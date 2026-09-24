#!/usr/bin/env node
// Bundles dist/index.html into one self-contained, scrollable HTML file
// (CSS, JS, icons and favicon inlined) for sharing a draft without a server.
// Run `npm run build` first. Output: drafts/site-preview.html
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const read = (p) => readFile(join(DIST, p), "utf8");

let html = await read("index.html");
const css = await read("assets/css/main.css");
const js = await read("assets/js/main.js");
const sprite = (await read("assets/img/icons.svg"))
  .replace("<svg ", '<svg style="display:none" aria-hidden="true" ')
  .trim();
const favicon = `data:image/svg+xml,${encodeURIComponent(await read("assets/img/favicon.svg"))}`;

html = html
  .replace('<link rel="stylesheet" href="/assets/css/main.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="/assets/js/main.js" defer></script>', "")
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="${favicon}" type="image/svg+xml">`)
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, "")
  .replace(/href="\/assets\/img\/icons\.svg#/g, 'href="#')
  // Function replacers above: inlined code contains "$" sequences replace() would interpret.
  // Same-page links work without a server; other pages point at the closest section.
  .replace(/href="\/#/g, 'href="#')
  .replace(/href="\/team\.html"/g, 'href="#dentists"')
  .replace(/href="\/(privacy|terms|accessibility)\.html(#[\w-]+)?"/g, 'href="#contact"')
  .replace(/href="\/"/g, 'href="#top"')
  .replace("<body", `<body data-preview`)
  .replace(/<body([^>]*)>/, (_, attrs) => `<body${attrs}>\n${sprite}`)
  .replace("</body>", () => `<script>\n${js}\n</script>\n</body>`);

await mkdir(join(ROOT, "drafts"), { recursive: true });
await writeFile(join(ROOT, "drafts", "site-preview.html"), html);
console.log(`Wrote drafts/site-preview.html (${Math.round(html.length / 1024)} KB)`);
