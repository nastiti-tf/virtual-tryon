import { describe, expect, it } from "vitest";

import {
  defaultHijabColor,
  hijabColors,
  hijabRegion,
  parseHex,
  recolorRgb,
  sharpenAlpha,
} from "@/lib/hijab";
import type { Landmark } from "@/lib/overlay-fit";

function face(overrides: Record<number, Landmark>): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = point;
  }
  return landmarks;
}

// Wajah tegak di tengah frame 1000×1000: lebar 200 px, tinggi 280 px.
const upright = face({
  10: { x: 0.5, y: 0.3 },
  152: { x: 0.5, y: 0.58 },
  234: { x: 0.4, y: 0.45 },
  454: { x: 0.6, y: 0.45 },
});

describe("parseHex", () => {
  it("reads 6- and 3-digit colors", () => {
    expect(parseHex("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHex("#0af")).toEqual([0, 170, 255]);
  });

  it("falls back to gray for invalid input", () => {
    expect(parseHex("not-a-color")).toEqual([128, 128, 128]);
  });
});

describe("recolorRgb", () => {
  it("keeps the target color at average brightness", () => {
    const [r, g, b] = recolorRgb(100, 100, [200, 100, 50]);
    expect([Math.round(r), Math.round(g), Math.round(b)]).toEqual([200, 100, 50]);
  });

  it("keeps folds: darker cloth gives darker output, brighter gives brighter", () => {
    const dark = recolorRgb(40, 100, [180, 120, 90]);
    const bright = recolorRgb(160, 100, [180, 120, 90]);
    expect(dark[0]).toBeLessThan(180);
    expect(bright[0]).toBeGreaterThan(180);
  });

  it("stays within 0..255 and can make black stay black", () => {
    const out = recolorRgb(255, 30, [250, 250, 250]);
    expect(Math.max(...out)).toBeLessThanOrEqual(255);
    expect(recolorRgb(90, 90, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("sharpenAlpha", () => {
  it("cuts the faint halo and saturates solid areas", () => {
    expect(sharpenAlpha(0)).toBe(0);
    expect(sharpenAlpha(50)).toBe(0);
    expect(sharpenAlpha(255)).toBe(1);
  });
});

describe("hijabRegion", () => {
  it("covers the head and drapes below the chin, wider than the face", () => {
    const region = hijabRegion(upright, 1000, 1000, 1.2)!;

    expect(region).not.toBeNull();
    expect(region.bbox.y).toBeLessThan(300); // di atas dahi
    expect(region.bbox.y + region.bbox.h).toBeGreaterThan(580 + 100); // di bawah dagu
    expect(region.bbox.w).toBeGreaterThan(200 * 2); // lebih lebar dari wajah
  });

  it("grows when the reach increases", () => {
    const short = hijabRegion(upright, 1000, 1000, 0.5)!;
    const long = hijabRegion(upright, 1000, 1000, 1.8)!;
    expect(long.bbox.h).toBeGreaterThan(short.bbox.h);
  });

  it("is centered on the face and stays inside the frame", () => {
    const region = hijabRegion(upright, 1000, 1000)!;
    const center = region.bbox.x + region.bbox.w / 2;

    expect(Math.abs(center - 500)).toBeLessThan(2);
    expect(region.bbox.x).toBeGreaterThanOrEqual(0);
    expect(region.bbox.x + region.bbox.w).toBeLessThanOrEqual(1000);
    expect(region.bbox.y + region.bbox.h).toBeLessThanOrEqual(1000);
  });

  it("follows a tilted head", () => {
    // Kepala miring 30° ke kanan: dagu bergeser ke kiri-bawah dari dahi.
    const tilted = face({
      10: { x: 0.5, y: 0.3 },
      152: { x: 0.5 - 0.14, y: 0.3 + 0.2425 },
      234: { x: 0.4, y: 0.4 },
      454: { x: 0.6, y: 0.4 },
    });
    const straight = hijabRegion(upright, 1000, 1000)!;
    const region = hijabRegion(tilted, 1000, 1000)!;

    expect(region.bbox.x + region.bbox.w / 2).toBeLessThan(straight.bbox.x + straight.bbox.w / 2);
  });

  it("returns null for a degenerate face", () => {
    expect(hijabRegion(face({}), 1000, 1000)).toBeNull();
  });
});

describe("hijab palette", () => {
  it("has a valid default and unique hex colors", () => {
    expect(hijabColors).toContain(defaultHijabColor);
    expect(new Set(hijabColors.map((c) => c.hex)).size).toBe(hijabColors.length);
  });
});
