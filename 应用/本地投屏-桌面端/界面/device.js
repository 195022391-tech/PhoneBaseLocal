import {
  ControlClient,
  VideoSession,
  mapControlKey,
  normalizeControlText,
  mapPointerCoords,
  presentationRotationFor,
  createPointerMoveScheduler,
} from "./player.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ip = params.get("ip") || "";
const port = Number(params.get("port") || 11019);
const name = params.get("name") || ip;
const deviceId = params.get("deviceId") || "";
let presentation = params.get("mode") === "portrait" ? "portrait" : "landscape";

document.title = name ? `${name} · 设备投屏` : "设备投屏";
$("device-title").textContent = name || "设备投屏";
$("device-short-id").textContent = deviceId ? deviceId.slice(0, 8) : "—";
$("device-address").textContent = ip ? `${ip}:${port}` : "缺少地址";
$("detail-name").textContent = name || "—";
$("detail-id").textContent = deviceId || "—";
$("detail-address").textContent = ip ? `${ip}:${port}` : "—";
$("device-window").dataset.mode = presentation;

/** 对齐官方 M.rotation / presentationRotation */
let rotation = 0;
/** 展示尺寸（源按 rotation 换边），对齐 phonebase-device-rotate 的 width/height */
let displayWidth = 0;
let displayHeight = 0;
/** 用户点旋转菜单后锁定；切 portrait/landscape 模式时清空 */
let explicitRotation = null;
/** /api/info 或 geometry 的源分辨率（未旋转） */
let deviceSource = { width: 0, height: 0 };
let controlling = false;
let control = null;
let session = null;
let fpsTimer = null;
let lastFrames = 0;
let lastFitKey = "";
/** 点过「放大」后保持拉满，避免 onSize/方向回调把窗又收小 */
let preferFillWorkArea = false;
let fitInFlight = false;
let fitTimer = null;
let homeBusy = false;
/** 由 bindPointer 写入：Home 前取消手势（对齐官方 cancelGesture） */
let cancelActiveGesture = () => {};

function normRotation(deg) {
  return ((Number(deg) % 360) + 360) % 360;
}

/** 手机原始帧尺寸（未旋转），供 De() / Ve() */
function sourceFrameSize() {
  const g = control?.geometry;
  if (g?.width && g?.height) return { width: g.width, height: g.height };
  if (deviceSource.width && deviceSource.height) return { ...deviceSource };
  const canvas = $("device-canvas");
  return { width: canvas?.width || 0, height: canvas?.height || 0 };
}

/** 官方：M={mode,rotation,width,height} → displayWidth/Height，再 Ce + phonebase-device-rotate */
function applyPresentation() {
  const { width: w0, height: h0 } = sourceFrameSize();
  let w = w0;
  let h = h0;
  if (!w || !h) {
    w = deviceSource.width || 0;
    h = deviceSource.height || 0;
  }
  rotation =
    explicitRotation != null
      ? normRotation(explicitRotation)
      : presentationRotationFor(presentation, w, h);
  const swap = rotation === 90 || rotation === 270;
  displayWidth = swap ? h : w;
  displayHeight = swap ? w : h;
  const mode =
    explicitRotation == null
      ? presentation
      : displayWidth > displayHeight
        ? "landscape"
        : "portrait";
  $("device-window").dataset.mode = mode;
  $("rotation-device-menu").querySelector(".rotation-menu-status").textContent = `当前 ${rotation}°`;
  // 官方：模式用 Ve 旋进画面；旋转菜单改 presentationRotation，走 CSS（勿与 bake 叠两层）
  const bakeMode = explicitRotation != null ? "original" : presentation;
  session?.player?.setPresentation?.(bakeMode);
  lastFitKey = "";
  void fitWindowToVideo(preferFillWorkArea);
}

function setPresentation(mode) {
  presentation = mode === "portrait" ? "portrait" : "landscape";
  explicitRotation = null;
  applyPresentation();
}

/** geometry.orientation：1/2 竖，3/4 横；用户点过旋转菜单则不抢 */
function followPhoneOrientation(geometry) {
  if (explicitRotation != null) return;
  const o = Number(geometry?.orientation);
  if (![1, 2, 3, 4, 5, 6, 7, 8].includes(o)) return;
  const landscape = o === 3 || o === 4 || o === 7 || o === 8;
  const next = landscape ? "landscape" : "portrait";
  if (next === presentation) {
    if (preferFillWorkArea) scheduleFitWindow(true);
    return;
  }
  setPresentation(next);
}

