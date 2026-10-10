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

// Counts come from the built data, never typed by hand.
const inventory = JSON.parse(readFileSync(`${WEB}public/data/inventory.json`, "utf-8")).elements;
const unesco = inventory.filter((e) => e.unesco).length;
const sheets = JSON.parse(readFileSync(`${WEB}public/data/mediation.json`, "utf-8")).count;

const MARK =
  '<svg viewBox="0 0 32 32" width="64" height="64">' +
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

// 2. The card: brand and facts on the left, the map bleeding off the right edge.
function card(width, height) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face{font-family:Display;src:url(data:font/woff2;base64,${DISPLAY}) format("woff2");font-weight:200 800}
@font-face{font-family:Body;src:url(data:font/woff2;base64,${BODY}) format("woff2");font-weight:200 800}
*{box-sizing:border-box}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{background:#13294b;color:#fff;font-family:Body,sans-serif;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(circle at 18% 22%,rgba(242,184,75,.16),transparent 42%),radial-gradient(circle at 40% 95%,rgba(124,196,168,.14),transparent 40%)}
.text{position:absolute;left:64px;top:56px;bottom:52px;width:${Math.round(width * 0.47)}px;display:flex;flex-direction:column}
.kicker{margin:22px 0 0;font-size:19px;letter-spacing:.08em;text-transform:uppercase;color:#c6d2e6}
h1{font-family:Display,sans-serif;font-weight:750;font-size:${Math.round(height * 0.14)}px;line-height:.95;letter-spacing:-.02em;margin:14px 0 18px}
.fr{font-size:27px;line-height:1.3;margin:0;color:#fff}
.en{font-size:21px;line-height:1.35;margin:10px 0 0;color:#c6d2e6}
.chips{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}
.chip{border:1.5px solid rgba(255,255,255,.28);border-radius:999px;padding:8px 16px;font-size:19px;font-weight:600}
.chip b{color:#f2b84b}
.url{margin-top:18px;font-family:Display,sans-serif;font-size:18px;color:#c6d2e6;letter-spacing:.01em}
.map{position:absolute;top:44px;bottom:44px;left:${Math.round(width * 0.555)}px;right:-40px;border-radius:28px 0 0 28px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35);border:3px solid rgba(255,255,255,.12)}
.map img{width:100%;height:100%;object-fit:cover;object-position:50% 45%;display:block}
.credit{position:absolute;right:16px;bottom:10px;font-size:11px;color:rgba(255,255,255,.55)}
</style></head><body><div class="glow"></div>
<div class="text">
  ${MARK}
  <p class="kicker">Patrimoine culturel immatériel</p>
  <h1>Carte du PCI</h1>
  <p class="fr">L’Inventaire national du patrimoine culturel immatériel en France, sur une carte.</p>
  <p class="en">France’s national inventory of intangible cultural heritage, mapped. FR / EN.</p>
  <div class="chips"><span class="chip"><b>${inventory.length}</b> éléments</span><span class="chip"><b>${sheets}</b> fiches pédagogiques</span><span class="chip"><b>${unesco}</b> UNESCO</span></div>
  <div class="url">paulbenard01.github.io/Mapatrimoine</div>
</div>
<div class="map"><img src="data:image/png;base64,${map}" alt=""></div>
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
