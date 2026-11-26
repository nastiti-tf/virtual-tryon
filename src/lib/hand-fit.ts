import {
  drawOverlay,
  toCanvas,
  type HandTrack,
  type Landmark,
  type OverlayPose,
  type View,
} from "@/lib/overlay-fit";
import { fingerIds, type FingerId, type OverlayAnchor, type OverlayFit } from "@/lib/try-on-data";

/**
 * Pemasangan aksesoris tangan lewat Hand Landmarker (21 titik per tangan, maksimal dua tangan).
 *
 * - "wrist" (jam tangan, gelang): titik pergelangan (0) menjadi pangkal, arah ke buku jari tengah (9)
 *   menjadi arah "atas" gambar, lebar telapak (buku jari telunjuk 5 ↔ kelingking 17) menjadi acuan lebar.
 * - "nails" (kuku): tiap jari punya gambar sendiri, dipasang di ujung jari antara sendi ujung dan
 *   ujung jari, searah jari, lebarnya mengikuti lebar telapak.
 */

/** Indeks landmark Hand Landmarker. */
export const HAND = {
  wrist: 0,
  indexMcp: 5,
  middleMcp: 9,
  pinkyMcp: 17,
} as const;

/** Sendi ujung (dip) dan ujung jari (tip) tiap jari. Untuk jempol dipakai sendi IP (3) dan ujung (4). */
export const FINGER_JOINTS: Readonly<Record<FingerId, { dip: number; tip: number }>> = {
  thumb: { dip: 3, tip: 4 },
  index: { dip: 7, tip: 8 },
  middle: { dip: 11, tip: 12 },
  ring: { dip: 15, tip: 16 },
  pinky: { dip: 19, tip: 20 },
};

/** Lebar kuku ÷ lebar telapak. Jempol paling lebar, kelingking paling sempit. */
export const NAIL_WIDTH: Readonly<Record<FingerId, number>> = {
  thumb: 0.235,
  index: 0.19,
  middle: 0.195,
  ring: 0.18,
  pinky: 0.15,
};

/**
 * Pusat kuku berada sekian × panjang ruas ujung jari (dip → tip) dari ujung jari ke arah pangkal.
 * Kuku press-on sedikit lebih panjang dari ujung jari, jadi pusatnya tidak di tengah ruas.
 */
const NAIL_CENTER = 0.22;
/** Ruas ujung yang lebih pendek dari ini (× lebar telapak) dianggap tertekuk ke kamera: kuku disembunyikan. */
const MIN_FINGER_SEGMENT = 0.1;
/** Panjang telapak (pergelangan → buku jari tengah) ≈ sekian × lebar telapak, dipakai saat telapak miring. */
const PALM_LENGTH_TO_WIDTH = 0.8;
const MIN_YAW_SCALE = 0.55;

type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Satu gambar yang harus digambar: `slot` = "single" (jam/gelang) atau "<set>_<jari>" (kuku). */
export type HandOverlay = { key: string; slot: string; pose: OverlayPose };

/** Gambar yang sudah dimuat untuk sampel terpilih. */
export type HandImages = {
  single: HTMLImageElement | null;
  /** Kunci "a_thumb", "b_index", dst. */
  nails: ReadonlyMap<string, HTMLImageElement>;
};

type HandGeometry = {
  wrist: Point;
  /** Vektor satuan dari pergelangan ke arah jari. */
  toFingers: Point;
  /** Lebar telapak di layar (sudah terpengaruh perspektif). */
  palmWidth: number;
  /** Lebar telapak seandainya menghadap lurus ke kamera. */
  frontalPalmWidth: number;
};

function measureHand(landmarks: readonly Landmark[], view: View): HandGeometry | null {
  const wrist = landmarks[HAND.wrist];
  const index = landmarks[HAND.indexMcp];
  const middle = landmarks[HAND.middleMcp];
  const pinky = landmarks[HAND.pinkyMcp];

  if (!wrist || !index || !middle || !pinky) {
    return null;
  }

  const w = toCanvas(wrist, view);
  const m = toCanvas(middle, view);
  const palmWidth = dist(toCanvas(index, view), toCanvas(pinky, view));
  const length = dist(w, m);

  if (length < 1e-3 || palmWidth < 1e-3) {
    return null;
  }

  return {
    wrist: w,
    toFingers: { x: (m.x - w.x) / length, y: (m.y - w.y) / length },
    palmWidth,
    frontalPalmWidth: Math.max(palmWidth, length * PALM_LENGTH_TO_WIDTH),
  };
}

/** Rotasi (radian) yang membuat sumbu "atas" gambar (0, -1) menunjuk ke arah `up`. */
const rotationToward = (up: Point) => Math.atan2(up.x, -up.y);

/** Kunci stabil per tangan: label MediaPipe; bila dua tangan berlabel sama, yang kedua diberi akhiran. */
function handKeys(hands: readonly HandTrack[]): string[] {
  const seen = new Set<string>();

  return hands.map((hand, index) => {
    const base = hand.label || `hand${index}`;
    let key = base;

    for (let n = 2; seen.has(key); n += 1) {
      key = `${base}-${n}`;
    }

    seen.add(key);
    return key;
  });
}

