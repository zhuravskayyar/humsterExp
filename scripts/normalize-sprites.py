#!/usr/bin/env python3
"""Normalize existing hamster sprite sheets into fixed-size transparent strips."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FRAME_W = 384
FRAME_H = 256
ALPHA_THRESHOLD = 8
MIN_COMPONENT_PIXELS = 96
MIN_COMPONENT_RATIO = 0.025
EDGE_SLIVER_RATIO = 0.35
MARKER_TOLERANCE = 8
FRAME_MARKER_COLOR = (255, 0, 255)  # pink/magenta: vertical cut marker between frames
GROUND_MARKER_COLOR = (0, 0, 255)  # blue: ground baseline marker inside a frame


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    mode: str
    src: str
    frames: int
    cols: int
    rows: int
    out: str


@dataclass(frozen=True)
class RawFrame:
    content: Image.Image | None
    ground_y: int | None = None


SHEETS = [
    SheetSpec("pixel", "idle", "assets/images/hamsters/pixel/idle/pixel_idle_improved_source.png", 4, 4, 1, "assets/images/hamsters/pixel/idle/pixel_idle_normalized.png"),
    SheetSpec("pixel", "attack", "assets/images/hamsters/pixel/attack/pixel_attack_improved_source.png", 4, 4, 1, "assets/images/hamsters/pixel/attack/pixel_attack_normalized.png"),
    SheetSpec("shurup", "idle", "assets/images/hamsters/shurup/idle/idle.png", 4, 4, 1, "assets/images/hamsters/shurup/idle/shurup_idle_normalized.png"),
    SheetSpec("shurup", "attack", "assets/images/hamsters/shurup/attack/atack.png", 6, 6, 1, "assets/images/hamsters/shurup/attack/shurup_attack_normalized.png"),
    SheetSpec("pliushka", "idle", "assets/images/hamsters/pliushka/idle/d47aa63d-40ae-4c22-aa55-a422666316a9.png", 4, 4, 1, "assets/images/hamsters/pliushka/idle/pliushka_idle_normalized.png"),
    SheetSpec("pliushka", "attack", "assets/images/hamsters/pliushka/attack/a1b2b61a-9439-41c4-9b03-2148fa912a96.png", 4, 4, 1, "assets/images/hamsters/pliushka/attack/pliushka_attack_normalized.png"),
    SheetSpec("bublyk", "idle", "assets/images/hamsters/bublyk/idle/7ca303bb-871a-4892-853d-ba2f5b441dd2.png", 4, 4, 1, "assets/images/hamsters/bublyk/idle/bublyk_idle_normalized.png"),
    SheetSpec("bublyk", "attack", "assets/images/hamsters/bublyk/attack/2e5a680e-804e-4c3c-81e0-7945504018a8.png", 6, 6, 1, "assets/images/hamsters/bublyk/attack/bublyk_attack_normalized.png"),
    SheetSpec("hryzun", "idle", "assets/images/hamsters/hryzun/idle/085e95b3-4243-4d59-9a8a-8ab0e6d3fd07.png", 4, 2, 2, "assets/images/hamsters/hryzun/idle/hryzun_idle_normalized.png"),
    SheetSpec("hryzun", "attack", "assets/images/hamsters/hryzun/attack/hryzun_attack_improved_source.png", 5, 5, 1, "assets/images/hamsters/hryzun/attack/hryzun_attack_normalized.png"),
    SheetSpec("iskra", "idle", "assets/images/hamsters/iskra/idle/iskra_idle_source.png", 4, 4, 1, "assets/images/hamsters/iskra/idle/iskra_idle_normalized.png"),
    SheetSpec("iskra", "attack", "assets/images/hamsters/iskra/attack/iskra_attack_source.png", 4, 4, 1, "assets/images/hamsters/iskra/attack/iskra_attack_normalized.png"),
    SheetSpec("krykhta", "idle", "assets/images/hamsters/krykhta/idle/krykhta_idle_source.png", 4, 4, 1, "assets/images/hamsters/krykhta/idle/krykhta_idle_normalized.png"),
    SheetSpec("krykhta", "attack", "assets/images/hamsters/krykhta/attack/krykhta_attack_source.png", 4, 4, 1, "assets/images/hamsters/krykhta/attack/krykhta_attack_normalized.png"),
    SheetSpec("tin", "idle", "assets/images/hamsters/tin/idle/17791034-2be3-4da1-90de-6ef13f6064da_no_bg.png", 4, 4, 1, "assets/images/hamsters/tin/idle/tin_idle_normalized.png"),
    SheetSpec("tin", "attack", "assets/images/hamsters/tin/attack/f001878f-710a-4f01-b1e9-21e363e9bbc8_no_bg.png", 4, 4, 1, "assets/images/hamsters/tin/attack/tin_attack_normalized.png"),
]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    return alpha.getbbox()


def is_marker_pixel(pixel: tuple[int, int, int, int], color: tuple[int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha <= ALPHA_THRESHOLD:
        return False
    if color == FRAME_MARKER_COLOR:
        return (
            (abs(red - color[0]) <= MARKER_TOLERANCE
             and abs(green - color[1]) <= MARKER_TOLERANCE
             and abs(blue - color[2]) <= MARKER_TOLERANCE)
            or (red >= 130 and blue >= 130 and green <= 130 and abs(red - blue) <= 80)
        )
    if color == GROUND_MARKER_COLOR:
        return (
            (abs(red - color[0]) <= MARKER_TOLERANCE
             and abs(green - color[1]) <= MARKER_TOLERANCE
             and abs(blue - color[2]) <= MARKER_TOLERANCE)
            or (blue >= 150 and red <= 120 and green <= 150 and blue > red + 45 and blue > green + 35)
        )
    return (
        abs(red - color[0]) <= MARKER_TOLERANCE
        and abs(green - color[1]) <= MARKER_TOLERANCE
        and abs(blue - color[2]) <= MARKER_TOLERANCE
    )


def marker_column_runs(image: Image.Image, color: tuple[int, int, int]) -> list[tuple[int, int]]:
    pixels = image.load()
    min_pixels = max(6, int(image.height * 0.18))
    runs: list[tuple[int, int]] = []
    start: int | None = None

    for x in range(image.width):
        count = sum(1 for y in range(image.height) if is_marker_pixel(pixels[x, y], color))
        is_marker_column = count >= min_pixels
        if is_marker_column and start is None:
            start = x
        elif not is_marker_column and start is not None:
            runs.append((start, x - 1))
            start = None

    if start is not None:
        runs.append((start, image.width - 1))
    return runs


def marker_slot_bounds(image: Image.Image, frames: int) -> list[tuple[int, int]] | None:
    runs = marker_column_runs(image, FRAME_MARKER_COLOR)
    if not runs:
        return None

    if len(runs) == frames - 1:
        bounds: list[tuple[int, int]] = []
        left = 0
        for start, end in runs:
            bounds.append((left, start))
            left = end + 1
        bounds.append((left, image.width))
    elif len(runs) == frames + 1:
        bounds = [(runs[index][1] + 1, runs[index + 1][0]) for index in range(frames)]
    else:
        raise SystemExit(
            f"Pink frame markers found, but count is wrong: expected {frames - 1} between-frame "
            f"markers or {frames + 1} outer+inner markers, got {len(runs)}"
        )

    if len(bounds) != frames or any(right <= left for left, right in bounds):
        raise SystemExit("Pink frame markers produced empty or invalid frame bounds")
    return bounds


def detect_ground_y(image: Image.Image) -> int | None:
    pixels = image.load()
    row_hits: list[int] = []
    min_pixels = max(4, int(image.width * 0.04))

    for y in range(image.height):
        count = sum(1 for x in range(image.width) if is_marker_pixel(pixels[x, y], GROUND_MARKER_COLOR))
        if count >= min_pixels:
            row_hits.append(y)

    if row_hits:
        return max(row_hits)

    loose_hits = [
        y
        for y in range(image.height)
        for x in range(image.width)
        if is_marker_pixel(pixels[x, y], GROUND_MARKER_COLOR)
    ]
    return max(loose_hits) if loose_hits else None


def remove_marker_pixels(image: Image.Image) -> Image.Image:
    cleaned = image.copy()
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            pixel = pixels[x, y]
            if (
                is_marker_pixel(pixel, FRAME_MARKER_COLOR)
                or is_marker_pixel(pixel, GROUND_MARKER_COLOR)
            ):
                pixels[x, y] = (0, 0, 0, 0)
    return cleaned


def horizontal_bounds(image: Image.Image, frames: int) -> list[int]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    counts = [
        sum(1 for y in range(image.height) if pixels[x, y] > ALPHA_THRESHOLD)
        for x in range(image.width)
    ]
    expected_width = image.width / frames
    bounds = [0]

    for index in range(1, frames):
        expected = index * expected_width
        radius = max(24, int(expected_width * 0.22))
        left = max(bounds[-1] + 8, int(expected - radius))
        right = min(image.width - 8, int(expected + radius))
        if left >= right:
            bounds.append(round(expected))
            continue

        def score(x: int) -> tuple[int, int]:
            window_sum = sum(counts[max(0, x - 3):min(image.width, x + 4)])
            return window_sum, abs(x - round(expected))

        bounds.append(min(range(left, right + 1), key=score))

    bounds.append(image.width)
    return bounds


def remove_small_components(image: Image.Image) -> Image.Image:
    width, height = image.size
    alpha = image.getchannel("A")
    alpha_pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[dict[str, object]] = []

    for y in range(height):
        row_offset = y * width
        for x in range(width):
            index = row_offset + x
            if visited[index] or alpha_pixels[x, y] <= ALPHA_THRESHOLD:
                visited[index] = 1
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[index] = 1
            pixels_in_component: list[int] = []
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                cx, cy = queue.popleft()
                cindex = cy * width + cx
                pixels_in_component.append(cindex)
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if visited[nindex]:
                        continue
                    visited[nindex] = 1
                    if alpha_pixels[nx, ny] > ALPHA_THRESHOLD:
                        queue.append((nx, ny))

            components.append({
                "pixels": pixels_in_component,
                "area": len(pixels_in_component),
                "bbox": (min_x, min_y, max_x + 1, max_y + 1),
            })

    if not components:
        return image

    largest = max(component["area"] for component in components)
    threshold = max(MIN_COMPONENT_PIXELS, int(largest * MIN_COMPONENT_RATIO))
    largest_index = max(range(len(components)), key=lambda index: components[index]["area"])
    keep = bytearray(width * height)
    for index, component in enumerate(components):
        area = component["area"]
        left, _, right, _ = component["bbox"]
        touches_edge = left <= 1 or right >= width - 1
        edge_sliver = touches_edge and area < largest * EDGE_SLIVER_RATIO and index != largest_index
        if area >= threshold and not edge_sliver:
            for pixel_index in component["pixels"]:
                keep[pixel_index] = 1

    cleaned = image.copy()
    pixels = cleaned.load()
    for y in range(height):
        for x in range(width):
            if not keep[y * width + x]:
                pixels[x, y] = (0, 0, 0, 0)
    return cleaned


def split_sheet(spec: SheetSpec) -> list[RawFrame]:
    image = Image.open(ROOT / spec.src).convert("RGBA")
    frame_h = image.height / spec.rows
    frames: list[RawFrame] = []
    marker_bounds = marker_slot_bounds(image, spec.frames) if spec.rows == 1 else None
    row_bounds = None if marker_bounds else horizontal_bounds(image, spec.frames) if spec.rows == 1 else None

    for index in range(spec.frames):
        row = index // spec.cols
        if marker_bounds:
            left, right = marker_bounds[index]
            top = 0
            bottom = image.height
        elif row_bounds:
            left = row_bounds[index]
            right = row_bounds[index + 1]
            top = round(row * frame_h)
            bottom = round((row + 1) * frame_h)
        else:
            frame_w = image.width / spec.cols
            col = index % spec.cols
            left = round(col * frame_w)
            right = round((col + 1) * frame_w)
            top = round(row * frame_h)
            bottom = round((row + 1) * frame_h)
        slot = image.crop((left, top, right, bottom))
        ground_y = detect_ground_y(slot)
        slot = remove_marker_pixels(slot)
        slot = remove_small_components(slot)
        bbox = alpha_bbox(slot)
        if bbox:
            content = slot.crop(bbox)
            content_ground_y = ground_y - bbox[1] + 1 if ground_y is not None else None
            frames.append(RawFrame(content, content_ground_y))
        else:
            frames.append(RawFrame(None))

    return frames


def layout_height(raw: RawFrame) -> int:
    if raw.content is None:
        return 0
    ground_y = raw.ground_y if raw.ground_y is not None else raw.content.height
    return max(raw.content.height, ground_y)


def compose_frame(raw: RawFrame, scale: float) -> Image.Image:
    frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    if raw.content is None:
        return frame

    width = max(1, round(raw.content.width * scale))
    height = max(1, round(raw.content.height * scale))
    resized = raw.content.resize((width, height), Image.Resampling.NEAREST)
    ground_y = raw.ground_y if raw.ground_y is not None else raw.content.height
    ground_y = max(1, ground_y)
    ground = max(1, round(ground_y * scale))
    x = (FRAME_W - width) // 2
    y = FRAME_H - ground
    if y + height > FRAME_H:
        y = FRAME_H - height
    y = max(0, y)
    frame.alpha_composite(resized, (x, y))
    return frame


def render_strip(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_W, 0))
    return strip


def alpha_area(frame: Image.Image) -> int:
    alpha = frame.getchannel("A")
    return sum(1 for value in alpha.tobytes() if value > ALPHA_THRESHOLD)


def repair_effect_only_attack_frames(frames: list[Image.Image]) -> list[Image.Image]:
    if len(frames) < 2:
        return frames

    areas = [alpha_area(frame) for frame in frames]
    heights = [
        (bbox[3] - bbox[1]) if (bbox := alpha_bbox(frame)) else 0
        for frame in frames
    ]
    max_area = max(areas)
    max_height = max(heights)
    if max_area <= 0 or max_height <= 0:
        return frames

    repaired: list[Image.Image] = []
    last_body_frame: Image.Image | None = None
    for frame, area, height in zip(frames, areas, heights):
        has_body = area >= max_area * 0.45 and height >= max_height * 0.68
        if has_body:
            last_body_frame = frame
            repaired.append(frame)
            continue

        if last_body_frame is None:
            repaired.append(frame)
            continue

        merged = last_body_frame.copy()
        merged.alpha_composite(frame)
        repaired.append(merged)

    return repaired


def paint_checkerboard(image: Image.Image, tile: int = 16) -> None:
    draw = ImageDraw.Draw(image)
    colors = ((240, 243, 246, 255), (225, 230, 235, 255))
    for top in range(0, image.height, tile):
        for left in range(0, image.width, tile):
            draw.rectangle(
                (left, top, left + tile - 1, top + tile - 1),
                fill=colors[((left // tile) + (top // tile)) % 2],
            )


def render_preview(slug: str, mode_frames: dict[str, list[Image.Image]]) -> None:
    gap = 8
    label_h = 24
    modes = list(mode_frames.items())
    max_frames = max(len(frames) for _, frames in modes)
    width = max_frames * FRAME_W + (max_frames - 1) * gap
    height = len(modes) * (FRAME_H + label_h) + (len(modes) - 1) * gap
    sheet = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    paint_checkerboard(sheet)
    draw = ImageDraw.Draw(sheet)

    y = 0
    for mode, frames in modes:
        draw.rectangle((0, y, width, y + label_h - 1), fill=(43, 29, 22, 235))
        draw.text((8, y + 5), f"{slug} {mode}", fill=(246, 231, 199, 255))
        y += label_h
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * (FRAME_W + gap), y))
        y += FRAME_H + gap

    out = ROOT / "artifacts" / "sprites" / f"{slug}-normalized-preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize hamster sprite sheets into fixed-size transparent strips.")
    parser.add_argument("--slug", help="Only normalize one hamster slug, for example pixel.")
    parser.add_argument("--mode", choices=["idle", "attack"], help="Only normalize one animation mode.")
    args = parser.parse_args()

    by_slug: dict[str, list[SheetSpec]] = {}
    for spec in SHEETS:
        if args.slug and spec.slug != args.slug:
            continue
        if args.mode and spec.mode != args.mode:
            continue
        by_slug.setdefault(spec.slug, []).append(spec)

    for slug, specs in by_slug.items():
        raw: dict[str, list[RawFrame]] = {spec.mode: split_sheet(spec) for spec in specs}
        normalized: dict[str, list[Image.Image]] = {}

        for spec in specs:
            contents = [frame for frame in raw[spec.mode] if frame.content is not None]
            if not contents:
                raise SystemExit(f"No visible pixels found for {slug}.{spec.mode}")

            max_w = max(frame.content.width for frame in contents if frame.content is not None)
            max_h = max(layout_height(frame) for frame in contents)
            scale = min(FRAME_W / max_w, FRAME_H / max_h)
            frames = [compose_frame(frame, scale) for frame in raw[spec.mode]]
            if spec.mode == "attack":
                frames = repair_effect_only_attack_frames(frames)
            normalized[spec.mode] = frames
            out = ROOT / spec.out
            out.parent.mkdir(parents=True, exist_ok=True)
            render_strip(frames).save(out)
            print(f"{slug}.{spec.mode}: {out.relative_to(ROOT)} {FRAME_W * len(frames)}x{FRAME_H}")

        render_preview(slug, normalized)


if __name__ == "__main__":
    main()
