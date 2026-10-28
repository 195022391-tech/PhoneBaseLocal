# LanCaptureHelper 静态深挖（无伪代码）

目标：`dig/ipa_direct/.../LanCaptureHelper`  
明细 JSON：`IPA_HELPER_STATIC.json`  

> 本机 Windows Ghidra **只接受 PE**，无法对 arm64 Mach-O 出伪代码；下文为 ObjC 符号/字符串推断，非运行态、非反编译。

## 1. 服务入口（推断）

`PBLocalService` + `initWithLicense:port:information:`  
HTTP 路由（字符串实锤）：

- 信息：`/api/info` `/api/health` `/api/screenshot` `/api/video-settings`
- 控制进程：`/api/control/stop|restart|memory-guard`
- 授权：`/api/license/challenge|identity|owner|proof|renew`
- 云：`/api/cloud-host/config`

WS：`/video` `/control`（`NSURLSessionWebSocket*`，`openVideo` / `receiveVideo:` / `receiveControl:sessionId:` / `closeControl:`）  
发现：`PBBonjourPublisher` → `_phonebase._tcp`

## 2. 视频链路

```
PBCapture → PBVideoEncoder (VT H.264)
         → appendPacket:video:toClient: / broadcastFrame:configuration:keyframe:timestampUs:
         → discardUnsentVideo: / receiveVideo:
```

画质：`phonebase-video-settings`，`updateVideoSettings:generation:completion:`，`wallVideo` / `videoMaxDimension` / `videoFrameRate`

## 3. 触控注入

`PBTouchInjector`：

- `sendPositionX:y:touching:moved:canceled:error:`
- `pressHome:`
- 私有 API：`IOHIDEventCreateDigitizer*` / `Keyboard` / `Unicode` → `IOHIDEventSystemClientDispatchEvent`
- 客户端名：`IOHIDLibUserClient`

控制面：`consumeControlPayload:client:` → `sendControlJSON:toClient:`；云策略头 `X-PhoneBase-Control-Policy` / `phonebase-cloud-control-policy`

## 4. 授权 / 租约（多层）

| 层 | 协议名 | 关键符号 |
|---|---|---|
| 商业 | `phonebase-commercial-v1` | `PBCommercialLicense`，头 `X-PhoneBase-License` |
| 本地 owner | `phonebase-local-owner(-v1)` | `setLicenseLocalOwner:` / `localOwnerClaimsAllowed:` |
| 本地 lease | `phonebase-local-lease-v2` | `createLocalLeaseChallenge:` `verifyLeaseHeader:permission:error:` `renewLocalLease:` |
| 租机锁 | `phonebase-rental-lock*` | `createRentalLockChallengeForRequest:` `applyRentalLockHeader:` `signRentalLockAcknowledgement:` |
| P2P | `phonebase-p2p-media` / `frame-clock-v1` | `verifyP2PMediaLeaseHeader:` `verifyP2PMediaGatherHeader:` |

云边：`wss://47.94.92.125:8444/device-host/connect`，STUN `stun:47.94.92.125:8445`，`phonebase-device-host-v1`

## 5. 和桌面文档对齐状态

| 模块 | 桌面 | 手机静态 | 缺什么 |
|---|---|---|---|
| 视频 | `VIDEO_PROTOCOL.md` | 编码/发包符号齐 | 帧头字节布局需对照抓包或伪代码 |
| 控制 | `CONTROL_PROTOCOL.md` | IOHID + JSON 控制齐 | 坐标归一化/按键码表需伪代码或抓包 |
| 授权 | `LICENSE_PROTOCOL.md` | 多协议分层齐 | challenge/proof 算法需伪代码 |
| P2P | `P2P_PROTOCOL.md` | libdatachannel 齐 | 与 LAN 路径优先级需运行态 |

## 6. 真·伪代码下一步（需换环境）

任选其一：

1. **macOS + Hopper/IDA** 打开 `LanCaptureHelper`，优先反编译：  
   `-[PBLocalService initWithLicense:port:information:]`  
   `-[PBTouchInjector sendPositionX:y:touching:moved:canceled:error:]`  
   `-[PBCommercialLicense …]` / `verifyLeaseHeader:permission:error:`  
   `appendPacket:video:toClient:`
2. 或把二进制拿到 **Linux + Ghidra（支持 Mach-O）** 再跑 REA `analyze_function`。

本机已有 `E:\代码\ipa解包工具\tools\ghidra_11.4.3_PUBLIC_*.zip`，但 **Windows Ghidra 不能分析这份 IPA 的 arm64 Mach-O**。
