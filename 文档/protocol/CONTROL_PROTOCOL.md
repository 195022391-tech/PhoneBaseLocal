# phonebase-control 协议（静态还原）

证据来源：`entry.mjs` 中 `Lp` / `ea` / `dS`，以及 `web/device.js` 控制客户端。

## 通道

```
浏览器  --WS-->  桌面 /control/{deviceId}  --WS-->  手机基座
         (同源 Origin)                      phonebase-control v1
```

- URL：`ws(s)://{host}/control/{deviceId}`（租赁：`/rental/control/...`）
- 非本机网段 / Origin 不匹配 → 403
- 同一 device 已有控制 → 409
- 断连时桌面代发：`{type:"pointer", action:"cancel", seq:++}`

## 手机 → 浏览器

### `ready`
```json
{
  "type": "ready",
  "protocol": "phonebase-control",
  "version": 1,
  "deviceId": "<id>",
  "controlAvailable": true,
  "geometry": {
    "width": 2-8192,
    "height": 2-8192,
    "sourceWidth": 2-8192,
    "sourceHeight": 2-8192,
    "orientation": 1-8,
    "revision": <positive int>,
    "changedAtUs": <nonneg>
  },
  "homeAvailable": true,
  "textAvailable": true,
  "keyboardAvailable": true
}
```

### `geometry` / `ack` / `error`
- `geometry`：revision 必须严格递增；客户端会取消当前手势
- `ack`：`{type:"ack", seq, ok, error?, code?}` — 触控 3s 无 ack 则 recover
- `error`：字符串 ≤1024

## 浏览器 → 手机（`Lp(msg, lastSeq)`）

常量：
- 坐标 `Fp(x)`：`number` 有限且 **`0 ≤ x ≤ 1`**（归一化）
- 文本上限 **4096** UTF-8 字节；整包 JSON ≤ **8192**
- 按键白名单：`backspace | enter | tab | escape | left | right | up | down`
- 限速：**90 msg/s**
- `seq`：正安全整数，且必须 `> lastSeq`（keepalive 除外）

| type | 必填 | 备注 |
|---|---|---|
| `keepalive` | — | 客户端每 **500ms**；不推进 seq |
| `pointer` | `action`, `seq`；非 cancel 时还有 `x,y,geometryRevision,frameTimestampUs` | `action`: `down\|move\|up\|cancel` |
| `button` | `button:"home"`, `seq` | 需 `homeAvailable` |
| `text` | `text`, `seq` | 需 `textAvailable` |
| `key` | `key`∈白名单, `seq` | 需 `keyboardAvailable` |

触控发送（device.js `command`）：
```js
{
  type: "pointer",
  action,                    // down|move|up|cancel
  seq: ++seq,
  x, y,                      // 0..1，相对当前画面
  geometryRevision: geometry.revision,
  frameTimestampUs: frame.timestampUs
}
```

## 能力门闩

| 能力 | 条件 |
|---|---|
| `canPoint` | ready 且 frame 与 geometry 对齐 |
| `canHome` | ready + homeAvailable |
| `canText` / `canKey` | ready + active + canPoint + 对应 Available |

Home / 方向变化 → `cancelGesture` + `inputEpoch++`（作废未发送输入）。

## 相关切片

- `Lp_fn.js` / `ea_geometry.js` — 校验函数原文
- `CONTROL_LITERALS.txt` — 字面量样例
- `DEVICE_TYPES.txt` — device.js 消息类型
'''
