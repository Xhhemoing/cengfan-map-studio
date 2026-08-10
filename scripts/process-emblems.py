#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量抠图 + 压缩校徽（复刻 src/lib/background-removal.ts 算法，numpy 向量化）：
- 背景色 = 四角像素平均（RGB）
- dist < tolerance -> alpha=0；tolerance <= dist < tolerance*1.6 -> alpha 渐变柔化边缘
- 源图四角已是透明（alpha≈0）-> 直接保留原 alpha，不做背景去除（避免误删内容）
- 输出 128px webp（RGBA）
"""
import json
import os
import numpy as np
from PIL import Image

MANIFEST = "assets-src/emblems-source/_manifest.json"
SRC_DIR = "assets-src/emblems-source"
OUT_DIR = "public/emblems"
SIZE = 128
TOLERANCE = 42.0  # 与 background-removal.ts 默认一致


def corners_transparent(rgba: np.ndarray) -> bool:
    h, w = rgba.shape[:2]
    corners = np.stack([rgba[0, 0], rgba[0, w - 1], rgba[h - 1, 0], rgba[h - 1, w - 1]])
    return bool(np.all(corners[:, 3] <= 40))


def remove_background(rgba: np.ndarray, tolerance: float = TOLERANCE) -> np.ndarray:
    """复刻 removeBackground：numpy 向量化，返回抠图后的 RGBA 数组。"""
    h, w = rgba.shape[:2]
    corners = np.stack([rgba[0, 0], rgba[0, w - 1], rgba[h - 1, 0], rgba[h - 1, w - 1]])
    bg = corners[:, :3].mean(axis=0)

    rgb = rgba[:, :, :3].astype(np.float64)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    alpha = rgba[:, :, 3].astype(np.float64)

    soft_hi = tolerance * 1.6
    band = tolerance * 0.6
    out = rgba.copy()
    clear = dist < tolerance
    soft = (dist >= tolerance) & (dist < soft_hi)
    out[:, :, 3][clear] = 0
    out[:, :, 3][soft] = np.round(alpha[soft] * (dist[soft] - tolerance) / band)
    return out


def process(name: str, info: dict) -> str:
    if info["type"] == "eol":
        src = os.path.join(SRC_DIR, f"{info['sid']}.{info.get('ext', 'png')}")
    else:
        src = os.path.join(SRC_DIR, "repo", info["file"])
    out = os.path.join(OUT_DIR, name + ".webp")
    if os.path.exists(out):
        return "skip"
    with Image.open(src) as im:
        rgba = im.convert("RGBA")
        arr = np.array(rgba)
        if not corners_transparent(arr):
            arr = remove_background(arr)
        out_im = Image.fromarray(arr, "RGBA")
        out_im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        out_im.save(out, "WEBP", quality=82, method=4)
    return "ok"


def main():
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    done = skipped = failed = 0
    failures = []
    for i, (name, info) in enumerate(manifest.items(), 1):
        try:
            st = process(name, info)
            if st == "skip":
                skipped += 1
            else:
                done += 1
        except Exception as e:
            failed += 1
            failures.append((name, str(e)[:60]))
        if i % 500 == 0:
            print(f"  {i}/{len(manifest)} done={done} skip={skipped} fail={failed}")
    print(f"完成: {done}, 跳过: {skipped}, 失败: {failed}")
    for f in failures[:10]:
        print("  FAIL", f)


if __name__ == "__main__":
    main()
