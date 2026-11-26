/**
 * Aksesoris bawaan karakter. Berbeda dengan katalog try-on (foto), semua aksesoris di sini
 * digambar lewat kode, jadi warnanya bisa diganti bebas tanpa aset gambar tambahan.
 *
 * Tiap slot (kepala, mata, leher, pergelangan) memegang satu aksesoris + satu warna. Warna
 * diingat per slot, jadi saat berganti model warnanya tetap sama.
 */

export type AccessorySlot = "headwear" | "eyewear" | "neckwear" | "wristwear";

export const accessorySlots: readonly { id: AccessorySlot; name: string }[] = [
  { id: "headwear", name: "Kepala" },
  { id: "eyewear", name: "Mata" },
  { id: "neckwear", name: "Leher" },
  { id: "wristwear", name: "Tangan" },
];

export type AccessoryColor = { name: string; hex: string };

export const accessoryColors: readonly AccessoryColor[] = [
  { name: "Merah", hex: "#d94b58" },
  { name: "Pink", hex: "#f08fb0" },
  { name: "Lilac", hex: "#a98bd6" },
  { name: "Biru", hex: "#4f86d6" },
  { name: "Hijau", hex: "#5fae7e" },
  { name: "Kuning", hex: "#f2c14e" },
  { name: "Cokelat", hex: "#8a5a3c" },
  { name: "Hitam", hex: "#2b2830" },
  { name: "Putih", hex: "#f6f3f0" },
];

export type AccessorySelection = { id: string | null; color: number };
export type AccessoryState = Record<AccessorySlot, AccessorySelection>;

export const defaultAccessories: AccessoryState = {
  headwear: { id: null, color: 0 },
  eyewear: { id: null, color: 7 },
  neckwear: { id: null, color: 3 },
  wristwear: { id: null, color: 5 },
};

/** Ukuran dan titik penting karakter yang dibutuhkan untuk menaruh aksesoris. */
export type AccessoryGeometry = {
  cx: number;
  faceTop: number;
  faceWidth: number;
  headHeight: number;
  chinY: number;
  eyeY: number;
  /** Jarak pusat mata ke garis tengah wajah. */
  eyeHalfGap: number;
  shoulderY: number;
  shoulderWidth: number;
  /** Jarak pusat tangan ke garis tengah, dan tinggi pergelangan. */
  handX: number;
  handY: number;
};

export type Palette = { base: string; light: string; dark: string };

/* ------------------------------------------------------------------------------------------ */
/* Warna                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Campur dua warna hex (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)})`;
}

export function makePalette(hex: string): Palette {
  return {
    base: hex,
    light: mix(hex, "#ffffff", 0.38),
    dark: mix(hex, "#000000", 0.42),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Gambar                                                                                     */
/* ------------------------------------------------------------------------------------------ */

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, g: AccessoryGeometry, p: Palette) => void;

export type AccessoryItem = { id: string; name: string; draw: Draw };

const LINE = 1.8;

/** Isi bentuk yang sedang dibuat (path aktif) dengan warna dan garis tepi gelap. */
function paint(ctx: Ctx, fill: string | CanvasGradient, p: Palette, width = LINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.strokeStyle = p.dark;
  ctx.stroke();
}

function vertical(ctx: Ctx, y0: number, y1: number, p: Palette) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, p.light);
  g.addColorStop(1, p.base);
  return g;
}

/** Garis tebal dengan garis tepi: dipakai untuk bingkai kacamata dan bando. */
function thickStroke(ctx: Ctx, path: () => void, width: number, p: Palette) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  path();
  ctx.lineWidth = width + 3.5;
  ctx.strokeStyle = p.dark;
  ctx.stroke();
  ctx.beginPath();
  path();
  ctx.lineWidth = width;
  ctx.strokeStyle = p.base;
  ctx.stroke();
}

/* --- Kepala ---------------------------------------------------------------------------------- */

