import {
  defaultAccessories,
  drawAccessory,
  mix,
  randomAccessories,
  type AccessoryGeometry,
  type AccessoryState,
} from "@/lib/accessories";
import { drawOverlay, type OverlayPose } from "@/lib/overlay-fit";
import {
  resolveOverlayFit,
  tryOnCategories,
  type OverlayFit,
  type TryOnCategory,
  type TryOnSample,
} from "@/lib/try-on-data";

/**
 * Karakter 2D yang bisa didandani. Aksesorisnya memakai katalog dan angka `fit` yang sama dengan
 * studio kamera (try-on-data.ts), jadi semua baju, rambut, topi, kacamata, kalung, dan dasi yang ada
 * di try-on otomatis bisa dipasang di karakter ini tanpa aset tambahan.
 */

/** Lapisan yang bisa dipasang, sesuai `id` kategori di try-on-data. */
export type CharacterLayer = "clothes" | "hair" | "hats" | "glasses" | "necklaces" | "ties";

/** Urutan tampil di panel. */
export const characterLayers: readonly CharacterLayer[] = [
  "clothes",
  "hair",
  "hats",
  "glasses",
  "necklaces",
  "ties",
];

export type SkinTone = { name: string; base: string; shade: string };
export type HairTone = { name: string; color: string };
export type PantsTone = { name: string; color: string };
export type PantsStyle = "long" | "skirt";

export const skinTones: readonly SkinTone[] = [
  { name: "Porselen", base: "#f6d8c4", shade: "#e9b9a0" },
  { name: "Sawo muda", base: "#e8b996", shade: "#d49b77" },
  { name: "Sawo matang", base: "#c98f66", shade: "#b0734c" },
  { name: "Cokelat", base: "#a56a45", shade: "#8a5232" },
  { name: "Gelap", base: "#7a4a30", shade: "#613821" },
];

export const hairTones: readonly HairTone[] = [
  { name: "Hitam", color: "#2a2230" },
  { name: "Cokelat", color: "#6b4429" },
  { name: "Pirang", color: "#d9a95b" },
  { name: "Merah tua", color: "#8a2f2f" },
  { name: "Abu", color: "#8c8c99" },
];

export const pantsTones: readonly PantsTone[] = [
  { name: "Hitam", color: "#2b2830" },
  { name: "Navy", color: "#27385e" },
  { name: "Abu", color: "#7b7f8c" },
  { name: "Cokelat", color: "#6f4d34" },
  { name: "Marun", color: "#6b1f27" },
];

export type CharacterState = {
  skin: number;
  hairTone: number;
  pantsStyle: PantsStyle;
  pantsTone: number;
  /** id sampel per lapisan; null = tidak dipakai. */
  items: Record<CharacterLayer, string | null>;
  /** Aksesoris bawaan (digambar lewat kode) beserta warna pilihannya. */
  accessories: AccessoryState;
};

export const defaultCharacter: CharacterState = {
  skin: 1,
  hairTone: 0,
  pantsStyle: "long",
  pantsTone: 0,
  items: {
    clothes: "senin_blazer",
    hair: null,
    hats: null,
    glasses: null,
    necklaces: null,
    ties: null,
  },
  accessories: defaultAccessories,
};

export function getLayerCategory(layer: CharacterLayer): TryOnCategory {
  const found = (tryOnCategories as readonly TryOnCategory[]).find((c) => c.id === layer);

  if (!found) {
    throw new Error(`Kategori "${layer}" tidak ada di try-on-data.`);
  }

  return found;
}

export function getLayerSample(layer: CharacterLayer, id: string | null): TryOnSample | null {
  if (!id) {
    return null;
  }

  return getLayerCategory(layer).samples.find((sample) => sample.id === id) ?? null;
}

/** Pilihan acak untuk tombol "Acak gaya". `chanceNone` = peluang lapisan dibiarkan kosong. */
export function randomCharacter(previous: CharacterState, random: () => number = Math.random) {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)] as T;
  const chanceNone: Record<CharacterLayer, number> = {
    clothes: 0,
    hair: 0.35,
    hats: 0.55,
    glasses: 0.45,
    necklaces: 0.6,
    ties: 0.7,
  };

  const items = { ...previous.items };

  for (const layer of characterLayers) {
    items[layer] =
      random() < chanceNone[layer] ? null : pick(getLayerCategory(layer).samples).id;
  }

  return {
    ...previous,
    items,
    pantsStyle: random() < 0.25 ? "skirt" : "long",
    pantsTone: Math.floor(random() * pantsTones.length),
    accessories: randomAccessories(random),
  } satisfies CharacterState;
}

