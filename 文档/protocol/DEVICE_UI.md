# 设备窗口 UI（device.js）静态还原

页面：`web/device.html` + `device.js`  
宿主：WebView2；主窗口通过 `chrome.webview.postMessage` 开/关子窗。

---

## 窗口桥（WebView2）

检测：`phonebaseDeviceWindow===true && chrome.webview`

| 方向 | type | 含义 |
|---|---|---|
| 主 UI → 宿主 | `phonebase-open-device` | `{deviceId, mode, width, height, rental?}` |
| 宿主 → 主 UI | `phonebase-device-window` | `{deviceId, state: open\|closed\|error, rental?}` |
| 设备页 → 宿主 | `phonebase-device-title` | 同步标题 |
| 设备页 → 宿主 | `phonebase-device-rotate` | `{mode, width, height, rotation}` |
| 设备页 → 宿主 | `phonebase-device-maximize` | 放大（非原生则走 Fullscreen API） |
| 设备页 → 宿主 | `phonebase-device-close` | 关闭 |
| 宿主 → 设备页 | `locked` / `recovery` | 锁会话 / 恢复世代 |

租赁：`?rental=1`；默认演示分辨率假设 `750×1334` portrait。

---

## 画面与控制开关

- Canvas `#device-canvas` 显示 WebCodecs 解码帧（见 `VIDEO_PROTOCOL.md`）
- `#control-toggle` → `toggleControl()`；开启后 canvas 加 class `touch-control`
- 失焦 / `visibilitychange` / `pagehide` → `suspend`；回来 → `resume`
- 工具：Home、方向菜单（portrait/landscape）、截图 PNG、文本输入、编码设置（fps/码率）

---

## 触控坐标：`De()` → 0..1

```js
point(e, clamp=false) =
  De(canvas.getBoundingClientRect(),
     frame.width, frame.height,
     e.clientX, e.clientY,
     clamp,
     presentationRotation)  // 0|90|180|270
```

`De` 逻辑：
1. 按旋转决定内容宽高是否互换  
2. letterbox：`scale = min(boxW/contentW, boxH/contentH)`，居中  
3. 归一化到画面内 `[0,1]²`（`clamp=false` 时出界返回 `null`）  
4. 再按旋转映射：
   - 0° → `(x,y)`
   - 90° → `(y, 1-x)`
   - 180° → `(1-x, 1-y)`
   - 270° → `(1-y, x)`

---

## 手势状态机

监听 canvas：`pointerdown/move/up/cancel` + `lostpointercapture`（仅主键 / primary）

| 事件 | 行为 |
|---|---|
| down | `setPointerCapture` → `command("down", {x,y})` + 触点反馈 |
| move | 合并待发送点；**≤ 30fps**（`qe=1000/30`）再 `command("move", …)` |
| up | 最后一次 `point(..., true)` → `command("up")` → releaseCapture |
| cancel / 丢指针 / 旋转 / 分辨率变 | `cancelGesture()` → 发 `pointer/cancel` |

每条 pointer 自动附带：
`geometryRevision`、`frameTimestampUs`（见 `CONTROL_PROTOCOL.md`）。

`canPoint` = 控制 ready 且 `frame` 与 `geometry` 尺寸对齐。

---

## 键盘 / 文本

- 画布 keydown：单字符 → `text`（可 coalesce）；映射键 → `key`（backspace/enter/…）
- `beforeinput`：insertText / 换行 / 退格  
- 输入法 composition 期间暂存，结束再发  
- Home 按钮 → `button/home`（并 bump `inputEpoch`、取消手势）

---

## 与主界面关系

主页双击设备 → `phonebase-open-device` → 宿主开 WebView 载入 `device.html`  
设备页自管 `/view` 视频 + `/control` 触控；主页只做列表/扫描/账号。

切片：`device_coord_De.js`、`DEVICE_UI_RAW.md`、`device.html.txt`
'''
