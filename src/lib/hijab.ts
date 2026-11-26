import type { ImageSegmenter } from "@mediapipe/tasks-vision";

import type { Landmark, View } from "@/lib/overlay-fit";

/**
 * Mengubah warna hijab pengguna di kamera langsung.
 *
 * Cara kerja:
 * 1. Image Segmenter (selfie multiclass) memberi label tiap piksel: rambut, baju, aksesori, dll.
 *    Hijab biasanya terbaca sebagai rambut / baju / lainnya.
 * 2. Landmark wajah membatasi wilayah: hanya piksel di sekitar kepala sampai dada atas yang boleh
 *    diubah, wilayahnya ikut miring dan membesar mengikuti wajah, dan oval wajah dikecualikan.
 * 3. Piksel yang lolos diberi warna baru dengan tetap mempertahankan terang-gelapnya
 *    (lipatan dan bayangan kain tidak hilang).
 */

export type HijabColor = { name: string; hex: string };

export const hijabColors: readonly HijabColor[] = [
  { name: "Hitam", hex: "#1f1b24" },
  { name: "Putih", hex: "#f4f1ec" },
  { name: "Krem", hex: "#d9c3a5" },
  { name: "Dusty pink", hex: "#d49a9f" },
  { name: "Lilac", hex: "#a98bd6" },
  { name: "Sage", hex: "#8fae95" },
  { name: "Navy", hex: "#27385e" },
  { name: "Marun", hex: "#7a1f2b" },
  { name: "Mocha", hex: "#7b5a45" },
];

export const defaultHijabColor = hijabColors[3]!;

/** Seberapa jauh area hijab dihitung ke bawah dagu (satuan: tinggi wajah). */
export const DEFAULT_HIJAB_REACH = 1.2;

/** Label kelas selfie_multiclass_256x256: 0 latar, 1 rambut, 2 kulit tubuh, 3 kulit wajah, 4 baju, 5 lainnya. */
const HIJAB_CLASSES = new Set([1, 4, 5]);

/** Indeks landmark kontur wajah (Face Mesh) dan titik acuan. */
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;
const LM = { top: 10, chin: 152, sideA: 234, sideB: 454 } as const;

/** Sisi terpanjang area kerja (piksel); lebih kecil = lebih ringan. */
const MAX_WORK = 420;
const SEGMENT_SMOOTHING = 0.5;
const LUMA_SMOOTHING = 0.85;

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Rgb = readonly [number, number, number];

export type HijabRegion = {
  /** Bentuk longgar area hijab di sekitar kepala (piksel sumber). */
  polygon: Point[];
  /** Kontur wajah yang tidak boleh diwarnai ulang (piksel sumber). */
  oval: Point[];
  bbox: Box;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full.padEnd(6, "0").slice(0, 6), 16);

  if (Number.isNaN(value)) {
    return [128, 128, 128];
  }

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Bentuk area hijab dari landmark wajah. Dibuat dalam koordinat lokal kepala (u: kiri-kanan dalam
 * lebar wajah, v: atas-bawah dalam tinggi wajah dari puncak dahi) lalu diputar mengikuti kepala.
 */