/**
 * 对齐官方 Ce()：style 按未旋转 bitmap 设宽高，再用 CSS rotate；
 * 占位盒按旋转后换边 contain。宽高按同一 scale 推导，避免放大后独立 round 比例漂移导致 De 点偏。
 */
function layoutCanvas() {
  const screen = $("screen");
  const canvas = $("device-canvas");
  if (!screen || !canvas) return;
  const cssRot = explicitRotation != null ? rotation : 0;
  const sw = screen.clientWidth;
  const sh = screen.clientHeight;
  const cw = canvas.width || displayWidth;
  const ch = canvas.height || displayHeight;
  const boxW = cssRot % 180 === 90 ? ch : cw;
  const boxH = cssRot % 180 === 90 ? cw : ch;
  if (cw > 0 && ch > 0 && sw > 0 && sh > 0) {
    const scale = Math.min(sw / boxW, sh / boxH);
    // 先定一边再按源比例推另一边，避免放大后 W/H 独立 round 导致 De letterbox 点偏
    const styleW = Math.max(1, Math.round(cw * scale));
    const styleH = Math.max(1, Math.round((styleW * ch) / cw));
    canvas.style.width = `${styleW}px`;
    canvas.style.height = `${styleH}px`;
  } else {
    canvas.style.width = `${Math.max(1, sw)}px`;
    canvas.style.height = `${Math.max(1, sh)}px`;
  }
  canvas.style.transform = cssRot
    ? `translate(-50%, -50%) rotate(${cssRot}deg)`
    : "translate(-50%, -50%)";
}

/** 对齐官方 phonebase-device-rotate：用 displayWidth/Height 调窗 */
async function fitWindowToVideo(fillWorkArea = false) {
  if (fitInFlight) return;
  let vw = displayWidth;
  let vh = displayHeight;
  // 无显式旋转且已 bake 时，canvas 即展示尺寸
  const canvas = $("device-canvas");
  const real =
    explicitRotation == null &&
    canvas &&
    canvas.width >= 16 &&
    canvas.height >= 16 &&
    !(canvas.width === 300 && canvas.height === 150);
  if (real && vw > 0 && vh > 0) {
    const canvasLandscape = canvas.width >= canvas.height;
    const displayLandscape = vw >= vh;
    if (canvasLandscape === displayLandscape) {
      vw = canvas.width;
      vh = canvas.height;
    }
  } else if (real && (!vw || !vh)) {
    vw = canvas.width;
    vh = canvas.height;
  }
  if (!vw || !vh) {
    layoutCanvas();
    return;
  }
  const key = `${vw}x${vh}:${rotation}:${fillWorkArea ? "max" : "fit"}:${explicitRotation ?? "ve"}`;
  if (key === lastFitKey) {
    layoutCanvas();
    return;
  }
  lastFitKey = key;
  fitInFlight = true;
  try {
    await window.desktopLocal?.fitDeviceContent?.({
      videoWidth: vw,
      videoHeight: vh,
      rotation: 0,
      fillWorkArea: !!fillWorkArea,
    });
  } catch {
    /* ignore */
  } finally {
    fitInFlight = false;
  }
  layoutCanvas();
}

/** Home 后画面剧变时合并 fit，避免放大窗连续 setContentSize 卡死 */
function scheduleFitWindow(fillWorkArea = preferFillWorkArea) {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    void fitWindowToVideo(fillWorkArea);
  }, 120);
}

function setScreen(title, status) {
  $("screen-title").textContent = title;
  $("screen-status").textContent = status;
}

function showPlaceholder(show) {
  $("screen-placeholder").hidden = !show;
}

function setRtt(ms) {
  $("network-rtt").textContent = ms != null ? `接口 RTT ${ms} ms` : "接口 RTT —";
  $("detail-network").textContent = ms != null ? `${ms} ms` : "—";
}

function applyRotation(deg) {
  explicitRotation = normRotation(deg);
  applyPresentation();
}

