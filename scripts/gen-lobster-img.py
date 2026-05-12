"""Generate vintage nautical illustration for Captain Lobster."""
from PIL import Image, ImageDraw, ImageFont
import math, os

W, H = 480, 420
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ── Parchment circle background ──
cx, cy, r = W // 2, H // 2 - 10, 195
for i in range(r, 0, -1):
    a = int(60 * (1 - i / r))
    draw.ellipse([cx - i, cy - i, cx + i, cy + i],
                 fill=(252, 242, 215, a))

# Darker rim
for i in range(6):
    a = int(25 + 10 * (1 - i / 6))
    draw.ellipse([cx - r - i, cy - r - i, cx + r + i, cy + r + i],
                 outline=(139, 105, 20, a), width=1)

# ── Compass rose ──
def compass_poly(cx, cy, size, angle=0):
    pts = []
    for i in range(4):
        a = angle + i * math.pi / 2
        pts.append((cx + size * math.cos(a), cy - size * math.sin(a)))
        a += math.pi / 8
        pts.append((cx + size * 0.35 * math.cos(a), cy - size * 0.35 * math.sin(a)))
        a += math.pi / 8
        pts.append((cx + size * 0.15 * math.cos(a), cy - size * 0.15 * math.sin(a)))
    return pts

# N/S pointers (dark)
pts_ns = compass_poly(cx, cy - 10, 100)
draw.polygon(pts_ns, fill=(139, 105, 20, 180))
pts_ns_small = compass_poly(cx, cy - 10, 55)
draw.polygon(pts_ns_small, fill=(180, 140, 30, 200))

# E/W pointers (lighter)
pts_ew = compass_poly(cx, cy - 10, 100, angle=math.pi / 4)
draw.polygon(pts_ew, fill=(180, 150, 60, 120))
pts_ew_small = compass_poly(cx, cy - 10, 55, angle=math.pi / 4)
draw.polygon(pts_ew_small, fill=(200, 175, 100, 150))

# Center dot
draw.ellipse([cx - 6, cy - 16, cx + 6, cy - 4], fill=(100, 60, 10, 255))

# ── Lobster body ──
lx, ly = cx - 35, cy - 130
# Main body
draw.ellipse([lx + 5, ly + 18, lx + 65, ly + 52], fill=(195, 45, 35, 255))
draw.ellipse([lx + 5, ly + 18, lx + 65, ly + 52], outline=(120, 25, 20, 200), width=2)
# Head
draw.ellipse([lx + 8, ly + 2, lx + 62, ly + 28], fill=(220, 55, 40, 255))
draw.ellipse([lx + 8, ly + 2, lx + 62, ly + 28], outline=(120, 25, 20, 200), width=2)
# Eyes
draw.ellipse([lx + 16, ly + 8, lx + 30, ly + 20], fill=(255, 255, 255, 255))
draw.ellipse([lx + 19, ly + 10, lx + 27, ly + 18], fill=(20, 20, 20, 255))
draw.ellipse([lx + 40, ly + 8, lx + 54, ly + 20], fill=(255, 255, 255, 255))
draw.ellipse([lx + 43, ly + 10, lx + 51, ly + 18], fill=(20, 20, 20, 255))
# Antennae
for side, sx in [(-1, lx + 28), (1, lx + 42)]:
    for j in range(2):
        ex = sx + side * (25 + j * 8)
        ey = ly - 5 - j * 6
        mid_x = sx + side * 12
        mid_y = ly - 2
        for t in range(20):
            t_n = t / 19
            px = sx + (mid_x - sx) * t_n * 2 - (sx + (mid_x - sx) * 2 - ex) * (t_n ** 2)
            py = ly - t_n * 16
            if 0 <= px < W and 0 <= py + j * 2 < H:
                draw.ellipse([px - 1, py + j * 2 - 1, px + 1, py + j * 2 + 1],
                            fill=(195, 45, 35, 200))
# Claws
for side in [-1, 1]:
    bx = lx + (35 if side > 0 else 35)
    by = ly + 22
    cx1 = bx + side * 30
    claw_pts = [(bx, by), (bx + side * 5, by - 8), (cx1, by - 15),
                (cx1 + side * 12, by - 8), (bx + side * 5, by + 8)]
    draw.polygon(claw_pts, fill=(220, 60, 40, 240))
    draw.polygon(claw_pts, outline=(120, 25, 20, 200), width=1)