const headband: Draw = (ctx, g, p) => {
  const midY = g.faceTop + g.headHeight * 0.52;
  const rx = g.faceWidth / 2 + 3;
  const ry = g.headHeight * 0.52 + 3;

  thickStroke(ctx, () => ctx.ellipse(g.cx, midY, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9), 10, p);

  ctx.beginPath();
  ctx.ellipse(g.cx, midY, rx - 1, ry - 1, 0, Math.PI * 1.25, Math.PI * 1.55);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();
};

const bow: Draw = (ctx, g, p) => {
  ctx.save();
  ctx.translate(g.cx + g.faceWidth * 0.27, g.faceTop + g.headHeight * 0.06);
  ctx.rotate(0.28);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(side * 12, -28, side * 46, -32, side * 44, -4);
    ctx.bezierCurveTo(side * 46, 26, side * 12, 24, 0, 0);
    ctx.closePath();
    paint(ctx, vertical(ctx, -30, 24, p), p);

    ctx.beginPath();
    ctx.moveTo(side * 8, -1);
    ctx.quadraticCurveTo(side * 26, -8, side * 38, -3);
    ctx.strokeStyle = p.dark;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 9.5, 0, 0, Math.PI * 2);
  paint(ctx, p.base, p);
  ctx.restore();
};

