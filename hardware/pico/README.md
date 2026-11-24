# SimMonitor Raspberry Pi Pico Controller

`code.py` reads the two MCP23017 expanders and the Pico ADC inputs, then sends
newline-delimited JSON to the instructor PC over CircuitPython USB serial.

USB HID keyboard output is not used.

## Required CircuitPython libraries

Copy these folders from the matching CircuitPython library bundle:

```text
CIRCUITPY/lib/adafruit_mcp230xx/
CIRCUITPY/lib/adafruit_bus_device/
```

Copy this project's `hardware/pico/code.py` to:

```text
CIRCUITPY/code.py
```

## Pico wiring

| Pico pin | Function |
| --- | --- |
| GP12 | I2C0 SDA, rotary MCP23017 |
| GP13 | I2C0 SCL, rotary MCP23017 |
| GP18 | I2C1 SDA, button MCP23017 |
| GP19 | I2C1 SCL, button MCP23017 |
| GP26 / ADC0 | Right paddle resistor input |
| GP27 / ADC1 | Manikin lead resistor network |
| GP28 / ADC2 | Reserved |

Both MCP23017 devices may use address `0x20` because they are on separate I2C
buses. Power them from Pico `3V3`, not 5 V, and share GND with the Pico.

## MCP23017 #1: rotary switch

The rotary COM terminal connects to GND. Inputs use the MCP23017 internal
pull-ups, so the selected position reads LOW.

| MCP pin | Position |
| --- | --- |
| GPA3 | PACING |
| GPA2 | OFF |
| GPA1 | MONITOR |
| GPA0 | AED |
| GPB7 | DISARM |
| GPB6 | 5 J |
| GPB5 | 10 J |
| GPB4 | 20 J |
| GPB3 | 50 J |
| GPB2 | 100 J |
| GPA5 | 150 J |
| GPA4 | 360 J |

No-contact time during rotary movement is ignored. Multiple simultaneous LOW
contacts produce a `fault` message.

## MCP23017 #2: buttons

Connect the other side of every normally-open button to GND.

| MCP pin | Button |
| --- | --- |
| GPB5 | Front-panel SHOCK |
| GPB6 | CHARGE |
| GPB7 | SYNC |
| GPA1 | LEAD |
| GPA4 | SENSITIVITY |
| GPA0 | Left-paddle SHOCK |

The paddle shock event is emitted only while both the left-paddle switch and
the right-paddle ADC SHOCK state are active.

## ADC calibration

現在の `code.py` には、開発時の回路で測定した値が設定されています。抵抗値、配線、Picoが変わった場合は、実機のtelemetryを測定して再校正します。

- GP26のパドル入力は、待機・CHARGE・SHOCK・両方の各状態で `paddle_adc_raw` を記録し、隣接する状態の測定値の間で閾値を設定します。現行コードの閾値は順に `12000`、`32240`、`46370`、`62610` です。
- GP27の電極入力は、正しい接続と誤接続・未接続の各状態で `lead_adc_raw` を測ります。現行の正接続範囲は `3000–12000` です。確定した範囲を `LEAD_CORRECT_MIN` と `LEAD_CORRECT_MAX` に設定します。LEDは正接続時に点灯します。3本の状態はADC入力の判定結果をまとめて反映します。
- MCP23017の認識を確認するときは、[I²C診断スクリプト](diagnostics/i2c_scan.py)をPicoで実行します。両方のバスで `0x20` が見えることを確認し、診断後は通常の `code.py` に戻してください。

## Serial messages

Examples:

```json
{"type":"rotary","position":"monitor"}
{"type":"rotary","position":"energy","joules":150}
{"type":"button","name":"charge","source":"panel"}
{"type":"button","name":"shock","source":"paddles"}
{"type":"button","name":"sync","source":"panel"}
{"type":"lead_status","status":"correct","correct":true,"leads":{"red":true,"yellow":true,"green":true},"adc_raw":31120}
{"type":"telemetry","paddle_adc_raw":65472,"paddle_state":"idle","lead_adc_raw":31120,"lead_status":"correct"}
```

## PCとの接続

インストラクター画面を開き、ChromeまたはEdgeの「Picoを接続」でUSBポートを選択します。Pythonブリッジを使う場合は、以下の手順で実行してください。

ポートを省略するとCircuitPython Picoを自動検出します。ADCの校正時は `--verbose` を追加してください。ADC0/ADC1と2台のMCP23017の全ピンを一覧表示するには `--io-monitor` を追加します。`LOW*` はGNDへ接続されて入力が有効になっているピン、`HIGH` は内部プルアップで非動作のピンです。

ブリッジは `/api/sim-monitor/action?room=接続ID` へ操作を転送します。telemetryに含まれるロータリー位置は、初回接続時と位置変更の検出に利用します。

macOS・Linuxではリポジトリのルートで以下を実行します。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r hardware/requirements.txt
.venv/bin/python hardware/pico_bridge.py --url http://localhost:3000 --room 接続ID
```

WindowsのPowerShellでは `py -m venv .venv` で環境を作成し、実行パスは `.\.venv\Scripts\python.exe` を使います。Web SerialとPythonブリッジのうち、一方でUSBポートを開きます。
