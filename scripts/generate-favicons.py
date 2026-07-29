"""Generate the IELTSX favicon set from an existing raster logo."""

from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter


SIZES = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "favicon-48x48.png": 48,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
    "apple-touch-icon.png": 180,
}


def circular_crop(source: Image.Image) -> Image.Image:
    """Tightly crop the original circular mark and place it on white."""
    source = source.convert("RGB")
    width, height = source.size

    # The uploaded 1024px artwork's ring is centered slightly above the canvas
    # center. These ratios preserve the complete glow while removing empty edges.
    center_x = round(width * 0.5)
    center_y = round(height * 0.476)
    crop_size = round(min(width, height) * 0.801)
    left = center_x - crop_size // 2
    top = center_y - crop_size // 2
    cropped = source.crop((left, top, left + crop_size, top + crop_size))

    # Antialiased circular mask: the uploaded pixels remain untouched inside it,
    # while the favicon canvas outside the logo becomes solid white.
    scale = 4
    mask = Image.new("L", (crop_size * scale, crop_size * scale), 0)
    draw = ImageDraw.Draw(mask)
    inset = round(crop_size * 0.006 * scale)
    draw.ellipse(
        (inset, inset, crop_size * scale - inset - 1, crop_size * scale - inset - 1),
        fill=255,
    )
    mask = mask.resize((crop_size, crop_size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (crop_size, crop_size), "white")
    canvas.paste(cropped, (0, 0), mask)
    return canvas


def render_icon(master: Image.Image, size: int) -> Image.Image:
    icon = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 48:
        icon = icon.filter(ImageFilter.UnsharpMask(radius=0.65, percent=135, threshold=2))
    return icon


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate-favicons.py SOURCE_IMAGE OUTPUT_DIR")

    source_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as source:
        master = circular_crop(source)

    rendered = {}
    for filename, size in SIZES.items():
        icon = render_icon(master, size)
        icon.save(output_dir / filename, format="PNG", optimize=True)
        rendered[size] = icon

    rendered[48].save(
        output_dir / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[rendered[32], rendered[16]],
    )


if __name__ == "__main__":
    main()
