import { describe, expect, it } from "vitest";

import {
  computeOverlayPose,
  hasVisibleHips,
  hasVisibleShoulders,
  smoothPose,
  toCanvas,
  type Landmark,
  type OverlayPose,
  type TrackingData,
  type View,
} from "@/lib/overlay-fit";
import { defaultOverlayFit, tryOnCategories, type OverlayFit } from "@/lib/try-on-data";

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

function faceWith(overrides: Record<number, Landmark>): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = point;
  }
  return landmarks;
}

function poseWith(overrides: Record<number, Landmark>): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
  }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = point;
  }
  return landmarks;
}

// Wajah menghadap lurus: mata di y=0.5, sisi wajah selebar 0.4, dahi di y=0.2, dagu di y=0.6.
const frontalFace = faceWith({
  33: { x: 0.4, y: 0.5, z: 0 },
  263: { x: 0.6, y: 0.5, z: 0 },
  234: { x: 0.3, y: 0.5, z: 0 },
  454: { x: 0.7, y: 0.5, z: 0 },
  10: { x: 0.5, y: 0.2, z: 0 },
  152: { x: 0.5, y: 0.6, z: 0 },
});

const shoulders = poseWith({
  11: { x: 0.3, y: 0.8, visibility: 1 },
  12: { x: 0.7, y: 0.8, visibility: 1 },
});

describe("toCanvas", () => {
  const wide: View = {
    sourceWidth: 1000,
    sourceHeight: 500,
    width: 500,
    height: 500,
    mirror: false,
  };

  it("memperhitungkan crop object-cover", () => {
    expect(toCanvas({ x: 0.5, y: 0.5 }, wide)).toEqual({ x: 250, y: 250 });
    expect(toCanvas({ x: 0.25, y: 0 }, wide)).toEqual({ x: 0, y: 0 });
  });

  it("membalik sumbu X saat mirror", () => {
    expect(toCanvas({ x: 0.25, y: 0 }, { ...wide, mirror: true })).toEqual({ x: 500, y: 0 });
  });

  it("menghormati object-position", () => {
    expect(toCanvas({ x: 0.5, y: 0.5 }, { ...wide, positionX: 0 })).toEqual({ x: 500, y: 250 });
  });
});

describe("kacamata (eyes)", () => {
  const data: TrackingData = { face: frontalFace, pose: null };

  it("dijangkarkan di tengah mata dengan lebar sesuai jarak mata", () => {
    const pose = computeOverlayPose("eyes", data, square, fit());

    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(500);
    expect(pose?.width).toBeCloseTo(200 * defaultOverlayFit.widthScale);
    expect(pose?.rotation).toBeCloseTo(0);
    expect(pose?.yawScale).toBeCloseTo(1);
  });

  it("membalik arah kemiringan saat tampilan di-mirror", () => {
    const tilted: TrackingData = {
      face: faceWith({ 33: { x: 0.4, y: 0.5, z: 0 }, 263: { x: 0.6, y: 0.6, z: 0 } }),
      pose: null,
    };

    expect(computeOverlayPose("eyes", tilted, square)?.rotation).toBeGreaterThan(0);
    expect(computeOverlayPose("eyes", tilted, { ...square, mirror: true })?.rotation).toBeLessThan(
      0,
    );
  });

  it("menjaga lebar asli saat menoleh: lebar gambar × yawScale = lebar di layar", () => {
    const turned: TrackingData = {
      face: faceWith({
        33: { x: 0.4, y: 0.5, z: 0 },
        263: { x: 0.6, y: 0.5, z: 0 },
        234: { x: 0.3, y: 0.5, z: -0.1 },
        454: { x: 0.7, y: 0.5, z: 0.1 },
      }),
      pose: null,
    };
    const pose = computeOverlayPose("eyes", turned, square, fit());

    expect(pose?.yawScale).toBeLessThan(1);
    expect(pose?.yawScale).toBeGreaterThanOrEqual(0.55);
    expect((pose?.width ?? 0) * (pose?.yawScale ?? 0)).toBeCloseTo(
      200 * defaultOverlayFit.widthScale,
    );
  });

  it("mengembalikan null tanpa wajah", () => {
    expect(computeOverlayPose("eyes", { face: null, pose: null }, square)).toBeNull();
  });
});

describe("topi dan rambut (head)", () => {
  it("dijangkarkan di puncak dahi dengan lebar mengikuti lebar wajah", () => {
    const pose = computeOverlayPose(
      "head",
      { face: frontalFace, pose: null },
      square,
      fit({ widthScale: 1.5 }),
    );

    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(200);
    expect(pose?.width).toBeCloseTo(400 * 1.5);
  });

  it("ikut miring mengikuti garis mata", () => {
    const tilted: TrackingData = {
      face: faceWith({
        33: { x: 0.4, y: 0.5, z: 0 },
        263: { x: 0.6, y: 0.6, z: 0 },
        234: { x: 0.3, y: 0.5, z: 0 },
        454: { x: 0.7, y: 0.5, z: 0 },
        10: { x: 0.5, y: 0.2, z: 0 },
      }),
      pose: null,
    };

    expect(computeOverlayPose("head", tilted, square)?.rotation).toBeGreaterThan(0);
  });
});

