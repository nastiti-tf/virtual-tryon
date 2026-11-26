# Mirror Muse Try On

Create a modern, professional, responsive web application called "Virtual Try-On AI".

PROJECT PURPOSE:
An AI-powered virtual try-on application that allows users to preview fashion accessories and clothing through a camera.

DESIGN DIRECTION:

Modern, futuristic, clean, and premium.

Use a soft neutral background with dark text and elegant purple accents.

Use consistent typography, spacing, rounded corners, and subtle shadows.

Make the interface look like a real commercial fashion technology product, not a generic AI template.

Responsive for desktop and mobile.

CREATE THESE TWO PAGES:

LANDING PAGE

Navigation bar with logo and app name.

Hero section with headline: "Your Style, Your Virtual Experience."

Short description explaining virtual try-on.

Primary button: "Start Virtual Try-On".

Preview section showing accessory categories.

Short feature section explaining the benefits.

Clean footer.

TRY-ON WORKSPACE

A large central camera preview area with a placeholder illustration.

A clear camera activation button.

A left or right accessory selection panel.

Categories: Glasses, Hair, Hat, Necklace, Clothes, Watch, Bracelet, Ring, and Nails.

A color selection area.

A screenshot button.

A back-to-home button.

TECHNICAL REQUIREMENTS:

Build a functional frontend with reusable components.

Use local sample data for accessory categories.

Make navigation between the landing page and workspace functional.

Do not add authentication, database, payment, or backend services.

Do not implement computer vision, face tracking, chatbot, or 3D rendering yet. These are handled by other team members.

Keep the camera preview area ready for future integration.

Do not create decorative buttons without functionality.

Start by building the complete visual foundation and functional navigation for these two pages.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mirror-muse-try-on.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d7e599fb-0d0f-43d3-9a25-68964aa061ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Try-on dengan landmark (kacamata, topi, rambut, kalung, dasi, baju, jam tangan, gelang, kuku)

Aksesoris dipasang mengikuti tubuh lewat MediaPipe (jalan di browser, video tidak dikirim ke server).
Landmark yang dipakai tergantung jenis aksesoris (`anchor` pada tiap aset):

| Anchor | Aksesoris | Landmark | Acuan lebar |
| --- | --- | --- | --- |
| `eyes` | Kacamata | Face: ujung luar kedua mata (33, 263) | jarak antar mata |
| `head` | Topi, rambut | Face: puncak dahi (10), sisi wajah (234, 454), garis mata | lebar wajah |
| `neck` | Kalung, dasi | Pose: bahu (11, 12). Jika bahu tidak terlihat: Face: dagu (152) + dahi (10) | lebar bahu |
| `torso` | Pakaian (seragam) | Pose: bahu (11, 12) + pinggul (23, 24, bila terlihat). Jika bahu tidak terlihat: Face: dagu + dahi | lebar bahu |
| `wrist` | Jam tangan, gelang | Hand: pergelangan (0), buku jari tengah (9) untuk arah, buku jari telunjuk (5) ↔ kelingking (17) untuk lebar | lebar telapak |
| `nails` | Kuku | Hand: sendi ujung + ujung tiap jari (jempol 3→4, telunjuk 7→8, tengah 11→12, manis 15→16, kelingking 19→20) | lebar telapak |

Model bahu (Pose Landmarker) hanya dimuat saat memilih kalung/dasi. Jika bahu belum terlihat di kamera,
posisi leher diperkirakan dari wajah dan muncul saran untuk mundur sedikit.

- `src/lib/mediapipe.ts` — memuat model (singleton, GPU → CPU fallback).
- `src/lib/overlay-fit.ts` — posisi/ukuran/rotasi/yaw per anchor, smoothing, dan penggambaran.
- `src/lib/try-on-data.ts` — katalog aset dan penyesuaian (`fit`) per aksesoris.

### Menambah aksesoris baru
1. `public/overlays/<folder>/<id>.webp` — foto depan, background transparan (folder: `glasses`, `hats`, `hair`, `necklaces`, `ties`, `watch`, `bracelets`).
2. `public/thumbnails/<folder>/<id>.png` — gambar kecil untuk tombol.
3. Tambah satu baris di `try-on-data.ts`, mis. `hatSample("hat_baru", "Nama")`.