/** Jam tangan dan gelang: satu gambar per tangan, di pergelangan. */
function computeWristOverlays(
  hands: readonly HandTrack[],
  view: View,
  fit: OverlayFit,
): HandOverlay[] {
  const keys = handKeys(hands);
  const result: HandOverlay[] = [];

  hands.forEach((hand, index) => {
    const geometry = measureHand(hand.landmarks, view);

    if (!geometry) {
      return;
    }

    result.push({
      key: keys[index] ?? String(index),
      slot: "single",
      pose: {
        x: geometry.wrist.x,
        y: geometry.wrist.y,
        width: geometry.frontalPalmWidth * fit.widthScale,
        rotation: rotationToward(geometry.toFingers) + (fit.rotation ?? 0),
        // Telapak menyamping → aksesoris menyempit seperti pergelangan yang diputar.
        yawScale: clamp(geometry.palmWidth / geometry.frontalPalmWidth, MIN_YAW_SCALE, 1),
      },
    });
  });

  return result;
}

/** Kuku: satu gambar per jari per tangan. Tangan berlabel Left memakai set "a", Right memakai "b". */
function computeNailOverlays(
  hands: readonly HandTrack[],
  view: View,
  fit: OverlayFit,
): HandOverlay[] {
  const keys = handKeys(hands);
  const usedSides = new Set<string>();
  const result: HandOverlay[] = [];

  hands.forEach((hand, index) => {
    const geometry = measureHand(hand.landmarks, view);

    if (!geometry) {
      return;
    }

    const fallbackSide = index % 2 === 0 ? "a" : "b";
    let side = hand.label === "Left" ? "a" : hand.label === "Right" ? "b" : fallbackSide;

    // Dua tangan dengan label sama (salah deteksi): tangan kedua memakai set lainnya.
    if (usedSides.has(side)) {
      side = side === "a" ? "b" : "a";
    }

    usedSides.add(side);

    for (const finger of fingerIds) {
      const joints = FINGER_JOINTS[finger];
      const tipLandmark = hand.landmarks[joints.tip];
      const dipLandmark = hand.landmarks[joints.dip];

      if (!tipLandmark || !dipLandmark) {
        continue;
      }

      const tip = toCanvas(tipLandmark, view);
      const dip = toCanvas(dipLandmark, view);
      const segment = dist(tip, dip);

      if (segment < geometry.frontalPalmWidth * MIN_FINGER_SEGMENT) {
        continue;
      }

      // Arah dari ujung jari ke pangkal kuku. Gambar kuku menaruh ujung di bawah, pangkal di atas,
      // jadi "atas" gambar harus menunjuk ke arah ini.
      const towardCuticle = { x: (dip.x - tip.x) / segment, y: (dip.y - tip.y) / segment };

      result.push({
        key: `${keys[index] ?? index}:${finger}`,
        slot: `${side}_${finger}`,
        pose: {
          x: tip.x + towardCuticle.x * segment * NAIL_CENTER,
          y: tip.y + towardCuticle.y * segment * NAIL_CENTER,
          width: geometry.frontalPalmWidth * NAIL_WIDTH[finger] * fit.widthScale,
          rotation: rotationToward(towardCuticle),
          yawScale: 1,
        },
      });
    }
  });

  return result;
}

/** Posisi semua gambar aksesoris tangan untuk frame ini. Kosong bila tidak ada tangan terdeteksi. */
export function computeHandOverlays(
  anchor: OverlayAnchor,
  hands: readonly HandTrack[] | null | undefined,
  view: View,
  fit: OverlayFit,
): HandOverlay[] {
  if (!hands || hands.length === 0) {
    return [];
  }

  switch (anchor) {
    case "wrist":
      return computeWristOverlays(hands, view, fit);
    case "nails":
      return computeNailOverlays(hands, view, fit);
    default:
      return [];
  }
}

/**
 * Penghalusan per gambar (dicocokkan lewat `key`). Rotasi dihaluskan lewat selisih sudut terpendek
 * supaya tidak berputar balik saat melewati ±180°. `previous` diperbarui di tempat.
 */
export function smoothHandOverlays(
  previous: Map<string, OverlayPose>,
  next: readonly HandOverlay[],
  alpha: number,
): HandOverlay[] {
  const mix = (from: number, to: number) => from + (to - from) * alpha;

  const result = next.map<HandOverlay>((overlay) => {
    const before = previous.get(overlay.key);

    if (!before) {
      return overlay;
    }

    const { pose } = overlay;

    return {
      ...overlay,
      pose: {
        x: mix(before.x, pose.x),
        y: mix(before.y, pose.y),
        width: mix(before.width, pose.width),
        rotation: before.rotation + wrapAngle(pose.rotation - before.rotation) * alpha,
        yawScale: mix(before.yawScale, pose.yawScale),
      },
    };
  });

  previous.clear();

  for (const overlay of result) {
    previous.set(overlay.key, overlay.pose);
  }

  return result;
}

export function drawHandOverlays(
  context: CanvasRenderingContext2D,
  overlays: readonly HandOverlay[],
  images: HandImages,
  fit: OverlayFit,
) {
  for (const overlay of overlays) {
    const image = overlay.slot === "single" ? images.single : images.nails.get(overlay.slot);

    if (image) {
      drawOverlay(context, image, overlay.pose, fit);
    }
  }
}

type HandResult = {
  landmarks: ReadonlyArray<ReadonlyArray<Landmark>>;
  handedness: ReadonlyArray<ReadonlyArray<{ categoryName: string }>>;
};

/** Hasil HandLandmarker.detectForVideo → daftar tangan dengan labelnya. */
export function readHands(result: HandResult): HandTrack[] {
  return result.landmarks.map((landmarks, index) => ({
    landmarks,
    label: result.handedness[index]?.[0]?.categoryName ?? "",
  }));
}