describe("kalung dan dasi (neck)", () => {
  it("memakai bahu: di atas garis bahu, lebar mengikuti lebar bahu", () => {
    const pose = computeOverlayPose(
      "neck",
      { face: frontalFace, pose: shoulders },
      square,
      fit({ widthScale: 0.5 }),
    );

    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(800 - 400 * 0.1);
    expect(pose?.width).toBeCloseTo(400 * 0.5);
    expect(pose?.rotation).toBeCloseTo(0);
  });

  it("naik tegak lurus garis bahu saat bahu miring", () => {
    const tilted = poseWith({
      11: { x: 0.3, y: 0.8, visibility: 1 },
      12: { x: 0.7, y: 0.9, visibility: 1 },
    });
    const pose = computeOverlayPose("neck", { face: null, pose: tilted }, square);

    expect(pose?.rotation).toBeGreaterThan(0);
    // Titik leher bergeser ke kanan-atas dari titik tengah bahu (500, 850).
    expect(pose?.x).toBeGreaterThan(500);
    expect(pose?.y).toBeLessThan(850);
  });

  it("cadangan dari wajah saat bahu tidak terlihat", () => {
    const hidden = poseWith({
      11: { x: 0.3, y: 0.8, visibility: 0.1 },
      12: { x: 0.7, y: 0.8, visibility: 0.1 },
    });

    expect(hasVisibleShoulders(hidden)).toBe(false);

    const pose = computeOverlayPose(
      "neck",
      { face: frontalFace, pose: hidden },
      square,
      fit({ widthScale: 0.5 }),
    );

    // Dagu di y=600, tinggi wajah 400 → leher 0.5 × 400 di bawah dagu.
    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(800);
    expect(pose?.width).toBeCloseTo(400 * 2.8 * 0.5);
  });

  it("menganggap bahu di luar frame sebagai tidak terlihat", () => {
    expect(
      hasVisibleShoulders(
        poseWith({ 11: { x: 0.3, y: 1.4, visibility: 1 }, 12: { x: 0.7, y: 1.4, visibility: 1 } }),
      ),
    ).toBe(false);
    expect(hasVisibleShoulders(shoulders)).toBe(true);
    expect(hasVisibleShoulders(null)).toBe(false);
  });

  it("mengembalikan null tanpa bahu maupun wajah", () => {
    expect(computeOverlayPose("neck", { face: null, pose: null }, square)).toBeNull();
  });
});

describe("baju, rompi, blazer (torso)", () => {
  const withHips = poseWith({
    11: { x: 0.3, y: 0.4, visibility: 1 },
    12: { x: 0.7, y: 0.4, visibility: 1 },
    23: { x: 0.35, y: 0.9, visibility: 1 },
    24: { x: 0.65, y: 0.9, visibility: 1 },
  });
  const shouldersOnly = poseWith({
    11: { x: 0.3, y: 0.4, visibility: 1 },
    12: { x: 0.7, y: 0.4, visibility: 1 },
    23: { x: 0.35, y: 1.4, visibility: 1 },
    24: { x: 0.65, y: 1.4, visibility: 1 },
  });

  it("dijangkarkan tepat di tengah garis bahu (tanpa naik ke leher)", () => {
    const pose = computeOverlayPose(
      "torso",
      { face: frontalFace, pose: shouldersOnly },
      square,
      fit({ widthScale: 1.5, anchorY: 0.15, hemRatio: 1.2 }),
    );

    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(400);
    expect(pose?.width).toBeCloseTo(400 * 1.5);
    expect(pose?.rotation).toBeCloseTo(0);
  });

  it("memakai rasio asli gambar saat pinggul tidak terlihat", () => {
    const pose = computeOverlayPose(
      "torso",
      { face: null, pose: shouldersOnly },
      square,
      fit({ hemRatio: 1.2 }),
    );

    expect(hasVisibleHips(shouldersOnly)).toBe(false);
    expect(pose?.height).toBeUndefined();
  });

  it("menyesuaikan tinggi dengan panjang badan saat pinggul terlihat", () => {
    const pose = computeOverlayPose(
      "torso",
      { face: null, pose: withHips },
      square,
      fit({ widthScale: 1.5, anchorY: 0.2, hemRatio: 1.2 }),
    );

    // Bahu-pinggul: dari (500,400) ke (500,900) = 500 px; tinggi = 500 × 1.2 ÷ (1 − 0.2).
    expect(hasVisibleHips(withHips)).toBe(true);
    expect(pose?.height).toBeCloseTo((500 * 1.2) / 0.8);
  });

  it("ikut miring mengikuti garis bahu", () => {
    const tilted = poseWith({
      11: { x: 0.3, y: 0.4, visibility: 1 },
      12: { x: 0.7, y: 0.5, visibility: 1 },
    });
    const pose = computeOverlayPose("torso", { face: null, pose: tilted }, square);

    expect(pose?.rotation).toBeGreaterThan(0);
    expect(pose?.x).toBeCloseTo(500);
    expect(pose?.y).toBeCloseTo(450);
  });

  it("cadangan dari wajah: garis bahu sedikit di bawah titik leher", () => {
    const hidden = poseWith({
      11: { x: 0.3, y: 0.8, visibility: 0.1 },
      12: { x: 0.7, y: 0.8, visibility: 0.1 },
    });
    const data: TrackingData = { face: frontalFace, pose: hidden };
    const neck = computeOverlayPose("neck", data, square, fit({ widthScale: 1 }));
    const torso = computeOverlayPose("torso", data, square, fit({ widthScale: 1 }));

    expect(torso?.x).toBeCloseTo(neck?.x ?? 0);
    expect(torso?.y).toBeGreaterThan(neck?.y ?? 0);
    expect(torso?.width).toBeCloseTo(400 * 2.8);
  });

  it("mengembalikan null tanpa bahu maupun wajah", () => {
    expect(computeOverlayPose("torso", { face: null, pose: null }, square)).toBeNull();
  });
});

