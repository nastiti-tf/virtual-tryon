import {
  Circle,
  CircleDot,
  Crown,
  Gem,
  Glasses,
  Paintbrush,
  Ribbon,
  Shirt,
  Watch,
  Waves,
  type LucideIcon,
} from "lucide-react";

/**
 * Bagian tubuh tempat aksesoris dipasang, menentukan landmark yang dipakai:
 * - "eyes": tengah kedua mata (Face Landmarker) → kacamata
 * - "head": puncak dahi + lebar wajah (Face Landmarker) → topi, rambut
 * - "neck": pangkal leher dari bahu (Pose Landmarker, cadangan: wajah) → kalung, dasi
 * - "torso": garis bahu + pinggul (Pose Landmarker, cadangan: wajah) → baju, rompi, blazer
 * - "wrist": pergelangan + buku jari (Hand Landmarker) → jam tangan, gelang
 * - "nails": ujung dan sendi jari (Hand Landmarker) → kuku, satu gambar per jari
 */
export type OverlayAnchor = "eyes" | "head" | "neck" | "torso" | "wrist" | "nails";

/**
 * Penyesuaian aksesoris terhadap tubuh. Ukuran dan posisi dihitung dari area gambar
 * yang benar-benar terisi (padding transparan diabaikan otomatis).
 */
export type OverlayFit = {
  /**
   * Lebar aksesoris ÷ panjang acuan:
   * jarak antar mata ("eyes"), lebar wajah ("head"), atau lebar bahu ("neck", "torso").
   * Untuk "torso" ini sudah termasuk lengan: lebar seluruh gambar ÷ lebar bahu.
   */
  widthScale: number;
  /** Titik pada gambar (0..1 dari kiri) yang dipasang di titik jangkar. */
  anchorX: number;
  /** Titik pada gambar (0..1 dari atas) yang dipasang di titik jangkar. */
  anchorY: number;
  /** Geser vertikal dalam satuan lebar aksesoris (+ = turun). */
  offsetY: number;
  /**
   * Khusus "torso": panjang dari garis bahu sampai ujung bawah baju ÷ jarak bahu–pinggul.
   * Dipakai untuk menyesuaikan tinggi baju hanya jika pinggul terlihat di kamera;
   * jika tidak, tinggi mengikuti rasio asli gambar.
   */
  hemRatio?: number;
  /**
   * Khusus "wrist": putaran tambahan (radian, + = searah jarum jam) untuk gambar yang fotonya miring,
   * supaya angka 12 / sumbu gelang tepat mengarah ke jari.
   */
  rotation?: number;
};

/** Jari pada satu tangan, dari jempol sampai kelingking. */
export type FingerId = "thumb" | "index" | "middle" | "ring" | "pinky";

export const fingerIds: readonly FingerId[] = ["thumb", "index", "middle", "ring", "pinky"];

/** Satu set kuku untuk satu tangan: gambar per jari. */
export type NailHandSet = Readonly<Record<FingerId, string>>;

/**
 * Satu set kuku = dua tangan. Lembar aset berisi 10 kuku dalam dua baris: "a" = baris atas, "b" = baris
 * bawah. Tangan dengan label Left di MediaPipe memakai "a", Right memakai "b".
 */
export type NailSet = Readonly<Record<"a" | "b", NailHandSet>>;

export type TryOnSample = {
  id: string;
  name: string;
  thumbnail?: string;
  overlay2d?: string;
  /** Khusus kuku: gambar per jari untuk kedua tangan (pengganti `overlay2d`). */
  nails?: NailSet;
  anchor?: OverlayAnchor;
  fit?: OverlayFit;
};

/** Sampel punya gambar untuk dipasang langsung di kamera? */
export function hasOverlay(sample: TryOnSample): boolean {
  return Boolean(sample.overlay2d ?? sample.nails);
}

export type TryOnCategory = {
  id?: string;
  name: string;
  icon: LucideIcon;
  samples: readonly [TryOnSample, ...TryOnSample[]];
};

export type TryOnColor = {
  name: string;
  className: string;
};

export const defaultOverlayFit: OverlayFit = {
  widthScale: 1.55,
  anchorX: 0.5,
  anchorY: 0.5,
  offsetY: 0,
};

export function resolveOverlayFit(sample: TryOnSample): OverlayFit {
  return sample.fit ?? defaultOverlayFit;
}