Padding transparan pada gambar diabaikan otomatis. Atur `fit` bila perlu:
- `widthScale` — lebar aksesoris ÷ acuan lebar (tabel di atas).
- `anchorX`, `anchorY` — titik pada gambar (0..1) yang dipasang di titik jangkar. Contoh: dasar topi `anchorY: 1`,
  garis rambut wig, ujung atas kalung `anchorY: 0`, tengah pita `anchorY: 0.5`.
- `offsetY` — geser vertikal dalam satuan lebar aksesoris (+ = turun).

### Pakaian (seragam)
Sembilan seragam (`public/overlays/clothes/`): Senin blazer, Selasa rompi, Rabu kemeja, Kamis batik,
Jumat pramuka — masing-masing lengan panjang dan pendek (Senin hanya blazer).

- `anchor: "torso"`: garis bahu pada gambar (`anchorY`) dipasang di tengah kedua bahu pengguna; lebar seluruh gambar
  = `widthScale` × lebar bahu (sudah termasuk lengan); gambar ikut miring mengikuti garis bahu.
- Jika kedua pinggul terlihat, tinggi baju disesuaikan dengan panjang badan lewat `hemRatio`
  (panjang bahu→ujung baju ÷ jarak bahu→pinggul), dibatasi 0.85×–1.25× rasio asli agar tidak penyok.
  Jika pinggul tidak terlihat (umumnya webcam), tinggi memakai rasio asli gambar.
- Bukaan leher pada baju berkerah (Rabu, Kamis, Jumat) sudah dilubangi di aset supaya leher pengguna tetap terlihat.
- Aset dibuat dari foto produk lewat `scripts/build-uniform-assets.py` (hapus latar putih, crop, ukur titik bahu).
  Rabu-Panjang/Pendek aslinya hanya ±240 px lebar sehingga hasilnya agak buram; ganti dengan gambar lebih besar bila ada.

### Jam tangan dan gelang (`anchor: "wrist"`)
Aset: `public/overlays/watch/` (4 jam) dan `public/overlays/bracelets/` (3 gelang).

- Pusat gambar (`anchorX`, `anchorY`) dipasang di dekat pergelangan; arah "atas" gambar menunjuk ke jari
  (pergelangan → buku jari tengah), sumbu horizontal gambar searah lebar pergelangan.
- `widthScale` = lebar gambar ÷ lebar telapak. Jarak pusat dari titik pergelangan ke arah lengan diatur lewat
  konstanta `WATCH_FOREARM` / `BRACELET_FOREARM` di `try-on-data.ts` (satuan: lebar telapak).
- `rotation` (radian) meluruskan foto yang miring, mis. jam "Kulit & emas" (`-0.3`).
- Bila telapak miring, aksesoris menyempit (`yawScale`, minimal 0.55). Dipasang di semua tangan yang terdeteksi.

### Kuku (`anchor: "nails"`)
Aset: `public/overlays/nails/nails_<set>_<a|b>_<jari>.webp` — 5 set × 2 tangan × 5 jari. Lembar aslinya berisi
10 kuku (2 baris × 5); `scripts/build-hand-assets.py` memotongnya per kuku dan mengurutkan dari yang terlebar (jempol)
ke kelingking. Baris atas = set `a` (tangan berlabel Left di MediaPipe), baris bawah = set `b` (Right).

- Ujung kuku ada di BAWAH gambar, jadi "atas" gambar diputar menunjuk ke pangkal kuku (sendi ujung → ujung jari).
- Pusat kuku = 0.22 × panjang ruas ujung dari ujung jari; lebar per jari ada di `NAIL_WIDTH` (`hand-fit.ts`),
  dikalikan `fit.widthScale` (default 1) untuk memperbesar/memperkecil semua kuku sekaligus.
- Ruas ujung yang terlalu pendek (jari menunjuk ke kamera / menggenggam) → kuku jari itu disembunyikan.
- Belum dibedakan telapak vs punggung tangan: kuku/jam tetap tergambar walau telapak menghadap kamera.

Model tangan (`hand_landmarker`) hanya dimuat saat memilih jam tangan, gelang, atau kuku.
Perhitungan ada di `src/lib/hand-fit.ts`.

Kategori Cincin belum punya aset.
