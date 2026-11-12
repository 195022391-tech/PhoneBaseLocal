export function sameBytes(a, b) {
  return !!(a && b && a.length === b.length && a.every((v, i) => v === b[i]));
}

/** @param {ArrayBuffer|Uint8Array} buf */
export function parsePhb1(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength < 21) throw new Error("PHB1 too short");
  const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  if (magic !== "PHB1") throw new Error(`bad magic ${magic}`);
  const version = u8[4];
  const flags = u8[5];
  if (version !== 1 || u8[6] !== 0 || u8[7] !== 0) throw new Error("bad PHB1 header");
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const timestampUs = Number(view.getBigUint64(8, false));
  const payloadLen = view.getUint32(16, false);
  if (u8.byteLength !== 20 + payloadLen) throw new Error("PHB1 length mismatch");
  return {
    flags,
    timestampUs,
    payload: u8.subarray(20),
    configuration: flags === 2,
    keyframe: flags === 1,
  };
}

function codecFromAvcC(avcC) {
  if (avcC.length < 4 || avcC[0] !== 1) throw new Error("invalid avcC");
  const hex = [...avcC.subarray(1, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `avc1.${hex}`;
}

/** 官方 mt/Ve（商业 v1.7）：portrait/landscape 与帧比例不一致时返回 90°（不是 270°） */
export function presentationRotationFor(mode, frameW, frameH) {
  if (mode !== "portrait" && mode !== "landscape") return 0;
  if (!Number.isFinite(frameW) || !Number.isFinite(frameH) || frameW <= 0 || frameH <= 0 || frameW === frameH) {
    return 0;
  }
  return (mode === "landscape") === frameW > frameH ? 0 : 90;
}

/**
 * 局域网跟手：用 rAF 合并（约显示刷新率），比官方云端 30fps setTimeout 更顺；
 * 手机端 HID 再做 latest-wins，两边都不堆积。
 * @param {(x:number,y:number)=>void} sendMove
 */
export function createPointerMoveScheduler(sendMove) {
  let pending = null;
  let raf = 0;
  const flush = () => {
    raf = 0;
    if (!pending) return;
    const p = pending;
    pending = null;
    sendMove(p.x, p.y);
  };
  return {
    move(x, y) {
      pending = { x, y };
      if (!raf) raf = requestAnimationFrame(flush);
    },
    flush() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      flush();
    },
    clear() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      pending = null;
    },
  };
}

/**
 * 官方 De：letterbox + presentationRotation → 手机归一化坐标 0..1
 * @param {DOMRectReadOnly|{left:number,top:number,width:number,height:number}} rect
 */
export function mapPointerCoords(rect, frameW, frameH, clientX, clientY, clamp = false, rotation = 0) {
  const n = ((Number(rotation) % 360) + 360) % 360;
  if (
    ![rect?.left, rect?.top, rect?.width, rect?.height, frameW, frameH, clientX, clientY].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    frameW <= 0 ||
    frameH <= 0 ||
    ![0, 90, 180, 270].includes(n)
  ) {
    return null;
  }
  const swap = n === 90 || n === 270;
  const contentW = swap ? frameH : frameW;
  const contentH = swap ? frameW : frameH;
  const scale = Math.min(rect.width / contentW, rect.height / contentH);
  const drawW = contentW * scale;
  const drawH = contentH * scale;
  const originX = rect.left + (rect.width - drawW) / 2;
  const originY = rect.top + (rect.height - drawH) / 2;
  let x = (clientX - originX) / drawW;
  let y = (clientY - originY) / drawH;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  if (n === 90) return { x: y, y: 1 - x };
  if (n === 180) return { x: 1 - x, y: 1 - y };
  if (n === 270) return { x: 1 - y, y: x };
  return { x, y };
}

/**
 * 墙模式画质：按卡片 CSS 宽度选 maxDimension。
 * 低占用仍随卡片放大（384→512），避免大缩略图被 384 拉伸发糊。
 */
export function wallProfileFromSize(cssSize, lowUsage) {
  const r = Math.max(0, Math.round(Number(cssSize) || 0));
  if (lowUsage) {
    const maxDimension = r < 280 ? 384 : 512;
    return { profile: "wall", maxDimension, frameRate: 15, stageSize: r, lowUsage: true };
  }
  const maxDimension = r < 220 ? 384 : r < 300 ? 512 : 768;
  const frameRate = r < 220 ? 15 : 20;
  return { profile: "wall", maxDimension, frameRate, stageSize: r, lowUsage: false };
}