const beanie: Draw = (ctx, g, p) => {
  const rx = g.faceWidth / 2 + 6;
  const top = g.faceTop - 16;
  const baseY = g.faceTop + g.headHeight * 0.27;

  // Kubah rajut.
  ctx.beginPath();
  ctx.moveTo(g.cx - rx, baseY);
  ctx.bezierCurveTo(g.cx - rx, top + 14, g.cx - rx * 0.62, top, g.cx, top);
  ctx.bezierCurveTo(g.cx + rx * 0.62, top, g.cx + rx, top + 14, g.cx + rx, baseY);
  ctx.closePath();
  paint(ctx, vertical(ctx, top, baseY, p), p);

  // Rajutan vertikal.
  ctx.strokeStyle = p.dark;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1.4;
  for (let k = -5; k <= 5; k++) {
    ctx.beginPath();
    ctx.moveTo(g.cx + k * 3, top + 4);
    ctx.quadraticCurveTo(g.cx + k * rx * 0.2, (top + baseY) / 2, g.cx + k * rx * 0.19, baseY - 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Lipatan bawah.
  ctx.beginPath();
  ctx.roundRect(g.cx - rx - 3, baseY - 20, rx * 2 + 6, 28, 13);
  paint(ctx, p.base, p);

  ctx.strokeStyle = p.dark;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.4;
  for (let x = g.cx - rx + 6; x < g.cx + rx - 4; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, baseY - 16);
    ctx.lineTo(x, baseY + 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Pompom.
  ctx.beginPath();
  ctx.arc(g.cx, top - 3, 15, 0, Math.PI * 2);
  paint(ctx, p.light, p);
};

const clips: Draw = (ctx, g, p) => {
  ctx.save();
  ctx.translate(g.cx - g.faceWidth * 0.3, g.faceTop + g.headHeight * 0.2);
  ctx.rotate(-0.5);

  for (const y of [-7, 7]) {
    ctx.beginPath();
    ctx.roundRect(-18, y - 4.5, 36, 9, 4.5);
    paint(ctx, vertical(ctx, y - 5, y + 5, p), p);
  }
  ctx.restore();
};

/* --- Mata ------------------------------------------------------------------------------------ */

function glassesFrame(
  ctx: Ctx,
  g: AccessoryGeometry,
  p: Palette,
  lens: (x: number) => void,
  reach: number,
) {
  const lensFill = () => {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      lens(g.cx + side * g.eyeHalfGap);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fill();
    }
  };

  lensFill();

  for (const side of [-1, 1]) {
    thickStroke(ctx, () => lens(g.cx + side * g.eyeHalfGap), 4.5, p);
  }

  // Jembatan hidung dan gagang ke arah telinga.
  thickStroke(
    ctx,
    () => {
      ctx.moveTo(g.cx - g.eyeHalfGap + reach, g.eyeY - 6);
      ctx.quadraticCurveTo(g.cx, g.eyeY - 16, g.cx + g.eyeHalfGap - reach, g.eyeY - 6);
    },
    3.5,
    p,
  );

  for (const side of [-1, 1]) {
    thickStroke(
      ctx,
      () => {
        ctx.moveTo(g.cx + side * (g.eyeHalfGap + reach), g.eyeY - 6);
        ctx.lineTo(g.cx + side * (g.faceWidth / 2 - 2), g.eyeY - 4);
      },
      3.5,
      p,
    );
  }
}

const roundGlasses: Draw = (ctx, g, p) => {
  const r = 31;
  glassesFrame(ctx, g, p, (x) => ctx.arc(x, g.eyeY, r, 0, Math.PI * 2), r);
};

const squareGlasses: Draw = (ctx, g, p) => {
  const w = 33;
  const h = 27;
  glassesFrame(ctx, g, p, (x) => ctx.roundRect(x - w, g.eyeY - h, w * 2, h * 2, 13), w);
};

/* --- Leher ----------------------------------------------------------------------------------- */

const scarf: Draw = (ctx, g, p) => {
  const y = g.shoulderY - 2;
  const hw = g.shoulderWidth / 2 + 3;

  // Ekor syal di depan dada.
  ctx.save();
  ctx.translate(g.cx + hw - 20, y + 8);
  ctx.rotate(-0.06);
  ctx.beginPath();
  ctx.roundRect(-13, 0, 27, 58, [4, 4, 8, 8]);
  paint(ctx, vertical(ctx, 0, 58, p), p);

  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.45;
  for (const yy of [16, 28]) {
    ctx.beginPath();
    ctx.moveTo(-13, yy);
    ctx.lineTo(14, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let x = -9; x <= 10; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 58);
    ctx.lineTo(x, 66);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = p.dark;
    ctx.stroke();
  }
  ctx.restore();

  // Lilitan di leher.
  ctx.beginPath();
  ctx.roundRect(g.cx - hw, y - 13, hw * 2, 28, 13);
  paint(ctx, vertical(ctx, y - 13, y + 15, p), p);

  ctx.beginPath();
  ctx.moveTo(g.cx - hw + 10, y - 2);
  ctx.quadraticCurveTo(g.cx, y + 6, g.cx + hw - 10, y - 2);
  ctx.strokeStyle = p.dark;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const bowTie: Draw = (ctx, g, p) => {
  ctx.save();
  ctx.translate(g.cx, g.shoulderY + 4);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 3, 0);
    ctx.lineTo(side * 27, -15);
    ctx.quadraticCurveTo(side * 32, 0, side * 27, 15);
    ctx.closePath();
    paint(ctx, vertical(ctx, -15, 15, p), p);
  }

  ctx.beginPath();
  ctx.roundRect(-6, -8, 12, 16, 4);
  paint(ctx, p.base, p);
  ctx.restore();
};

const longTie: Draw = (ctx, g, p) => {
  ctx.save();
  ctx.translate(g.cx, g.shoulderY + 2);

  // Bilah dasi.
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.lineTo(12, 60);
  ctx.lineTo(0, 72);
  ctx.lineTo(-12, 60);
  ctx.closePath();
  paint(ctx, vertical(ctx, 8, 72, p), p);

  // Simpul.
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.lineTo(8, -4);
  ctx.lineTo(6, 10);
  ctx.lineTo(-6, 10);
  ctx.closePath();
  paint(ctx, p.light, p);
  ctx.restore();
};

const beads: Draw = (ctx, g, p) => {
  const a = { x: g.cx - 25, y: g.shoulderY - 9 };
  const b = { x: g.cx, y: g.shoulderY + 36 };
  const c = { x: g.cx + 25, y: g.shoulderY - 9 };
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * b.x + t * t * c.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * b.y + t * t * c.y,
  });

  // Benang.
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  for (let i = 0; i <= 12; i++) {
    const { x, y } = at(i / 12);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    paint(ctx, p.base, p, 1.2);
    ctx.beginPath();
    ctx.arc(x - 1.2, y - 1.4, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
  }

  // Liontin.
  const mid = at(0.5);
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y + 2);
  ctx.bezierCurveTo(mid.x + 10, mid.y + 10, mid.x + 7, mid.y + 22, mid.x, mid.y + 26);
  ctx.bezierCurveTo(mid.x - 7, mid.y + 22, mid.x - 10, mid.y + 10, mid.x, mid.y + 2);
  paint(ctx, vertical(ctx, mid.y, mid.y + 26, p), p);
};

