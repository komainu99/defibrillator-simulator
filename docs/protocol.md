# 通信仕様

## PC・iPadとNext.js

演習IDは英数字、ハイフン、アンダースコアの16～80文字です。新規演習では暗号学的乱数から48文字のIDを生成します。

| メソッドとパス | 用途 |
| --- | --- |
| `GET /api/sim-monitor/state?room=ID` | 現在の状態スナップショットを取得 |
| `GET /api/sim-monitor/events?room=ID` | SSE。接続直後のスナップショットと、その後の状態更新を配信 |
| `POST /api/sim-monitor/action?room=ID` | JSONで操作を送信 |

SSEは `data:` 行にJSONを載せ、空行で区切ります。接続維持用のコメントを15秒ごとに送ります。ブラウザーは `EventSource` を使用し、接続状況を画面に表示します。

```json
{
  "action": "SET_ROTARY_POSITION",
  "value": { "position": "energy", "joules": 150 },
  "operationId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
}
```

`value` は操作によって省略できます。同じルームで操作IDと内容が一致した再送は適用せず、同じIDで内容が異なる場合はHTTP 409を返します。操作IDはルームごとに直近1,000件を保持します。本文は64 KiBまでです。

## PicoとPC

PicoはUSBシリアルに改行区切りJSONを出力します。PC側は既定で115200 baudを指定し、Web SerialまたはPythonブリッジで読み取ります。

| シリアルメッセージ | 操作 |
| --- | --- |
| `rotary` | `SET_ROTARY_POSITION`。位置と、出力位置の場合は模擬ジュール値 |
| `button` | `LEAD_NEXT`、`SENSITIVITY_NEXT`、`SYNC_TOGGLE`、`CHARGE`、`SHOCK` |
| `lead_status` | `SET_LEAD_STATUS`。赤・黄・緑の電極判定 |
| `telemetry` | ロータリーの確定位置を未適用時に反映。ADC・I²Cピン状態は診断に利用 |

配線とADC校正は [Picoの接続ガイド](../hardware/pico/README.md) を参照してください。
