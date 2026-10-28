# PhoneBase Direct 1.0.10 — 子系统分解（静态）

证据来源：IPA 清单、嵌入 entitlements、Mach-O load commands、字符串/选择器。  
非运行时观测。Ghidra/Hopper 深解在本机 session 未成功绑定。

---

## 1. 本机控制协议

### 传输
- HTTP 管控口：`PBFixedServicePort` = **11019**（Info.plist）
- WebSocket：`ws://127.0.0.1:%u%@`，路径观测到 **`/control`**、**`/video`**
- 本地 HTTP API（Helper）：见文末路由表
- 业务名：`phonebase-control`；遥测/指标：`local-control-handshake|pong|send|receive`、`control-open|close`

### 鉴权头
- `X-PhoneBase-Session`
- `X-PhoneBase-License`
- `X-PhoneBase-Control-Session`
- `X-PhoneBase-Control-Policy`（亦见小写 `x-phonebase-*`）
- 云侧策略名：`phonebase-cloud-control-policy`
- 拒绝类：`Forbidden`、`rate-limited`、HTTP `429 Too Many Requests`

### 消息处理（选择器）
- 入站：`consumeControlPayload:client:`、`receiveControl:sessionId:`
- 出站：`sendControlJSON:toClient:`、`sendError:text:toClient:`
- 会话：`closeControl:`、`setControlEpoch:`、`suspendControlForRestart`
- 策略：`applyCloudControlPolicy:client:`、`verifyCloudControlPolicyHeader:context:error:`
- 释放输入：`releaseControllerInput:` / `releaseControllerInput:policyCode:`

### 触控注入（观测）
- 类：`PBTouchInjector`
- API：`sendPositionX:y:touching:moved:canceled:error:`
- 状态结构：`{?="touching"i"orientation"I}`
- 能力位：`homeAvailable` / `keyboardAvailable` / `textAvailable`
- **私有 HID**（entitlements + 符号）：
  - `com.apple.private.hid.client.event-dispatch`
  - `com.apple.private.hid.manager.client`
  - `IOHIDEventSystemClientCreate` / `DispatchEvent`
  - `IOHIDEventCreateDigitizerEvent` / `DigitizerFingerEvent`
  - `IOHIDEventCreateKeyboardEvent` / `UnicodeEvent`
- 方向：`FBSOrientationObserver`、`PBVideoOrientation`、`activeInterfaceOrientation`

### 推断
控制面是 JSON-over-WS（`/control`），带 session/license/policy 头；触控经 IOHID 注入 digitizer/键盘事件。精确 JSON schema（字段名全集）需反汇编 `consumeControlPayload:` 才能钉死。

---

## 2. 视频链路

### 采集（特权全局抓屏）
Helper entitlements：
- `com.apple.QuartzCore.global-capture`
- `com.apple.QuartzCore.system-layers`
- `com.apple.QuartzCore.displayable-context`
- `platform-application`、`no-sandbox`
- IOKit：`IOSurface*`、`AGX*`、`IOHIDLibUserClient`、`AppleJPEGDriverUserClient`

符号：
- `CARenderServerRenderDisplay` / `CARenderServerGetDirtyFrameCount`
- IOSurface ↔ CVPixelBuffer 路径
- `captureBackend`、`wallVideo`、`sourceWidth/Height`、`sourceOrientation`

### 编码
- `PBVideoEncoder` + VideoToolbox：
  - `VTCompressionSessionCreate/EncodeFrame/CompleteFrames`
  - H264 Baseline AutoLevel
  - bitrate / expected frame rate / max keyframe interval / force keyframe
- 配置：`newSessionWidth:height:pixelFormat:frameRate:bitrateBps:error:`
- CLI：`--frame-rate`、`--bitrate-mbps`
- 设置 API：`/api/video-settings`；更新：`updateVideoSettings:generation:completion:`、`updateProfileFrameRate:bitrateBps:maxDimension:`
- 截图：`/api/screenshot`、`snapshotForClient:`；log 域 `cn.local.phonebase.lan.snapshot`

### 两条出站通路