/**
 * Konvensi aset per kategori:
 *   public/overlays/<folder>/<id>.webp    foto depan, background transparan
 *   public/thumbnails/<folder>/<id>.png   gambar kecil untuk tombol
 */
const overlayCategory =
  (folder: string, anchor: OverlayAnchor, defaults: OverlayFit) =>
  (id: string, name: string, fit: Partial<OverlayFit> = {}): TryOnSample => ({
    id,
    name,
    thumbnail: `/thumbnails/${folder}/${id}.png`,
    overlay2d: `/overlays/${folder}/${id}.webp`,
    anchor,
    fit: { ...defaults, ...fit },
  });

// Angka di bawah diukur dari gambar masing-masing aset (lihat catatan di README).
const glassesSample = overlayCategory("glasses", "eyes", defaultOverlayFit);
// Dasar topi (anchorY = 1) duduk di puncak dahi.
const hatSample = overlayCategory("hats", "head", {
  widthScale: 1.5,
  anchorX: 0.5,
  anchorY: 1,
  offsetY: -0.02,
});
// anchorY = garis rambut (tengah bukaan wajah pada wig), widthScale membuat bukaan sama dengan lebar wajah.
const hairSample = overlayCategory("hair", "head", {
  widthScale: 2.1,
  anchorX: 0.5,
  anchorY: 0.5,
  offsetY: 0,
});
// Ujung atas kalung/dasi duduk di pangkal leher.
const necklaceSample = overlayCategory("necklaces", "neck", {
  widthScale: 0.5,
  anchorX: 0.5,
  anchorY: 0,
  offsetY: -0.02,
});
const tieSample = overlayCategory("ties", "neck", {
  widthScale: 0.3,
  anchorX: 0.5,
  anchorY: 0,
  offsetY: 0,
});

export const defaultTryOnCategory: TryOnCategory = {
  id: "glasses",
  name: "Kacamata",
  icon: Glasses,
  samples: [
    glassesSample("glasses_01", "Bingkai klasik"),
    glassesSample("glasses_hitam", "Hitam"),
    glassesSample("glasses_keren", "Cat-eye"),
    glassesSample("glasses_yellow", "Kuning sporty", { widthScale: 1.5 }),
    glassesSample("glasses_cute", "Cute"),
    glassesSample("glasses_y2k", "Y2K", { widthScale: 1.75, anchorX: 0.44 }),
    glassesSample("glasses_hello_kitty", "Hello Kitty", {
      widthScale: 1.6,
      anchorX: 0.485,
      anchorY: 0.57,
    }),
    glassesSample("glasses_alien", "Alien", { widthScale: 1.5 }),
    glassesSample("glasses_aneh", "Mata aneh", { widthScale: 1.6 }),
    glassesSample("glasses_doggy", "Doggy", { widthScale: 1.72, anchorY: 0.63 }),
  ],
};

const hairCategory: TryOnCategory = {
  id: "hair",
  name: "Rambut",
  icon: Waves,
  samples: [
    hairSample("hair_red", "Merah", { widthScale: 2.25, anchorX: 0.53, anchorY: 0.5 }),
    hairSample("hair_pink_bob", "Pink bob", { widthScale: 1.83, anchorY: 0.51, offsetY: 0.18 }),
    hairSample("hair_green", "Hijau", { widthScale: 2.3, anchorX: 0.52, anchorY: 0.45 }),
    hairSample("hair_gr33n", "Hijau neon", { widthScale: 2.08, anchorY: 0.49 }),
    hairSample("hair_badut", "Badut", { widthScale: 2.15, anchorX: 0.47, anchorY: 0.63 }),
  ],
};

const hatCategory: TryOnCategory = {
  id: "hats",
  name: "Topi",
  icon: Crown,
  samples: [
    hatSample("hat_cowboy", "Cowboy", { widthScale: 1.95, anchorY: 0.86 }),
    hatSample("hat_chef", "Chef", { widthScale: 1.5, anchorY: 0.93 }),
    hatSample("hat_mario", "Mario", { widthScale: 1.55, anchorY: 0.82, offsetY: 0 }),
    hatSample("hat_bajak_laut", "Bajak laut", { widthScale: 1.9, anchorY: 0.53 }),
    // Daun tomat duduk di puncak kepala, bukan di dahi.
    hatSample("hat_tomato", "Tomat", { widthScale: 0.95, anchorY: 0.6, offsetY: -0.38 }),
  ],
};

