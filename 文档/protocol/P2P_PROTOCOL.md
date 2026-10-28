# P2P / 探测协议（静态还原）

本地局域网走 `/view` + `PHB1`；跨网/租赁另有 **WebRTC P2P** 与 **PBPN UDP 探测**。  
证据：`pbpn_full.js`、`stun_peer.js`、`frame_clock.js`、`media_status.js`。

---

## 1. 传输模式

| 模式 | 标记 | 说明 |
|---|---|---|
| `p2p-direct` | `mediaTransport:"p2p-direct"` | 直连 UDP（WebRTC） |
| `tencent-relay` / `server-relay` | `fallback:true` | 走腾讯系中继；端口窗口约 **49160–49359** |
| 本机 LAN | `/view/{id}` | 不经 P2P，见 `VIDEO_PROTOCOL.md` |

状态上报协议：`phonebase-p2p-media-status-v1`  
字段含 `p2pBytes` / `relayBytes` / bitrate、`mediaSessionId`、`generation`、`counterScope:"peer-udp-payload"`。

硬编码：
- STUN：**`stun:47.94.92.125:8445`**（非测试模式不可改）
- 另有 `stun:stun.l.google.com:19302`
- 候选校验里出现 **`82.157.140.13`**（疑似中继出口）

---

## 2. WebRTC 信令（viewer）

工厂：`WB({ url, viewerId, accessToken, stunURL, fallback, ... })`

1. 连 `wss://…`，`Authorization: Bearer <43字符 base64url token>`
2. open 后发：`{ type:"p2p-start", viewerId, fallback? }`
3. 收/发：`p2p-offer` / `p2p-answer` / `p2p-ice` / `p2p-keyframe` / `p2p-stop` / `p2p-close` …
4. 需要关键帧时对 receiver 发 **RTCP PLI**，并信令 `{type:"p2p-keyframe", mediaSessionId, generation}`
5. 媒体仍是 **`PHB1` 包**（`is()` 解析），外加 frame-clock 元数据

相关消息名见 `P2P_MSG_TYPES.txt`。

---

## 3. Frame clock：`phonebase-p2p-frame-clock-v1`

与视频包绑定的时钟锚点：

```json
{
  "protocol": "phonebase-p2p-frame-clock-v1",
  "ssrc": <uint>,
  "rtpTimestamp": <uint>,
  "sourceTimestampUs": <int>,
  "geometryRevision": <int>,
  "serial": <positive int>
}
```

规则（失败则 `P2P_FRAME_CLOCK_*`）：
- `geometryRevision` 必须等于当前 geometry.revision
- `sourceTimestampUs >= geometry.changedAtUs`
- 同 SSRC 下 `serial` / `sourceTimestampUs` 递增
- RTP 时钟按 **90kHz**：`Δrtp` 与 `ΔsourceUs` 偏差 ≤ 24µs 量级校验
- geometry revision 变化 → 清 floor、重新等关键帧

---

## 4. 网络探测：PBPN（96 字节 UDP）

用于租赁/网络测试（`phonebase-network-test-v1`），**拒绝 RFC1918 私网地址**（测公网直连能力）。

### 包布局（`ml=96`）

| Offset | 内容 |
|---|---|
| 0..3 | ASCII **`PBPN`** |
| 4 | version `1` |
| 5 | **kind** 1..5 |
| 6 | **role** 0=phone / 1=viewer |
| 7 | `0` |
| 8..23 | `probeId` hex32（16 bytes） |
| 24..27 | `seq` u32 BE |
| 28..43 | `nonce` 16B |
| 44..59 | `cookie` 16B |
| 60..63 | 必须 `0` |
| 64..95 | HMAC-SHA256(key, bytes[0..64)) 截断/整段 32B |

kind 枚举：
```
register=1, challenge=2, confirm=3, peerProbe=4, peerAck=5
```

key：32 字节，或 43 字符 base64url。

### 协调 WebSocket 消息

| type | 方向 | 作用 |
|---|---|---|
| `probe-open` | server→client | 下发 probeId、server 地址、serverKey/peerKey、expires |
| `probe-peer` | server→client | 对端公网 address:port |
| `probe-summary` / `probe-result` | 结果 |
| `probe-close` | 结束（带 code） |

握手大致：
1. viewer → server UDP：`register`
2. server → viewer：`challenge`（带 cookie/nonce）
3. viewer → server：`confirm`
4. 双方 `peerProbe` / `peerAck` 测直连 RTT  
结果 state：`direct` | `relay` | `timeout` | `unsupported` | …

---

## 5. 和本机路径的关系

```
同网:  mDNS/扫网 → /api/info → WS /view (PHB1) + WS /control
跨网:  账号 token → WSS 信令 → WebRTC(+STUN/中继) → 仍是 PHB1 + frame-clock
测网:  WSS 协调 + PBPN UDP（公网）→ phonebase-network-test-v1
```

## 切片

- `pbpn_full.js` / `pbpn_packets.js`
- `stun_peer.js` / `frame_clock.js` / `media_status.js`
- `P2P_MSG_TYPES.txt` / `P2P_PROBE_TYPES.txt`
'''