/** 官方独立设备窗口默认全分辨率 /video（不用墙模式 maxDimension） */
function getProfile() {
  return { profile: "foreground" };
}

async function start() {
  if (!ip || !window.desktopLocal?.probeInfo) {
    setScreen("无法连接", "缺少 IP 或 preload");
    return;
  }
  setScreen("正在连接设备", "读取 /api/info…");
  let body;
  let rtt = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = performance.now();
    body = await window.desktopLocal.probeInfo(ip, port);
    rtt = Math.round(performance.now() - t0);
    setRtt(rtt);
    if (body.ok) break;
    setScreen("正在连接设备", `第 ${attempt}/3 次失败：${body.error || "探测失败"}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!body?.ok) {
    setScreen(
      "连接失败",
      `${body?.error || "探测失败"}\n请确认手机显示 build=0.1.6-thread-http，并彻底滑掉旧进程后重开`
    );
    return;
  }
  const info = body.info || {};
  const shownName = info.name || name || "设备投屏";
  document.title = `${shownName} · 设备投屏`;
  $("device-title").textContent = shownName;
  $("device-short-id").textContent = (info.deviceId || deviceId || "—").slice(0, 8);
  $("detail-name").textContent = shownName;
  $("detail-id").textContent = info.deviceId || deviceId || "—";
  $("device-address").textContent = `${body.ip}:${body.port}`;
  $("detail-address").textContent = `${body.ip}:${body.port}`;
  const srcW = Number(info.geometry?.width || info.width) || 0;
  const srcH = Number(info.geometry?.height || info.height) || 0;
  if (srcW >= 2 && srcH >= 2) deviceSource = { width: srcW, height: srcH };
  applyPresentation();
  const baseWs = `ws://${body.ip}:${body.port}`;

  const canvas = $("device-canvas");
  session = new VideoSession({
    canvas,
    getProfile,
    presentation,
    onFrameTs: (ts) => control?.setFrameTs(ts),
    onFirstFrame: () => {
      showPlaceholder(false);
      $("capture-device").disabled = false;
      setScreen("已连接", "画面就绪 · 可直接控制");
      $("detail-resolution").textContent = `${canvas.width}×${canvas.height}`;
      applyPresentation();
    },
    onSize: (w, h) => {
      $("detail-resolution").textContent = `${w}×${h}`;
      // 只同步展示尺寸并 layout，避免每次 onSize 清 lastFitKey 再 setContentSize 卡顿
      if (Math.abs(displayWidth - w) > 1 || Math.abs(displayHeight - h) > 1) {
        displayWidth = w;
        displayHeight = h;
        lastFitKey = "";
        scheduleFitWindow(preferFillWorkArea);
      } else {
        layoutCanvas();
      }
    },
    onStatus: (t) => {
      $("screen-status").textContent = t;
      $("stream-notice").hidden = false;
      $("stream-notice").textContent = t;
    },
    onError: (e) => {
      $("stream-notice").hidden = false;
      $("stream-notice").textContent = e;
    },
  });

  fpsTimer = setInterval(() => {
    if (!session) return;
    const n = session.player.frames;
    $("detail-fps").textContent = `${Math.max(0, n - lastFrames)} fps`;
    lastFrames = n;
    if (canvas.width && canvas.height) $("detail-resolution").textContent = `${canvas.width}×${canvas.height}`;
    $("settings-profile").textContent = "foreground · 全分辨率";
  }, 1000);

  try {
    await session.open(baseWs);
  } catch (e) {
    setScreen("画面失败", e.message || String(e));
    return;
  }

  // 有 publisher 无首帧：多为手机基座未推 IDR / 旧 IPA；超时提示重装
  setTimeout(() => {
    if (!session || session.player.frames > 0) return;
    setScreen(
      "正在连接设备",
      "已连上发布端但无画面帧。请确认手机 build=0.1.19-encode-fix，彻底杀掉旧基座后重开"
    );
  }, 5000);

  // 默认直接开启控制，无需开关
  try {
    control = new ControlClient({
      url: `${baseWs}/control`,
      onReady: (msg) => {
        $("detail-status").textContent = "控制中";
        updateTextCapability(msg);
        if (msg?.geometry?.width && msg?.geometry?.height) {
          deviceSource = { width: msg.geometry.width, height: msg.geometry.height };
        }
        followPhoneOrientation(msg?.geometry);
        applyPresentation();
      },
      onGeometry: (geometry) => {
        if (geometry?.width && geometry?.height) {
          deviceSource = { width: geometry.width, height: geometry.height };
        }
        followPhoneOrientation(geometry);
      },
      onError: (e) => {
        $("detail-status").textContent = String(e);
      },
    });
    await control.connect();
    controlling = true;
    canvas.classList.add("touch-control");
    $("home-device").disabled = false;
    bindPointer(canvas);
    bindKeyboard(canvas);
    focusKeyCapture();
  } catch (e) {
    $("detail-status").textContent = e.message || String(e);
    setScreen("画面已连接", `控制未就绪: ${e.message || e}`);
  }
}

let inputArmed = false;
let composing = false;
let noticeTimer = null;
/** 组字结束可能 beforeinput+compositionend 双发，短时去重 */
let lastCompositionSent = { t: 0, text: "" };

function setTextStatus(text, isError = false) {
  const el = $("device-text-status");
  if (el) {
    el.textContent = text || "";
    el.classList.toggle("error", !!isError && !!text);
  }
  // 画面上始终可见，避免面板收起时“没任何提示”
  showInputNotice(text, isError);
}

function showInputNotice(text, isError = false) {
  const notice = $("stream-notice");
  if (!notice || !text) return;
  notice.hidden = false;
  notice.textContent = text;
  notice.classList.toggle("error", !!isError);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (notice.textContent === text) notice.hidden = true;
  }, isError ? 5000 : 1600);
}