// Baju: garis bahu pada gambar (anchorY) dipasang di garis bahu pengguna, lebar seluruh gambar =
// widthScale × lebar bahu. Nilai diukur dari titik ujung bahu tiap gambar (scripts/build-uniform-assets.py).
const clothesSample = overlayCategory("clothes", "torso", {
  widthScale: 1.5,
  anchorX: 0.5,
  anchorY: 0.15,
  offsetY: 0,
  hemRatio: 1.2,
});

const necklaceCategory: TryOnCategory = {
  id: "necklaces",
  name: "Kalung",
  icon: Gem,
  samples: [
    necklaceSample("necklace_rantai", "Rantai perak", { widthScale: 0.44 }),
    necklaceSample("necklace_black", "Bintang hitam", { widthScale: 0.5 }),
    necklaceSample("necklace_brown", "Gotik", { widthScale: 0.5 }),
    necklaceSample("necklace_gangster", "Gangster", { widthScale: 0.62 }),
  ],
};

const tieCategory: TryOnCategory = {
  id: "ties",
  name: "Dasi",
  icon: Ribbon,
  samples: [
    tieSample("tie_black", "Hitam", { widthScale: 0.32 }),
    tieSample("tie_red", "Merah", { widthScale: 0.3 }),
    tieSample("tie_kotak_kotak", "Kotak-kotak", { widthScale: 0.21 }),
    // Pita dijangkarkan di tengah, bukan di ujung atas.
    tieSample("tie_pita", "Pita", { widthScale: 0.36, anchorY: 0.5 }),
  ],
};

// Jam tangan dan gelang: pusat gambar (anchorX/anchorY) dipasang di pergelangan. Arah "atas" gambar
// mengarah ke jari, sumbu horizontal gambar searah lebar pergelangan. widthScale = lebar gambar ÷
// lebar telapak (buku jari telunjuk ke kelingking). `forearm` = jarak pusat dari titik pergelangan
// ke arah lengan, dalam lebar telapak; diubah ke offsetY (satuan lebar aksesoris) di sini.
const WATCH_FOREARM = 0.36;
const BRACELET_FOREARM = 0.2;

const wristSample =
  (folder: string, forearm: number) =>
  (id: string, name: string, fit: Partial<OverlayFit> & { widthScale: number }): TryOnSample =>
    overlayCategory(folder, "wrist", {
      ...defaultOverlayFit,
      offsetY: forearm / fit.widthScale,
    })(id, name, fit);

const watchSample = wristSample("watch", WATCH_FOREARM);
const braceletSample = wristSample("bracelets", BRACELET_FOREARM);

const watchCategory: TryOnCategory = {
  id: "watch",
  name: "Jam Tangan",
  icon: Watch,
  samples: [
    watchSample("watch_blue", "Biru klasik", { widthScale: 0.62, anchorX: 0.5, anchorY: 0.375 }),
    watchSample("watch_brown", "Kulit & emas", {
      widthScale: 0.9,
      anchorX: 0.31,
      anchorY: 0.41,
      rotation: -0.3,
    }),
    watchSample("watch_classic", "Silver GMT", { widthScale: 0.64, anchorX: 0.49, anchorY: 0.35 }),
    watchSample("watch_emas", "Emas hitam", { widthScale: 0.62, anchorX: 0.49, anchorY: 0.41 }),
  ],
};

const braceletCategory: TryOnCategory = {
  id: "bracelets",
  name: "Gelang",
  icon: CircleDot,
  samples: [
    braceletSample("bracelet_blue", "Safir biru", { widthScale: 0.95 }),
    braceletSample("bracelet_silver", "Kristal perak", { widthScale: 0.95 }),
    braceletSample("bracelet_simple_silver", "Silver simpel", { widthScale: 0.9 }),
  ],
};

/**
 * Kuku: tiap jari punya gambar sendiri (hasil potong lembar kuku, scripts/build-hand-assets.py).
 * Ujung kuku ada di bawah gambar. widthScale mengalikan lebar kuku bawaan per jari (lihat hand-fit.ts).
 */
const nailSet = (set: string, name: string): TryOnSample => {
  const hand = (side: "a" | "b"): NailHandSet => ({
    thumb: `/overlays/nails/nails_${set}_${side}_thumb.webp`,
    index: `/overlays/nails/nails_${set}_${side}_index.webp`,
    middle: `/overlays/nails/nails_${set}_${side}_middle.webp`,
    ring: `/overlays/nails/nails_${set}_${side}_ring.webp`,
    pinky: `/overlays/nails/nails_${set}_${side}_pinky.webp`,
  });

  return {
    id: `nails_${set}`,
    name,
    thumbnail: `/thumbnails/nails/nails_${set}.png`,
    anchor: "nails",
    nails: { a: hand("a"), b: hand("b") },
    fit: { ...defaultOverlayFit, widthScale: 1 },
  };
};

