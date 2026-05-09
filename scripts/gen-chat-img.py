"""Generate Ocean Chat P2P communication illustration."""
from PIL import Image, ImageDraw
import os

W, H = 440, 180
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

try:
    from PIL import ImageFont
    font = ImageFont.truetype("arial.ttf", 11)
    font_sm = ImageFont.truetype("arial.ttf", 9)
except Exception:
    font = ImageFont.load_default()
    font_sm = font

# ── Agent A box ──
ax1, ay1 = 20, 30
dra = draw
dra.rounded_rectangle([ax1, ay1, ax1 + 90, ay1 + 110], radius=14,
                      fill=(14, 30, 50, 240), outline=(56, 189, 248, 60), width=1)
dra.ellipse([ax1 + 28, ay1 + 18, ax1 + 62, ay1 + 52], fill=(56, 189, 248, 40))
dra.text((ax1 + 45, ay1 + 35), "烙", anchor="mm", fill=(255, 255, 255, 255), font=font)
dra.text((ax1 + 45, ay1 + 64), "Agent A", anchor="mt", fill=(148, 163, 184, 255), font=font)
dra.text((ax1 + 45, ay1 + 82), "OpenID . Ed25519", anchor="mt", fill=(61, 74, 92, 255), font=font_sm)

# ── Agent B box ──
bx1, by1 = W - 110, 30
dra.rounded_rectangle([bx1, by1, bx1 + 90, by1 + 110], radius=14,
                      fill=(14, 30, 50, 240), outline=(34, 197, 94, 60), width=1)
dra.ellipse([bx1 + 28, by1 + 18, bx1 + 62, by1 + 52], fill=(34, 197, 94, 40))
dra.text((bx1 + 45, by1 + 35), "烙", anchor="mm", fill=(255, 255, 255, 255), font=font)
dra.text((bx1 + 45, by1 + 64), "Agent B", anchor="mt", fill=(148, 163, 184, 255), font=font)
dra.text((bx1 + 45, by1 + 82), "OpenID . Ed25519", anchor="mt", fill=(61, 74, 92, 255), font=font_sm)

# ── OceanBus Cloud ──
cx2, cy2 = W // 2, 80
cloud_pts = [
    cx2 - 55, cy2 + 10, cx2 - 60, cy2 - 5, cx2 - 40, cy2 - 25,
    cx2 - 10, cy2 - 35, cx2 + 20, cy2 - 32, cx2 + 48, cy2 - 20,
    cx2 + 60, cy2, cx2 + 55, cy2 + 15, cx2 + 30, cy2 + 25,
    cx2, cy2 + 20, cx2 - 30, cy2 + 22
]
dra.polygon(cloud_pts, fill=(56, 189, 248, 15), outline=(56, 189, 248, 30), width=1)
dra.text((cx2, cy2 - 2), "OceanBus", anchor="mm", fill=(56, 189, 248, 180), font=font)

# ── Connection lines (int coords) ──
def iline(draw, xy, **kw):
    """Draw line with integer coords."""
    ixy = [(int(p[0]), int(p[1])) for p in xy]
    draw.line(ixy, **kw)

iline(dra, [(ax1 + 90, ay1 + 55), (cx2 - 55, cy2 - 15)], fill=(56, 189, 248, 50), width=1)
iline(dra, [(ax1 + 90, ay1 + 55), (cx2 - 55, cy2 + 8)], fill=(56, 189, 248, 50), width=1)
iline(dra, [(cx2 + 55, cy2 - 15), (bx1, by1 + 55)], fill=(34, 197, 94, 50), width=1)
iline(dra, [(cx2 + 55, cy2 + 8), (bx1, by1 + 55)], fill=(34, 197, 94, 50), width=1)

# ── Lock icons ──
for lx, ly, col in [(ax1 + 110, ay1 + 32, (56, 189, 248, 150)), (bx1 - 10, by1 + 32, (34, 197, 94, 150))]:
    dra.rectangle([lx - 3, ly, lx + 3, ly + 8], fill=col)
    dra.arc([lx - 4, ly - 4, lx + 4, ly + 2], start=0, end=180, fill=col, width=1)

# ── Labels ──
dra.text((ax1 + 45, ay1 + 105), "send()", anchor="mt", fill=(56, 189, 248, 150), font=font_sm)
dra.text((bx1 + 45, by1 + 105), "sync()", anchor="mt", fill=(34, 197, 94, 150), font=font_sm)
dra.text((cx2, cy2 - 42), "E2E encrypted . platform-blind", anchor="ms", fill=(61, 74, 92, 180), font=font_sm)

# ── Chat bubbles ──
dra.rounded_rectangle([ax1 + 5, ay1 + 125, ax1 + 75, ay1 + 145], radius=10,
                       fill=(56, 189, 248, 10), outline=(56, 189, 248, 30), width=1)
dra.text((ax1 + 40, ay1 + 135), "Hello!", anchor="mm", fill=(148, 163, 184, 200), font=font_sm)
dra.rounded_rectangle([bx1 + 15, by1 + 125, bx1 + 85, by1 + 145], radius=10,
                       fill=(34, 197, 94, 10), outline=(34, 197, 94, 30), width=1)
dra.text((bx1 + 50, by1 + 135), "Got it!", anchor="mm", fill=(148, 163, 184, 200), font=font_sm)

# ── Save ──
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'oceanchat-illustration.png')
img.save(out, 'PNG')
print(f"Saved: {out} ({W}x{H})")
