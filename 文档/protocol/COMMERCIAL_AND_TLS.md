# 商业授权 + HTTPS 证书（静态还原）

## 1. HTTPS / TLS

后端**不生成**证书，只从 runtime 读取：

```
{runtimeDirectory}/tls/server-key.pem
{runtimeDirectory}/tls/server-cert.pem
```

- 读到 → `https` 听 `httpsPort`（默认 3443），`tlsReady:true`
- 缺失（ENOENT）→ 只开 HTTP，日志：「未找到桌面程序生成的 TLS 证书」

桌面宿主（`手机投屏控制.exe`）元数据可见：
`CreateSelfSigned` / `CertificateRequest` / `X509Certificate2` / `RSACryptoServiceProvider` / `PEM`  
→ **由 WinForms 宿主自签并写入上述 PEM**（IL 字符串被混淆，CN/SAN 未从明文还原）。

网关校验证书链时还会用：`web/license-root.cer`（亦嵌入宿主资源 `PhoneBaseRelease.license-root.cer`）。

---

## 2. 商业服

Base：`https://47.94.92.125:8443/commercial/v1`  
云网关根：`https://47.94.92.125:8443/`（`caFile=license-root.cer`）

### 内置 release 身份

```js
local: { product:"local", version:"1.0.21", buildId:"local-1.0.21-20261027-1" }
cloud: { product:"cloud", version:"0.3.0",  buildId:"cloud-0.3.0-20261017-2" }
```

`--commercial` 时 ready 带上 local release；手机还需 `licenseProtocol:"phonebase-commercial-v1"`。

### `/release/handshake`

请求（经账号 scope 的 `send`）：
```json
{
  "release": { "product", "version", "buildId" },
  "installId": "<安装实例 id>",
  "event": "startup" | "heartbeat" | ...,
  "observedHashes": {
    "app":     "<sha256 of 手机投屏控制.exe>",
    "config":  "<sha256 of 手机投屏控制.exe.config>",
    "backend": "<sha256 of backend/entry.mjs>"
  }
}
```

响应策略对象（或 `.policy`）：
```json
{
  "payload":   "<base64url JSON claims>",
  "signature": "<base64url RSA-SHA256>"
}
```

本地用嵌入的 **PKCS#1 RSA 公钥**（`Xu` → `release_pubkey.der`）验签后解析 claims：

| 字段 | 要求 |
|---|---|
| `v` | `1` |
| `iss` | `phonebase-commerce` |
| `aud` | `phonebase-release` |
| `release.*` | 与本地 product/version/buildId 一致 |
| `installId` | 与请求一致 |
| `accountId` / `sessionId` | 若有会话则必须匹配 |
| `iat` / `exp` | 有效；**`exp-iat ≤ 30` 秒** |
| `allowed` | boolean；false → `RELEASE_BLOCKED` |
| `artifactHashes` | 可选；与 observedHashes 不一致 → `INTEGRITY_FAILURE` |
| `reason` / `blockReason` | 拒绝文案 |

缓存：验过的 claims 约 **30s** 内复用；距过期 >22s 可直接 `assert`；账号切换 → `STALE_SCOPE`。

心跳事件：`heartbeat`；首次/会话变：`startup`。

### 相关错误码

`RELEASE_POLICY_INVALID` / `RELEASE_POLICY_EXPIRED` / `RELEASE_BLOCKED` / `INTEGRITY_FAILURE` / `STALE_SCOPE` / `INVALID_RELEASE_CHECK_MODE`

自测后端：`requireReleaseOnlineChecks:!1`，transport 仅允许 mock `/health`。

---

## 3. 切片

- `tls_load.js` — 读 PEM 启 HTTPS  
- `release_verify.js` / `release_client.js` — `ES` / `$p`  
- `release_pubkey.b64` / `.der` — 验签公钥  
- `host_cert_strings.txt` — 宿主加密学 API 名  
'''