/* ------------------------------------------------------------------------------------------ */
/* Geometri (proporsi chibi)                                                                   */
/* ------------------------------------------------------------------------------------------ */

/**
 * Proporsi mengikuti panduan chibi: tinggi kepala (puncak–dagu) = 1, tinggi badan (bahu–telapak
 * kaki) = 0,8. Badan dibagi dua sama panjang: batang tubuh 0,4 dan kaki 0,4.
 */
export const STAGE = { width: 400, height: 640 } as const;

const CX = STAGE.width / 2;
/** Tinggi kepala dalam piksel: satuan dasar semua ukuran lain. */
const HEAD_H = 250;
/** Wajah chibi lebar: hampir sama dengan tingginya. */
const FACE = { width: 244, top: 128, height: HEAD_H } as const;
const CHIN_Y = FACE.top + FACE.height;
/** Badan 0,8 tinggi kepala di bawah dagu. */
const BODY_H = HEAD_H * 0.8;
const FEET_Y = CHIN_Y + BODY_H;
const CROTCH_Y = CHIN_Y + BODY_H / 2;
/** Bahu sempit dan tepat di bawah dagu (leher nyaris tak terlihat). */
const SHOULDER = { y: CHIN_Y + HEAD_H * 0.07, width: 74 } as const;
/** Mata besar dan rendah: sekitar 70% dari puncak kepala. */
const EYES = {
  /** Jarak antar pusat mata: dibuat dekat seperti referensi chibi. */
  distance: 100,
  /** Acuan lebar kacamata foto (tidak ikut mengecil saat mata didekatkan). */
  glassesBase: 125,
  y: FACE.top + FACE.height * 0.7,
} as const;
/** Lebar wajah "setara foto" untuk topi/rambut: aset aslinya dibuat untuk wajah manusia yang sempit. */
const HEADWEAR_WIDTH = FACE.width * 0.62;
/** Sama dengan NECK_RAISE di overlay-fit: titik leher sedikit di atas garis bahu. */
const NECK_RAISE = 0.1;

const still = { rotation: 0, yawScale: 1 } as const;

/** Titik acuan untuk aksesoris bawaan (lihat accessories.ts). */
const ACCESSORY_GEOMETRY: AccessoryGeometry = {
  cx: CX,
  faceTop: FACE.top,
  faceWidth: FACE.width,
  headHeight: HEAD_H,
  chinY: CHIN_Y,
  eyeY: EYES.y,
  eyeHalfGap: EYES.distance / 2,
  shoulderY: SHOULDER.y,
  shoulderWidth: SHOULDER.width,
  handX: SHOULDER.width / 2 + 12,
  handY: CROTCH_Y + 4,
};

/** Pose (posisi + lebar) tiap jenis aksesoris, dengan rumus yang sama seperti overlay-fit. */
export function getLayerPose(layer: CharacterLayer, fit: OverlayFit): OverlayPose {
  switch (layer) {
    case "glasses":
      return { x: CX, y: EYES.y, width: EYES.glassesBase * fit.widthScale, ...still };
    case "hair":
      // Titik tengah wig (garis rambut) diturunkan ke sekitar dahi–mata karena kepala chibi tinggi.
      return { x: CX, y: FACE.top + HEAD_H * 0.34, width: HEADWEAR_WIDTH * 1.08 * fit.widthScale, ...still };
    case "hats":
      // Topi sedikit turun ke kubah kepala supaya terlihat "dipakai", bukan melayang.
      return {
        x: CX,
        y: FACE.top + HEAD_H * 0.17,
        width: HEADWEAR_WIDTH * 0.85 * fit.widthScale,
        ...still,
      };
    case "necklaces":
    case "ties":
      return {
        x: CX,
        y: SHOULDER.y - SHOULDER.width * NECK_RAISE,
        width: SHOULDER.width * fit.widthScale,
        ...still,
      };
    case "clothes":
      // height kecil = dipaksa ke batas terpendek yang diizinkan drawOverlay (0,85×) agar baju
      // tidak menutupi kaki pendek karakter chibi.
      return { x: CX, y: SHOULDER.y, width: SHOULDER.width * fit.widthScale, height: 1, ...still };
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Penggambaran                                                                               */
/* ------------------------------------------------------------------------------------------ */

export type ImageLookup = (src: string) => HTMLImageElement | undefined;

const INK = "#2f2433";

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  stroke?: { color: string; width: number },
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
  fill: string | CanvasGradient,
  stroke?: { color: string; width: number },
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
  }
}