export function wallProfileSticky(cssSize, lowUsage, current) {
  const r = Math.max(0, Math.round(Number(cssSize) || 0));
  const fresh = wallProfileFromSize(r, lowUsage);
  if (!current || current.profile !== "wall" || !!current.lowUsage !== !!lowUsage) return fresh;
  if (fresh.maxDimension === current.maxDimension && fresh.frameRate === current.frameRate) {
    return { ...fresh, stageSize: r };
  }
  const hyst = 24;
  if (lowUsage) {
    if (current.maxDimension === 384 && r < 280 + hyst) {
      return { profile: "wall", maxDimension: 384, frameRate: 15, stageSize: r, lowUsage: true };
    }
    if (current.maxDimension === 512 && r >= 280 - hyst) {
      return { profile: "wall", maxDimension: 512, frameRate: 15, stageSize: r, lowUsage: true };
    }
    return fresh;
  }
  if (current.maxDimension === 384 && r < 220 + hyst) {
    return { profile: "wall", maxDimension: 384, frameRate: 15, stageSize: r, lowUsage: false };
  }
  if (current.maxDimension === 512 && r >= 220 - hyst && r < 300 + hyst) {
    return { profile: "wall", maxDimension: 512, frameRate: 20, stageSize: r, lowUsage: false };
  }
  if (current.maxDimension === 768 && r >= 300 - hyst) {
    return { profile: "wall", maxDimension: 768, frameRate: 20, stageSize: r, lowUsage: false };
  }
  return fresh;
}

export function profileKey(p) {
  if (!p) return "";
  if (p.profile === "foreground") return "foreground";
  return `wall:${p.maxDimension}@${p.frameRate}`;
}

export function buildVideoUrl(base, streamProfile) {
  if (!streamProfile || streamProfile.profile === "foreground") return `${base}/video`;
  const dim = Math.max(128, Math.min(768, Math.round(streamProfile.maxDimension || 384)));
  const fps = streamProfile.frameRate === 20 ? 20 : 15;
  return `${base}/video?profile=wall&maxDimension=${dim}&frameRate=${fps}`;
}

/** 对齐商业版：pending 包队列上限 / 字节上限 / decodeQueue 阈值 */
const PENDING_WHEN_READY = 16;
const PENDING_WHEN_BUSY = 8;
const PENDING_BYTES_MAX = 2 * 1024 * 1024;
const DECODE_QUEUE_MAX = 3;
/** 官方 device.js：墙流 Gt=software-first，大窗 Ht=hardware/no-preference */
const DECODER_PREFS_WALL = ["prefer-software", "no-preference"];
const DECODER_PREFS_FOREGROUND = ["prefer-hardware", "prefer-software", "no-preference"];

export class Phb1Player {
  constructor(canvasEl, { onFrameTs, onFrames, onFirstFrame, onSize, onError, presentation = "original", wall = false } = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d", { alpha: false, desynchronized: true });
    if (this.ctx) {
      // 视频帧按像素拷贝，高品质平滑反而吃 CPU（放大窗时更明显）
      this.ctx.imageSmoothingEnabled = false;
    }
    this.onFrameTs = onFrameTs;
    this.onFrames = onFrames;
    this.onFirstFrame = onFirstFrame;
    this.onSize = onSize;
    this.onError = onError;
    // portrait | landscape | original — 与官方一致：比例不匹配时旋转绘制进 canvas
    this.presentation = presentation;
    this.wall = wall === true;
    this.decoderPreferences = this.wall ? DECODER_PREFS_WALL : DECODER_PREFS_FOREGROUND;
    this.decoderPreference = 0;
    this.decoder = null;
    this.configuration = null;
    this.verifiedConfiguration = null;
    this.codec = null;
    this.configured = false;
    this.needsKeyframe = true;
    this.configuring = false;
    this.pendingPackets = [];
    this.pendingBytes = 0;
    this.drainingPending = false;
    this.outputTimestampFloor = null;
    this.generation = 0;
    this.lastTs = 0;
    this.frames = 0;
    this.dropped = 0;
  }

