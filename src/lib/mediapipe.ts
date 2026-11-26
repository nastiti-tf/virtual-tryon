import type {
  FaceLandmarker,
  HandLandmarker,
  ImageSegmenter,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

// Versi WASM harus sama dengan versi @mediapipe/tasks-vision di package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";
const FACE_MODEL = `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;
const POSE_MODEL = `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;

const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;

const SEGMENTER_MODEL = `${MODEL_BASE}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`;

type Vision = typeof import("@mediapipe/tasks-vision");
type Fileset = Awaited<ReturnType<Vision["FilesetResolver"]["forVisionTasks"]>>;

let visionPromise: Promise<{ module: Vision; fileset: Fileset }> | null = null;

// Import dinamis menghindari error saat SSR; fileset WASM dipakai bersama oleh semua model.
function loadVision() {
  visionPromise ??= (async () => {
    const module = await import("@mediapipe/tasks-vision");
    const fileset = await module.FilesetResolver.forVisionTasks(WASM_URL);
    return { module, fileset };
  })().catch((error: unknown) => {
    visionPromise = null; // izinkan coba lagi
    throw error;
  });

  return visionPromise;
}

// Coba GPU dulu; jika tidak didukung, pakai CPU.
async function withDelegateFallback<T>(create: (delegate: "GPU" | "CPU") => Promise<T>) {
  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

let lastTimestamp = 0;

/**
 * Timestamp video untuk MediaPipe. Wajib naik terus pada tiap model, dan beberapa loop (aksesoris,
 * hijab) memakai model yang sama, jadi semuanya mengambil dari satu penghitung ini.
 */
export function nextTimestamp(): number {
  lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);
  return lastTimestamp;
}

let facePromise: Promise<FaceLandmarker> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;
let handPromise: Promise<HandLandmarker> | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Landmark wajah (478 titik): dipakai untuk kacamata, topi, rambut, dan cadangan posisi leher. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  facePromise ??= (async () => {
    const { module, fileset } = await loadVision();
    return withDelegateFallback((delegate) =>
      module.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      }),
    );
  })().catch((error: unknown) => {
    facePromise = null;
    throw error;
  });

  return facePromise;
}

/** Landmark tubuh (33 titik): bahu dipakai untuk kalung dan dasi. Hanya dimuat jika dibutuhkan. */
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  posePromise ??= (async () => {
    const { module, fileset } = await loadVision();
    return withDelegateFallback((delegate) =>
      module.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    );
  })().catch((error: unknown) => {
    posePromise = null;
    throw error;
  });

  return posePromise;
}

/** Landmark tangan (21 titik per tangan, maksimal 2 tangan): dipakai untuk jam tangan, gelang, dan kuku. */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  handPromise ??= (async () => {
    const { module, fileset } = await loadVision();
    return withDelegateFallback((delegate) =>
      module.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      }),
    );
  })().catch((error: unknown) => {
    handPromise = null;
    throw error;
  });

  return handPromise;
}

/** Segmentasi per piksel (rambut, baju, kulit, dst.): dipakai untuk mengubah warna hijab. */
export function loadImageSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { module, fileset } = await loadVision();
    return withDelegateFallback((delegate) =>
      module.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    );
  })().catch((error: unknown) => {
    segmenterPromise = null;
    throw error;
  });

  return segmenterPromise;
}
