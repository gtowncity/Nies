// server.js — Minimaler Node-Server: statische Seite + SSE-Live-Relay
// Start: node server.js   (NODE >= 18 empfohlen)
import { createServer } from "http";
import { parse } from "url";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const rooms = new Map(); // roomId -> {clients:Set(res), last:any}

function mimeFor(p) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".css":  return "text/css; charset=utf-8";
    case ".js":   return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png":  return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".svg":  return "image/svg+xml; charset=utf-8";
    default:      return "application/octet-stream";
  }
}

function safeJoin(baseDir, reqPath) {
  const decoded = decodeURIComponent(reqPath);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return path.join(baseDir, clean);
}

const server = createServer((req, res) => {
  const { pathname } = parse(req.url, true);

  // SSE endpoints: /live/<roomId>
  const m = pathname.match(/^\/live\/([A-Za-z0-9_-]{6,64})$/);
  if (m) {
    const room = m[1];
    if (req.method === "GET") {
      // Subscribe
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
      let meta = rooms.get(room) || { clients: new Set(), last: null };
      rooms.set(room, meta);
      meta.clients.add(res);
      if (meta.last) res.write(`data:${JSON.stringify(meta.last)}\n\n`);
      req.on("close", () => meta.clients.delete(res));
      return;
    }
    if (req.method === "POST") {
      // Push update
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          let meta = rooms.get(room) || { clients: new Set(), last: null };
          meta.last = payload; rooms.set(room, meta);
          for (const client of meta.clients) client.write(`data:${JSON.stringify(payload)}\n\n`);
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end("bad json");
        }
      });
      return;
    }
    res.writeHead(405).end("method");
    return;
  }

  // Static files (index.html default)
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = safeJoin(PUBLIC_DIR, filePath);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeFor(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => console.log("Nies-Counter live unter http://localhost:" + PORT));