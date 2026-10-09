// Screenshots (desktop + 390 px mobile) and a keyboard-only smoke test.
// Usage: npm run build && npm run preview  (other terminal)  then  npm run screenshots
// BASE_URL defaults to the Vite preview server. The clock is pinned with ?today=.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = new URL("../../docs/screenshots/", import.meta.url).pathname;
const TODAY = "2026-10-08";
const SANCH = "2023_67717_INV_PCI_FRANCE_00523";
mkdirSync(OUT, { recursive: true });

// Behind an HTTPS-only egress proxy (as in CI sandboxes), proxy https:// only so the local
// http:// preview server is reached directly.
const proxyArgs = process.env.HTTPS_PROXY
  ? [`--proxy-server=https=${new URL(process.env.HTTPS_PROXY).host}`]
  : [];
const browser = await chromium.launch({
  args: [...proxyArgs, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function shot(name, query, viewport, before) {
  const page = await browser.newPage({ viewport, locale: query.includes("lang=en") ? "en-GB" : "fr-FR" });
  page.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.error(`[${name}] console:`, m.text()));
  await page.goto(`${BASE}?today=${TODAY}&${query}`, { waitUntil: "load" });
  await page.waitForSelector("header.top");
  await page.waitForFunction(() => !document.querySelector(".panel p.count")?.textContent?.startsWith("0") );
  if (before) await before(page);
  await page
    .waitForSelector('.map[data-idle="true"]', { state: "attached", timeout: 30000 })
    .catch(() => console.warn(`[${name}] map did not report idle; capturing anyway`));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
  console.log("saved", name);
  await page.close();
}

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const LACE = "2008_67717_INV_PCI_FRANCE_00019"; // listed in the inventory, not documented here

await shot("desktop-inventory-fr", "lang=fr", desktop);
await shot("desktop-search-en", "lang=en&q=carnaval", desktop);
await shot("desktop-detail-en", `lang=en&id=${SANCH}`, desktop);
await shot("desktop-undocumented-fr", `lang=fr&id=${LACE}`, desktop);
await shot("desktop-agenda-en", "lang=en&view=agenda", desktop);
await shot("desktop-agenda-february-fr", "lang=fr&view=agenda&month=2", desktop);
await shot("desktop-overseas-fr", "lang=fr&zone=overseas", desktop, async (page) => {
  await page.click('[data-key="menu-zone"]');
});
await shot("desktop-themes-menu-fr", "lang=fr", desktop, async (page) => {
  await page.click('[data-key="menu-themes"]');
});
await shot("desktop-unesco-fr", "lang=fr&unesco=1", desktop);
await shot("desktop-resources-fr", "lang=fr&view=resources", desktop);
await shot("mobile-inventory-fr", "lang=fr", mobile);
await shot("mobile-agenda-en", "lang=en&view=agenda", mobile);
await shot("mobile-map-en", "lang=en&pane=map", mobile);
await shot("mobile-near-fr", "lang=fr&sort=distance", mobile);
await shot("mobile-resources-fr", "lang=fr&view=resources", mobile);
await shot("mobile-detail-fr", `lang=fr&id=${SANCH}`, mobile);

// Keyboard-only smoke test: search, filters, list and detail without a mouse.
const page = await browser.newPage({ viewport: desktop, locale: "en-GB" });
await page.goto(`${BASE}?today=${TODAY}&lang=en`, { waitUntil: "load" });
await page.waitForSelector("p.count");
const results = async () => (await page.textContent(".panel p.count")).trim();
const focused = () =>
  page.evaluate(() => document.activeElement?.getAttribute("data-key") ?? document.activeElement?.id ?? document.activeElement?.tagName);
const tabTo = async (key, max = 120) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if ((await focused()) === key) return;
  }
  throw new Error(`could not reach ${key} with Tab`);
};
const log = { start: await results() };
await tabTo("search");
await page.keyboard.type("sanch");
log.afterSearch = await results();
if ((await focused()) !== "search") throw new Error("focus lost while typing");
await tabTo(`item-${SANCH}`);
await page.keyboard.press("Enter");
log.detailFocused = await focused();
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Enter"); // back to the list
log.backFocused = await focused();
const shiftTabTo = async (key, max = 120) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Shift+Tab");
    if ((await focused()) === key) return;
  }
  throw new Error(`could not reach ${key} with Shift+Tab`);
};
await shiftTabTo("search");
for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
log.cleared = await results();
await tabTo("view-agenda");
await page.keyboard.press("Enter");
log.agenda = await results();
await tabTo("month-4");
await page.keyboard.press(" ");
log.april = await results();
await shiftTabTo("menu-zone");
await page.keyboard.press("Enter");
await tabTo("zone-overseas");
await page.keyboard.press("Enter");
log.overseasAprilEvents = await results();
console.log(JSON.stringify(log));
const ok =
  log.afterSearch.startsWith("1 ") &&
  log.detailFocused === "detail-title" &&
  log.backFocused === `item-${SANCH}` &&
  log.cleared === log.start &&
  parseInt(log.agenda) > 0 &&
  parseInt(log.agenda) < parseInt(log.start) &&
  log.april !== log.agenda;
if (!ok) throw new Error("keyboard smoke test failed");
console.log("keyboard smoke test passed");
await browser.close();
