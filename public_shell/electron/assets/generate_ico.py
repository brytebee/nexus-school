"""
generate_ico.py — Creates a Windows-compatible icon.ico from icon.png
Uses only Python stdlib (struct + zlib) — no external packages needed.
Modern ICO format embeds PNGs directly (supported since Windows Vista).
Run: python3 generate_ico.py
"""
import struct, os

SIZES = [16, 24, 32, 48, 64, 128, 256]
SRC   = os.path.join(os.path.dirname(__file__), "icon.png")
DST   = os.path.join(os.path.dirname(__file__), "icon.ico")

def resize_png_sips(src: str, size: int) -> bytes:
    """Use macOS sips to resize PNG, return raw PNG bytes."""
    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.run(
            ["sips", "-z", str(size), str(size), src, "--out", tmp_path],
            check=True, capture_output=True
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)

def build_ico(png_chunks: list[tuple[int, bytes]]) -> bytes:
    """
    ICO structure:
      - ICONDIR header  (6 bytes)
      - ICONDIRENTRY[]  (16 bytes × n)
      - PNG data        (variable)
    """
    n = len(png_chunks)
    header = struct.pack("<HHH", 0, 1, n)         # reserved=0, type=1 (ICO), count=n

    # Calculate data offset: header (6) + entries (16 * n)
    offset = 6 + 16 * n
    entries = b""
    data    = b""

    for size, png_bytes in png_chunks:
        w = h = size if size < 256 else 0          # ICO uses 0 to mean 256
        byte_count = len(png_bytes)
        entries += struct.pack(
            "<BBBBHHII",
            w, h,           # width, height (0 = 256)
            0,              # color count (0 = no palette)
            0,              # reserved
            1,              # color planes
            32,             # bits per pixel
            byte_count,     # size of image data
            offset          # offset of image data in file
        )
        data   += png_bytes
        offset += byte_count

    return header + entries + data


if __name__ == "__main__":
    print(f"Source: {SRC}")
    chunks = []
    for size in SIZES:
        print(f"  Resizing → {size}×{size}px …", end=" ", flush=True)
        png = resize_png_sips(SRC, size)
        chunks.append((size, png))
        print(f"{len(png):,} bytes ✓")

    ico = build_ico(chunks)
    with open(DST, "wb") as f:
        f.write(ico)
    print(f"\n✅ Written: {DST}  ({len(ico):,} bytes, {len(chunks)} sizes)")
