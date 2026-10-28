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

export class Phb1Player {
  constructor(canvasEl, { onFrameTs, onFrames, onFirstFrame, onSize, onError, presentation = "original" } = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high";
    }
    this.onFrameTs = onFrameTs;
    this.onFrames = onFrames;
    this.onFirstFrame = onFirstFrame;
    this.onSize = onSize;
    this.onError = onError;
    // portrait | landscape | original — 与官方设备窗一致，方向不匹配时旋转绘制
    this.presentation = presentation;
    this.decoderPreferences = ["prefer-software", "prefer-hardware", "no-preference"];
    this.decoderPreference = 0;
    this.decoder = null;
    this.configuration = null;
    this.codec = null;
    this.configured = false;
    this.needsKeyframe = true;
    this.configuring = false;
    this.generation = 0;
    this.lastTs = 0;
    this.frames = 0;
    this.dropped = 0;
  }

  reset() {
    this.generation += 1;
    try {
      this.decoder?.close();
    } catch {}
    this.decoder = null;
    this.configuration = null;
    this.codec = null;
    this.configured = false;
    this.needsKeyframe = true;
    this.configuring = false;
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
  }

  setPresentation(mode) {
    this.presentation = mode === "landscape" || mode === "portrait" ? mode : "original";
  }

  createDecoder() {
    return new VideoDecoder({
      output: (frame) => {
        try {
          const fw = frame.displayWidth;
          const fh = frame.displayHeight;
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
            this.ctx.save();
            this.ctx.translate(tw, 0);
            this.ctx.rotate(Math.PI / 2);
            this.ctx.drawImage(frame, 0, 0);
            this.ctx.restore();
          } else {
            this.ctx.drawImage(frame, 0, 0);
          }
          this.frames += 1;
          if (this.frames === 1) this.onFirstFrame?.();
          if (resized) this.onSize?.(tw, th);
          this.onFrames?.(this.frames);
        } finally {
          frame.close();
        }
      },
      error: (e) => {
        this.needsKeyframe = true;
        this.onError?.(e.message || String(e));
        if (this.configuration) this.configureDecoder(this.decoderPreference + 1);
      },
    });
  }

  async configureDecoder(preference = this.decoderPreference) {
    if (!this.configuration) return null;
    const gen = ++this.generation;
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
        description,
        optimizeForLatency: true,
        hardwareAcceleration: this.decoderPreferences[i],
      };
      let support = null;
      try {
        support = await VideoDecoder.isConfigSupported(opts);
      } catch {
        support = null;
      }
      if (gen !== this.generation || !sameBytes(this.configuration, description)) return null;
      if (support?.supported !== true) continue;
      try {
        const dec = this.createDecoder();
        this.decoder = dec;
        this.decoderPreference = i;
        dec.configure(opts);
        if (gen !== this.generation || this.decoder !== dec || !sameBytes(this.configuration, description)) {
          try {
            dec.close();
          } catch {}
          return null;
        }
        this.configured = true;
        this.configuring = false;
        return codec;
      } catch {
        if (gen === this.generation) this.closeDecoder();
      }
    }
    if (gen === this.generation) {
      this.configuring = false;
      this.configured = false;
    }
    return null;
  }

  ensureDecoder(description) {
    if (sameBytes(this.configuration, description) && this.decoder?.state === "configured") {
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
    if (this.configuring || !this.decoder || this.decoder.state !== "configured") {
      this.dropped++;
      if (!this.configuring) this.configureDecoder(this.decoder ? this.decoderPreference + 1 : this.decoderPreference);
      return p;
    }
    if (this.decoder.decodeQueueSize > 3) {
      this.dropped++;
      this.configureDecoder();
      return p;
    }
    if (this.needsKeyframe && !p.keyframe) {
      this.dropped++;
      return p;
    }

    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: p.keyframe ? "key" : "delta",
          timestamp: p.timestampUs,
          data: p.payload,
        })
      );
      if (p.keyframe) this.needsKeyframe = false;
    } catch {
      this.dropped++;
      this.configureDecoder(this.decoderPreference + 1);
    }
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
  constructor({ url, onReady, onAck, onError }) {
    this.url = url;
    this.onReady = onReady;
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
        this.geometry = msg.geometry;
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
    if (!this.frameTimestampUs) return;
    const seq = ++this.seq;
    this.ws.send(
      JSON.stringify({
        type: "pointer",
        action,
        seq,
        x,
        y,
        geometryRevision: this.geometry.revision,
        frameTimestampUs: this.frameTimestampUs,
      })
    );
    return seq;
  }

  home() {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "home", seq: ++this.seq }));
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
  constructor({ canvas, getProfile, onFrameTs, onFirstFrame, onSize, onStatus, onError, presentation = "original" }) {
    this.canvas = canvas;
    this.getProfile = getProfile;
    this.onStatus = onStatus;
    this.onError = onError;
    this.player = new Phb1Player(canvas, {
      onFrameTs,
      onFirstFrame,
      onSize,
      onError,
      presentation,
    });
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
    return this.openVideo(profile, { initial });
  }

  openVideo(streamProfile, { initial = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.alive || !this.baseWs) {
        reject(new Error("session closed"));
        return;
      }
      const url = buildVideoUrl(this.baseWs, streamProfile);
      this.onStatus?.(initial ? "连接画面…" : "切换画质…");
      const ws = new WebSocket(url);
      this.ws = ws;
      this.streamProfile = streamProfile;
      ws.binaryType = "arraybuffer";
      const t = setTimeout(() => reject(new Error("视频连接超时")), 6000);
      ws.onopen = () => {
        clearTimeout(t);
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
        if (this.alive && !this.reconnecting) this.onStatus?.("画面断开");
      };
    });
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
    try {
      await this.openVideo(next);
    } finally {
      this.reconnecting = false;
    }
  }

  close() {
    this.alive = false;
    this.reconnecting = false;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.player.reset();
    this.baseWs = null;
    this.streamProfile = null;
  }
}
