# entry.mjs 拆包地图

源文件：`artifacts/desktop/payload/backend/entry.mjs`（或根目录 `payload/backend/entry.mjs`，约 1.12MB，esbuild 打包，无 source map）  
切片目录：`research/desktop-slices/NN_*.js`（**不可直接运行**，仅标注偏移便于阅读）  
协议文档：`文档/protocol/`

## 阅读顺序（推荐）

| 顺序 | 文件 | 内容 |
|---|---|---|
| 1 | `00_banner_help.js` / `01_cli_parse.js` / `02_cli_main.js` | CLI、stdin=`shutdown`、smoke/self-test |
| 2 | `03_ports_defaults.js` | `Ni=11019` 手机主端口，`Ku=8879` 扫描备用 |
| 3 | `05_device_validate.js` + `device_advertise_schema.js` | `lan-phonebase` 设备校验与广告字段 |
| 4 | `06_mdns_browse.js` | Bonjour `type=phonebase` tcp，窗口 800ms |
| 5 | `07_scan_pool.js` | 并发探测池 `Op`、回落 11019 |
| 6 | `16_api_scan.js` + `15_api_devices.js` | HTTP 路由：scan/devices/IPA 下载 |
| 7 | `13_health_caps.js` / `health_capabilities.js` | `/api/health` 能力位 |
| 8 | `11_tls_paths.js` | `tls/server-cert.pem` + `server-key.pem` |
| 9 | `17_api_license.js` + `23_ws_license_header.js` | 授权 + `X-PhoneBase-License` |
| 10 | `08_commercial_base.js` + `09_release_handshake.js` | 云 `…/commercial/v1`、`/release/handshake` |
| 11 | `14_api_account.js` + `10_account_store.js` | 本地账号、`account-client-id` |
| 12 | `19_local_guest.js` | 访客会话/租约 |
| 13 | `20_gateway.js` + `21_direct_host.js` | 云网关 / direct-host |
| 14 | `22_p2p_stun.js` + `24_control_msgs.js` | STUN `8445`、控制与媒体 |
| 15 | `CONTROL_PROTOCOL.md` | 触控/按键线协议 |
| 16 | `VIDEO_PROTOCOL.md` | `PHB1` H.264/AVCC 视频帧 |
| 17 | `P2P_PROTOCOL.md` | WebRTC 信令 + PBPN 探测 + frame-clock |
| 18 | `COMMERCIAL_AND_TLS.md` | 自签 HTTPS + release/handshake |
| 19 | `LICENSE_PROTOCOL.md` | 手机 challenge / lease / License 头 |
| 20 | **`DEVICE_UI.md`** | **设备窗 / 触控映射 / WebView 桥** |

前端切片：`research/web-slices/`（`scan_ui` / `device_window` / `p2p` / `account` …）

## 路由总表

见 `ROUTES.txt`（54 条路径字符串）。

## /api/scan 行为（代码 + 实测）

```
POST /api/scan          仅 localhost 页面 + 同源校验 hi(A)
  body.async === true  → l.startScan(body)   // 异步
  否则                 → await l.scan(body)  // 同步扫完再返回
GET  /api/scan/status   → l.scanStatus()
POST /api/scan/cancel   → 仅本机；l.cancelScan()
POST /api/devices       → 本机添加
POST /api/devices/batch → 批量添加
DELETE /api/devices/:id → 移除并 reset 控制/代理
```

发现链路：
1. mDNS browse `phonebase/tcp`（800ms）
2. 子网 IP 候选端口 **8879**，探测失败回落 **11019**
3. `GET http://{ip}:{port}/api/info`（≤8KB，校验 `lan-phonebase`）
4. 通过后进入设备列表；截图/画质走手机 `/api/screenshot`、`/api/video-settings`

实测：
- `--lan-address 127.0.0.1` + 空 body → 立刻 `scanned:0`（`SCAN_LIVE.json`）
- `--lan-address 192.168.9.103` + `{"async":true}` → `total:506`（`192.168.9.1–254`），约 12s 扫完，本网无 PhoneBase 设备（`SCAN_LIVE_LAN.json`）

## 本机管理限制（反复出现）

多处 403 文案表明：**扫描/添加/移除/账号操作只能在服务器本机 localhost 页面**，且要带当前页会话（`hi(A)` / cookie）。

## IPA 下载

同进程还直接 `GET /PhoneBase-*.ipa` / TrollStore 包名；文件来自安装目录旁的构建产物，payload.zip 里**没有**这些 IPA（ENOENT →「尚未完成构建」）。