/** Gradasi horizontal: sisi kiri-kanan sedikit gelap, tengah terang (kesan bulat). */
function roundShade(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  base: string,
  edge: string,
): CanvasGradient {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, edge);
  g.addColorStop(0.35, base);
  g.addColorStop(0.65, base);
  g.addColorStop(1, edge);
  return g;
}

/** Garis kontur kepala chibi: kubah lebar, pipi penuh, dagu kecil membulat. */
function headPath(ctx: CanvasRenderingContext2D, grow = 0) {
  const rx = FACE.width / 2 + grow;
  const top = FACE.top - grow;
  const chin = CHIN_Y + grow;
  const h = chin - top;

  // Bentuk hampir bundar seperti referensi: terlebar di sekitar mata, dagu lebar dan membulat.
  const k = 0.5523; // konstanta lingkaran bézier
  const midY = top + h * 0.52;
  const ryTop = midY - top;
  const ryBot = chin - midY;

  ctx.beginPath();
  ctx.moveTo(CX, top);
  ctx.bezierCurveTo(CX + rx * k, top, CX + rx, midY - ryTop * k, CX + rx, midY);
  ctx.bezierCurveTo(CX + rx, midY + ryBot * 0.72, CX + rx * 0.62, chin, CX, chin);
  ctx.bezierCurveTo(CX - rx * 0.62, chin, CX - rx, midY + ryBot * 0.72, CX - rx, midY);
  ctx.bezierCurveTo(CX - rx, midY - ryTop * k, CX - rx * k, top, CX, top);
  ctx.closePath();
}

function drawLowerBody(ctx: CanvasRenderingContext2D, state: CharacterState, skin: SkinTone) {
  const pants = pantsTones[state.pantsTone]?.color ?? pantsTones[0]!.color;
  const pantsDark = mix(pants, "#000000", 0.25);
  const line = { color: "rgba(47, 36, 51, 0.55)", width: 1.6 };
  const shoe = "#2a2430";
  const legW = 27;
  const gap = 5;
  const legTop = CROTCH_Y - 14;
  const legBottom = FEET_Y - 10;
  const lx = CX - gap / 2 - legW;
  const rx = CX + gap / 2;

  // Bayangan di lantai.
  ellipse(ctx, CX, FEET_Y + 2, 66, 8, "rgba(43, 34, 51, 0.16)");

  if (state.pantsStyle === "skirt") {
    // Kaki kulit + kaus kaki putih, rok di atasnya.
    for (const x of [lx + 1, rx - 1]) {
      roundedRect(ctx, x, legTop, legW - 2, legBottom - legTop, 9, roundShade(ctx, x, legW - 2, skin.base, skin.shade), line);
      roundedRect(ctx, x, legBottom - 34, legW - 2, 34, [4, 4, 9, 9], "#f6f4fa", line);
    }

    ctx.beginPath();
    ctx.moveTo(CX - 36, CROTCH_Y - 40);
    ctx.lineTo(CX + 36, CROTCH_Y - 40);
    ctx.lineTo(CX + 56, CROTCH_Y + 38);
    ctx.quadraticCurveTo(CX, CROTCH_Y + 46, CX - 56, CROTCH_Y + 38);
    ctx.closePath();
    ctx.fillStyle = pants;
    ctx.fill();
    ctx.lineWidth = line.width;
    ctx.lineJoin = "round";
    ctx.strokeStyle = line.color;
    ctx.stroke();

    // Lipatan rok.
    ctx.strokeStyle = pantsDark;
    ctx.lineWidth = 1.5;
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(CX + k * 40, CROTCH_Y - 34);
      ctx.lineTo(CX + k * 100, CROTCH_Y + 40);
      ctx.stroke();
    }
  } else {
    // Pinggang + dua kaki pendek yang tegas terpisah.
    roundedRect(ctx, CX - 36, CROTCH_Y - 40, 72, 50, 12, pants, line);
    for (const x of [lx, rx]) {
      roundedRect(ctx, x, legTop + 10, legW, legBottom - legTop - 10, [6, 6, 10, 10], roundShade(ctx, x, legW, pants, pantsDark), line);
    }
    // Garis tengah selangkangan.
    ctx.beginPath();
    ctx.moveTo(CX, CROTCH_Y + 4);
    ctx.lineTo(CX, CROTCH_Y + 18);
    ctx.strokeStyle = pantsDark;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Sepatu bulat kecil.
  for (const x of [lx + legW / 2, rx + legW / 2]) {
    ellipse(ctx, x + (x < CX ? -2 : 2), FEET_Y - 6, 19, 11, shoe, { color: INK, width: 1.6 });
    ellipse(ctx, x + (x < CX ? -6 : -2), FEET_Y - 10, 7, 3.2, "rgba(255,255,255,0.22)");
  }
}

