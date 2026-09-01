// 開発時の動作確認用（アプリ本体ではない。iPadには関係しない）。
//
// Chrome 152 で --screenshot と --timeout の組み合わせが実時間を待たなくなり、
// IndexedDBの読み込みが終わる前に撮影されるようになった（画面が空のまま写る）。
// そこでDevTools Protocolを直に叩いて「実時間で待つ・JSを評価する・撮る」を行う。
// 外部ライブラリを入れられないのでWebSocketは手書きしてある。
//
// 使い方:
//   python -m http.server 8765 --bind 127.0.0.1
//   chrome --headless=new --disable-gpu --no-first-run --remote-debugging-port=9222 \
//          --user-data-dir=<使い捨て> --window-size=1280,900 about:blank &
//   node tools/shot.js "http://127.0.0.1:8765/index.html?nosw=1&demo=1" out.png 4000 "評価するJS" ...
//   （出力先を .pdf にすると印刷イメージのPDFが出る。?nosw=1 を付けないと
//     Service Workerが古いCSS/JSを返し、直したつもりで直っていない事故になる）
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const fs = require("fs");

const [url, outPng, waitMs, ...evals] = process.argv.slice(2);
const PORT = Number(process.env.CDP_PORT || 9222);

const getJson = (path) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: PORT, path }, (r) => {
    let b = ""; r.on("data", (c) => b += c); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString("base64");
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0), handshaked = false;
    const waiters = new Map();
    let id = 0;

    const send = (method, params) => new Promise((res) => {
      const msg = JSON.stringify({ id: ++id, method, params: params || {} });
      waiters.set(id, res);
      const payload = Buffer.from(msg);
      const mask = crypto.randomBytes(4);
      const len = payload.length;
      let head;
      if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
      else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
      const masked = Buffer.from(payload);
      for (let i = 0; i < len; i++) masked[i] ^= mask[i % 4];
      sock.write(Buffer.concat([head, mask, masked]));
    });

    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshaked) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        handshaked = true;
        buf = buf.slice(end + 4);
        resolve({ send, close: () => sock.destroy() });
      }
      // フレーム解析（サーバ→クライアントはマスクなし）
      for (;;) {
        if (buf.length < 2) return;
        const len0 = buf[1] & 0x7f;
        let off = 2, len = len0;
        if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const body = buf.slice(off, off + len).toString();
        buf = buf.slice(off + len);
        try {
          const m = JSON.parse(body);
          if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
        } catch { /* イベントは無視 */ }
      }
    });
    sock.on("error", reject);
  });
}

(async () => {
  const targets = await getJson("/json/list");
  const page = targets.find((t) => t.type === "page");
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const logs = [];
  await cdp.send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, Number(waitMs || 5000)));
  for (const js of evals) {
    const r = await cdp.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
    const v = r.result?.result;
    logs.push(js + "  =>  " + JSON.stringify(v?.value ?? v?.description ?? v));
  }
  if (outPng && outPng.endsWith(".pdf")) {
    const pdf = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(outPng, Buffer.from(pdf.result.data, "base64"));
    logs.push("saved " + outPng);
  } else if (outPng) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(outPng, Buffer.from(shot.result.data, "base64"));
    logs.push("saved " + outPng);
  }
  console.log(logs.join("\n"));
  cdp.close();
  process.exit(0);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