  reset() {
    this.generation += 1;
    this.configuring = false;
    this.clearPendingPackets();
    this.verifiedConfiguration = null;
    this.outputTimestampFloor = null;
    try {
      this.decoder?.close();
    } catch {}
    this.decoder = null;
    this.configuration = null;
    this.codec = null;
    this.configured = false;
    this.needsKeyframe = true;
    this.decoderPreference = 0;
    this.frames = 0;
    this.dropped = 0;
    this.onFrames?.(0);
  }

  closeDecoder() {
    try {
      this.decoder?.close();
    } catch {}
    this.decoder = null;
    this.configured = false;
    this.configuring = false;
    this.verifiedConfiguration = null;
  }

  clearPendingPackets() {
    this.pendingPackets.length = 0;
    this.pendingBytes = 0;
  }

  setPresentation(mode) {
    const next = mode === "landscape" || mode === "portrait" ? mode : "original";
    if (this.presentation === next) return;
    this.presentation = next;
    // 勿把 width/height 置 0：Chromium 会回落到默认 300×150，竖屏窗里出现横条+大块黑边
  }

  /** 墙流切软解优先（官方 Gt）；大窗硬解优先 */
  setWallMode(wall) {
    const next = wall === true;
    if (this.wall === next) return;
    this.wall = next;
    this.decoderPreferences = next ? DECODER_PREFS_WALL : DECODER_PREFS_FOREGROUND;
    this.decoderPreference = 0;
    // 偏好变更后从关键帧重建解码器，避免硬解墙流周期性尖峰卡顿
    this.reset();
  }

  decoderCurrent(gen, description) {
    return gen === this.generation && sameBytes(this.configuration, description);
  }

  createDecoder(description, gen, preference) {
    const dec = new VideoDecoder({
      output: (frame) => {
        try {
          if (!this.decoderCurrent(gen, description) || this.decoder !== dec) return;
          if (this.needsKeyframe) return;
          if (this.outputTimestampFloor != null && Number(frame.timestamp) < this.outputTimestampFloor) return;
          const fw = frame.displayWidth;
          const fh = frame.displayHeight;
          // 官方：横/竖模式与帧比例不一致时旋进 bitmap，避免仅 CSS rotate 被裁切
          const needRotate =
            (this.presentation === "landscape" && fw < fh) ||
            (this.presentation === "portrait" && fw > fh);
          const tw = needRotate ? fh : fw;
          const th = needRotate ? fw : fh;
          const resized = this.canvas.width !== tw || this.canvas.height !== th;
          if (resized) {
            this.canvas.width = tw;
            this.canvas.height = th;
          }
          if (needRotate) {
            // 对齐商业 v1.7：translate(displayW,0) + rotate(+90°)
            this.ctx.save();
            this.ctx.translate(tw, 0);
            this.ctx.rotate(Math.PI / 2);
            this.ctx.drawImage(frame, 0, 0, fw, fh);
            this.ctx.restore();
          } else {
            this.ctx.drawImage(frame, 0, 0, tw, th);
          }
          this.frames += 1;
          if (this.frames === 1) this.onFirstFrame?.();
          if (resized) this.onSize?.(tw, th);
          this.onFrames?.(this.frames);
        } finally {
          frame.close();
        }
      },
      error: () => {
        if (!this.decoderCurrent(gen, description) || this.decoder !== dec) return;
        this.needsKeyframe = true;
        this.onError?.("解码恢复中，等待关键帧");
        this.configureDecoder(preference + 1);
      },
    });
    dec.ondequeue = () => {
      if (this.decoderCurrent(gen, description) && this.decoder === dec) this.drainPendingPackets();
    };
    return dec;
  }

  async configureDecoder(preference = this.decoderPreference) {
    if (!this.configuration) return null;
    const gen = ++this.generation;
    this.clearPendingPackets();
    this.outputTimestampFloor = null;
    this.closeDecoder();
    this.needsKeyframe = true;
    this.configuring = true;
    const description = this.configuration;
    const codec = codecFromAvcC(description);
    this.codec = codec;
    const start = Math.max(0, preference | 0);
    for (let i = start; i < this.decoderPreferences.length; i++) {
      const opts = {
        codec,
        description: description.slice(),
        optimizeForLatency: true,
        hardwareAcceleration: this.decoderPreferences[i],
      };
      let support = null;
      try {
        support = await VideoDecoder.isConfigSupported(opts);
      } catch {
        support = null;
      }
      if (!this.decoderCurrent(gen, description)) return null;
      if (support?.supported !== true) continue;
      try {
        const dec = this.createDecoder(description, gen, i);
        this.decoder = dec;
        this.decoderPreference = i;
        dec.configure(opts);
        if (!this.decoderCurrent(gen, description) || this.decoder !== dec) return null;
        this.verifiedConfiguration = opts;
        this.configured = true;
        this.configuring = false;
        this.drainPendingPackets();
        return codec;
      } catch {
        if (this.decoderCurrent(gen, description) && this.decoder) {
          try {
            this.decoder.close();
          } catch {}
          this.decoder = null;
        }
      }
    }
    if (this.decoderCurrent(gen, description)) {
      this.configuring = false;
      this.configured = false;
      this.dropped += this.pendingPackets.length;
      this.clearPendingPackets();
    }
    return null;
  }