/* --- Pergelangan ----------------------------------------------------------------------------- */

const bracelet: Draw = (ctx, g, p) => {
  for (const side of [-1, 1]) {
    const x = g.cx + side * g.handX;
    const y = g.handY + 3;

    ctx.beginPath();
    ctx.roundRect(x - 12, y - 4.5, 24, 9, 4.5);
    paint(ctx, vertical(ctx, y - 5, y + 5, p), p);

    for (const dx of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = p.light;
      ctx.fill();
    }
  }
};

const watch: Draw = (ctx, g, p) => {
  // Di tangan kiri layar saja, seperti jam tangan pada umumnya.
  const x = g.cx - g.handX;
  const y = g.handY + 3;

  ctx.beginPath();
  ctx.roundRect(x - 12.5, y - 5, 25, 10, 4);
  paint(ctx, p.base, p);

  ctx.beginPath();
  ctx.roundRect(x - 9, y - 10, 18, 18, 5);
  paint(ctx, "#f7f5fa", p, 2.4);

  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 1);
  ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y - 1);
  ctx.lineTo(x + 4, y + 1);
  ctx.stroke();
};

/* ------------------------------------------------------------------------------------------ */
/* Katalog                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export const accessoryCatalog: Record<AccessorySlot, readonly AccessoryItem[]> = {
  headwear: [
    { id: "headband", name: "Bando", draw: headband },
    { id: "bow", name: "Pita", draw: bow },
    { id: "beanie", name: "Kupluk", draw: beanie },
    { id: "clips", name: "Jepit rambut", draw: clips },
  ],
  eyewear: [
    { id: "round_glasses", name: "Kacamata bulat", draw: roundGlasses },
    { id: "square_glasses", name: "Kacamata kotak", draw: squareGlasses },
  ],
  neckwear: [
    { id: "scarf", name: "Syal", draw: scarf },
    { id: "bow_tie", name: "Dasi kupu-kupu", draw: bowTie },
    { id: "long_tie", name: "Dasi", draw: longTie },
    { id: "beads", name: "Kalung manik", draw: beads },
  ],
  wristwear: [
    { id: "bracelet", name: "Gelang", draw: bracelet },
    { id: "watch", name: "Jam tangan", draw: watch },
  ],
};

export function getAccessoryItem(slot: AccessorySlot, id: string | null): AccessoryItem | null {
  if (!id) {
    return null;
  }

  return accessoryCatalog[slot].find((item) => item.id === id) ?? null;
}

export function getAccessoryColor(index: number): AccessoryColor {
  return accessoryColors[index] ?? accessoryColors[0]!;
}

/** Menggambar satu slot aksesoris dengan warna pilihannya (tidak melakukan apa-apa bila kosong). */
export function drawAccessory(
  ctx: Ctx,
  slot: AccessorySlot,
  selection: AccessorySelection,
  geometry: AccessoryGeometry,
) {
  const item = getAccessoryItem(slot, selection.id);

  if (!item) {
    return;
  }

  ctx.save();
  item.draw(ctx, geometry, makePalette(getAccessoryColor(selection.color).hex));
  ctx.restore();
}

/** Pilihan acak untuk tombol "Acak gaya". */
export function randomAccessories(random: () => number = Math.random): AccessoryState {
  const result = { ...defaultAccessories };

  for (const { id: slot } of accessorySlots) {
    const items = accessoryCatalog[slot];
    const color = Math.floor(random() * accessoryColors.length);

    result[slot] =
      random() < 0.6
        ? { id: null, color }
        : { id: items[Math.floor(random() * items.length)]!.id, color };
  }

  return result;
}
