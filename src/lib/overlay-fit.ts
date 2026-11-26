import { defaultOverlayFit, type OverlayAnchor, type OverlayFit } from "@/lib/try-on-data";

/** Titik landmark MediaPipe yang sudah dinormalisasi (0..1 terhadap frame sumber). */
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

/** Satu tangan yang terdeteksi: 21 landmark + label MediaPipe ("Left" / "Right"). */
export type HandTrack = { landmarks: readonly Landmark[]; label: string };

/**
 * Hasil deteksi terbaru. `pose` hanya terisi untuk aksesoris leher dan badan, `hands` hanya untuk
 * aksesoris tangan (jam tangan, gelang, kuku).
 */
export type TrackingData = {
  face: readonly Landmark[] | null;
  pose: readonly Landmark[] | null;
  hands?: readonly HandTrack[] | null;
};

/**
 * Cara sumber (video/gambar) ditampilkan di kotak canvas.
 * Meniru CSS `object-cover` + `object-position` (+ mirror untuk kamera depan).
 */
export type View = {
  /** Ukuran asli sumber (video.videoWidth / image.naturalWidth). */
  sourceWidth: number;
  sourceHeight: number;
  /** Ukuran kotak tampil dalam piksel CSS. */
  width: number;
  height: number;
  mirror: boolean;
  /** object-position dalam 0..1 (default tengah). */
  positionX?: number;
  positionY?: number;
};

export type OverlayPose = {
  /** Titik jangkar di layar (piksel canvas). */
  x: number;
  y: number;
  /** Lebar aksesoris (piksel canvas), sudah tanpa efek perspektif menoleh. */
  width: number;
  /** Rotasi roll dalam radian. */
  rotation: number;
  /** Pengecilan horizontal saat kepala menoleh (0.55..1). */
  yawScale: number;
  /**
   * Tinggi gambar (piksel canvas) bila ingin dipaksa, mis. baju yang disesuaikan dengan panjang
   * badan. Kosong = tinggi mengikuti rasio asli gambar.
   */
  height?: number;
};

// Indeks landmark Face Landmarker (478 titik).
const FACE = { eyeA: 33, eyeB: 263, sideA: 234, sideB: 454, forehead: 10, chin: 152 } as const;
// Indeks landmark Pose Landmarker (33 titik).
const POSE = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 } as const;

const MIN_YAW_SCALE = 0.55;
/** Titik leher berada sedikit di atas garis bahu (satuan: lebar bahu). */
const NECK_RAISE = 0.1;
/** Cadangan saat bahu tidak terlihat: leher ≈ setengah tinggi wajah di bawah dagu. */
const NECK_BELOW_CHIN = 0.5;
/** Cadangan saat bahu tidak terlihat: lebar bahu ≈ 2.8× lebar wajah. */
const SHOULDER_TO_FACE_WIDTH = 2.8;
const MIN_VISIBILITY = 0.5;
/** Baju boleh diregangkan paling banyak segini terhadap rasio aslinya agar tidak terlihat penyok. */
const MIN_HEIGHT_STRETCH = 0.85;
const MAX_HEIGHT_STRETCH = 1.25;

type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Landmark (0..1 pada frame sumber) → piksel pada kotak tampil. */
export function toCanvas(point: Landmark, view: View): Point {
  const scale = Math.max(view.width / view.sourceWidth, view.height / view.sourceHeight);
  const offsetX = (view.width - view.sourceWidth * scale) * (view.positionX ?? 0.5);
  const offsetY = (view.height - view.sourceHeight * scale) * (view.positionY ?? 0.5);
  const x = point.x * view.sourceWidth * scale + offsetX;

  return {
    x: view.mirror ? view.width - x : x,
    y: point.y * view.sourceHeight * scale + offsetY,
  };
}

/** Dua titik diurutkan berdasarkan posisi di layar (kiri, kanan). */
const byScreenX = (a: Point, b: Point): [Point, Point] => (a.x <= b.x ? [a, b] : [b, a]);

/** Perkiraan sudut menoleh (yaw) dari kedalaman sisi kiri/kanan wajah. */
function estimateYaw(face: readonly Landmark[], view: View): number {
  const a = face[FACE.sideA];
  const b = face[FACE.sideB];

  if (!a || !b || a.z === undefined || b.z === undefined) {
    return 0;
  }

  const dx = (b.x - a.x) * view.sourceWidth;
  const dz = (b.z - a.z) * view.sourceWidth;

  return Math.atan2(dz, Math.abs(dx));
}