  /** 对齐商业版：积压时缓冲，关键帧清空队列；溢出则 reset 等下一 IDR */
  bufferPendingPacket(packet) {
    const ready =
      !this.configuring && !this.needsKeyframe && this.decoder?.state === "configured";
    if (packet.keyframe) {
      this.dropped += this.pendingPackets.length;
      this.clearPendingPackets();
    } else if (!this.pendingPackets.length && !ready) {
      this.dropped++;
      return;
    }
    const limit = ready ? PENDING_WHEN_READY : PENDING_WHEN_BUSY;
    if (this.pendingPackets.length >= limit || this.pendingBytes + packet.payload.byteLength > PENDING_BYTES_MAX) {
      this.dropped += this.pendingPackets.length + 1;
      this.clearPendingPackets();
      if (!this.configuring) this.recoverDecoder();
      return;
    }
    this.pendingPackets.push({
      keyframe: packet.keyframe,
      timestampUs: packet.timestampUs,
      payload: packet.payload.slice(),
    });
    this.pendingBytes += packet.payload.byteLength;
  }

  drainPendingPackets() {
    if (
      this.drainingPending ||
      this.configuring ||
      this.decoder?.state !== "configured"
    ) {
      return;
    }
    const dec = this.decoder;
    const gen = this.generation;
    this.drainingPending = true;
    try {
      while (this.pendingPackets.length && dec.decodeQueueSize <= DECODE_QUEUE_MAX) {
        const next = this.pendingPackets.shift();
        this.pendingBytes -= next.payload.byteLength;
        this.decodePacket(next);
        if (this.decoder !== dec || this.generation !== gen || this.configuring) break;
      }
    } finally {
      this.drainingPending = false;
    }
  }

  recoverDecoder() {
    const dec = this.decoder;
    const cfg = this.verifiedConfiguration;
    if (this.configuring || !dec || dec.state !== "configured" || !cfg) return false;
    this.clearPendingPackets();
    this.needsKeyframe = true;
    this.outputTimestampFloor = null;
    try {
      dec.reset();
      dec.configure(cfg);
      return this.decoder === dec && !this.configuring && dec.state === "configured";
    } catch {
      if (this.decoder === dec && !this.configuring) this.configureDecoder(this.decoderPreference + 1);
      return false;
    }
  }

  decodePacket(packet) {
    if (this.needsKeyframe && !packet.keyframe) {
      this.dropped++;
      return;
    }
    if (this.needsKeyframe) this.outputTimestampFloor = packet.timestampUs;
    this.needsKeyframe = false;
    const dec = this.decoder;
    try {
      dec.decode(
        new EncodedVideoChunk({
          type: packet.keyframe ? "key" : "delta",
          timestamp: packet.timestampUs,
          data: packet.payload,
        })
      );
    } catch {
      this.dropped++;
      if (this.decoder === dec && !this.configuring) this.configureDecoder(this.decoderPreference + 1);
    }
  }

  ensureDecoder(description) {
    if (sameBytes(this.configuration, description) && this.decoder?.state === "configured") {
      return this.codec;
    }
    // Same avcC already configuring — don't abort mid-flight (phone may re-send config).
    if (sameBytes(this.configuration, description) && this.configuring) {
      return this.codec;
    }
    this.configuration = description.slice();
    this.decoderPreference = 0;
    return this.configureDecoder(0);
  }