**A. 本机 LAN WebSocket `/video`**
- `phonebase-video` / `phonebase-video-settings`
- 指标：`local-video-handshake|pong|receive`
- 选择器：`receiveVideo:`、`appendPacket:video:toClient:`、`broadcastFrame:configuration:keyframe:timestampUs:`、`discardUnsentVideo:`
- `videoTransport`、`videoDemand*`、`wantsFrames`

**B. P2P / WebRTC（libdatachannel 0.24.6）**
- 协议名：`phonebase-p2p-media`、`phonebase-p2p-gather`、`phonebase-p2p-frame-clock-v1`、`phonebase-relay`、`tencent-relay`
- 消息类型 kebab：`p2p-open|close|offer|answer|ice|metadata|keyframe|state|lease`
- 类：`PBP2PMedia`；校验：`verifyP2PMediaGatherHeader` / `verifyP2PMediaLeaseHeader`
- 媒体：H264 RTP packetizer；ICE via libjuice；DTLS-SRTP via mbedtls；SCTP/usrsctp
- SDP 片段观测：`profile-level-id=42e01f` / `42e033`，`packetization-mode=1`

### P2P 错误码（观测全集摘要）
`P2P_OPEN_REJECTED`、`P2P_ANSWER_*`、`P2P_CANDIDATE_REJECTED`、`P2P_ICE_UNREACHABLE`、`P2P_NO_*_CANDIDATE`、`P2P_DTLS_AUTH_FAILED`、`P2P_H264_*`、`P2P_FRAME_CLOCK_*`、`P2P_VIDEO_AUTH_*`、`P2P_RELAY_PROOF_FAILED`、`P2P_PHONE_SESSION_LIMIT`、`P2P_CONNECTION_LOST` 等。

### 推断
屏幕 → CARenderServer/IOSurface → VT H264 →（LAN WS 分包 **或** WebRTC Track）。`videoDemand`/`wantsFrames` 做按需出流。

---

## 3. 商业许可与云控

### 本机 License API
- `GET/POST?` `/api/license/identity`
- `/api/license/proof` — `proofForNonce:error:`
- `/api/license/renew`（Helper 亦会打 `http://127.0.0.1:%u/api/license/renew`）
- 协议标识：`phonebase-commercial-v1`、`licenseProtocol`、`licenseRequired`
- 字段：`licenseAccountId`、`licenseSessionId`、`licenseExpiresAt`、`deviceKeyFingerprint`、`phoneFingerprint`
- 本地材料：`commercial-device-key.der` + `.lock`、`.commercial-key-%@.tmp`；根证 `license-root.cer`（堡塔）

### 租约 / Grant
- 消息：`local-lease` / `local-lease-response`、`p2p-lease`、`session-renew` / `session-renew-response`、`rental-authorization`
- 选择器：`renewLocalLease:`、`verifyLeaseHeader:permission:error:`、`verifyHostGrantHeader:allowExpired:error:`、`configureHostGrant:accountId:completion:`
- 字段：`rentalLeaseId`、`rentalSettingsProtected`、`grantId`、`hostGrant`、`ownerAccountId`、`renterSessionId`
- 错误：`HOST_GRANT_EXPIRED|REVOKED`、`HOST_PROOF_INVALID`、`HOST_DEVICE_CHANGED`、`HOST_OWNER_REVOKED`、`HOST_RELEASE_CHANGED`、`RELEASE_BLOCKED|UNREGISTERED`、`lease-expired`、`PROBE_EXPIRED`、`ENTITLEMENT_REQUIRED`

### 云通道
- REST：`https://47.94.92.125:8444/commercial/v1/device-host`
- WSS：`wss://47.94.92.125:8444/device-host/connect`
- 协议族：`phonebase-device-host(-v1)`、`phonebase-device-host-grant`、`phonebase-commerce`、`phonebase-direct-host`
- 云消息 kebab：`cloud-wss`、`cloud-handshake|hello|message|pong|send|receive`、`cloud-send-queue|stalled`
- 类：`PBDirectCloudPublisher`、`PBCommercialLicense`
- 云控策略字段：`cloudControlRequired/ExpiresAt/SessionId/Generation/Claims/PolicyVersion`
- 设备根证：`phone-direct-root.cer`（PhoneBase Device Root 2026）