function updateTextCapability(msg) {
  const textOk = control?.textAvailable === true;
  const keyOk = control?.keyboardAvailable === true;
  // 能力位仅作提示：实际输入一律强制下发 text/key
  const detail = textOk || keyOk
    ? `键盘可用 · 点画面后直接打字`
    : `基座声明 textAvailable=false，仍将尝试发送；若手机无字请换支持键盘的官方本地基座 IPA`;
  setTextStatus(detail, !textOk && !keyOk);
  $("device-text-send").disabled = false;
  $("device-text-input").disabled = false;
  $("detail-status").textContent = `控制中 · text=${textOk ? "开" : "关"} key=${keyOk ? "开" : "关"}`;
}

function keyCapture() {
  return $("device-key-capture");
}

function focusKeyCapture() {
  const capture = keyCapture();
  if (!capture || !controlling || !control?.ready) return;
  inputArmed = true;
  try {
    capture.focus({ preventScroll: true });
  } catch {
    $("device-canvas")?.focus({ preventScroll: true });
  }
}

function bindPointer(canvas) {
  const point = (ev, clamp) => {
    // 官方 De(canvasRect, frameW, frameH, …, presentationRotation)：
    // 始终用【源帧】+ 展示角；bake/CSS 只影响怎么画，不把 rot 置 0（放大后否则点位全偏）
    const src = sourceFrameSize();
    const fw = src.width;
    const fh = src.height;
    if (!fw || !fh) return null;
    const rot =
      explicitRotation != null
        ? rotation
        : presentationRotationFor(presentation, fw, fh);
    return mapPointerCoords(
      canvas.getBoundingClientRect(),
      fw,
      fh,
      ev.clientX,
      ev.clientY,
      clamp,
      rot
    );
  };
  let pid = null;
  // 官方：move ≤30fps 合并；up 前 flush 最后一点
  const moves = createPointerMoveScheduler((x, y) => control?.pointer?.("move", x, y));
  cancelActiveGesture = () => {
    moves.clear();
    if (pid == null) return;
    try {
      control?.pointer?.("cancel", 0, 0);
    } catch {
      /* ignore */
    }
    try {
      canvas.releasePointerCapture?.(pid);
    } catch {
      /* ignore */
    }
    pid = null;
  };
  canvas.onpointerdown = (ev) => {
    if (!controlling || !control?.ready) return;
    if (ev.button === 0) focusKeyCapture();
    const pt = point(ev, false);
    if (!pt) return;
    moves.clear();
    canvas.setPointerCapture(ev.pointerId);
    pid = ev.pointerId;
    control.pointer("down", pt.x, pt.y);
    ev.preventDefault();
  };
  canvas.onpointermove = (ev) => {
    if (pid !== ev.pointerId) return;
    const pt = point(ev, true);
    if (!pt) return;
    moves.move(pt.x, pt.y);
    ev.preventDefault();
  };
  const up = (ev) => {
    if (pid !== ev.pointerId) return;
    const pt = point(ev, true);
    moves.flush();
    if (pt) control.pointer("up", pt.x, pt.y);
    else moves.clear();
    pid = null;
    // 松手后夺回键盘焦点，避免被 canvas capture 抢走
    focusKeyCapture();
  };
  canvas.onpointerup = up;
  canvas.onpointercancel = up;
}