  push(packet) {
    const p = parsePhb1(packet);
    this.lastTs = p.timestampUs;
    this.onFrameTs?.(p.timestampUs);

    if (p.configuration) {
      const desc = p.payload.slice();
      if (sameBytes(this.configuration, desc) && this.decoder?.state === "configured") return p;
      this.ensureDecoder(desc);
      return p;
    }
    if (!this.configuration) {
      this.dropped++;
      return p;
    }
    if (this.configuring) {
      this.bufferPendingPacket(p);
      return p;
    }
    if (!this.decoder || this.decoder.state !== "configured") {
      this.configureDecoder(this.decoder ? this.decoderPreference + 1 : this.decoderPreference);
      this.bufferPendingPacket(p);
      this.drainPendingPackets();
      return p;
    }
    // 对齐商业版：积压先缓冲；关键帧可触发 recover 清队列，避免硬丢后等整段 GOP
    if (this.pendingPackets.length || (this.decoder.decodeQueueSize > DECODE_QUEUE_MAX && !p.keyframe)) {
      this.bufferPendingPacket(p);
      this.drainPendingPackets();
      return p;
    }
    if (this.decoder.decodeQueueSize > DECODE_QUEUE_MAX && !this.recoverDecoder()) {
      if (this.configuring) this.bufferPendingPacket(p);
      else this.dropped++;
      return p;
    }
    this.decodePacket(p);
    return p;
  }
}

const CONTROL_KEYS = Object.freeze(["backspace", "enter", "tab", "escape", "left", "right", "up", "down"]);
const KEY_MAP = Object.freeze({
  Backspace: "backspace",
  Enter: "enter",
  Tab: "tab",
  Escape: "escape",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
});

function flagOn(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function normalizeControlText(value) {
  if (typeof value !== "string" || !value.length) throw new Error("请输入有效文本");
  let text = value.replace(/\r\n?/g, "\n");
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(text)) throw new Error("文本含不支持的控制字符");
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("文本包含无效字符");
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new Error("文本包含无效字符");
    }
  }
  if (new TextEncoder().encode(text).length > 4096) throw new Error("每次最多发送 4096 字节，请缩短文本");
  return text;
}

export function mapControlKey(domKey) {
  return KEY_MAP[domKey] || null;
}

export class ControlClient {
  constructor({ url, onReady, onGeometry, onAck, onError }) {
    this.url = url;
    this.onReady = onReady;
    this.onGeometry = onGeometry;
    this.onAck = onAck;
    this.onError = onError;
    this.ws = null;
    this.seq = 0;
    this.geometry = null;
    this.frameTimestampUs = 0;
    this.ready = false;
    this.keepalive = null;
    this.homeAvailable = true;
    // 默认允许尝试；ready 若显式关闭再关掉
    this.textAvailable = true;
    this.keyboardAvailable = true;
    this.pendingInputs = new Map();
  }

  get canText() {
    return this.ready && this.textAvailable;
  }

  get canKey() {
    return this.ready && this.keyboardAvailable;
  }

