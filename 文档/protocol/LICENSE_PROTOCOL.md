# 设备授权 / License 协议（静态还原）

涉及三方：**手机基座**、**桌面后端**、**账号/商业云**（`47.94.92.125`）。  
手机 HTTP 头：`X-PhoneBase-License: {payload}.{signature}`

商业手机必须：`licenseRequired:true` 且 `licenseProtocol:"phonebase-commercial-v1"`。

---

## 协议常量

| 名 | 值 |
|---|---|
| 租约挑战协议 | `phonebase-local-lease-v2`（`Yp`） |
| 本地 owner 许可 | `phonebase-local-owner-v1`（`ia`） |
| 指纹 | 64 hex SHA256（设备公钥 DER） |
| nonce/epoch | 43 字符 base64url → 32 字节 |
| 支持的 base 包 | `base 1.0.12` / `1.0.11`（`Li`/`ss`） |

---

## 手机侧 HTTP（桌面 → 手机）

| 路径 | 用途 |
|---|---|
| `GET/POST /api/license/identity` | 取 `publicKey`、`deviceId`、`release`、`installId` |
| `/api/license/challenge` | 返回 `{protocol:Yp, deviceId, nonce, epoch, ownerProtocol?}` |
| `/api/license/proof` | body `{nonce}` → `{proof}`（绑定刷新） |
| `/api/license/owner` | 推送本地 owner 许可（带 License 头） |
| `/api/license/renew` | 推送/续租约；应答 `{ok, renewed}` |

---

## 账号云（桌面 → 商业服）

| 路径 | 用途 |
|---|---|
| `GET /devices` | 已绑定列表（含 `deviceKeyFingerprint`、`baseRelease`） |
| `POST /devices/challenge` | 绑定刷新：下发 per-device nonce |
| `POST /devices/bind` | `{existingOnly, devices:[{deviceId,publicKey,nonce,proof}]}` → `already_bound` 等 |
| `POST /devices/lease` | `{deviceIds, leaseChallenges?}` → `leases[]` + `results[]` |
| `POST /devices/local-owner` | 本地 owner 许可签发（新版 base） |

`results.status` 映射：
`not_bound` → `DEVICE_NOT_BOUND`  
`quota_expired` → `DEVICE_ENTITLEMENT_EXPIRED`  
`rental_exclusive` → `RENTAL_EXCLUSIVE_CONTROL`  
`release_blocked` → `DEVICE_RELEASE_BLOCKED`  
`challenge_required` → `PHONE_CHALLENGE_REQUIRED`

---

## 主流程（连上在线手机后）

```
1) identity
   手机 publicKey → SHA256(PKCS1 DER) 必须等于 deviceId（及已存 fingerprint）

2) 若 baseRelease 需刷新绑定：
   云 /devices/challenge → 手机 /api/license/proof → 云 /devices/bind

3) 手机 /api/license/challenge
   → 云 /devices/lease 或 /devices/local-owner（带 nonce+epoch）
   → 得到 lease/permit：{payload, signature}

4) 校验：
   - 普通租约：nl()  aud=phonebase-device，permissions 含 view+control
     有效窗 exp-iat ≤ 30s；v2 本地协议带 phoneNonce/phoneEpoch
   - 本地 owner：Xp() aud=phonebase-local-owner，purpose=local-owner

5) 推送到手机：
   License 头 = payload.signature
   → /api/license/owner 或 /api/license/renew
```

全程有并发闸（约 8 路 challenge、24 路 push）、10s denied 冷却、绑定失败码写入设备状态。

---

## 令牌形状（摘要）

**设备租约 `nl`（aud=`phonebase-device`）**
- `iss=phonebase-commerce`
- `permissions` ⊇ `view`,`control`
- 可选 `localProtocol=phonebase-local-lease-v2` + `phoneNonce`/`phoneEpoch`/`baseRelease`

**本地 owner `Xp`（aud=`phonebase-local-owner`）**
- `purpose=local-owner`，`protocol=phonebase-local-owner-v1`
- 含 `permitId`、`bindingGeneration`、`entitlementId`、`commercialExpiresAt`、`graceExpiresAt` 等 UUID/时间字段

验签：RSA-SHA256，公钥 `sl`（商业签发钥，与 release 的 `Kp` 同类嵌入）。

---

## 切片

- `license_routes.js` — 绑定/租约状态机原文  
- `license_Xp.js` / `license_nl.js` — 令牌校验  
'''
