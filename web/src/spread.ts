// Pins on the same spot (one town, or the centre of a department or region) are spread on
// rings 50 m apart, so each one can be seen and clicked once the map is zoomed in. Display
// only: distances, the detail panel and the open data keep the true coordinates.

export const SPREAD_M = 50;
const M_PER_DEGREE = 111_320;

/** Offset [east, north] in metres of the n-th pin of a stack: the first stays on the spot,
 * then rings of 6, 12, 18... pins, `spacing` metres apart. */
export function ringOffset(n: number, spacing = SPREAD_M): [number, number] {
  if (n <= 0) return [0, 0];
  let ring = 1;
  let first = 1;
  while (n >= first + 6 * ring) {
    first += 6 * ring;
    ring += 1;
  }
  const angle = (2 * Math.PI * (n - first)) / (6 * ring);
  return [ring * spacing * Math.cos(angle), ring * spacing * Math.sin(angle)];
}

/** Display coordinates [lon, lat] for each point, in input order. Points sharing a position
 * (to about a metre) are spread around it; the first in `order` keeps the true position. */
export function spreadStacked<T extends { lat: number; lon: number }>(
  points: T[],
  order: (a: T, b: T) => number = () => 0,
  spacing = SPREAD_M,
): Array<[number, number]> {
  const groups = new Map<string, number[]>();
  points.forEach((p, i) => {
    const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });
  const out: Array<[number, number]> = points.map((p) => [p.lon, p.lat]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => order(points[a], points[b]) || a - b);
    group.forEach((index, n) => {
      const { lat, lon } = points[index];
      const [east, north] = ringOffset(n, spacing);
      out[index] = [
        lon + east / (M_PER_DEGREE * Math.cos((lat * Math.PI) / 180)),
        lat + north / M_PER_DEGREE,
      ];
    });
  }
  return out;
}
