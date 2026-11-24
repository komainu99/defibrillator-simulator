import analogio
import board
import busio
import digitalio
import json
import time

from adafruit_mcp230xx.mcp23017 import MCP23017

# MCP23017 #1: I2C0 on GP12 (SDA), GP13 (SCL)
# MCP23017 #2: I2C1 on GP18 (SDA), GP19 (SCL)
MCP_ROTARY_ADDRESS = 0x20
MCP_BUTTON_ADDRESS = 0x20

DEBOUNCE_SECONDS = 0.040
SHOCK_REARM_SECONDS = 0.400
ADC_SAMPLE_INTERVAL = 0.010
TELEMETRY_INTERVAL = 0.500

# Calibrated from the completed right-paddle resistor network.
# Measured centers: BOTH=31475, SHOCK=33002, CHARGE=59736, IDLE=65489.
PADDLE_SHORT_MAX = 12000
PADDLE_BOTH_MAX = 32240
PADDLE_SHOCK_MAX = 46370
PADDLE_CHARGE_MAX = 62610

# Correct wiring measured 5369 raw. Incorrect states measured 328-788 on
# the low side and 22699-58782 on the high side. Keep broad margins around
# the correct value so component tolerance does not cause false lead-off.
LEAD_CORRECT_MIN = 3000
LEAD_CORRECT_MAX = 12000


ROTARY_POSITIONS = (
    {"position": "pacing"},
    {"position": "off"},
    {"position": "monitor"},
    {"position": "aed"},
    {"position": "disarm"},
    {"position": "energy", "joules": 5},
    {"position": "energy", "joules": 10},
    {"position": "energy", "joules": 20},
    {"position": "energy", "joules": 50},
    {"position": "energy", "joules": 100},
    {"position": "energy", "joules": 150},
    {"position": "energy", "joules": 360},
)

BUTTON_NAMES = (
    "lead",
    "sensitivity",
    "sync",
    "charge",
    "shock",
    "paddle_shock_left",
)

BUTTON_PIN_NUMBERS = {
    "shock": 13,              # GPB5
    "charge": 14,             # GPB6
    "sync": 15,               # GPB7
    "lead": 1,                # GPA1
    "sensitivity": 12,         # GPA4
    "paddle_shock_left": 0,   # GPA0
}


def publish(message_type, **values):
    message = {"type": message_type}
    message.update(values)
    print(json.dumps(message))


class DebouncedInput:
    def __init__(self, pin):
        self.pin = pin
        initial = not pin.value
        self.raw_pressed = initial
        self.pressed = initial
        self.changed_at = time.monotonic()

    def update(self, now):
        raw_pressed = not self.pin.value
        pressed_edge = False
        released_edge = False

        if raw_pressed != self.raw_pressed:
            self.raw_pressed = raw_pressed
            self.changed_at = now

        if raw_pressed != self.pressed and now - self.changed_at >= DEBOUNCE_SECONDS:
            self.pressed = raw_pressed
            pressed_edge = self.pressed
            released_edge = not self.pressed

        return pressed_edge, released_edge


class RotaryInput:
    def __init__(self, pins):
        self.pins = pins
        self.candidate_index = None
        self.stable_index = None
        self.changed_at = time.monotonic()
        self.last_fault = None
        self.active_contacts = []

    def update(self, now):
        active = [index for index, pin in enumerate(self.pins) if not pin.value]
        self.active_contacts = active

        if len(active) == 0:
            # Break-before-make switches briefly have no active contact.
            self.candidate_index = None
            self.changed_at = now
            self.last_fault = None
            return None

        if len(active) > 1:
            self.candidate_index = None
            self.changed_at = now
            fault = tuple(active)
            if fault != self.last_fault:
                publish("fault", source="rotary", reason="multiple_contacts", contacts=active)
                self.last_fault = fault
            return None

        self.last_fault = None
        index = active[0]
        if index != self.candidate_index:
            self.candidate_index = index
            self.changed_at = now
            return None

        if index != self.stable_index and now - self.changed_at >= DEBOUNCE_SECONDS:
            self.stable_index = index
            return index

        return None

    def telemetry(self):
        position = None
        if self.stable_index is not None:
            position = ROTARY_POSITIONS[self.stable_index]
        return {
            "contacts": self.active_contacts,
            "candidate_index": self.candidate_index,
            "stable_index": self.stable_index,
            "position": position,
        }


def configure_input(mcp, pin_number):
    pin = mcp.get_pin(pin_number)
    pin.direction = digitalio.Direction.INPUT
    pin.pull = digitalio.Pull.UP
    return pin


def read_adc(adc, sample_count=8):
    total = 0
    for _ in range(sample_count):
        total += adc.value
    return total // sample_count


def adc_voltage(adc_raw):
    return round(adc_raw * 3.3 / 65535, 3)


def mcp_pin_name(pin_number):
    bank = "A" if pin_number < 8 else "B"
    return "GP{}{}".format(bank, pin_number % 8)


def read_mcp_pins(pins):
    return {
        mcp_pin_name(index): {
            "high": bool(pin.value),
            "active": not pin.value,
        }
        for index, pin in enumerate(pins)
    }


def classify_paddle(adc_raw):
    if adc_raw < PADDLE_SHORT_MAX:
        return "fault"
    if adc_raw < PADDLE_BOTH_MAX:
        return "both"
    if adc_raw < PADDLE_SHOCK_MAX:
        return "shock"
    if adc_raw < PADDLE_CHARGE_MAX:
        return "charge"
    return "idle"