const nailsCategory: TryOnCategory = {
  id: "nails",
  name: "Kuku",
  icon: Paintbrush,
  samples: [
    nailSet("blue", "Navy french"),
    nailSet("brown", "Latte floral"),
    nailSet("maroon", "Maroon & emas"),
    nailSet("pink", "Dusty rose"),
    nailSet("tosca", "Tosca french"),
  ],
};

const clothesCategory: TryOnCategory = {
  id: "clothes",
  name: "Pakaian",
  icon: Shirt,
  samples: [
    clothesSample("senin_blazer", "Senin · Blazer", {
      widthScale: 1.41,
      anchorX: 0.499,
      anchorY: 0.144,
      hemRatio: 1.3,
    }),
    clothesSample("selasa_panjang", "Selasa · Panjang", {
      widthScale: 1.47,
      anchorX: 0.496,
      anchorY: 0.164,
      hemRatio: 1.15,
    }),
    clothesSample("selasa_pendek", "Selasa · Pendek", {
      widthScale: 1.57,
      anchorX: 0.496,
      anchorY: 0.168,
      hemRatio: 1.15,
    }),
    clothesSample("rabu_panjang", "Rabu · Panjang", {
      widthScale: 1.54,
      anchorX: 0.5,
      anchorY: 0.165,
    }),
    clothesSample("rabu_pendek", "Rabu · Pendek", {
      widthScale: 1.5,
      anchorX: 0.502,
      anchorY: 0.17,
    }),
    clothesSample("kamis_panjang", "Kamis · Panjang", {
      widthScale: 1.5,
      anchorX: 0.5,
      anchorY: 0.149,
    }),
    clothesSample("kamis_pendek", "Kamis · Pendek", {
      widthScale: 1.5,
      anchorX: 0.502,
      anchorY: 0.148,
    }),
    clothesSample("jumat_panjang", "Jumat · Panjang", {
      widthScale: 1.46,
      anchorX: 0.499,
      anchorY: 0.15,
    }),
    clothesSample("jumat_pendek", "Jumat · Pendek", {
      widthScale: 1.51,
      anchorX: 0.499,
      anchorY: 0.149,
    }),
  ],
};

const plain = (prefix: string, names: readonly [string, ...string[]]) =>
  names.map((name, i) => ({
    id: `${prefix}_${String(i + 1).padStart(2, "0")}`,
    name,
  })) as [TryOnSample, ...TryOnSample[]];

export const tryOnCategories = [
  defaultTryOnCategory,
  hairCategory,
  hatCategory,
  necklaceCategory,
  tieCategory,
  clothesCategory,
  watchCategory,
  braceletCategory,
  {
    name: "Cincin",
    icon: Circle,
    samples: plain("ring", ["Kubah pahatan", "Cincin susun", "Signet klasik"]),
  },
  nailsCategory,
] as const satisfies readonly [TryOnCategory, ...TryOnCategory[]];

export const defaultTryOnColor: TryOnColor = {
  name: "Lilac",
  className: "bg-swatch-lilac",
};

export const tryOnColors = [
  defaultTryOnColor,
  { name: "Mawar", className: "bg-swatch-rose" },
  { name: "Hitam", className: "bg-swatch-ink" },
  { name: "Sage", className: "bg-swatch-sage" },
  { name: "Perak", className: "bg-swatch-silver" },
  { name: "Amber", className: "bg-swatch-amber" },
] as const satisfies readonly [TryOnColor, ...TryOnColor[]];

export const hairColors = [
  { name: "Hitam", className: "bg-swatch-ink" },
  { name: "Cokelat", className: "bg-swatch-amber" },
  { name: "Mawar", className: "bg-swatch-rose" },
  { name: "Lilac", className: "bg-swatch-lilac" },
  { name: "Sage", className: "bg-swatch-sage" },
] as const satisfies readonly [TryOnColor, ...TryOnColor[]];

export function getDefaultTryOnSelection() {
  return {
    category: defaultTryOnCategory,
    sample: defaultTryOnCategory.samples[0],
    color: defaultTryOnColor,
  };
}
