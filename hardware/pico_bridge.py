#!/usr/bin/env python3
import argparse
import json
import uuid
import re
import os
import urllib.parse
import sys
import time
import urllib.error
import urllib.request


BUTTON_ACTIONS = {
    "lead": "LEAD_NEXT",
    "sensitivity": "SENSITIVITY_NEXT",
    "sync": "SYNC_TOGGLE",
    "charge": "CHARGE",
    "shock": "SHOCK",
}


def post_action(base_url, action, value=None, attempts=3, room=None):
    payload = {"action": action, "operationId": str(uuid.uuid4())}
    if value is not None:
        payload["value"] = value

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/sim-monitor/action?{urllib.parse.urlencode({'room': room or ''})}",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )

    last_error = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                result = json.loads(response.read().decode("utf-8"))
            if not result.get("ok"):
                raise RuntimeError(f"SimMonitor rejected action {action}")
            return result
        except (OSError, ValueError, urllib.error.URLError, RuntimeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(0.25 * (attempt + 1))

    raise RuntimeError(f"Could not send {action} to SimMonitor: {last_error}")


def message_to_action(message):
    message_type = message.get("type")

    if message_type == "rotary":
        position = message.get("position")
        value = {"position": position}
        if position == "energy":
            value["joules"] = message.get("joules")
        return "SET_ROTARY_POSITION", value

    if message_type == "button":
        action = BUTTON_ACTIONS.get(message.get("name"))
        if action:
            return action, None
        return None

    if message_type == "lead_status" and isinstance(message.get("leads"), dict):
        leads = message["leads"]
        return "SET_LEAD_STATUS", {
            "red": bool(leads.get("red")),
            "yellow": bool(leads.get("yellow")),
            "green": bool(leads.get("green")),
        }

    return None


def rotary_position_to_action(position):
    if not isinstance(position, dict):
        return None
    name = position.get("position")
    if not name:
        return None
    value = {"position": name}
    if name == "energy":
        value["joules"] = position.get("joules")
    return "SET_ROTARY_POSITION", value


def describe_port(port):
    details = [port.device]
    if port.description:
        details.append(port.description)
    if port.manufacturer:
        details.append(port.manufacturer)
    return " - ".join(details)


def find_pico_port(list_ports):
    matches = []
    for port in list_ports.comports():
        text = " ".join(
            part for part in (port.description, port.manufacturer, port.product) if part
        ).lower()
        if port.vid == 0x239A or "circuitpython" in text or "raspberry pi pico" in text:
            matches.append(port)

    if len(matches) == 1:
        return matches[0].device
    if not matches:
        raise RuntimeError("CircuitPython Picoが見つかりません。COMポートを指定してください。")

    ports = ", ".join(port.device for port in matches)
    raise RuntimeError(f"複数のCircuitPythonデバイスが見つかりました ({ports}). 1つを指定してください。")


def list_serial_ports(list_ports):
    ports = list(list_ports.comports())
    if not ports:
        print("No serial ports found.")
        return
    for port in ports:
        print(describe_port(port))


def format_io_telemetry(message):
    lines = ["\n=== Pico I/O telemetry ==="]
    for name, adc in message.get("adc", {}).items():
        lines.append(
            f"{name:<10} raw={adc.get('raw', '-'):>5}  voltage={adc.get('volts', '-')} V"
        )

    for device_name, device in message.get("mcp23017", {}).items():
        lines.append(f"\n{device_name} ({device.get('address', '-')})")
        pins = device.get("pins", {})
        for bank in ("A", "B"):
            cells = []
            for index in range(8):
                pin_name = f"GP{bank}{index}"
                pin = pins.get(pin_name, {})
                state = "LOW*" if pin.get("active") else "HIGH"
                cells.append(f"{pin_name}:{state:<4}")
            lines.append("  " + "  ".join(cells))
    return "\n".join(lines)


def run_bridge(serial_module, port, baud, base_url, verbose, io_monitor, room):
    while True:
        try:
            with serial_module.Serial(port, baud, timeout=1) as connection:
                print(f"Pico connected on {port}; forwarding to {base_url}")
                last_rotary_position = None
                while True:
                    raw_line = connection.readline()
                    if not raw_line:
                        continue

                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    try:
                        message = json.loads(line)
                    except json.JSONDecodeError:
                        if verbose:
                            print(f"serial: {line}")
                        continue

                    if io_monitor and message.get("type") == "telemetry":
                        print(format_io_telemetry(message))
                    elif verbose or message.get("type") in ("ready", "fault"):
                        print(json.dumps(message, ensure_ascii=False))

                    action = message_to_action(message)
                    if message.get("type") == "telemetry":
                        rotary_position = message.get("rotary", {}).get("position")
                        if rotary_position and rotary_position != last_rotary_position:
                            action = rotary_position_to_action(rotary_position)
                            last_rotary_position = rotary_position.copy()
                    elif message.get("type") == "rotary":
                        last_rotary_position = {
                            key: message[key]
                            for key in ("position", "joules")
                            if key in message
                        }
                    if not action:
                        continue

                    action_name, value = action
                    try:
                        post_action(base_url, action_name, value, room=room)
                        print(f"{action_name} {json.dumps(value, ensure_ascii=False) if value is not None else ''}".rstrip())
                    except RuntimeError as error:
                        print(error, file=sys.stderr)
        except KeyboardInterrupt:
            print("Bridge stopped.")
            return 0
        except (OSError, serial_module.SerialException) as error:
            print(f"Serial connection error: {error}. Retrying in 2 seconds.", file=sys.stderr)
            time.sleep(2)


def main():
    parser = argparse.ArgumentParser(
        description="Forward SimMonitor Pico USB serial events to the local server."
    )
    parser.add_argument(
        "port",
        nargs="?",
        help="Serial port such as COM4. Omit to auto-detect CircuitPython.",
    )
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--room", default=os.environ.get("SIM_MONITOR_ROOM"), help="接続画面で表示した接続ID")
    parser.add_argument("--list-ports", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--io-monitor",
        action="store_true",
        help="ADCと2台のMCP23017全ピンを一覧表示します。",
    )
    args = parser.parse_args()

    if not args.list_ports and not re.fullmatch(r"[a-zA-Z0-9_-]{16,80}", args.room or ""):
        parser.error("--room にインストラクター画面と同じ接続IDを指定してください。")
    parsed_url = urllib.parse.urlsplit(args.url)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc or parsed_url.username or parsed_url.password or parsed_url.path not in ("", "/") or parsed_url.query or parsed_url.fragment:
        parser.error("--url は http://localhost:3000 のようなサーバーのアドレスにしてください。")

    try:
        import serial
        from serial.tools import list_ports
    except ImportError:
        print(
            "pyserial is required. Install it with: py -m pip install pyserial",
            file=sys.stderr,
        )
        return 2

    if args.list_ports:
        list_serial_ports(list_ports)
        return 0

    try:
        port = args.port or find_pico_port(list_ports)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        print("Available ports:", file=sys.stderr)
        list_serial_ports(list_ports)
        return 2

    return run_bridge(serial, port, args.baud, args.url, args.verbose, args.io_monitor, args.room)


if __name__ == "__main__":
    raise SystemExit(main())
