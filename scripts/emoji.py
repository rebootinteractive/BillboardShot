#!/usr/bin/env python3
"""
Turn a Fluent Emoji (Flat) into a starting grid for an art library picture.

    python3 scripts/emoji.py "Spouting whale" 16 14 3
    python3 scripts/emoji.py "Spouting whale" 16 14 3 --json whale "Whale" animal

The result is a starting point, never a finished picture: downsampling leaves stray
pixels and merges details, so always clean the grid by hand afterwards and check it with
`npm run art -- show <id>`. See docs/level-design-strategy.md, section 3.

Needs Pillow (`pip3 install pillow`) and ImageMagick (`brew install imagemagick`).
Fluent Emoji is MIT licensed; every converted picture records its source and url.
"""
import io
import json
import subprocess
import sys
import urllib.parse

from PIL import Image

SUPER = 8  # samples per cell, per axis


def fetch(asset):
    """The emoji as a 512px RGBA image, or None when the asset name is wrong."""
    slug = asset.lower().replace(' ', '_').replace('-', '_').replace("'", '')
    url = (f'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/'
           f'{urllib.parse.quote(asset)}/Flat/{slug}_flat.svg')
    svg = subprocess.run(['curl', '-sL', '--max-time', '30', url], capture_output=True).stdout
    if not svg.lstrip().startswith(b'<'):
        return None, url
    png = subprocess.run(['magick', '-background', 'none', '-density', '600', 'svg:-',
                          '-resize', '512x512', 'png:-'], input=svg, capture_output=True).stdout
    return (Image.open(io.BytesIO(png)).convert('RGBA') if png else None), url


def sample(img, w, h):
    """Average color and alpha coverage for each cell of a w x h grid."""
    box = img.getbbox()
    if box:
        img = img.crop(box)
    img = img.resize((w * SUPER, h * SUPER), Image.LANCZOS)
    px = img.load()
    grid = []
    for r in range(h):
        row = []
        for c in range(w):
            rs = gs = bs = n = 0
            cover = 0.0
            for y in range(r * SUPER, (r + 1) * SUPER):
                for x in range(c * SUPER, (c + 1) * SUPER):
                    red, green, blue, alpha = px[x, y]
                    cover += alpha / 255
                    if alpha > 140:
                        rs, gs, bs, n = rs + red, gs + green, bs + blue, n + 1
            row.append(((rs // n, gs // n, bs // n) if n else (0, 0, 0), cover / (SUPER * SUPER)))
        grid.append(row)
    return grid


def largest_island(mask, w, h):
    """The biggest connected run of filled cells; the rest is dropped as specks."""
    seen = [[False] * w for _ in range(h)]
    best = []
    for r in range(h):
        for c in range(w):
            if not mask[r][c] or seen[r][c]:
                continue
            piece, stack, seen[r][c] = [], [(r, c)], True
            while stack:
                y, x = stack.pop()
                piece.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((ny, nx))
            if len(piece) > len(best):
                best = piece
    return set(best)


def kmeans(points, k, rounds=25):
    """Group cell colors into k color groups."""
    if len(points) <= k:
        return list(range(len(points))), list(points)
    step = max(1, len(points) // k)
    centers = [points[i * step] for i in range(k)]
    labels = [0] * len(points)
    for _ in range(rounds):
        for i, p in enumerate(points):
            labels[i] = min(range(k), key=lambda j: sum((p[d] - centers[j][d]) ** 2 for d in range(3)))
        for j in range(k):
            members = [points[i] for i in range(len(points)) if labels[i] == j]
            if members:
                centers[j] = tuple(sum(m[d] for m in members) // len(members) for d in range(3))
    return labels, centers


def convert(asset, w, h, k, threshold=0.42):
    img, url = fetch(asset)
    if img is None:
        return None, url
    grid = sample(img, w, h)
    mask = [[grid[r][c][1] >= threshold for c in range(w)] for r in range(h)]
    keep = largest_island(mask, w, h)
    points = [grid[r][c][0] for r in range(h) for c in range(w) if (r, c) in keep]
    spots = [(r, c) for r in range(h) for c in range(w) if (r, c) in keep]
    if not points:
        return None, url
    labels, centers = kmeans(points, k)
    counts = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1
    order = sorted(counts, key=lambda j: -counts[j])
    rank = {o: i + 1 for i, o in enumerate(order)}
    art = [['.'] * w for _ in range(h)]
    for (r, c), label in zip(spots, labels):
        art[r][c] = str(rank[label])
    hexes = {rank[o]: '#%02x%02x%02x' % centers[o] for o in order}
    return (
        [''.join(row) for row in art],
        hexes,
        {rank[o]: counts[o] for o in order},
        url,
    ), url


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 4:
        print(__doc__)
        return 1
    asset, w, h, k = args[0], int(args[1]), int(args[2]), int(args[3])
    result, url = convert(asset, w, h, k)
    if result is None:
        print(f'FAILED: no Flat svg for "{asset}"\n  tried {url}')
        return 1
    art, hexes, counts, url = result
    if '--json' in sys.argv:
        rest = sys.argv[sys.argv.index('--json') + 1:]
        pid, name = rest[0], rest[1]
        tags = rest[2:] or ['object']
        print(json.dumps({
            'id': pid, 'name': name, 'tags': tags, 'status': 'draft',
            'origin': {'method': 'converted', 'source': 'Fluent Emoji (Flat)',
                       'license': 'MIT', 'url': url},
            'art': art,
            'groups': {str(g): {'part': f'TODO ({hexes[g]}, {counts[g]}px)', 'suggest': ['white']}
                       for g in sorted(hexes)},
        }, indent=2))
        return 0
    for row in art:
        print('  ' + row.replace('.', '·'))
    print(' groups: ' + ', '.join(f'{g}={hexes[g]} ({counts[g]}px)' for g in sorted(hexes)))
    print(f' pixels: {sum(1 for r in art for ch in r if ch != ".")}  size: {w}x{h}')
    print(f' url: {url}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
