// Writes the favicon and app icons in web/public/ from the brand mark (the same shapes as
// brandMark() in src/main.ts, on the navy of the top bar). Run after changing the mark:
//   node scripts/icons.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = new URL("../public/", import.meta.url).pathname;
const NAVY = "#13294b";
const SHAPES =
  '<circle cx="12.5" cy="13" r="6.5" fill="#f2b84b" stroke="#13294b" stroke-width="1.5"/>' +
  '<path d="M21 13.5 26.5 19 21 24.5 15.5 19Z" fill="#7cc4a8" stroke="#13294b" stroke-width="1.5"/>' +
  '<circle cx="11" cy="23" r="3.2" fill="none" stroke="#c6d2e6" stroke-width="2"/>';

/** Rounded tile for tabs and "any" icons; full-bleed tile with the shapes scaled into the
 * safe zone for maskable and Apple icons (the system applies its own mask). */
function icon({ rounded, scale = 1 }) {
  const tile = rounded
    ? `<rect width="32" height="32" rx="7" fill="${NAVY}"/>`
    : `<rect width="32" height="32" fill="${NAVY}"/>`;
  const shapes = scale === 1 ? SHAPES : `<g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${SHAPES}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${tile}${shapes}</svg>`;
}

const favicon = icon({ rounded: true });
writeFileSync(`${OUT}favicon.svg`, favicon + "\n");

const PNGS = [
  ["favicon-32.png", 32, favicon],
  ["icon-192.png", 192, favicon],
  ["icon-512.png", 512, favicon],
  ["icon-maskable-512.png", 512, icon({ rounded: false, scale: 0.8 })],
  ["apple-touch-icon.png", 180, icon({ rounded: false, scale: 0.9 })],
];

const browser = await chromium.launch();
for (const [name, size, svg] of PNGS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: `${OUT}${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log(`wrote favicon.svg and ${PNGS.length} PNG icons to ${OUT}`);
