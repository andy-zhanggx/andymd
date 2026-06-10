"""Generate a 1024x1024 macOS-style app icon for AndyMD: the `andy.md` filename wordmark."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 1024
# macOS Big Sur rounded-square: superellipse approximation with ~22.5% corner radius
CORNER_RADIUS = int(SIZE * 0.225)
BG = (28, 28, 32, 255)           # deep neutral dark — close to macOS dark-mode chrome
BG_ACCENT = (56, 56, 64, 255)    # subtle gradient stop
ACCENT = (10, 132, 255, 255)     # macOS system blue
FG = (240, 240, 240, 255)        # near-white

out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

# ---- rounded square bg with subtle diagonal gradient ----
mask = Image.new('L', (SIZE, SIZE), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle((0, 0, SIZE, SIZE), radius=CORNER_RADIUS, fill=255)

# gradient layer: top-left lighter, bottom-right darker
grad = Image.new('RGBA', (SIZE, SIZE), BG)
grad_px = grad.load()
for y in range(SIZE):
    for x in range(SIZE):
        t = (x + y) / (2 * SIZE)  # 0 at top-left, 1 at bottom-right
        r = int(BG_ACCENT[0] * (1 - t) + BG[0] * t)
        g = int(BG_ACCENT[1] * (1 - t) + BG[1] * t)
        b = int(BG_ACCENT[2] * (1 - t) + BG[2] * t)
        grad_px[x, y] = (r, g, b, 255)

out.paste(grad, (0, 0), mask)

# ---- subtle top highlight, fading to transparent (Big Sur style inner glow) ----
highlight = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
hi_px = highlight.load()
fade_h = int(SIZE * 0.40)
for y in range(fade_h):
    alpha = int(14 * (1 - y / fade_h))
    for x in range(SIZE):
        hi_px[x, y] = (255, 255, 255, alpha)
hl_masked = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
hl_masked.paste(highlight, (0, 0), mask)
out = Image.alpha_composite(out, hl_masked)

# ---- draw the wordmark: "andy" (white) + ".md" (blue), SF Mono ----
font_path = '/System/Library/Fonts/SFNSMono.ttf'
font_size = 196
font = ImageFont.truetype(font_path, size=font_size)
try:
    font.set_variation_by_name('Semibold')
except Exception:
    pass

draw = ImageDraw.Draw(out)

name_text = 'andy'
dot_text = '.'
md_text = 'md'
# Tighten the mono advance around the dot — full mono cells read too loose at icon scale
TIGHTEN = int(font_size * 0.14)
name_w = draw.textlength(name_text, font=font)
dot_w = draw.textlength(dot_text, font=font)
md_w = draw.textlength(md_text, font=font)

x_dot_off = name_w - TIGHTEN
x_md_off = x_dot_off + dot_w - TIGHTEN
total_w = x_md_off + md_w

x = (SIZE - total_w) / 2
# Center vertically so the wordmark sits optically centered
bbox = draw.textbbox((0, 0), name_text + dot_text + md_text, font=font)
text_h = bbox[3] - bbox[1]
y = (SIZE - text_h) / 2 - bbox[1]

shadow_color = (0, 0, 0, 160)
shadow_offset = 6
for seg_text, seg_x, color in (
    (name_text, x, FG),
    (dot_text, x + x_dot_off, ACCENT),
    (md_text, x + x_md_off, ACCENT),
):
    draw.text((seg_x + shadow_offset, y + shadow_offset), seg_text, font=font, fill=shadow_color)
    draw.text((seg_x, y), seg_text, font=font, fill=color)

# Save
dest_dir = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
dest_dir = os.path.abspath(dest_dir)
os.makedirs(dest_dir, exist_ok=True)
out.save(os.path.join(dest_dir, 'icon.png'), 'PNG')
print(f'wrote {dest_dir}/icon.png')