type FaceMetrics = {
  /** Kemiringan kepala (roll) dari garis mata. */
  rotation: number;
  /** Lebar wajah di layar (sudah terpengaruh perspektif menoleh). */
  faceWidth: number;
  yawScale: number;
  /** Lebar wajah seandainya menghadap lurus ke kamera. */
  frontalFaceWidth: number;
  eyeDistance: number;
  eyeCenter: Point;
};

function measureFace(face: readonly Landmark[], view: View): FaceMetrics | null {
  const eyeA = face[FACE.eyeA];
  const eyeB = face[FACE.eyeB];
  const sideA = face[FACE.sideA];
  const sideB = face[FACE.sideB];

  if (!eyeA || !eyeB || !sideA || !sideB) {
    return null;
  }

  const [left, right] = byScreenX(toCanvas(eyeA, view), toCanvas(eyeB, view));
  const faceWidth = dist(toCanvas(sideA, view), toCanvas(sideB, view));
  const yawScale = clamp(Math.cos(estimateYaw(face, view)), MIN_YAW_SCALE, 1);

  return {
    rotation: Math.atan2(right.y - left.y, right.x - left.x),
    faceWidth,
    yawScale,
    frontalFaceWidth: faceWidth / yawScale,
    eyeDistance: dist(left, right),
    eyeCenter: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 },
  };
}

/** Kacamata: dijangkarkan di tengah kedua mata, lebar mengikuti jarak mata. */
function computeEyesPose(
  face: readonly Landmark[],
  view: View,
  fit: OverlayFit,
): OverlayPose | null {
  const m = measureFace(face, view);

  if (!m) {
    return null;
  }

  return {
    x: m.eyeCenter.x,
    y: m.eyeCenter.y,
    width: (m.eyeDistance / m.yawScale) * fit.widthScale,
    rotation: m.rotation,
    yawScale: m.yawScale,
  };
}

/** Topi dan rambut: dijangkarkan di puncak dahi, lebar mengikuti lebar wajah. */
function computeHeadPose(
  face: readonly Landmark[],
  view: View,
  fit: OverlayFit,
): OverlayPose | null {
  const m = measureFace(face, view);
  const forehead = face[FACE.forehead];

  if (!m || !forehead) {
    return null;
  }

  const anchor = toCanvas(forehead, view);

  return {
    x: anchor.x,
    y: anchor.y,
    width: m.frontalFaceWidth * fit.widthScale,
    rotation: m.rotation,
    yawScale: m.yawScale,
  };
}

const isVisible = (l: Landmark) =>
  (l.visibility ?? 1) >= MIN_VISIBILITY && l.x > -0.05 && l.x < 1.05 && l.y > -0.05 && l.y < 1.05;

/** Kedua bahu terlihat jelas di kamera? */
export function hasVisibleShoulders(pose: readonly Landmark[] | null): boolean {
  const a = pose?.[POSE.leftShoulder];
  const b = pose?.[POSE.rightShoulder];

  return Boolean(a && b && isVisible(a) && isVisible(b));
}

/** Satu landmark pose terlihat jelas dan berada di dalam frame? */
const isLandmarkVisible = (l: Landmark | undefined): l is Landmark => Boolean(l && isVisible(l));

/** Kedua pinggul terlihat jelas di kamera? */
export function hasVisibleHips(pose: readonly Landmark[] | null): boolean {
  return isLandmarkVisible(pose?.[POSE.leftHip]) && isLandmarkVisible(pose?.[POSE.rightHip]);
}

type FaceNeck = {
  /** Titik pangkal leher yang diperkirakan dari wajah. */
  x: number;
  y: number;
  /** Vektor satuan "atas" badan (dari dagu ke dahi). */
  upX: number;
  upY: number;
  /** Perkiraan lebar bahu (tanpa fit). */
  shoulderWidth: number;
  rotation: number;
};

