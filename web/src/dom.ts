// Tiny DOM helpers shared by the app and the mediation sheet.
export type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;
export type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(markup: string, cls: string): SVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 20 20");
  el.setAttribute("class", cls);
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  el.innerHTML = markup;
  return el;
}
