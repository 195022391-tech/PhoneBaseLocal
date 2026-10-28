# 手机基座 IPA：DirectPhoneBase 1.0.12

源：`手机基座(1).ipa`  
SHA-256：`118fb017f22a346342a3054d7b5b75b51ea8e2b30f7c102a787ee5e642c903ed`  
解压副本：`证据/ipa/DirectPhoneBase.app-extracted/DirectPhoneBase.app/`

## 包结构

| 路径 | 大小 | 角色 |
|---|---|---|
| `PhoneBaseDirect` | 369 KB | 宿主 App（UI / 拉起助手 / 本地探测） |
| `LanCaptureHelper` | 2.4 MB | 实际投屏服务（HTTP + WS + 采集 + 触控 + 授权） |
| `Info.plist` | — | `cn.local.phonebase.direct`，版本 **1.0.12 (38)**，iOS 14+ |
| `license-root.cer` | — | 商业 license 根证 |
| `phone-direct-root.cer` | — | Direct 通道根证 |
| `ThirdPartyNotices.txt` | — | 含 libdatachannel / juice 等 |

Bonjour：`_phonebase._tcp`；ATS 允许任意/本地网络；后台模式 `network-authentication`。

内嵌构建串与真机一致：`base-1.0.12-20261027-1`，`licenseRequired` + `phonebase-commercial-v1`。

## 进程分工

```
PhoneBaseDirect (宿主)
  ├─ 启动 Widget / network-startup / network-wake
  ├─ 拉起 LanCaptureHelper
  └─ 用 http://127.0.0.1:{port}/api/info|control/* 探活与管控

LanCaptureHelper (服务)
  ├─ PBLocalService     HTTP + WS
  ├─ PBCapture          画面采集
  ├─ PBVideoEncoder     VT H.264
  ├─ PBTouchInjector    IOHID 注入
  ├─ PBCommercialLicense / local-owner / rental-lock
  ├─ PBP2PMedia         WebRTC (libdatachannel) + STUN
  └─ PBBonjourPublisher _phonebase._tcp
```

## HTTP（助手侧）

- `/api/info` `/api/health` `/api/screenshot` `/api/video-settings`
- `/api/control/stop|restart|memory-guard`
- `/api/license/challenge|identity|owner|proof|renew`
- `/api/cloud-host/config`

## WebSocket

- `/video`、`/control`（本机 `ws://127.0.0.1:%u%@`）
- 云：`wss://47.94.92.125:8444/device-host/connect`
- STUN：`stun:47.94.92.125:8445`
- 头：`X-PhoneBase-License`、`X-PhoneBase-Control-Policy`、`X-PhoneBase-Control-Session`、`X-PhoneBase-Session`

## 授权相关协议名（字符串）

- `phonebase-commercial-v1`
- `phonebase-local-owner` / `phonebase-local-owner-v1` / `local-owner`
- `phonebase-rental-lock` / `rental-lock-challenge` / `rental-lock-ack`
- `phonebase-p2p-frame-clock-v1`
- `phonebase-video-settings`

本地租赁：`createLocalLeaseChallenge` / `verifyLeaseHeader` / `renewLocalLease`；另有 `verifyP2PMediaLeaseHeader`。

## 采集与控制（原生）

- 采集：`IOSurface` + `VideoToolbox`（`VTCompressionSession`，H.264 Baseline）
- 触控：`PBTouchInjector` → `IOHIDEventCreateDigitizer*` / `Keyboard` / `Unicode` + `IOHIDEventSystemClientDispatchEvent`
- 权限标识串：`IOSurfaceRootUserClient`、`IOHIDLibUserClient`（免越狱/巨魔类注入路径）

## ObjC 主类（助手）

`PBLocalService` `PBCapture` `PBVideoEncoder` `PBTouchInjector` `PBCommercialLicense` `PBClient` `PBOutbound` `PBP2PMedia` `PBBonjourPublisher` `PBDirectCloudPublisher` `PBDirectController` `PBSettingsGuard` `PBConnectivityProbe` `PBEncodedFrame` `PBVideoOrientation`

## 与桌面文档对齐

| 桌面已文档 | 手机侧证据 |
|---|---|
| `VIDEO_PROTOCOL.md` PHB1 / H.264 | VT 编码 + `/video` WS + h264 帧计数 |
| `CONTROL_PROTOCOL.md` | `/control` + `PBTouchInjector` IOHID |
| `LICENSE_PROTOCOL.md` | `/api/license/*` + `PBCommercialLicense` |
| `P2P_PROTOCOL.md` | libdatachannel、STUN 8445、sdp-offer/answer |
| `COMMERCIAL_AND_TLS.md` | 47.94.92.125:8443/8444 + 内嵌 cer |

## 局限

- 当前环境 REA `inspect_plist` / `inspect_macho` / `get_objc_classes` 输出 schema 异常；本笔记以 artifact 图 + 二进制字符串/符号为准，**未**做伪代码级反编译。
- 下一步若要深挖：对 `LanCaptureHelper` 开 Ghidra/Hopper，优先 `PBLocalService`、`PBTouchInjector`、`PBCommercialLicense`、`appendPacket:video:toClient:`。