function drawUpperBody(ctx: CanvasRenderingContext2D, skin: SkinTone) {
  const line = { color: "rgba(47, 36, 51, 0.55)", width: 1.6 };
  const armTop = SHOULDER.y + 8;
  const handY = CROTCH_Y + 4;

  // Lengan pendek-gemuk + tangan bulat (di belakang baju).
  for (const side of [-1, 1] as const) {
    const sx = CX + side * (SHOULDER.width / 2 - 2);
    const hx = CX + side * (SHOULDER.width / 2 + 12);

    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 22;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(sx, armTop);
    ctx.lineTo(hx, handY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = skin.base;
    ctx.lineWidth = 19;
    ctx.beginPath();
    ctx.moveTo(sx, armTop);
    ctx.lineTo(hx, handY);
    ctx.stroke();

    ellipse(ctx, hx + side * 1, handY + 9, 12, 12.5, skin.base, { color: "rgba(47, 36, 51, 0.6)", width: 1.6 });
  }

  // Leher pendek, hampir tertutup dagu.
  roundedRect(ctx, CX - 12, CHIN_Y - 14, 24, SHOULDER.y - CHIN_Y + 22, 8, skin.base, line);

  // Baju dasar (kaos tanpa lengan) supaya karakter tidak telanjang saat belum memakai baju.
  const top = SHOULDER.y - 6;
  const half = SHOULDER.width / 2;
  const tee = ctx.createLinearGradient(0, top, 0, CROTCH_Y);
  tee.addColorStop(0, "#efe9fa");
  tee.addColorStop(1, "#d9cfee");

  ctx.beginPath();
  ctx.moveTo(CX - half, top + 8);
  ctx.quadraticCurveTo(CX - half + 4, top, CX - 14, top);
  ctx.quadraticCurveTo(CX, top + 12, CX + 14, top);
  ctx.quadraticCurveTo(CX + half - 4, top, CX + half, top + 8);
  ctx.lineTo(CX + half - 4, CROTCH_Y - 8);
  ctx.quadraticCurveTo(CX, CROTCH_Y + 2, CX - half + 4, CROTCH_Y - 8);
  ctx.closePath();
  ctx.fillStyle = tee;
  ctx.fill();
  ctx.lineWidth = line.width;
  ctx.lineJoin = "round";
  ctx.strokeStyle = line.color;
  ctx.stroke();
}

/** Rambut belakang: massa rambut di balik kepala dan menutup leher. */
function drawBaseHairBack(ctx: CanvasRenderingContext2D, color: string) {
  const dark = mix(color, "#000000", 0.28);
  const g = ctx.createLinearGradient(0, FACE.top, 0, CHIN_Y);
  g.addColorStop(0, mix(color, "#ffffff", 0.08));
  g.addColorStop(1, dark);

  // Hanya sampai setinggi telinga; di bawahnya wajah dan dagu bersih dari rambut.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, STAGE.width, FACE.top + HEAD_H * 0.78);
  ctx.clip();
  headPath(ctx, 8);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** Poni dan rambut samping, digambar di atas wajah. */
function drawBaseHairFront(ctx: CanvasRenderingContext2D, color: string) {
  const light = mix(color, "#ffffff", 0.22);
  const dark = mix(color, "#000000", 0.25);
  const rx = FACE.width / 2;
  const top = FACE.top;
  const bangY = top + HEAD_H * 0.27;
  const sideY = top + HEAD_H * 0.62;

  const g = ctx.createLinearGradient(0, top, 0, bangY + 20);
  g.addColorStop(0, light);
  g.addColorStop(0.45, color);
  g.addColorStop(1, dark);

  ctx.beginPath();
  // Tepi kiri luar mengikuti kepala, turun sampai sisi pipi.
  ctx.moveTo(CX - rx - 4, sideY);
  ctx.bezierCurveTo(CX - rx - 8, top + HEAD_H * 0.2, CX - rx * 0.6, top - 6, CX, top - 6);
  ctx.bezierCurveTo(CX + rx * 0.6, top - 6, CX + rx + 8, top + HEAD_H * 0.2, CX + rx + 4, sideY);
  // Rambut samping kanan menyelip di depan telinga, lalu poni bergerigi.
  ctx.bezierCurveTo(CX + rx - 2, sideY - 14, CX + rx - 10, bangY + 30, CX + rx - 24, bangY + 18);
  ctx.bezierCurveTo(CX + rx - 40, bangY + 26, CX + 70, bangY + 34, CX + 56, bangY + 16);
  ctx.bezierCurveTo(CX + 44, bangY + 34, CX + 22, bangY + 36, CX + 10, bangY + 12);
  ctx.bezierCurveTo(CX + 2, bangY + 34, CX - 22, bangY + 38, CX - 36, bangY + 14);
  ctx.bezierCurveTo(CX - 46, bangY + 32, CX - 74, bangY + 34, CX - 82, bangY + 18);
  ctx.bezierCurveTo(CX - rx + 6, bangY + 24, CX - rx + 4, sideY - 14, CX - rx - 4, sideY);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Kilau rambut.
  ctx.beginPath();
  ctx.ellipse(CX - 30, top + HEAD_H * 0.1, 46, 9, -0.2, Math.PI * 1.05, Math.PI * 1.9);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, side: -1 | 1) {
  const ey = EYES.y;
  const rx = 23;
  const ry = 27;

  // Putih mata.
  ellipse(ctx, ex, ey, rx, ry, "#ffffff");

  // Iris abu-keunguan dengan gradasi, terpotong oleh bentuk mata.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const iris = ctx.createLinearGradient(0, ey - ry, 0, ey + ry);
  iris.addColorStop(0, "#3f3a4d");
  iris.addColorStop(0.45, "#7a768c");
  iris.addColorStop(1, "#bdbacb");
  ellipse(ctx, ex, ey + 2, rx - 3, ry - 1, iris);
  ellipse(ctx, ex, ey + 3, 9, 12, "#1f1a27");
  ctx.restore();

  // Kilau mata.
  ellipse(ctx, ex - 8, ey - 9, 6, 7, "#ffffff");
  ellipse(ctx, ex + 8, ey + 11, 3, 3.4, "rgba(255,255,255,0.9)");

  // Garis kelopak atas tebal + bulu mata di sudut luar.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(ex, ey, rx + 1, ry + 1, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ex + side * (rx - 1), ey - ry * 0.55);
  ctx.quadraticCurveTo(ex + side * (rx + 7), ey - ry * 0.7, ex + side * (rx + 10), ey - ry * 0.35);
  ctx.stroke();

  // Garis bawah mata tipis.
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(ex, ey, rx, ry, 0, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Mata besar; dipanggil lagi di atas wig supaya helai rambut tidak menutupi mata. */
function drawEyes(ctx: CanvasRenderingContext2D) {
  drawEye(ctx, CX - EYES.distance / 2, -1);
  drawEye(ctx, CX + EYES.distance / 2, 1);
}

function drawFace(ctx: CanvasRenderingContext2D, skin: SkinTone) {
  const cy = FACE.top + HEAD_H * 0.68;
  const rx = FACE.width / 2;
  const earLine = { color: INK, width: 2 };

  // Telinga di tinggi mata, menonjol ke samping seperti panduan.
  for (const side of [-1, 1] as const) {
    ellipse(ctx, CX + side * (rx - 1), cy, 15, 24, skin.base, earLine);
    ellipse(ctx, CX + side * (rx + 1), cy + 2, 7, 13, skin.shade);
  }

  // Wajah: gradasi lembut + garis kontur tebal.
  headPath(ctx);
  const face = ctx.createLinearGradient(0, FACE.top, 0, CHIN_Y);
  face.addColorStop(0, mix(skin.base, "#ffffff", 0.18));
  face.addColorStop(0.55, skin.base);
  face.addColorStop(1, mix(skin.base, skin.shade, 0.55));
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Bayangan lembut di bawah dagu (bagian leher) tidak perlu: leher digambar sebelum wajah.

  // Pipi merona.
  for (const side of [-1, 1] as const) {
    const bx = CX + side * 61;
    const by = EYES.y + 24;
    const blush = ctx.createRadialGradient(bx, by, 2, bx, by, 24);
    blush.addColorStop(0, "rgba(236, 105, 125, 0.5)");
    blush.addColorStop(1, "rgba(236, 105, 125, 0)");
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.25, 0.7);
    ctx.translate(-bx, -by);
    ellipse(ctx, bx, by, 24, 24, blush);
    ctx.restore();
  }

  // Alis tipis.
  ctx.lineCap = "round";
  ctx.strokeStyle = mix(INK, "#8a7a8a", 0.25);
  ctx.lineWidth = 2.6;
  for (const side of [-1, 1] as const) {
    const bx = CX + side * (EYES.distance / 2);
    const by = EYES.y - 44;
    ctx.beginPath();
    ctx.moveTo(bx - 17, by + 3);
    ctx.quadraticCurveTo(bx, by - 5, bx + 17, by + 2);
    ctx.stroke();
  }

  drawEyes(ctx);

  // Hidung = titik kecil; senyum mungil dekat dagu.
  ellipse(ctx, CX, EYES.y + 22, 1.6, 1.2, mix(skin.shade, "#7a4a40", 0.35));

  ctx.beginPath();
  ctx.moveTo(CX - 9, EYES.y + 33);
  ctx.quadraticCurveTo(CX, EYES.y + 41, CX + 9, EYES.y + 33);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#a8454f";
  ctx.stroke();
}

/**
 * Menggambar karakter lengkap di area logis STAGE (400 × 600). Panggil dengan transform yang
 * sudah diskalakan; fungsi ini tidak mengosongkan canvas.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  state: CharacterState,
  lookup: ImageLookup,
) {
  const skin = skinTones[state.skin] ?? skinTones[0]!;
  const hairColor = hairTones[state.hairTone]?.color ?? hairTones[0]!.color;
  const wig = getLayerSample("hair", state.items.hair);

  drawLowerBody(ctx, state, skin);
  drawUpperBody(ctx, skin);

  if (!wig) {
    drawBaseHairBack(ctx, hairColor);
  }

  drawFace(ctx, skin);

  if (!wig) {
    drawBaseHairFront(ctx, hairColor);
  }

  const drawLayer = (layer: CharacterLayer) => {
    const sample = getLayerSample(layer, state.items[layer]);
    const image = sample?.overlay2d ? lookup(sample.overlay2d) : undefined;

    if (!sample || !image) {
      return;
    }

    const fit = resolveOverlayFit(sample);
    drawOverlay(ctx, image, getLayerPose(layer, fit), fit);
  };

  const drawBuiltIn = (slot: keyof AccessoryState) =>
    drawAccessory(ctx, slot, state.accessories[slot], ACCESSORY_GEOMETRY);

  // Urutan lapisan, dari bawah ke atas.
  drawLayer("clothes");
  drawBuiltIn("wristwear");
  drawBuiltIn("neckwear");
  drawLayer("necklaces");
  drawLayer("ties");
  drawLayer("hair");

  if (wig) {
    // Helai wig tidak boleh menutupi mata besar karakter.
    drawEyes(ctx);
  }

  drawBuiltIn("headwear");
  drawLayer("glasses");
  drawBuiltIn("eyewear");
  drawLayer("hats");
}

/** Menggambar ke canvas dengan skala piksel tertentu (transparan di luar karakter). */
export function renderCharacter(
  canvas: HTMLCanvasElement,
  state: CharacterState,
  lookup: ImageLookup,
  scale: number,
) {
  const width = Math.round(STAGE.width * scale);
  const height = Math.round(STAGE.height * scale);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return false;
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, STAGE.width, STAGE.height);
  drawCharacter(ctx, state, lookup);

  return true;
}

/** Semua gambar overlay yang dibutuhkan state ini. */
export function getRequiredImages(state: CharacterState): string[] {
  return characterLayers.flatMap((layer) => {
    const src = getLayerSample(layer, state.items[layer])?.overlay2d;
    return src ? [src] : [];
  });
}