  connect() {
    this.close();
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "ready") {
        this.ready = true;
        this.geometry = msg.geometry;
        this.seq = 0;
        this.homeAvailable = msg.homeAvailable !== false;
        if ("textAvailable" in msg) this.textAvailable = flagOn(msg.textAvailable);
        if ("keyboardAvailable" in msg) this.keyboardAvailable = flagOn(msg.keyboardAvailable);
        this.onReady?.(msg);
        clearInterval(this.keepalive);
        this.keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "keepalive" }));
        }, 500);
      } else if (msg.type === "geometry") {
        this.geometry = msg.geometry || msg;
        this.onGeometry?.(this.geometry);
      } else if (msg.type === "ack") {
        const pending = this.pendingInputs.get(msg.seq);
        if (pending) {
          this.pendingInputs.delete(msg.seq);
          if (msg.ok === false) pending.reject(new Error(msg.error || msg.code || "输入被拒绝"));
          else pending.resolve(msg);
        }
        this.onAck?.(msg);
      } else if (msg.type === "error") {
        this.onError?.(msg.error || "control error");
      }
    };
    ws.onerror = () => this.onError?.("控制通道错误");
    ws.onclose = () => {
      this.ready = false;
      clearInterval(this.keepalive);
    };
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("控制连接超时")), 5000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          reject(new Error("控制连接失败"));
        },
        { once: true }
      );
    });
  }

  setFrameTs(ts) {
    if (Number.isFinite(ts) && ts > 0) this.frameTimestampUs = ts;
  }

  pointer(action, x, y) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN || !this.geometry) return;
    // 无帧时间戳时仍下发，避免画面已出但控制被静默丢掉
    const frameTs = this.frameTimestampUs || Date.now() * 1000;
    const seq = ++this.seq;
    this.ws.send(
      JSON.stringify({
        type: "pointer",
        action,
        seq,
        x,
        y,
        geometryRevision: this.geometry.revision,
        frameTimestampUs: frameTs,
      })
    );
    return seq;
  }

  /**
   * 官方：cancelGesture 后发 {type:"button",button:"home",seq}，等 ack（有超时，避免放大窗卡死）。
   * @param {{ cancelGesture?: () => void, button?: string }} [opts]
   */
  home(opts = {}) {
    return this.sendButton(opts.button || "home", opts);
  }

  /** 双击 Home → 多任务 */
  appSwitcher(opts = {}) {
    return this.sendButton("app-switcher", opts);
  }

  sendButton(button, opts = {}) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    if (this.homeAvailable === false) return Promise.resolve(false);
    try {
      opts.cancelGesture?.();
    } catch {
      /* ignore */
    }
    const body = { type: "button", button, seq: ++this.seq };
    return new Promise((resolve) => {
      const entry = {
        resolve: (msg) => resolve(msg || { ok: true }),
        reject: () => resolve({ ok: false }),
      };
      this.pendingInputs.set(body.seq, entry);
      try {
        this.ws.send(JSON.stringify(body));
      } catch {
        this.pendingInputs.delete(body.seq);
        resolve({ ok: false });
        return;
      }
      setTimeout(() => {
        if (!this.pendingInputs.has(body.seq)) return;
        this.pendingInputs.delete(body.seq);
        resolve({ ok: true, timedOut: true });
      }, 1500);
    });
  }

  text(value, { force = true } = {}) {
    const text = normalizeControlText(value);
    return this.inputCommand("text", { text }, { force });
  }

  key(name, { force = true } = {}) {
    if (!CONTROL_KEYS.includes(name)) return Promise.reject(new Error("不支持的手机按键"));
    return this.inputCommand("key", { key: name }, { force });
  }

  inputCommand(type, payload, { force = true } = {}) {
    if (!this.ready) {
      return Promise.reject(new Error("等待控制连接就绪"));
    }
    // 部分基座能力位报 false，但仍处理 text/key；默认强制尝试发送
    if (!force && !(type === "text" ? this.canText : this.canKey)) {
      const supported = type === "text" ? this.textAvailable : this.keyboardAvailable;
      return Promise.reject(
        new Error(supported ? "等待控制连接就绪" : "文本与键盘输入需要更新手机基座 IPA")
      );
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("控制连接未打开"));
    }
    const body = { type, seq: ++this.seq, ...payload };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 8192) {
      return Promise.reject(new Error("输入指令超过 8192 字节，请缩短文本"));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      };
      this.pendingInputs.set(body.seq, entry);
      try {
        this.ws.send(JSON.stringify(body));
      } catch (e) {
        this.pendingInputs.delete(body.seq);
        entry.reject(e);
        return;
      }
      setTimeout(() => {
        if (!this.pendingInputs.has(body.seq)) return;
        this.pendingInputs.delete(body.seq);
        resolve({ ok: true, timedOut: true });
      }, 2500);
    });
  }

  close() {
    clearInterval(this.keepalive);
    for (const pending of this.pendingInputs.values()) {
      pending.reject(new Error("控制已断开"));
    }
    this.pendingInputs.clear();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.ready = false;
    this.textAvailable = false;
    this.keyboardAvailable = false;
  }
}

export class VideoSession {
  constructor({ canvas, getProfile, onFrameTs, onFirstFrame, onSize, onStatus, onError, presentation = "original", autoRecover = true }) {
    this.canvas = canvas;
    this.getProfile = getProfile;
    this.onStatus = onStatus;
    this.onError = onError;
    this.autoRecover = autoRecover !== false;
    this.lastPaintAt = 0;
    this.stallTimer = null;
    this.recoverTimer = null;
    this.player = new Phb1Player(canvas, {
      onFrameTs: (ts) => {
        this.lastPaintAt = performance.now();
        onFrameTs?.(ts);
      },
      onFirstFrame: () => {
        this.lastPaintAt = performance.now();
        onFirstFrame?.();
      },
      onSize,
      onError,
      presentation,
    });
    // 解码出帧也算“在画”，避免仅靠 timestamp
    const prevOnFrames = this.player.onFrames;
    this.player.onFrames = (n) => {
      if (n > 0) this.lastPaintAt = performance.now();
      prevOnFrames?.(n);
    };
    this.ws = null;
    this.baseWs = null;
    this.streamProfile = null;
    this.reconnecting = false;
    this.alive = false;
  }