export function hijabRegion(
  face: readonly Landmark[],
  sourceWidth: number,
  sourceHeight: number,
  reach: number = DEFAULT_HIJAB_REACH,
): HijabRegion | null {
  const px = (index: number): Point | null => {
    const l = face[index];
    return l ? { x: l.x * sourceWidth, y: l.y * sourceHeight } : null;
  };

  const top = px(LM.top);
  const chin = px(LM.chin);
  const a = px(LM.sideA);
  const b = px(LM.sideB);

  if (!top || !chin || !a || !b) {
    return null;
  }

  const faceHeight = Math.hypot(chin.x - top.x, chin.y - top.y);
  const faceWidth = Math.hypot(b.x - a.x, b.y - a.y);

  if (faceHeight < 8 || faceWidth < 8) {
    return null;
  }

  // Sumbu "bawah" kepala (dahi → dagu) dan sumbu "kanan" tegak lurusnya.
  const down = { x: (chin.x - top.x) / faceHeight, y: (chin.y - top.y) / faceHeight };
  const right = { x: -down.y, y: down.x };

  const toSource = (u: number, v: number): Point => ({
    x: top.x + right.x * u * faceWidth + down.x * v * faceHeight,
    y: top.y + right.y * u * faceWidth + down.y * v * faceHeight,
  });

  const bottom = 1 + clamp(reach, 0.3, 2.5);

  // Separuh kanan (u > 0), lalu dicerminkan untuk separuh kiri.
  const half: [number, number][] = [
    [0.9, -0.65],
    [1.3, 0],
    [1.4, 0.6],
    [1.5, 1],
    [1.9, bottom],
  ];
  const polygon = [
    ...half.map(([u, v]) => toSource(u, v)),
    ...[...half].reverse().map(([u, v]) => toSource(-u, v)),
  ];

  const oval = FACE_OVAL.map(px).filter((p): p is Point => p !== null);

  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const x0 = clamp(Math.floor(Math.min(...xs)) - 4, 0, sourceWidth);
  const y0 = clamp(Math.floor(Math.min(...ys)) - 4, 0, sourceHeight);
  const x1 = clamp(Math.ceil(Math.max(...xs)) + 4, 0, sourceWidth);
  const y1 = clamp(Math.ceil(Math.max(...ys)) + 4, 0, sourceHeight);

  if (x1 - x0 < 4 || y1 - y0 < 4) {
    return null;
  }

  return { polygon, oval, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/**
 * Warna baru satu piksel: warna target dikali terang-gelap relatif piksel itu terhadap rata-rata
 * kain, sehingga lipatan dan bayangan tetap terlihat, termasuk saat hijab asli gelap/terang.
 */
export function recolorRgb(luma: number, lumaMean: number, target: Rgb): [number, number, number] {
  const ratio = clamp((luma + 10) / (lumaMean + 10), 0.25, 2);

  return [
    Math.min(255, target[0] * ratio),
    Math.min(255, target[1] * ratio),
    Math.min(255, target[2] * ratio),
  ];
}

/** Mempertegas tepi mask yang diperbesar (bilinear) agar tidak ada halo. */
export function sharpenAlpha(alpha: number): number {
  return clamp((alpha / 255 - 0.25) * 1.6, 0, 1);
}

export type HijabDrawOptions = {
  color: string;
  /** Tampilkan area terdeteksi sebagai warna magenta (untuk menyetel). */
  debug?: boolean;
};

function makeCanvas() {
  return document.createElement("canvas");
}

export class HijabRecolorer {
  private maskWidth = 0;
  private maskHeight = 0;
  private smoothed: Float32Array | null = null;
  private bbox: Box | null = null;
  private lumaMean: number | null = null;
  private sourceSize = { width: 0, height: 0 };

  private readonly regionCanvas = makeCanvas();
  private readonly alphaCanvas = makeCanvas();
  private readonly workCanvas = makeCanvas();

  private readonly segmenter: ImageSegmenter;

  constructor(segmenter: ImageSegmenter) {
    this.segmenter = segmenter;
  }

  get ready() {
    return this.smoothed !== null && this.bbox !== null;
  }

  clear() {
    this.smoothed = null;
    this.bbox = null;
    this.lumaMean = null;
  }

  /** Segmentasi satu frame, lalu gabungkan dengan wilayah dari landmark wajah. */
  update(
    video: HTMLVideoElement,
    face: readonly Landmark[],
    timestamp: number,
    reach: number = DEFAULT_HIJAB_REACH,
  ): boolean {
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    const region = hijabRegion(face, sw, sh, reach);

    if (!region || !sw || !sh) {
      return false;
    }

    const out: { classes: Uint8Array | null; width: number; height: number } = {
      classes: null,
      width: 0,
      height: 0,
    };

    this.segmenter.segmentForVideo(video, timestamp, (result) => {
      const mask = result.categoryMask;

      if (mask) {
        out.width = mask.width;
        out.height = mask.height;
        out.classes = mask.getAsUint8Array().slice();
      }
    });

    const { classes, width: w, height: h } = out;

    if (!classes || !w || !h) {
      return false;
    }

    // Wilayah dari landmark (poligon longgar dikurangi oval wajah) pada resolusi mask.
    this.regionCanvas.width = w;
    this.regionCanvas.height = h;
    const rc = this.regionCanvas.getContext("2d", { willReadFrequently: true });
    const ac = this.alphaCanvas.getContext("2d");

    if (!rc || !ac) {
      return false;
    }

    const toMask = (p: Point): Point => ({ x: (p.x / sw) * w, y: (p.y / sh) * h });
    const trace = (points: Point[]) => {
      rc.beginPath();
      points.map(toMask).forEach((p, i) => (i === 0 ? rc.moveTo(p.x, p.y) : rc.lineTo(p.x, p.y)));
      rc.closePath();
      rc.fill();
    };

    rc.clearRect(0, 0, w, h);
    rc.globalCompositeOperation = "source-over";
    rc.fillStyle = "#fff";
    trace(region.polygon);
    rc.globalCompositeOperation = "destination-out";
    trace(region.oval);
    rc.globalCompositeOperation = "source-over";

    const regionData = rc.getImageData(0, 0, w, h).data;

    if (!this.smoothed || this.maskWidth !== w || this.maskHeight !== h) {
      this.smoothed = null;
      this.maskWidth = w;
      this.maskHeight = h;
      this.alphaCanvas.width = w;
      this.alphaCanvas.height = h;
    }

    const previous = this.smoothed;
    const next = new Float32Array(w * h);
    const image = ac.createImageData(w, h);

    for (let i = 0; i < next.length; i++) {
      const wanted = HIJAB_CLASSES.has(classes[i] ?? 0) ? (regionData[i * 4 + 3] ?? 0) / 255 : 0;
      const value = previous
        ? (previous[i] ?? 0) * SEGMENT_SMOOTHING + wanted * (1 - SEGMENT_SMOOTHING)
        : wanted;

      next[i] = value;
      image.data[i * 4] = 255;
      image.data[i * 4 + 1] = 255;
      image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = Math.round(value * 255);
    }

    ac.putImageData(image, 0, 0);
    this.smoothed = next;
    this.bbox = region.bbox;
    this.sourceSize = { width: sw, height: sh };

    return true;
  }

  /** Menggambar hijab berwarna baru di atas video, dengan pemetaan layar yang sama seperti aksesoris. */
  draw(
    context: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    view: View,
    options: HijabDrawOptions,
  ) {
    const bbox = this.bbox;
    const { width: sw, height: sh } = this.sourceSize;

    if (!this.smoothed || !bbox || !sw || !sh || !video.videoWidth) {
      return;
    }

    const scaleDown = Math.min(1, MAX_WORK / Math.max(bbox.w, bbox.h));
    const cw = Math.max(1, Math.round(bbox.w * scaleDown));
    const ch = Math.max(1, Math.round(bbox.h * scaleDown));

    if (this.workCanvas.width !== cw || this.workCanvas.height !== ch) {
      this.workCanvas.width = cw;
      this.workCanvas.height = ch;
    }

    const wc = this.workCanvas.getContext("2d", { willReadFrequently: true });

    if (!wc) {
      return;
    }

    // Potongan video, lalu dipotong lagi sesuai mask (alpha = seberapa yakin itu hijab).
    wc.globalCompositeOperation = "source-over";
    wc.clearRect(0, 0, cw, ch);
    wc.drawImage(video, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, cw, ch);
    wc.globalCompositeOperation = "destination-in";
    wc.drawImage(
      this.alphaCanvas,
      (bbox.x / sw) * this.maskWidth,
      (bbox.y / sh) * this.maskHeight,
      (bbox.w / sw) * this.maskWidth,
      (bbox.h / sh) * this.maskHeight,
      0,
      0,
      cw,
      ch,
    );
    wc.globalCompositeOperation = "source-over";

    let image: ImageData;

    try {
      image = wc.getImageData(0, 0, cw, ch);
    } catch {
      return;
    }

    const data = image.data;

    // Rata-rata terang kain (dihaluskan antar-frame agar tidak berkedip).
    let sum = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) > 128) {
        sum += 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
        count++;
      }
    }

    if (count > 40) {
      const mean = sum / count;
      this.lumaMean =
        this.lumaMean === null ? mean : this.lumaMean * LUMA_SMOOTHING + mean * (1 - LUMA_SMOOTHING);
    }

    const lumaMean = this.lumaMean ?? 128;
    const target = parseHex(options.color);

    for (let i = 0; i < data.length; i += 4) {
      const raw = data[i + 3] ?? 0;

      if (raw === 0) {
        continue;
      }

      const alpha = sharpenAlpha(raw);

      if (options.debug) {
        data[i] = 255;
        data[i + 1] = 0;
        data[i + 2] = 200;
        data[i + 3] = Math.round(alpha * 140);
        continue;
      }

      const luma = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
      const [r, g, b] = recolorRgb(luma, lumaMean, target);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(alpha * 255);
    }

    wc.putImageData(image, 0, 0);

    // Peta sumber → layar (meniru object-cover + mirror, sama seperti toCanvas di overlay-fit).
    const scale = Math.max(view.width / view.sourceWidth, view.height / view.sourceHeight);
    const offsetX = (view.width - view.sourceWidth * scale) * (view.positionX ?? 0.5);
    const offsetY = (view.height - view.sourceHeight * scale) * (view.positionY ?? 0.5);

    context.save();

    if (view.mirror) {
      context.translate(view.width, 0);
      context.scale(-1, 1);
    }

    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    context.imageSmoothingEnabled = true;
    context.drawImage(this.workCanvas, 0, 0, cw, ch, bbox.x, bbox.y, bbox.w, bbox.h);
    context.restore();
  }
}
