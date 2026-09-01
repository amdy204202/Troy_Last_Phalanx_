from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def keep_major_components(frame: Image.Image) -> Image.Image:
    alpha = np.array(frame.getchannel("A")) > 8
    height, width = alpha.shape
    seen = np.zeros_like(alpha, dtype=bool)
    components = []
    for y in range(height):
        for x in range(width):
            if seen[y, x] or not alpha[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            pixels = []
            while queue:
                py, px = queue.popleft()
                pixels.append((py, px))
                for ny, nx in ((py - 1, px), (py + 1, px), (py, px - 1), (py, px + 1)):
                    if 0 <= ny < height and 0 <= nx < width and alpha[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            components.append(pixels)
    if not components:
        return frame
    components.sort(key=len, reverse=True)
    cutoff = max(18, round(len(components[0]) * .015))
    keep = np.zeros_like(alpha, dtype=bool)
    for component in components:
        if len(component) < cutoff:
            break
        ys, xs = zip(*component)
        keep[ys, xs] = True
    rgba = np.array(frame)
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0)
    return Image.fromarray(rgba, "RGBA")


def extract_largest_components(image: Image.Image, count: int) -> list[Image.Image]:
    alpha = np.array(image.getchannel("A")) > 8
    height, width = alpha.shape
    labels = np.zeros((height, width), dtype=np.int16)
    records = []
    label = 0
    for y in range(height):
        for x in range(width):
            if labels[y, x] or not alpha[y, x]:
                continue
            label += 1
            queue = deque([(y, x)])
            labels[y, x] = label
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            x_total = 0
            while queue:
                py, px = queue.popleft()
                area += 1
                x_total += px
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for ny, nx in ((py - 1, px), (py + 1, px), (py, px - 1), (py, px + 1)):
                    if 0 <= ny < height and 0 <= nx < width and alpha[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        queue.append((ny, nx))
            records.append((area, x_total / area, label, (min_x, min_y, max_x + 1, max_y + 1)))
    records = sorted(records, reverse=True)[:count]
    records.sort(key=lambda record: record[1])
    rgba = np.array(image)
    frames = []
    for _, _, component, box in records:
        min_x, min_y, max_x, max_y = box
        crop = rgba[min_y:max_y, min_x:max_x].copy()
        component_mask = labels[min_y:max_y, min_x:max_x] == component
        crop[:, :, 3] = np.where(component_mask, crop[:, :, 3], 0)
        frames.append(Image.fromarray(crop, "RGBA"))
    return frames


def fit_cells(source: Path, target: Path, cells: int, cell_size: int, bottom: int, margin: int, find_gaps: bool = False) -> None:
    image = Image.open(source).convert("RGBA")
    if find_gaps:
        frames = extract_largest_components(image, cells)
    else:
        boundaries = [round(image.width * index / cells) for index in range(cells + 1)]
        frames = []
        for index in range(cells):
            frame = image.crop((boundaries[index], 0, boundaries[index + 1], image.height))
            alpha = frame.getchannel("A")
            box = alpha.getbbox()
            frames.append(frame.crop(box) if box else frame)

    max_height = max(frame.height for frame in frames)
    max_width = max(frame.width for frame in frames)
    scale = min((bottom - margin) / max_height, (cell_size - margin * 2) / max_width)
    strip = Image.new("RGBA", (cell_size * cells, cell_size), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
        frame = frame.resize(size, Image.Resampling.LANCZOS)
        x = index * cell_size + (cell_size - frame.width) // 2
        y = bottom - frame.height
        strip.alpha_composite(frame, (x, y))
    strip.save(target, optimize=True)


def remove_connected_checkerboard(source: Path) -> Image.Image:
    original = Image.open(source).convert("RGBA")
    rgba = np.array(original)
    rgb = rgba[:, :, :3]
    bright_gray = (rgb.max(axis=2) - rgb.min(axis=2) < 10) & (rgb.mean(axis=2) > 205)
    rgba[:, :, 3] = np.where(bright_gray | (rgba[:, :, 3] == 0), 0, rgba[:, :, 3])
    return Image.fromarray(rgba, "RGBA")


def prepare_elites() -> None:
    path = ROOT / "assets/elites/trojan-elite-atlas-v10.png"
    source = ROOT / "tools/trojan-elite-generated-source-v10.png"
    transparent = remove_connected_checkerboard(source if source.exists() else path)
    temporary = path.with_name("trojan-elite-atlas-source-v10.png")
    transparent.save(temporary, optimize=True)
    fit_cells(temporary, path, cells=3, cell_size=512, bottom=490, margin=24, find_gaps=True)
    temporary.unlink()


def prepare_icons() -> None:
    for name in ("dodge-roll-v10.png", "ultimate-v10.png"):
        path = ROOT / "assets/ui" / name
        image = Image.open(path).convert("RGBA")
        image.thumbnail((256, 256), Image.Resampling.LANCZOS)
        image.save(path, optimize=True)


def prepare_heroes() -> None:
    animations = ROOT / "assets/animations"
    for stem in ("telamon", "achileon", "calchas"):
        source = animations / f"{stem}-strip.png"
        target = animations / f"{stem}-strip-v10.png"
        fit_cells(source, target, cells=4, cell_size=768, bottom=742, margin=28, find_gaps=True)


if __name__ == "__main__":
    prepare_icons()
    prepare_elites()
    prepare_heroes()