# Captain hat
hx, hy = lx + 22, ly - 8
draw.rectangle([hx - 6, hy - 10, hx + 24, hy + 6], fill=(30, 30, 50, 255))
draw.rectangle([hx - 10, hy - 3, hx + 28, hy + 4], fill=(25, 25, 45, 255))
# Gold badge
draw.ellipse([hx + 6, hy - 8, hx + 14, hy - 2], fill=(251, 191, 36, 255))

# ── Ship silhouette ──
sx, sy = cx - 160, cy + 110
# Hull
draw.polygon([(sx, sy + 15), (sx + 15, sy), (sx + 55, sy), (sx + 70, sy + 15)],
             fill=(60, 40, 20, 160))
# Masts
for mx in [sx + 25, sx + 45]:
    draw.rectangle([mx - 1, sy - 30, mx + 1, sy], fill=(50, 35, 20, 180))
# Sails
draw.polygon([(sx + 25, sy - 28), (sx + 55, sy - 12), (sx + 25, sy - 4)],
             fill=(240, 230, 200, 180))
draw.polygon([(sx + 45, sy - 28), (sx + 15, sy - 14), (sx + 45, sy - 5)],
             fill=(230, 220, 190, 160))

# Small second ship
sx2, sy2 = cx + 110, cy + 115
draw.polygon([(sx2, sy2 + 10), (sx2 + 10, sy2), (sx2 + 35, sy2), (sx2 + 45, sy2 + 10)],
             fill=(60, 40, 20, 100))
draw.rectangle([sx2 + 15, sy2 - 18, sx2 + 17, sy2], fill=(50, 35, 20, 120))
draw.polygon([(sx2 + 17, sy2 - 17), (sx2 + 40, sy2 - 5), (sx2 + 17, sy2 - 2)],
             fill=(240, 230, 200, 120))

# ── Waves ──
for row, (wy, amp, alpha) in enumerate([
    (cy + 130, 5, 100), (cy + 139, 4, 80), (cy + 147, 3, 60)
]):
    pts = []
    for x in range(W):
        y = wy + int(amp * math.sin(x / 30 + row))
        pts.append((x, y))
    pts.append((W, H))
    pts.append((0, H))
    draw.polygon(pts, fill=(70, 120, 160, alpha))

# ── Sea monster hint ──
mx2, my2 = cx + 50, cy + 155
for i in range(4):
    draw.arc([mx2 + i * 8, my2 - 8 - i * 3, mx2 + 20 + i * 8, my2 + 8 + i * 5],
             start=0, end=180, fill=(30, 80, 50, 120 - i * 20), width=2)

# ── Decorative border dots ──
for angle in range(0, 360, 15):
    rad = angle * math.pi / 180
    bx2 = cx + (r - 14) * math.cos(rad)
    by2 = cy + (r - 14) * math.sin(rad)
    draw.ellipse([bx2 - 1.5, by2 - 1.5, bx2 + 1.5, by2 + 1.5],
                 fill=(139, 105, 20, 100))

# ── Dashed route lines ──
dash_pts = [(cx + 20, cy - 60), (cx + 80, cy - 20), (cx + 100, cy + 40)]
for i in range(len(dash_pts) - 1):
    x1, y1 = dash_pts[i]
    x2, y2 = dash_pts[i + 1]
    segments = 12
    for s in range(segments):
        if s % 2 == 0:
            t0, t1 = s / segments, (s + 1) / segments
            draw.line([(int(x1 + (x2 - x1) * t0), int(y1 + (y2 - y1) * t0)),
                      (int(x1 + (x2 - x1) * t1), int(y1 + (y2 - y1) * t1))],
                     fill=(139, 105, 20, 60), width=1)

# ── Title banner ──
banner_y = cy + r - 30
draw.rectangle([cx - 130, banner_y - 2, cx + 130, banner_y + 18],
               fill=(252, 242, 215, 200))
draw.rectangle([cx - 130, banner_y - 2, cx + 130, banner_y + 18],
               outline=(139, 105, 20, 100), width=1)

# Text (will try to use font; fallback to nothing)
try:
    font = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()
draw.text((cx, banner_y + 3), "CAPTAIN LOBSTER", fill=(80, 50, 15, 255),
          anchor="mt", font=font)

# ── Save ──
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lobster-illustration.png')
img.save(out, 'PNG')
print(f"Saved: {out} ({W}x{H})")