/** Cadangan saat bahu tidak terlihat: perkirakan leher dan lebar bahu dari wajah. */
function estimateNeckFromFace(data: TrackingData, view: View): FaceNeck | null {
  const { face } = data;
  const m = face ? measureFace(face, view) : null;
  const forehead = face?.[FACE.forehead];
  const chinLandmark = face?.[FACE.chin];

  if (!m || !forehead || !chinLandmark) {
    return null;
  }

  const chin = toCanvas(chinLandmark, view);
  const top = toCanvas(forehead, view);
  const faceHeight = dist(top, chin);

  if (faceHeight === 0) {
    return null;
  }

  // Vektor satuan dari dagu ke dahi; leher berada berlawanan arah dari dahi.
  const upX = (top.x - chin.x) / faceHeight;
  const upY = (top.y - chin.y) / faceHeight;

  return {
    x: chin.x - upX * faceHeight * NECK_BELOW_CHIN,
    y: chin.y - upY * faceHeight * NECK_BELOW_CHIN,
    upX,
    upY,
    shoulderWidth: m.frontalFaceWidth * SHOULDER_TO_FACE_WIDTH,
    rotation: m.rotation,
  };
}

/** Kalung dan dasi: dijangkarkan di pangkal leher. Bahu dari Pose Landmarker, cadangan dari wajah. */
function computeNeckPose(data: TrackingData, view: View, fit: OverlayFit): OverlayPose | null {
  const { pose } = data;
  const left = pose?.[POSE.leftShoulder];
  const right = pose?.[POSE.rightShoulder];

  if (pose && left && right && hasVisibleShoulders(pose)) {
    const [a, b] = byScreenX(toCanvas(left, view), toCanvas(right, view));
    const shoulderWidth = dist(a, b);
    const rotation = Math.atan2(b.y - a.y, b.x - a.x);
    const lift = shoulderWidth * NECK_RAISE;

    return {
      // Arah "atas" tegak lurus garis bahu: (sin r, -cos r).
      x: (a.x + b.x) / 2 + Math.sin(rotation) * lift,
      y: (a.y + b.y) / 2 - Math.cos(rotation) * lift,
      width: shoulderWidth * fit.widthScale,
      rotation,
      yawScale: 1,
    };
  }

  const neck = estimateNeckFromFace(data, view);

  if (!neck) {
    return null;
  }

  return {
    x: neck.x,
    y: neck.y,
    width: neck.shoulderWidth * fit.widthScale,
    rotation: neck.rotation,
    yawScale: 1,
  };
}

/**
 * Baju, rompi, blazer: garis bahu pada gambar dipasang tepat di garis bahu pengguna (titik tengah
 * kedua bahu), lebar mengikuti lebar bahu, dan miring mengikuti garis bahu.
 * Jika kedua pinggul terlihat, tinggi baju disesuaikan dengan panjang badan; jika tidak, tinggi
 * mengikuti rasio asli gambar. Cadangan dari wajah bila bahu tidak terlihat.
 */
function computeTorsoPose(data: TrackingData, view: View, fit: OverlayFit): OverlayPose | null {
  const { pose } = data;
  const left = pose?.[POSE.leftShoulder];
  const right = pose?.[POSE.rightShoulder];

  if (pose && left && right && hasVisibleShoulders(pose)) {
    const [a, b] = byScreenX(toCanvas(left, view), toCanvas(right, view));
    const shoulderWidth = dist(a, b);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const result: OverlayPose = {
      x: center.x,
      y: center.y,
      width: shoulderWidth * fit.widthScale,
      rotation: Math.atan2(b.y - a.y, b.x - a.x),
      yawScale: 1,
    };

    const leftHip = pose[POSE.leftHip];
    const rightHip = pose[POSE.rightHip];

    if (fit.hemRatio && isLandmarkVisible(leftHip) && isLandmarkVisible(rightHip)) {
      const hl = toCanvas(leftHip, view);
      const hr = toCanvas(rightHip, view);
      const torsoLength = dist(center, { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2 });

      // Abaikan deteksi pinggul yang tidak masuk akal (terlalu dekat ke bahu).
      if (torsoLength > shoulderWidth * 0.6) {
        // Dari garis bahu (anchorY) sampai ujung bawah gambar = torsoLength × hemRatio.
        result.height = (torsoLength * fit.hemRatio) / Math.max(1 - fit.anchorY, 0.2);
      }
    }

    return result;
  }

  const neck = estimateNeckFromFace(data, view);

  if (!neck) {
    return null;
  }

  // Garis bahu sedikit di bawah titik leher (kebalikan dari NECK_RAISE).
  const drop = neck.shoulderWidth * NECK_RAISE;

  return {
    x: neck.x - neck.upX * drop,
    y: neck.y - neck.upY * drop,
    width: neck.shoulderWidth * fit.widthScale,
    rotation: neck.rotation,
    yawScale: 1,
  };
}