def classify_leads(adc_raw):
    if LEAD_CORRECT_MIN is None or LEAD_CORRECT_MAX is None:
        return "uncalibrated"
    if LEAD_CORRECT_MIN <= adc_raw <= LEAD_CORRECT_MAX:
        return "correct"
    return "incorrect"


i2c0 = busio.I2C(board.GP13, board.GP12)
i2c1 = busio.I2C(board.GP19, board.GP18)

rotary_mcp = MCP23017(i2c0, address=MCP_ROTARY_ADDRESS)
button_mcp = MCP23017(i2c1, address=MCP_BUTTON_ADDRESS)

# Configure all 16 pins on both expanders so telemetry can report every pin.
rotary_mcp_pins = [configure_input(rotary_mcp, index) for index in range(16)]
button_mcp_pins = [configure_input(button_mcp, index) for index in range(16)]

rotary_pin_numbers = (
    3,   # PACING: GPA3
    2,   # OFF: GPA2
    1,   # MONITOR: GPA1
    0,   # AED: GPA0
    15,  # DISARM: GPB7
    14,  # 5 J: GPB6
    13,  # 10 J: GPB5
    12,  # 20 J: GPB4
    11,  # 50 J: GPB3
    10,  # 100 J: GPB2
    5,   # 150 J: GPA5
    4,   # 360 J: GPA4
)
rotary_pins = [rotary_mcp_pins[number] for number in rotary_pin_numbers]

# Second MCP23017 buttons use pins across banks A and B.
button_pins = {
    name: DebouncedInput(button_mcp_pins[BUTTON_PIN_NUMBERS[name]])
    for name in BUTTON_NAMES
}

right_paddle_adc = analogio.AnalogIn(board.GP26)
lead_adc = analogio.AnalogIn(board.GP27)

rotary = RotaryInput(rotary_pins)
led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT

last_adc_sample_at = 0
last_telemetry_at = 0
last_paddle_state = None
last_lead_state = None
paddle_shock_latched = False
last_paddle_shock_at = 0
right_paddle_raw = read_adc(right_paddle_adc)
lead_raw = read_adc(lead_adc)

publish("ready", firmware="simmonitor-pico", protocol=1)


while True:
    now = time.monotonic()

    rotary_index = rotary.update(now)
    if rotary_index is not None:
        publish("rotary", **ROTARY_POSITIONS[rotary_index])

    for name, button in button_pins.items():
        pressed_edge, released_edge = button.update(now)

        if name == "paddle_shock_left":
            if pressed_edge or released_edge:
                publish("input", name=name, pressed=button.pressed)
            continue

        if pressed_edge:
            publish("button", name=name, source="panel")

    if now - last_adc_sample_at >= ADC_SAMPLE_INTERVAL:
        last_adc_sample_at = now
        right_paddle_raw = read_adc(right_paddle_adc)
        lead_raw = read_adc(lead_adc)

        paddle_state = classify_paddle(right_paddle_raw)
        if paddle_state != last_paddle_state:
            previous = last_paddle_state
            last_paddle_state = paddle_state
            publish(
                "paddle",
                side="right",
                state=paddle_state,
                previous=previous,
                adc_raw=right_paddle_raw,
            )

            charge_pressed = paddle_state in ("charge", "both")
            charge_was_pressed = previous in ("charge", "both")
            if charge_pressed and not charge_was_pressed:
                publish("button", name="charge", source="right_paddle")

        lead_state = classify_leads(lead_raw)
        if lead_state != last_lead_state:
            last_lead_state = lead_state
            correct = lead_state == "correct"
            publish(
                "lead_status",
                status=lead_state,
                correct=correct,
                leads={"red": correct, "yellow": correct, "green": correct},
                adc_raw=lead_raw,
            )

    left_shock = button_pins["paddle_shock_left"].pressed
    right_shock = last_paddle_state in ("shock", "both")
    both_paddle_shock = left_shock and right_shock

    if (
        both_paddle_shock
        and not paddle_shock_latched
        and now - last_paddle_shock_at >= SHOCK_REARM_SECONDS
    ):
        publish("button", name="shock", source="paddles")
        paddle_shock_latched = True
        last_paddle_shock_at = now

    if not both_paddle_shock:
        paddle_shock_latched = False

    led.value = last_lead_state == "correct"

    if now - last_telemetry_at >= TELEMETRY_INTERVAL:
        last_telemetry_at = now
        publish(
            "telemetry",
            paddle_adc_raw=right_paddle_raw,
            paddle_state=last_paddle_state,
            lead_adc_raw=lead_raw,
            lead_status=last_lead_state,
            rotary=rotary.telemetry(),
            adc={
                "ADC0_GP26": {
                    "raw": right_paddle_raw,
                    "volts": adc_voltage(right_paddle_raw),
                },
                "ADC1_GP27": {
                    "raw": lead_raw,
                    "volts": adc_voltage(lead_raw),
                },
            },
            mcp23017={
                "rotary_i2c0": {
                    "address": "0x{:02X}".format(MCP_ROTARY_ADDRESS),
                    "pins": read_mcp_pins(rotary_mcp_pins),
                },
                "buttons_i2c1": {
                    "address": "0x{:02X}".format(MCP_BUTTON_ADDRESS),
                    "pins": read_mcp_pins(button_mcp_pins),
                },
            },
        )

    time.sleep(0.005)
