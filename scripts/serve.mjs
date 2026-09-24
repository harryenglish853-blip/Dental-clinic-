#!/usr/bin/env node
// Minimal static server for previewing dist/ locally (no dependencies).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST") {
    // Netlify Forms only works once deployed; locally we report that clearly.
    res.writeHead(501, { "Content-Type": "text/plain" }).end("Form submissions are handled by the hosting provider once deployed.");
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  let file = join(ROOT, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    const body = await readFile(join(ROOT, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  }
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
