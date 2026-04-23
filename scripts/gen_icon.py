"""Generate a 1024x1024 macOS-style app icon for Typora Clone."""
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
draw = ImageDraw.Draw(out)

# ---- rounded square bg with subtle diagonal gradient ----
# First fill solid bg, then overlay a radial-ish gradient for depth
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

# ---- subtle top highlight strip (Big Sur style inner glow) ----
highlight = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
hi_draw = ImageDraw.Draw(highlight)
hi_draw.rounded_rectangle(
    (0, 0, SIZE, int(SIZE * 0.35)),
    radius=CORNER_RADIUS,
    fill=(255, 255, 255, 18),
)
# Feather the highlight by compositing with mask
hl_masked = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
hl_masked.paste(highlight, (0, 0), mask)
out = Image.alpha_composite(out, hl_masked)

# ---- draw the monogram: "M" + down arrow ----
# Use SF Pro Rounded for a soft, product-app feel
font_path = '/System/Library/Fonts/SFNSRounded.ttf'
# Heavy weight (size index) — PIL picks default; use index 0 (regular) then overlay stroke
m_font = ImageFont.truetype(font_path, size=560)
arrow_font = ImageFont.truetype(font_path, size=260)

draw = ImageDraw.Draw(out)

# Measure M
m_text = 'M'
m_bbox = draw.textbbox((0, 0), m_text, font=m_font)
m_w = m_bbox[2] - m_bbox[0]
m_h = m_bbox[3] - m_bbox[1]
m_x = (SIZE - m_w) // 2 - m_bbox[0]
# Slightly above center to leave room for the arrow
m_y = int(SIZE * 0.22) - m_bbox[1]

# Draw a subtle shadow beneath M
shadow_color = (0, 0, 0, 160)
shadow_offset = 6
draw.text((m_x + shadow_offset, m_y + shadow_offset), m_text, font=m_font, fill=shadow_color)
draw.text((m_x, m_y), m_text, font=m_font, fill=FG)

# Down arrow (using an arrow glyph drawn as a shape, not text — more reliable)
arrow_cy = int(SIZE * 0.78)
arrow_half_w = int(SIZE * 0.10)
arrow_half_h = int(SIZE * 0.06)
cx = SIZE // 2
stem_half_w = int(SIZE * 0.028)
stem_top = int(SIZE * 0.56)

# Stem
draw.rounded_rectangle(
    (cx - stem_half_w, stem_top, cx + stem_half_w, arrow_cy + 4),
    radius=stem_half_w,
    fill=ACCENT,
)
# Arrowhead (triangle)
head = [
    (cx - arrow_half_w, arrow_cy),
    (cx + arrow_half_w, arrow_cy),
    (cx, arrow_cy + arrow_half_h * 2),
]
draw.polygon(head, fill=ACCENT)

# Save
dest_dir = '/Users/andy.zhanggx/projects/typora/.worktrees/v0.1-mvp/src-tauri/icons'
os.makedirs(dest_dir, exist_ok=True)
out.save(os.path.join(dest_dir, 'icon.png'), 'PNG')
print(f'wrote {dest_dir}/icon.png')
