"""
Menyiapkan aset tangan (kuku, jam tangan, gelang) untuk try-on.

  python scripts/build-hand-assets.py <folder-sumber> <folder-public>

Folder sumber berisi nails/, watch/, bracelet/ (hasil ekstrak nails.zip, watch.zip, bracelet.zip).

Hasil:
  public/overlays/nails/<set>_<tangan>_<jari>.webp   1 file per kuku (tangan: a = baris atas, b = baris bawah)
  public/thumbnails/nails/<set>.png                  satu baris kuku untuk tombol
  public/overlays/watch/<id>.webp, public/thumbnails/watch/<id>.png
  public/overlays/bracelets/<id>.webp, public/thumbnails/bracelets/<id>.png

Lembar kuku berisi 10 kuku dalam 2 baris (5 + 5). Tiap kuku dipotong, lalu diurutkan dari yang
terlebar (jempol) ke yang tersempit (kelingking). Di semua lembar, ujung kuku ada di BAWAH gambar
(pangkal kuku di atas) — pemasangan di overlay-fit memutar kuku sesuai hal ini.
"""

import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import maximum_filter

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets"
PUB = sys.argv[2] if len(sys.argv) > 2 else "public"

FINGERS = ["thumb", "index", "middle", "ring", "pinky"]
ALPHA_MIN = 16


def trim(img: Image.Image, pad: int = 2) -> Image.Image:
    box = img.getchannel("A").point(lambda v: 255 if v > ALPHA_MIN else 0).getbbox()
    if not box:
        return img
    x0, y0, x1, y1 = box
    return img.crop((max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, img.width), min(y1 + pad, img.height)))


def save(img: Image.Image, path: str, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, **kw)


def fit_side(img: Image.Image, side: int) -> Image.Image:
    k = side / max(img.size)
    if k >= 1:
        return img
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


def largest_blob(m: np.ndarray) -> np.ndarray:
    """Buang serpihan kuku tetangga yang ikut terpotong; manik tepi tetap ikut."""
    m8 = m.astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m8, np.ones((5, 5), np.uint8)), connectivity=8)
    if n <= 2:
        return m
    keep = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return m & (lab == keep)


def split_nails(rgba: np.ndarray) -> list[np.ndarray]:
    """Potong lembar menjadi 10 mask kuku."""
    mask = (rgba[:, :, 3] > ALPHA_MIN).astype(np.uint8)
    grown = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    n, lab, _, _ = cv2.connectedComponentsWithStats(grown, connectivity=8)

    if n - 1 == 10:
        return [(lab == i) & (mask > 0) for i in range(1, n)]

    # Kuku saling menempel: pisahkan dengan watershed dari puncak distance transform.
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    peaks = (dist == maximum_filter(dist, size=61)) & (dist > dist.max() * 0.45)
    pn, plab = cv2.connectedComponents(peaks.astype(np.uint8))
    if pn - 1 != 10:
        raise SystemExit(f"puncak kuku = {pn - 1}, seharusnya 10")

    markers = plab.astype(np.int32)
    markers[(mask == 0)] = 0
    bgmark = pn  # penanda latar
    markers[mask == 0] = bgmark
    relief = cv2.cvtColor((255 - np.clip(dist / dist.max() * 255, 0, 255)).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    cv2.watershed(relief, markers)
    return [(markers == i) & (mask > 0) for i in range(1, 11)]


def build_nails():
    out = {}
    folder = os.path.join(SRC, "nails")
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".png"):
            continue
        set_id = name.split("-")[0]
        rgba = np.array(Image.open(os.path.join(folder, name)).convert("RGBA"))
        pieces = []
        for m in split_nails(rgba):
            m = largest_blob(m)
            ys, xs = np.where(m)
            piece = rgba.copy()
            piece[:, :, 3] = np.where(m, piece[:, :, 3], 0)
            pieces.append(dict(img=piece, cx=xs.mean(), cy=ys.mean(), w=xs.max() - xs.min() + 1))

        pieces.sort(key=lambda p: p["cy"])
        rows = {"a": pieces[:5], "b": pieces[5:]}
        info = {}
        for hand, row in rows.items():
            row.sort(key=lambda p: p["cx"])
            if row[0]["w"] < row[-1]["w"]:  # jempol = kuku terlebar
                row.reverse()
            for finger, p in zip(FINGERS, row):
                img = trim(Image.fromarray(p["img"], "RGBA"))
                save(img, f"{PUB}/overlays/nails/nails_{set_id}_{hand}_{finger}.webp", quality=92, method=6)
                info[f"{hand}_{finger}"] = [img.width, img.height]

        # Thumbnail: baris atas, dari kiri ke kanan seperti di lembar aslinya.
        row_a = sorted(rows["a"], key=lambda p: p["cx"])
        canvas = np.zeros_like(rgba)
        for p in row_a:
            canvas = np.where(p["img"][:, :, 3:4] > 0, p["img"], canvas)
        thumb = fit_side(trim(Image.fromarray(canvas, "RGBA")), 240)
        save(thumb, f"{PUB}/thumbnails/nails/nails_{set_id}.png", optimize=True)
        out[set_id] = info
    return out


def build_single(kind: str, public_folder: str, prefix: str, ids: dict[str, str]):
    out = {}
    for src_name, id_ in ids.items():
        img = trim(Image.open(os.path.join(SRC, kind, src_name)).convert("RGBA"), pad=1)
        big = fit_side(img, 700)
        save(big, f"{PUB}/overlays/{public_folder}/{prefix}_{id_}.webp", quality=92, method=6)
        save(fit_side(img, 200), f"{PUB}/thumbnails/{public_folder}/{prefix}_{id_}.png", optimize=True)
        out[f"{prefix}_{id_}"] = [big.width, big.height]
    return out


if __name__ == "__main__":
    report = {
        "nails": build_nails(),
        "watch": build_single(
            "watch",
            "watch",
            "watch",
            {"Blue.png": "blue", "Brown.png": "brown", "Classic.png": "classic", "Emas.png": "emas"},
        ),
        "bracelets": build_single(
            "bracelet",
            "bracelets",
            "bracelet",
            {"blue-bracelet.png": "blue", "silver-bracelet.png": "silver", "simple-silver.png": "simple_silver"},
        ),
    }
    print(json.dumps(report, indent=1))