describe("smoothPose", () => {
  const a: OverlayPose = { x: 0, y: 0, width: 100, rotation: 0, yawScale: 1 };
  const b: OverlayPose = { x: 100, y: 50, width: 200, rotation: 1, yawScale: 0.8 };

  it("memakai pose baru apabila belum ada pose sebelumnya", () => {
    expect(smoothPose(null, b)).toBe(b);
  });

  it("menginterpolasi ke pose baru", () => {
    expect(smoothPose(a, b, 0.5)).toEqual({
      x: 50,
      y: 25,
      width: 150,
      rotation: 0.5,
      yawScale: 0.9,
    });
  });

  it("menghaluskan tinggi baju hanya bila tersedia", () => {
    const withHeight: OverlayPose = { ...a, height: 100 };
    const nextHeight: OverlayPose = { ...b, height: 200 };

    expect(smoothPose(withHeight, nextHeight, 0.5).height).toBe(150);
    expect(smoothPose(a, nextHeight, 0.5).height).toBe(200);
    expect(smoothPose(withHeight, b, 0.5).height).toBeUndefined();
  });
});

describe("katalog aset", () => {
  const withOverlay = tryOnCategories.flatMap((category) =>
    category.samples.filter((sample) => sample.overlay2d).map((sample) => ({ category, sample })),
  );

  it("setiap aksesoris punya titik pasang dan penyesuaian yang valid", () => {
    expect(withOverlay.length).toBeGreaterThan(20);

    for (const { sample } of withOverlay) {
      expect(sample.anchor, sample.id).toBeDefined();
      expect(sample.fit?.widthScale, sample.id).toBeGreaterThan(0);
      expect(sample.fit?.anchorX, sample.id).toBeGreaterThanOrEqual(0);
      expect(sample.fit?.anchorX, sample.id).toBeLessThanOrEqual(1);
      expect(sample.fit?.anchorY, sample.id).toBeGreaterThanOrEqual(0);
      expect(sample.fit?.anchorY, sample.id).toBeLessThanOrEqual(1);
    }
  });

  it("setiap pakaian memakai anchor torso dengan titik bahu yang valid", () => {
    const clothes = tryOnCategories.find((category) => category.id === "clothes");

    expect(clothes?.samples.length).toBe(9);

    for (const sample of clothes?.samples ?? []) {
      expect(sample.anchor, sample.id).toBe("torso");
      expect(sample.overlay2d, sample.id).toBe(`/overlays/clothes/${sample.id}.webp`);
      expect(sample.thumbnail, sample.id).toBe(`/thumbnails/clothes/${sample.id}.png`);
      // Gambar baju harus jauh lebih lebar dari bahu (lengan ikut), tapi tidak berlebihan.
      expect(sample.fit?.widthScale, sample.id).toBeGreaterThan(1.2);
      expect(sample.fit?.widthScale, sample.id).toBeLessThan(1.9);
      expect(sample.fit?.hemRatio, sample.id).toBeGreaterThan(0);
    }
  });

  it("id aksesoris unik", () => {
    const ids = tryOnCategories.flatMap((category) => category.samples.map((sample) => sample.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
