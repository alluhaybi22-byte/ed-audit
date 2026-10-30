"""Rebuild the committed Windows icon with Python and Pillow (optional)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
image = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((8, 8, 504, 504), radius=100, fill='#103e43')
draw.line([(62, 276), (153, 276), (202, 170), (267, 356), (317, 236), (351, 276), (450, 276)],
          fill='#ffffff', width=26, joint='curve')
draw.ellipse((418, 75, 454, 111), fill='#b6e5d7')
(root / 'build').mkdir(exist_ok=True)
image.save(root / 'desktop/icon.png')
image.save(root / 'build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
