// Writes the project thumbnail (social preview) from the live map and the brand:
//   web/public/og-image.png        1200x630, shown when a link to the site is shared
//   docs/social-preview.png        1280x640, for the GitHub repository card and the portfolio
// Needs `npm run preview` running (like the screenshots): node scripts/thumbnail.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const WEB = new URL("../", import.meta.url).pathname;
const font = (pkg, file) =>
  readFileSync(`${WEB}node_modules/@fontsource-variable/${pkg}/files/${file}`).toString("base64");
const DISPLAY = font("bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2");
const BODY = font("atkinson-hyperlegible-next", "atkinson-hyperlegible-next-latin-wght-normal.woff2");

// The count comes from the built data, never typed by hand.
const inventory = JSON.parse(readFileSync(`${WEB}public/data/inventory.json`, "utf-8")).elements;

const MARK =
  '<svg viewBox="0 0 32 32" width="76" height="76">' +
  '<rect x="1" y="1" width="30" height="30" rx="9" fill="#ffffff" fill-opacity="0.08"/>' +
  '<circle cx="12.5" cy="13" r="6.5" fill="#f2b84b" stroke="#13294b" stroke-width="1.5"/>' +
  '<path d="M21 13.5 26.5 19 21 24.5 15.5 19Z" fill="#7cc4a8" stroke="#13294b" stroke-width="1.5"/>' +
  '<circle cx="11" cy="23" r="3.2" fill="none" stroke="#c6d2e6" stroke-width="2"/></svg>';

const browser = await chromium.launch();

// 1. The map of metropolitan France as the site shows it, without its controls.
const site = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await site.goto(`${BASE}?lang=fr&today=2026-10-10`, { waitUntil: "load" });
await site.addStyleTag({ content: ".maplibregl-ctrl-top-right,.maplibregl-ctrl-bottom-right{display:none!important}" });
await site
  .waitForSelector('.map[data-idle="true"]', { state: "attached", timeout: 60000 })
  .catch(() => console.warn("map did not report idle; capturing anyway"));
await site.waitForTimeout(1500);
const map = (await site.locator(".map").screenshot()).toString("base64");
await site.close();

// 2. The card: the map as a faded backdrop, brand and one line centred so that crops
// (LinkedIn trims the sides in some places) never cut the text.
function card(width, height) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face{font-family:Display;src:url(data:font/woff2;base64,${DISPLAY}) format("woff2");font-weight:200 800}
@font-face{font-family:Body;src:url(data:font/woff2;base64,${BODY}) format("woff2");font-weight:200 800}
*{box-sizing:border-box}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{background:#13294b;color:#fff;font-family:Body,sans-serif;position:relative}
.map{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 50%;filter:grayscale(.35) contrast(.9);opacity:.55}
.veil{position:absolute;inset:0;background:radial-gradient(ellipse 38% 70% at 50% 50%,#13294b 60%,rgba(19,41,75,.6) 100%)}
.text{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:620px;text-align:center;display:flex;flex-direction:column;align-items:center}
h1{font-family:Display,sans-serif;font-weight:750;font-size:92px;line-height:1;letter-spacing:-.02em;margin:22px 0 18px;white-space:nowrap}
p{margin:0;font-size:26px;line-height:1.35;color:#dbe3f0;text-wrap:balance}
.meta{margin-top:20px;font-size:19px;color:#f2b84b;font-weight:600;letter-spacing:.02em}
.credit{position:absolute;right:14px;bottom:8px;font-size:11px;color:rgba(255,255,255,.6)}
</style></head><body>
<img class="map" src="data:image/png;base64,${map}" alt="">
<div class="veil"></div>
<div class="text">
  ${MARK}
  <h1>Carte du PCI</h1>
  <p>Le patrimoine culturel immatériel de France, sur une carte.</p>
  <div class="meta">${inventory.length} éléments · FR / EN</div>
</div>
<div class="credit">Fond de carte © OpenFreeMap, OpenMapTiles, OpenStreetMap</div>
</body></html>`;
}

for (const [path, width, height] of [
  [`${WEB}public/og-image.png`, 1200, 630],
  [`${WEB}../docs/social-preview.png`, 1280, 640],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(card(width, height), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
  await page.close();
  console.log("saved", path);
}
await browser.close();