function sendCompositionText(raw) {
  if (!raw) return;
  const now = Date.now();
  if (raw === lastCompositionSent.text && now - lastCompositionSent.t < 120) return;
  lastCompositionSent = { t: now, text: raw };
  void sendControlText(raw);
}

async function sendControlText(raw, { clearInput = false } = {}) {
  if (!control?.ready) {
    setTextStatus("控制未就绪", true);
    return false;
  }
  try {
    const text = normalizeControlText(raw);
    // 能力位 false 时仍强制发送：官方基座若误报，仍可能注入成功
    const forced = !control.canText;
    await control.text(text, { force: true });
    setTextStatus(
      forced
        ? `已强制发送「${text.length > 12 ? `${text.slice(0, 12)}…` : text}」（基座声明 textAvailable=false）`
        : `已发送「${text.length > 12 ? `${text.slice(0, 12)}…` : text}」`
    );
    if (clearInput) $("device-text-input").value = "";
    const capture = keyCapture();
    if (capture) capture.value = "";
    $("toggle-text-input").dataset.unsent = "false";
    return true;
  } catch (e) {
    setTextStatus(e.message || String(e), true);
    $("toggle-text-input").dataset.unsent = "true";
    return false;
  }
}

async function sendControlKey(name) {
  if (!control?.ready) {
    setTextStatus("控制未就绪", true);
    return;
  }
  try {
    await control.key(name, { force: true });
    setTextStatus(
      control.canKey ? `已发送按键 ${name}` : `已强制发送按键 ${name}（基座声明 keyboardAvailable=false）`
    );
  } catch (e) {
    setTextStatus(e.message || String(e), true);
  }
}

function isTypingTarget(el) {
  if (!el || el === document.body) return false;
  if (el === $("device-text-input")) return true;
  if (el.closest?.("dialog,input,textarea,select,[contenteditable=true]")) {
    // 隐藏 capture 不算“普通输入框”
    if (el === keyCapture() || el.id === "device-key-capture") return false;
    return true;
  }
  return false;
}

function handleTypedKeyDown(e) {
  if (!controlling || !control?.ready || !inputArmed || composing || e.isComposing) return false;
  if (isTypingTarget(e.target)) return false;
  const mapped = mapControlKey(e.key);
  if (mapped) {
    e.preventDefault();
    sendControlKey(mapped);
    return true;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    sendControlText(e.key);
    return true;
  }
  return false;
}

