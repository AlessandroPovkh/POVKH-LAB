import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(siteRoot, "assets", "og", "povkh-lab-og.png");
const logo = await readFile(path.join(siteRoot, "assets", "logo", "povkh-lab-horizontal-reverse-transparent-outlined.svg"));
const headingFont = await readFile(path.join(siteRoot, "assets", "fonts", "BarlowCondensed-ExtraBold.ttf"));
const monoFont = await readFile(path.join(siteRoot, "assets", "fonts", "IBMPlexMono-Regular.ttf"));
const dataUrl = (mime, buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:Barlow;src:url('${dataUrl("font/ttf", headingFont)}') format('truetype');font-weight:800}
    @font-face{font-family:Plex;src:url('${dataUrl("font/ttf", monoFont)}') format('truetype')}
    *{box-sizing:border-box}html,body{width:1200px;height:630px;margin:0;overflow:hidden;background:#080808;color:#f2efe7}
    body{position:relative;padding:62px 72px;font-family:Plex,monospace;background-image:linear-gradient(rgba(242,239,231,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(242,239,231,.04) 1px,transparent 1px),radial-gradient(circle at 82% 18%,rgba(243,34,34,.21),transparent 36%);background-size:24px 24px,24px 24px,100% 100%}
    body:before{content:"";position:absolute;left:72px;top:228px;width:164px;height:11px;background:#f32222}
    body:after{content:"+";position:absolute;right:72px;top:54px;color:#f32222;font:34px Plex}
    img{width:660px;height:auto;display:block}
    h1{position:absolute;left:72px;bottom:102px;margin:0;font:800 74px/.84 Barlow;text-transform:uppercase;letter-spacing:-.035em}
    .system{position:absolute;right:72px;bottom:64px;width:330px;padding:18px;border:1px solid rgba(242,239,231,.28);font-size:15px;line-height:1.65;letter-spacing:.1em;text-transform:uppercase}
    .system b{color:#f32222;font-weight:400}.ref{position:absolute;left:72px;bottom:48px;color:#888b8f;font-size:12px;letter-spacing:.12em}
  </style></head><body>
    <img src="${dataUrl("image/svg+xml", logo)}" alt="">
    <h1>Sound.<br>Process. Archive.</h1>
    <div class="system"><b>Catalog sequence</b><br>PVKH-001 → PVKH-013<br>Independent electronic music label</div>
    <div class="ref">POVKH LAB / BRESCIA / 2025—2026</div>
  </body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: output, type: "png", animations: "disabled" });
  console.log(`OpenGraph image generated: ${output}`);
} finally {
  await browser.close();
}
