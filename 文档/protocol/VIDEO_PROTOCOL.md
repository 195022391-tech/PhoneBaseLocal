# 局域网视频协议（静态还原）

通道：`ws(s)://{host}/view/{deviceId}`（租赁可加 `/rental`，`?transport=p2p-only`）  
证据：`entry.mjs` 的 `is` / `sS` / `Np`，`web/device.js` 的 `VideoDecoder`。

## 帧头（20 字节）+ payload

Magic：ASCII **`PHB1`**

| Offset | 类型 | 含义 |
|---|---|---|
| 0..3 | `PHB1` | 魔数 |
| 4 | u8 | 版本，必须为 `1` |
| 5 | u8 | **flags**：`0` 普通帧，`1` keyframe，`2` configuration |
| 6..7 | u8 | 必须为 `0` |
| 8..15 | u64 BE | **timestamp**（与 WebCodecs `timestamp` / 触控 `frameTimestampUs` 对齐） |
| 16..19 | u32 BE | payload 字节数 `== packet.length - 20` |
| 20.. | bytes | 见下 |

约束：总长 `21 … 4MiB`（`rs=4*1024*1024`）。

## flags = 2 → AVC configuration（avcC）

payload 为 **AVCDecoderConfigurationRecord**：
- `payload[0] === 1`
- `payload[4] & 3 === 3`（lengthSizeMinusOne = 3 → **4 字节 NAL length**）
- 内含 SPS（NAL type 7）+ PPS（type 8）；高 profile 可带 SPS-EXT（type 13）

浏览器侧：
```js
codec = `avc1.${bytes[1..3].toString(16)}`
description = avcC 全量 bytes
new VideoDecoder(...).configure({ codec, description, optimizeForLatency: true })
```

## flags = 0 / 1 → 视频帧（AVCC）

payload = 重复：
```
u32 BE nalLength | nalBytes…
```
- NAL header bit7 禁止为 1；`nal_unit_type` ∈ 1..23
- 至少含 type `1` 或 `5`
- **flags==1（keyframe）⇔ 存在 IDR type 5**，否则校验失败

解码：
```js
new EncodedVideoChunk({
  type: keyframe ? "key" : "delta",
  timestamp: Number(headerTimestamp),
  data: payload /* AVCC，不含 20 字节头 */
})
```

新连上或丢包后：先等 configuration，再等 keyframe（`needsKeyframe`）。  
转发水位：`rS=512KiB`；阻塞则丢帧并重新要关键帧。

## 同连接上的 JSON

```json
{ "type": "publisher", "online": true|false }
```
`online:false` 时清 configuration，并要求下一关键帧。

## 与控制面的耦合

触控 `pointer` 必须带：
- `geometryRevision` = 当前屏幕 geometry
- `frameTimestampUs` = 最近解码帧的 `timestampUs`（来自上述 u64）

见 `CONTROL_PROTOCOL.md`。

## 切片

- `is_packet.js` / `sS_config.js` / `Np_deliver.js`
- `device_view.js` — 前端拉流 + WebCodecs
'''