function bindKeyboard(canvas) {
  const capture = keyCapture();
  const targets = [canvas, capture].filter(Boolean);

  // 窗口级兜底：点过画面后即使焦点丢失也能打字（Electron 常见）
  window.addEventListener(
    "keydown",
    (e) => {
      handleTypedKeyDown(e);
    },
    true
  );

  for (const el of targets) {
    el.addEventListener("beforeinput", (e) => {
      if (!controlling || !control?.ready || !inputArmed || composing || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      if (e.inputType === "insertFromComposition") {
        // 中文等 IME：以前只 prevent 不发送，组字结果被吞；数字不走组字所以看起来「数字行文字不行」
        e.preventDefault();
        if (e.data) sendCompositionText(e.data);
        return;
      }
      if (e.inputType === "insertText" && e.data) {
        e.preventDefault();
        sendControlText(e.data);
        return;
      }
      if (["insertParagraph", "insertLineBreak"].includes(e.inputType)) {
        e.preventDefault();
        sendControlKey("enter");
        return;
      }
      if (e.inputType === "deleteContentBackward") {
        e.preventDefault();
        sendControlKey("backspace");
      }
    });
    el.addEventListener("paste", (e) => {
      if (!controlling || !control?.ready || !inputArmed || composing) return;
      if (isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData("text/plain");
      e.preventDefault();
      if (text) sendControlText(text);
    });
    el.addEventListener("compositionstart", () => {
      composing = true;
    });
    el.addEventListener("compositionend", (e) => {
      composing = false;
      if (e.data) sendCompositionText(e.data);
      if (capture) capture.value = "";
    });
    el.addEventListener("input", () => {
      if (!composing && capture && el === capture) capture.value = "";
    });
  }

  // Electron 焦点常不在 canvas：窗口级也收组字结束
  window.addEventListener("compositionstart", () => {
    if (inputArmed) composing = true;
  });
  window.addEventListener("compositionend", (e) => {
    if (!inputArmed) return;
    composing = false;
    if (e.data) sendCompositionText(e.data);
    if (capture) capture.value = "";
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.target?.closest?.("#screen, #device-canvas, #device-key-capture")) {
        if (!e.target?.closest?.("#device-keyboard-tools")) inputArmed = false;
      }
    },
    true
  );
}

async function maximizeToWorkArea() {
  preferFillWorkArea = !preferFillWorkArea;
  await window.desktopLocal?.toggleMaximize?.();
  lastFitKey = "";
  await fitWindowToVideo(preferFillWorkArea);
}
$("win-min").onclick = () => window.desktopLocal?.windowMinimize?.();
$("win-max").onclick = () => void maximizeToWorkArea();
$("close-device").onclick = () => window.desktopLocal?.windowClose?.() ?? window.close();
$("home-device").onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (homeBusy || !control?.ready) return;
  homeBusy = true;
  // 官方：Home 前 cancelGesture，避免触控 capture 与放大窗 fit 缠在一起卡死
  void control
    .home({ cancelGesture: cancelActiveGesture })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => {
        homeBusy = false;
      }, 400);
    });
};
$("maximize-device").onclick = () => void maximizeToWorkArea();
window.desktopLocal?.onDeviceSetMode?.((payload) => {
  if (payload?.mode) setPresentation(payload.mode);
});
$("capture-device").onclick = () => {
  const canvas = $("device-canvas");
  if (!canvas.width) return;
  const a = document.createElement("a");
  a.download = `phonebase-${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
};

$("open-details").onclick = () => $("details-dialog").showModal();
$("open-settings").onclick = () => $("settings-dialog").showModal();
$("toggle-text-input").onclick = () => {
  const panel = $("device-keyboard-tools");
  const open = panel.hidden;
  panel.hidden = !open;
  $("toggle-text-input").setAttribute("aria-expanded", open ? "true" : "false");
  $("toggle-text-input").setAttribute("aria-pressed", open ? "true" : "false");
  if (open) {
    $("device-text-input").focus();
    updateTextCapability();
  }
};
$("device-text-send").onclick = () => {
  sendControlText($("device-text-input").value, { clearInput: true });
};
$("device-text-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendControlText($("device-text-input").value, { clearInput: true });
  }
});
for (const dlg of document.querySelectorAll("dialog")) {
  dlg.querySelector(".close-dialog")?.addEventListener("click", () => dlg.close());
}

$("rotate-device").onclick = (e) => {
  e.stopPropagation();
  const menu = $("rotation-device-menu");
  menu.hidden = !menu.hidden;
  $("rotate-device").setAttribute("aria-expanded", menu.hidden ? "false" : "true");
};
$("rotation-device-menu").onclick = (e) => {
  const item = e.target.closest("[data-rotation]");
  if (!item) return;
  const v = item.dataset.rotation;
  if (v === "reset") {
    explicitRotation = null;
    applyPresentation();
  } else if (v === "90") applyRotation(rotation + 90);
  else if (v === "-90") applyRotation(rotation - 90);
  else if (v === "180") applyRotation(rotation + 180);
  $("rotation-device-menu").hidden = true;
};

window.addEventListener("resize", () => layoutCanvas());
new ResizeObserver(() => layoutCanvas()).observe($("screen"));

window.addEventListener("beforeunload", () => {
  clearInterval(fpsTimer);
  control?.close();
  session?.close();
});

layoutCanvas();
start();
