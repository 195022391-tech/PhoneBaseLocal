import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    ...headers,
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJsonLimited(res, limit = 8192) {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > limit) throw Object.assign(new Error("response too large"), { status: 422 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limit) throw Object.assign(new Error("response too large"), { status: 422 });
  return JSON.parse(buf.toString("utf8"));
}

function isLanIPv4(ip) {
  if (!net.isIPv4(ip) || ip === "0.0.0.0") return false;
  const p = ip.split(".").map(Number);
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  return false;
}

async function proxyInfo(ip, port) {
  if (!isLanIPv4(ip)) throw Object.assign(new Error("仅允许局域网 IPv4"), { status: 400 });
  const p = Number(port) || 11019;
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw Object.assign(new Error("端口无效"), { status: 400 });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`http://${ip}:${p}/api/info`, {
      signal: ctrl.signal,
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw Object.assign(new Error(`手机 /api/info HTTP ${r.status}`), { status: 502 });
    const info = await readJsonLimited(r);
    return { ip, port: p, info };
  } finally {
    clearTimeout(t);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/proxy/info") {
      const ip = url.searchParams.get("ip") || "";
      const port = url.searchParams.get("port") || "11019";
      const out = await proxyInfo(ip, port);
      return send(res, 200, out, { "Content-Type": "application/json; charset=utf-8" });
    }

    if (req.method === "POST" && url.pathname === "/api/proxy/info") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const out = await proxyInfo(String(body.ip || ""), body.port || 11019);
      return send(res, 200, out, { "Content-Type": "application/json; charset=utf-8" });
    }

    let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
    if (!filePath.startsWith(publicDir)) return send(res, 403, "forbidden");
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, "not found");
    const ext = path.extname(filePath);
    return send(res, 200, fs.readFileSync(filePath), { "Content-Type": MIME[ext] || "application/octet-stream" });
  } catch (e) {
    const status = e.status || (e.name === "AbortError" ? 504 : 500);
    return send(res, status, { error: e.message || String(e) }, { "Content-Type": "application/json; charset=utf-8" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ ok: true, url: `http://127.0.0.1:${PORT}/`, hint: "浏览器打开后填手机局域网 IP" }));
});
