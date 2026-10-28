const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const metaEl = $("meta");
const canvas = $("stage");
const ctx = canvas.getContext("2d");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function setMeta(obj) {
  metaEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

/** @param {ArrayBuffer|Uint8Array} buf */
function parsePhb1(buf) {
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

class Phb1Player {
  constructor(canvasEl, onFrameTs) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.onFrameTs = onFrameTs;
    this.decoder = null;
    this.configured = false;
    this.needsKeyframe = true;
    this.lastTs = 0;
    this.frames = 0;
  }

  reset() {
    try { this.decoder?.close(); } catch {}
    this.decoder = null;
    this.configured = false;
    this.needsKeyframe = true;
  }

  ensureDecoder(description) {
    if (this.decoder) {
      try { this.decoder.close(); } catch {}
    }
    const codec = codecFromAvcC(description);
    this.decoder = new VideoDecoder({
      output: (frame) => {
        try {
          if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
            this.canvas.width = frame.displayWidth;
            this.canvas.height = frame.displayHeight;
          }
          this.ctx.drawImage(frame, 0, 0);
          this.frames += 1;
        } finally {
          frame.close();
        }
      },
      error: (e) => setStatus(`解码错误: ${e.message || e}`, "bad"),
    });
    this.decoder.configure({
      codec,
      description,
      optimizeForLatency: true,
    });
    this.configured = true;
    this.needsKeyframe = true;
    return codec;
  }

  push(packet) {
    const p = parsePhb1(packet);
    this.lastTs = p.timestampUs;
    this.onFrameTs?.(p.timestampUs);

    if (p.configuration) {
      const codec = this.ensureDecoder(p.payload.slice());
      setStatus(`已配置 ${codec}`, "ok");
      return p;
    }
    if (!this.configured || !this.decoder) return p;
    if (this.needsKeyframe && !p.keyframe) return p;
    if (this.decoder.decodeQueueSize > 4) return p;

    this.decoder.decode(new EncodedVideoChunk({
      type: p.keyframe ? "key" : "delta",
      timestamp: p.timestampUs,
      data: p.payload,
    }));
    if (p.keyframe) this.needsKeyframe = false;
    return p;
  }
}

class ControlClient {
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
  }

  connect() {
    this.close();
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === "ready") {
        this.ready = true;
        this.geometry = msg.geometry;
        this.seq = 0;
        this.onReady?.(msg);
        clearInterval(this.keepalive);
        this.keepalive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "keepalive" }));
        }, 500);
      } else if (msg.type === "geometry") {
        this.geometry = msg.geometry;
      } else if (msg.type === "ack") {
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
      ws.onopen = () => { clearTimeout(t); resolve(); };
      ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("控制连接失败")); }, { once: true });
    });
  }

  setFrameTs(ts) {
    if (Number.isFinite(ts) && ts > 0) this.frameTimestampUs = ts;
  }

  pointer(action, x, y) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN || !this.geometry) return;
    if (!this.frameTimestampUs) return;
    const seq = ++this.seq;
    const msg = {
      type: "pointer",
      action,
      seq,
      x,
      y,
      geometryRevision: this.geometry.revision,
      frameTimestampUs: this.frameTimestampUs,
    };
    this.ws.send(JSON.stringify(msg));
    return seq;
  }

  close() {
    clearInterval(this.keepalive);
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.ready = false;
  }
}

class Session {
  constructor() {
    this.player = new Phb1Player(canvas, (ts) => this.control?.setFrameTs(ts));
    this.control = null;
    this.videoWs = null;
    this.info = null;
    this.pointerId = null;
  }

  async connect(ip, port) {
    await this.disconnect();
    setStatus("读取 /api/info…");
    const probe = await fetch(`/api/proxy/info?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`);
    const body = await probe.json();
    if (!probe.ok) throw new Error(body.error || `探测失败 ${probe.status}`);
    this.info = body.info;
    setMeta({
      ip: body.ip,
      port: body.port,
      name: this.info.name,
      deviceId: this.info.deviceId,
      licenseRequired: this.info.licenseRequired === true,
      release: this.info.release || null,
      geometry: this.info.geometry || null,
      streaming: this.info.streaming,
      controlAvailable: this.info.controlAvailable,
    });

    if (this.info.licenseRequired === true) {
      const msg = "当前手机仍是商业基座（licenseRequired=true）。请用 TrollStore 安装「手机本地投屏-v0.12.2」里的本地 IPA 后再连。";
      setStatus(msg, "bad");
      setMeta({ ...body.info, tip: msg });
      throw new Error(msg);
    }
    if (this.info.protocol && this.info.protocol !== "lan-phonebase") {
      throw new Error(`未知协议 ${this.info.protocol}`);
    }

    const base = `ws://${body.ip}:${body.port}`;
    this.control = new ControlClient({
      url: `${base}/control`,
      onReady: (msg) => setStatus(`控制就绪 · ${msg.geometry?.width}×${msg.geometry?.height}`, "ok"),
      onAck: (msg) => {
        if (!msg.ok) setStatus(`触控失败: ${msg.error || msg.code || "ack"}`, "bad");
      },
      onError: (e) => setStatus(String(e), "bad"),
    });

    setStatus("连接 /video …");
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${base}/video`);
      this.videoWs = ws;
      ws.binaryType = "arraybuffer";
      const t = setTimeout(() => reject(new Error("视频连接超时")), 6000);
      ws.onopen = () => {
        clearTimeout(t);
        setStatus("视频已连接，等待关键帧…", "ok");
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("视频连接失败（若 403，多半仍是商业基座）"));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          try {
            const j = JSON.parse(ev.data);
            if (j.type === "publisher" && j.online === false) {
              this.player.needsKeyframe = true;
              this.player.configured = false;
            }
          } catch {}
          return;
        }
        try {
          this.player.push(ev.data);
        } catch (e) {
          setStatus(`帧解析失败: ${e.message}`, "bad");
        }
      };
      ws.onclose = () => setStatus("视频断开", "bad");
    });

    setStatus("连接 /control …");
    await this.control.connect();
    $("connect").disabled = true;
    $("disconnect").disabled = false;
  }

  normXY(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  bindInput() {
    const down = (ev) => {
      if (!this.control?.ready) return;
      canvas.setPointerCapture(ev.pointerId);
      this.pointerId = ev.pointerId;
      const { x, y } = this.normXY(ev);
      this.control.pointer("down", x, y);
    };
    const move = (ev) => {
      if (this.pointerId !== ev.pointerId) return;
      const { x, y } = this.normXY(ev);
      this.control.pointer("move", x, y);
    };
    const up = (ev) => {
      if (this.pointerId !== ev.pointerId) return;
      const { x, y } = this.normXY(ev);
      this.control.pointer("up", x, y);
      this.pointerId = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  async disconnect() {
    try { this.videoWs?.close(); } catch {}
    this.videoWs = null;
    this.control?.close();
    this.control = null;
    this.player.reset();
    $("connect").disabled = false;
    $("disconnect").disabled = true;
  }
}

const session = new Session();
session.bindInput();

$("connect").onclick = async () => {
  $("connect").disabled = true;
  setStatus("连接中…");
  try {
    await session.connect($("ip").value.trim(), $("port").value.trim());
  } catch (e) {
    const msg = e.message || String(e);
    setStatus(msg, "bad");
    setMeta({ error: msg });
    await session.disconnect();
  } finally {
    if (!session.videoWs) $("connect").disabled = false;
  }
};

$("disconnect").onclick = async () => {
  await session.disconnect();
  setStatus("已断开");
};
