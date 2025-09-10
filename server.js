// server.js — Node 18+
// Static + SSE relay (/live/<roomId>) with keep-alive headers
import { createServer } from "http";
import { parse } from "url";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const rooms = new Map();

function mime(p){const e=path.extname(p).toLowerCase();return{".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml; charset=utf-8"}[e]||"application/octet-stream"}
function safeJoin(baseDir, reqPath){const clean=path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.[/\\])+/, '');return path.join(baseDir, clean)}

const server = createServer((req, res)=>{
  const { pathname } = parse(req.url, true);

  // SSE endpoints
  const m = pathname.match(/^\/live\/([A-Za-z0-9_-]{6,64})$/);
  if(m){
    const room=m[1];
    if(req.method==="GET"){
      let meta=rooms.get(room)||{clients:new Set(), last:null}; rooms.set(room,meta);
      res.writeHead(200,{
        "Content-Type":"text/event-stream",
        "Cache-Control":"no-cache, no-transform",
        "Connection":"keep-alive",
        "X-Accel-Buffering":"no",
        "Access-Control-Allow-Origin":"*"
      });
      meta.clients.add(res);
      res.write(":ok\n\n");
      if(meta.last) res.write(`data:${JSON.stringify(meta.last)}\n\n`);
      const ping=setInterval(()=>{try{res.write(":ping\n\n")}catch{}},25000);
      req.on("close",()=>{clearInterval(ping); meta.clients.delete(res)});
      return;
    }
    if(req.method==="POST"){
      let body=""; req.on("data",c=>body+=c);
      req.on("end",()=>{
        try{
          const payload=JSON.parse(body||"{}");
          let meta=rooms.get(room)||{clients:new Set(),last:null};
          meta.last=payload; rooms.set(room,meta);
          for(const c of meta.clients){ try{ c.write(`data:${JSON.stringify(payload)}\n\n`)}catch{} }
          res.writeHead(204).end();
        }catch{
          res.writeHead(400).end("bad json");
        }
      });
      return;
    }
    res.writeHead(405).end("method"); return;
  }

  // Static
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = safeJoin(PUBLIC_DIR, filePath);
  fs.stat(filePath,(err,st)=>{
    if(err || !st.isFile()){ res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"}); res.end("Not found"); return; }
    res.writeHead(200, {"Content-Type": mime(filePath)});
    fs.createReadStream(filePath).pipe(res);
  });
});

const PORT=process.env.PORT||8787;
server.listen(PORT,()=>console.log("Nies‑O‑Mat läuft: http://localhost:"+PORT));