### 日志脱敏
主程序含敏感头正则：`authorization|x-phonebase-license|cookie|password|token|device.?key|nonce|proof|bearer|-----BEGIN`

---

## 4. 启动与保活

### 角色
| 组件 | 职责 |
|------|------|
| `PhoneBaseDirect` | UI/配置、spawn Helper、Hotspot 唤醒、本机 HTTP 探活/重启 |
| `PBHelperLauncher` | `posix_spawn` + **persona**（`posix_spawnattr_set_persona_*_np`）拉起 Helper |
| `PBNetworkWakeManager` | `NEHotspotHelper` 回调恢复服务 |
| `PBFixedPortTransition` | 固定口 11019 ↔ legacy 口迁移 |
| `PBNetworkStartupManager` / Startup Widget | 启动实验、Widget、App Group 状态 |

### Helper 启动参数（观测）
`--port` `--name` `--device-id` `--log-path` `--launch-source` `--launch-requested-at`  
`--memory-guard` `--frame-rate` `--bitrate-mbps` `--restart-count` `--restart-history` `--restart-reason`

### 保活 / 管控
- 探活：`http://127.0.0.1:%u/api/info`、`/api/health`
- 重启：`/api/control/restart`、`restartService`、`waitingForRestart`
- 停止：`/api/control/stop`
- 内存守卫：`/api/control/memory-guard?enabled=%d`、`--memory-guard`  
  结构：`{automatic, overLimitSince, historyMillis[3], historyCount, restartCount}`
- 日志：`Documents/helper.log`；记忆：`helperMemory` / `helperRecovery`
- Hotspot：`hotspot-wake`、`lastHotspotCommand/EventAtUnix/BootId`；状态可能 `wifi-hotspot-events-unverified`
- URL scheme：`phonebase-startup://launch?`
- App Group：`group.cn.local.phonebase.direct`
- 持久化键：`direct.configuration.v1`、`direct.fixed-port.pending-legacy.v1`、`direct.network-wake.*`、`direct.startup-widget.*`、`direct.host-log-path.v1`

### 主 App entitlements（摘要）
- `HotspotHelper`、`persona-mgmt`、`no-sandbox`、`platform-application`
- application-id：`cn.local.phonebase.direct`  
- Helper id：`cn.local.phonebase.direct.helper`

### Bonjour
- 类型：`_phonebase._tcp.`；发布类 `PBBonjourPublisher`；服务名痕迹 `lan-phonebase` / `PhoneBase Bonjour`

### 推断
这是面向已签名特权/平台构建的“基座”：主 App 负责拉起无沙箱 Helper，用固定端口对外；热点事件与 memory-guard 驱动自动重启。IPA 内 **未打包** `*.appex`（字符串引用 `StartupWidget.appex` / `NetworkStartup.appex`），当前包为精简 Direct 构建（`PBMinimalUI`）。

---

## 本机 HTTP 路由一览

| 路径 | 用途（推断） |
|------|----------------|
| `/api/health` | 健康检查 |
| `/api/info` | 能力/状态汇总 |
| `/api/control/stop` | 停服务 |
| `/api/control/restart` | 重启 |
| `/api/control/memory-guard` | 内存守卫开关 |
| `/api/video-settings` | 码率/帧率/分辨率 |
| `/api/screenshot` | 截图 |
| `/api/license/identity` | 设备身份 |
| `/api/license/proof` | nonce 证明 |
| `/api/license/renew` | 续期 |
| `/api/cloud-host/config` | 云主机配置 |

WS：`/control`、`/video`

---

## 未解（需反汇编/动态）

1. `/control` JSON 字段全集与 `type`/`action` 枚举  
2. LAN `/video` 二进制帧布局（是否 Annex-B / length-prefixed / 自定义 header）  
3. `proofForNonce` 密码学细节与 `commercial-device-key.der` 算法  
4. `CARenderServerRenderDisplay` 调用参数与显示 ID 选择  
5. 云 WSS 帧格式与 `sendKind:sequence:nonce:cookie:destination:` 语义  
6. persona uid/gid 具体值与启动失败路径
