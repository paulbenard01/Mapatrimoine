import { describe, expect, test } from "vitest";
import { SPREAD_M, ringOffset, spreadStacked } from "../src/spread";

// Haversine distance in metres.
function metres([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

describe("ringOffset", () => {
  test("the first pin stays, then rings of 6 and 12 at 50 and 100 m", () => {
    expect(ringOffset(0)).toEqual([0, 0]);
    for (let n = 1; n <= 6; n++) expect(Math.hypot(...ringOffset(n))).toBeCloseTo(SPREAD_M);
    for (let n = 7; n <= 18; n++) expect(Math.hypot(...ringOffset(n))).toBeCloseTo(2 * SPREAD_M);
    expect(Math.hypot(...ringOffset(19))).toBeCloseTo(3 * SPREAD_M);
  });
});

describe("spreadStacked", () => {
  const paris = { lat: 48.8589, lon: 2.347 };

  test("lone points keep their position", () => {
    const points = [paris, { lat: 43.2803, lon: 5.3806 }];
    expect(spreadStacked(points)).toEqual([
      [2.347, 48.8589],
      [5.3806, 43.2803],
    ]);
  });

  test("a stack of 34 pins is spread at least about 50 m apart, within 200 m", () => {
    const points = Array.from({ length: 34 }, () => ({ ...paris }));
    const out = spreadStacked(points);
    expect(out[0]).toEqual([paris.lon, paris.lat]);
    let closest = Infinity;
    for (let i = 0; i < out.length; i++) {
      expect(metres(out[i], [paris.lon, paris.lat])).toBeLessThan(200);
      for (let j = i + 1; j < out.length; j++) closest = Math.min(closest, metres(out[i], out[j]));
    }
    expect(closest).toBeGreaterThan(SPREAD_M * 0.98);
    expect(closest).toBeLessThan(SPREAD_M * 1.02);
  });

  test("the first in order keeps the true position; others are untouched", () => {
    const points = [
      { ...paris, rank: 0 },
      { ...paris, rank: 1 },
      { lat: 45, lon: 1, rank: 0 },
    ];
    const out = spreadStacked(points, (a, b) => b.rank - a.rank);
    expect(out[1]).toEqual([paris.lon, paris.lat]);
    expect(metres(out[0], out[1])).toBeCloseTo(SPREAD_M, 0);
    expect(out[2]).toEqual([1, 45]);
  });
});
