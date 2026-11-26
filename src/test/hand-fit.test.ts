import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FINGER_JOINTS,
  NAIL_WIDTH,
  computeHandOverlays,
  readHands,
  smoothHandOverlays,
} from "@/lib/hand-fit";
import type { HandTrack, Landmark, OverlayPose, View } from "@/lib/overlay-fit";
import {
  defaultOverlayFit,
  fingerIds,
  hasOverlay,
  tryOnCategories,
  type OverlayFit,
} from "@/lib/try-on-data";

const square: View = {
  sourceWidth: 1000,
  sourceHeight: 1000,
  width: 1000,
  height: 1000,
  mirror: false,
};

const fit = (overrides: Partial<OverlayFit> = {}): OverlayFit => ({
  ...defaultOverlayFit,
  ...overrides,
});

/** Tangan menghadap kamera, jari ke atas: pergelangan di bawah, telapak selebar 0.2. */
function uprightHand(label = "Right"): HandTrack {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0 };
  };

  set(0, 0.5, 0.8);
  set(5, 0.4, 0.55); // buku jari telunjuk
  set(9, 0.5, 0.52); // buku jari tengah
  set(17, 0.6, 0.57); // buku jari kelingking

  // Jari lurus ke atas: sendi ujung 0.06 di bawah ujung jari.
  for (const joints of Object.values(FINGER_JOINTS)) {
    set(joints.dip, 0.5, 0.3);
    set(joints.tip, 0.5, 0.24);
  }

  return { landmarks, label };
}

/** Putar semua landmark 90° searah jarum jam di sekitar pergelangan (jari ke kanan). */
function rotateQuarterTurn(hand: HandTrack): HandTrack {
  const origin = hand.landmarks[0]!;

  return {
    label: hand.label,
    landmarks: hand.landmarks.map((l) => ({
      x: origin.x - (l.y - origin.y),
      y: origin.y + (l.x - origin.x),
      z: 0,
    })),
  };
}

describe("computeHandOverlays · wrist", () => {
  const wristFit = fit({ widthScale: 0.6 });

  it("tidak menghasilkan apa-apa tanpa tangan", () => {
    expect(computeHandOverlays("wrist", null, square, wristFit)).toEqual([]);
    expect(computeHandOverlays("wrist", [], square, wristFit)).toEqual([]);
  });

  it("memasang di pergelangan, lebar = lebar telapak × widthScale, tegak bila jari ke atas", () => {
    const [overlay] = computeHandOverlays("wrist", [uprightHand()], square, wristFit);

    expect(overlay?.slot).toBe("single");
    expect(overlay?.pose.x).toBeCloseTo(500);
    expect(overlay?.pose.y).toBeCloseTo(800);
    expect(overlay?.pose.rotation).toBeCloseTo(0);
    // Lebar telapak 200 px; panjang telapak (pergelangan → tengah) 280 px × 0.8 = 224 > 200.
    expect(overlay?.pose.width).toBeCloseTo(224 * 0.6, 0);
    expect(overlay?.pose.yawScale).toBeGreaterThan(0.55);
    expect(overlay?.pose.yawScale).toBeLessThanOrEqual(1);
  });

  it("memutar mengikuti arah jari", () => {
    const [overlay] = computeHandOverlays("wrist", [rotateQuarterTurn(uprightHand())], square, wristFit);

    // Jari menunjuk ke kanan → "atas" gambar diputar 90° searah jarum jam.
    expect(overlay?.pose.rotation).toBeCloseTo(Math.PI / 2, 1);
  });

  it("menambahkan fit.rotation", () => {
    const [overlay] = computeHandOverlays("wrist", [uprightHand()], square, fit({ rotation: -0.3 }));

    expect(overlay?.pose.rotation).toBeCloseTo(-0.3);
  });

  it("memasang di setiap tangan dengan kunci berbeda", () => {
    const overlays = computeHandOverlays(
      "wrist",
      [uprightHand("Left"), uprightHand("Left")],
      square,
      wristFit,
    );

    expect(overlays).toHaveLength(2);
    expect(new Set(overlays.map((o) => o.key)).size).toBe(2);
  });

  it("mengikuti kamera depan yang dicerminkan", () => {
    const [overlay] = computeHandOverlays(
      "wrist",
      [uprightHand()],
      { ...square, mirror: true },
      wristFit,
    );

    expect(overlay?.pose.x).toBeCloseTo(500);
    expect(overlay?.pose.rotation).toBeCloseTo(0);
  });
});