  async open(baseWs, { initial = true } = {}) {
    this.baseWs = baseWs;
    this.alive = true;
    const profile = this.getProfile(this.streamProfile);
    const out = await this.openVideo(profile, { initial });
    this.armStallWatch();
    return out;
  }

  armStallWatch() {
    if (!this.autoRecover) return;
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.stallTimer = setInterval(() => {
      if (!this.alive || this.reconnecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (!this.lastPaintAt) return;
      // 墙流双开时偶发卡在旧帧：超过 2.5s 无新画面则重拉一路
      if (performance.now() - this.lastPaintAt > 2500) {
        this.recover("画面停滞，重连…");
      }
    }, 1000);
  }

  recover(reason) {
    if (!this.alive || this.reconnecting || !this.baseWs) return;
    if (this.recoverTimer) return;
    this.onStatus?.(reason || "画面重连…");
    this.recoverTimer = setTimeout(async () => {
      this.recoverTimer = null;
      if (!this.alive || this.reconnecting || !this.baseWs) return;
      const profile = this.getProfile(this.streamProfile) || this.streamProfile;
      if (!profile) return;
      this.reconnecting = true;
      const old = this.ws;
      this.ws = null;
      try {
        old?.close();
      } catch {}
      this.player.reset();
      this.lastPaintAt = 0;
      try {
        await this.openVideo(profile);
        this.lastPaintAt = performance.now();
      } catch {
        this.onStatus?.("画面重连失败");
        // 再试一次（退避）
        if (this.alive) {
          this.recoverTimer = setTimeout(() => {
            this.recoverTimer = null;
            this.recover("画面重连…");
          }, 1200);
        }
      } finally {
        this.reconnecting = false;
      }
    }, 80);
  }

  openVideo(streamProfile, { initial = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.alive || !this.baseWs) {
        reject(new Error("session closed"));
        return;
      }
      // 对齐官方：wall profile 用 prefer-software，减轻小窗 1s IDR 硬解尖峰
      this.player.setWallMode?.(streamProfile?.profile === "wall");
      const url = buildVideoUrl(this.baseWs, streamProfile);
      this.onStatus?.(initial ? "连接画面…" : "切换画质…");
      const ws = new WebSocket(url);
      this.ws = ws;
      this.streamProfile = streamProfile;
      ws.binaryType = "arraybuffer";
      const t = setTimeout(() => reject(new Error("视频连接超时")), 6000);
      ws.onopen = () => {
        clearTimeout(t);
        this.lastPaintAt = performance.now();
        this.onStatus?.("画面已连接");
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("视频连接失败"));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          try {
            const j = JSON.parse(ev.data);
            if (j.type === "publisher" && j.online === false) {
              this.player.needsKeyframe = true;
              this.player.closeDecoder();
              this.onStatus?.("发布端离线");
            } else if (j.type === "publisher" && j.online === true) {
              this.onStatus?.("发布端在线");
              this.player.needsKeyframe = true;
            }
          } catch {}
          return;
        }
        try {
          this.player.push(ev.data);
        } catch (e) {
          this.onError?.(e.message || String(e));
        }
      };
      ws.onclose = () => {
        if (!this.alive || this.reconnecting) return;
        this.onStatus?.("画面断开");
        if (this.autoRecover) this.recover("画面断开，重连…");
      };
    });
  }

  setPresentation(mode) {
    this.player.setPresentation(mode);
  }

  async applyProfile(next) {
    if (!this.alive || !this.baseWs || this.reconnecting) return;
    if (profileKey(next) === profileKey(this.streamProfile)) {
      this.streamProfile = next;
      return;
    }
    this.reconnecting = true;
    const old = this.ws;
    this.ws = null;
    try {
      old?.close();
    } catch {}
    this.player.reset();
    this.lastPaintAt = 0;
    try {
      await this.openVideo(next);
      this.lastPaintAt = performance.now();
    } finally {
      this.reconnecting = false;
    }
  }

  close() {
    this.alive = false;
    this.reconnecting = false;
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
    if (this.recoverTimer) {
      clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.player.reset();
    this.baseWs = null;
    this.streamProfile = null;
  }
}