export function computeOverlayPose(
  anchor: OverlayAnchor,
  data: TrackingData,
  view: View,
  fit: OverlayFit = defaultOverlayFit,
): OverlayPose | null {
  switch (anchor) {
    case "eyes":
      return data.face ? computeEyesPose(data.face, view, fit) : null;
    case "head":
      return data.face ? computeHeadPose(data.face, view, fit) : null;
    case "neck":
      return computeNeckPose(data, view, fit);
    case "torso":
      return computeTorsoPose(data, view, fit);
    // Aksesoris tangan bisa dipasang di dua tangan sekaligus, jadi dihitung di hand-fit.ts.
    case "wrist":
    case "nails":
      return null;
  }
}

/** Tingkat penghalusan per jenis: bahu lebih berisik daripada wajah, jadi dihaluskan lebih kuat. */
export const SMOOTHING: Record<OverlayAnchor, number> = {
  eyes: 0.45,
  head: 0.4,
  neck: 0.3,
  torso: 0.3,
  wrist: 0.4,
  nails: 0.5,
};

/** Exponential smoothing agar overlay tidak bergetar. */
export function smoothPose(
  previous: OverlayPose | null,
  next: OverlayPose,
  alpha = 0.45,
): OverlayPose {
  if (!previous) {
    return next;
  }

  const mix = (from: number, to: number) => from + (to - from) * alpha;

  const smoothed: OverlayPose = {
    x: mix(previous.x, next.x),
    y: mix(previous.y, next.y),
    width: mix(previous.width, next.width),
    rotation: mix(previous.rotation, next.rotation),
    yawScale: mix(previous.yawScale, next.yawScale),
  };

  // Tinggi hanya ada saat pinggul terlihat; saat baru muncul/hilang, langsung ikuti nilai baru.
  if (next.height !== undefined) {
    smoothed.height =
      previous.height !== undefined ? mix(previous.height, next.height) : next.height;
  }

  return smoothed;
}

type Bounds = { x: number; y: number; width: number; height: number };

const boundsCache = new WeakMap<HTMLImageElement, Bounds>();

/**
 * Kotak area yang benar-benar terisi (alpha > 0) pada gambar aksesoris.
 * Dengan ini padding transparan pada aset tidak memengaruhi ukuran/posisi.
 */
export function getOpaqueBounds(image: HTMLImageElement): Bounds {
  const cached = boundsCache.get(image);
  if (cached) {
    return cached;
  }

  let result: Bounds = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };

  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (context) {
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if ((data[(y * width + x) * 4 + 3] ?? 0) > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX >= minX && maxY >= minY) {
        result = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      }
    }
  } catch {
    // Canvas tidak bisa dibaca → pakai seluruh gambar.
  }

  boundsCache.set(image, result);
  return result;
}

/**
 * Menggambar aksesoris sehingga titik (anchorX, anchorY) pada gambar jatuh tepat di titik jangkar.
 * offsetY menggeser sepanjang sumbu vertikal aksesoris, dalam satuan lebar aksesoris.
 */
export function drawOverlay(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  pose: OverlayPose,
  fit: OverlayFit = defaultOverlayFit,
) {
  if (!image.complete || image.naturalWidth === 0) {
    return;
  }

  const bounds = getOpaqueBounds(image);
  const width = pose.width;
  const naturalHeight = width * (bounds.height / bounds.width);
  const height =
    pose.height === undefined
      ? naturalHeight
      : clamp(pose.height, naturalHeight * MIN_HEIGHT_STRETCH, naturalHeight * MAX_HEIGHT_STRETCH);

  context.save();
  context.translate(pose.x, pose.y);
  context.rotate(pose.rotation);
  context.scale(pose.yawScale, 1);
  context.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    -width * fit.anchorX,
    -height * fit.anchorY + width * fit.offsetY,
    width,
    height,
  );
  context.restore();
}