describe("computeHandOverlays · nails", () => {
  const nailFit = fit({ widthScale: 1 });

  it("menghasilkan satu kuku per jari dengan slot set + jari", () => {
    const overlays = computeHandOverlays("nails", [uprightHand("Left")], square, nailFit);

    expect(overlays.map((o) => o.slot)).toEqual(fingerIds.map((finger) => `a_${finger}`));
  });

  it("tangan Right memakai set b", () => {
    const overlays = computeHandOverlays("nails", [uprightHand("Right")], square, nailFit);

    expect(overlays.every((o) => o.slot.startsWith("b_"))).toBe(true);
  });

  it("dua tangan berlabel sama memakai set yang berbeda", () => {
    const overlays = computeHandOverlays(
      "nails",
      [uprightHand("Left"), uprightHand("Left")],
      square,
      nailFit,
    );
    const sides = new Set(overlays.map((o) => o.slot[0]));

    expect(overlays).toHaveLength(10);
    expect(sides).toEqual(new Set(["a", "b"]));
  });

  it("pusat kuku sedikit di bawah ujung jari, gambar diputar 180° (ujung kuku di bawah gambar)", () => {
    const overlays = computeHandOverlays("nails", [uprightHand()], square, nailFit);
    const middle = overlays.find((o) => o.slot.endsWith("_middle"));

    // Ujung jari y = 240, sendi ujung y = 300 → ruas 60 px, pusat 0.22 × 60 px di bawah ujung jari.
    expect(middle?.pose.x).toBeCloseTo(500);
    expect(middle?.pose.y).toBeCloseTo(240 + 60 * 0.22);
    expect(Math.abs(middle?.pose.rotation ?? 0)).toBeCloseTo(Math.PI);
  });

  it("lebar kuku mengikuti jari dan widthScale", () => {
    const base = computeHandOverlays("nails", [uprightHand()], square, nailFit);
    const doubled = computeHandOverlays("nails", [uprightHand()], square, fit({ widthScale: 2 }));
    const width = (list: typeof base, finger: string) =>
      list.find((o) => o.slot.endsWith(`_${finger}`))?.pose.width ?? 0;

    expect(width(base, "thumb")).toBeGreaterThan(width(base, "pinky"));
    expect(width(base, "thumb") / width(base, "pinky")).toBeCloseTo(NAIL_WIDTH.thumb / NAIL_WIDTH.pinky);
    expect(width(doubled, "index")).toBeCloseTo(width(base, "index") * 2);
  });

  it("menyembunyikan kuku pada jari yang menunjuk ke kamera", () => {
    const hand = uprightHand();
    hand.landmarks = hand.landmarks.map((l, i) => (i === FINGER_JOINTS.ring.tip ? { ...l, y: 0.3 } : l));

    const slots = computeHandOverlays("nails", [hand], square, nailFit).map((o) => o.slot);

    expect(slots).toHaveLength(4);
    expect(slots).not.toContain("b_ring");
  });
});

describe("smoothHandOverlays", () => {
  const pose = (rotation: number, x = 0): OverlayPose => ({
    x,
    y: 0,
    width: 100,
    rotation,
    yawScale: 1,
  });

  it("langsung memakai nilai baru untuk kunci baru, lalu menghaluskan", () => {
    const store = new Map<string, OverlayPose>();

    expect(smoothHandOverlays(store, [{ key: "k", slot: "single", pose: pose(0, 0) }], 0.5)[0]?.pose.x).toBe(0);
    expect(smoothHandOverlays(store, [{ key: "k", slot: "single", pose: pose(0, 100) }], 0.5)[0]?.pose.x).toBe(50);
  });

  it("menghaluskan sudut lewat jalur terpendek di sekitar ±180°", () => {
    const store = new Map<string, OverlayPose>();
    smoothHandOverlays(store, [{ key: "k", slot: "single", pose: pose(3.1) }], 0.5);
    const [next] = smoothHandOverlays(store, [{ key: "k", slot: "single", pose: pose(-3.1) }], 0.5);

    expect(Math.abs(next?.pose.rotation ?? 0)).toBeGreaterThan(3);
  });

  it("melupakan kunci yang sudah tidak ada", () => {
    const store = new Map<string, OverlayPose>();
    smoothHandOverlays(store, [{ key: "a", slot: "single", pose: pose(0) }], 0.5);
    smoothHandOverlays(store, [{ key: "b", slot: "single", pose: pose(0) }], 0.5);

    expect([...store.keys()]).toEqual(["b"]);
  });
});

describe("readHands", () => {
  it("memasangkan landmark dengan label tangan", () => {
    const hands = readHands({
      landmarks: [[{ x: 0.1, y: 0.2 }], [{ x: 0.3, y: 0.4 }]],
      handedness: [[{ categoryName: "Left" }], []],
    });

    expect(hands.map((h) => h.label)).toEqual(["Left", ""]);
  });
});

describe("katalog tangan", () => {
  const publicFile = (url: string) => existsSync(join(process.cwd(), "public", url));
  const byId = (id: string) => tryOnCategories.find((category) => category.id === id);

  it("jam tangan dan gelang memakai anchor wrist dan file yang ada", () => {
    const samples = [...(byId("watch")?.samples ?? []), ...(byId("bracelets")?.samples ?? [])];

    expect(samples).toHaveLength(7);

    for (const sample of samples) {
      expect(sample.anchor, sample.id).toBe("wrist");
      expect(hasOverlay(sample), sample.id).toBe(true);
      expect(publicFile(sample.overlay2d ?? ""), sample.overlay2d).toBe(true);
      expect(publicFile(sample.thumbnail ?? ""), sample.thumbnail).toBe(true);
      expect(sample.fit?.widthScale, sample.id).toBeGreaterThan(0);
    }
  });

  it("setiap set kuku punya 5 jari untuk dua tangan, semua filenya ada", () => {
    const sets = byId("nails")?.samples ?? [];

    expect(sets).toHaveLength(5);

    for (const sample of sets) {
      expect(sample.anchor, sample.id).toBe("nails");
      expect(hasOverlay(sample), sample.id).toBe(true);
      expect(publicFile(sample.thumbnail ?? ""), sample.thumbnail).toBe(true);

      for (const side of ["a", "b"] as const) {
        for (const finger of fingerIds) {
          const url = sample.nails?.[side][finger] ?? "";
          expect(publicFile(url), url).toBe(true);
        }
      }
    }
  });
});
