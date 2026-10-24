#!/bin/zsh
# Builds "Sree Deck.app" (Swift panel + bundled Node host) and installs it to ~/Applications.
#   ./scripts/build-app.sh            build + install + (re)launch
set -euo pipefail
cd "${0:A:h}/.."
APP="build/Sree Deck.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/host"

swiftc -O app/main.swift -o "$APP/Contents/MacOS/SreeDeck" -framework AppKit -framework Carbon

(cd host && npm install --silent --omit=dev)
cp host/*.js host/package.json "$APP/Contents/Resources/host/"
cp -R host/node_modules "$APP/Contents/Resources/host/"

# app icon from the 🎛 emoji
python3 - <<'EOF'
from PIL import Image, ImageDraw, ImageFont
import os, subprocess
base = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); d = ImageDraw.Draw(base)
d.rounded_rectangle([64, 64, 960, 960], radius=200, fill=(0x30, 0x0a, 0x24))
e = Image.new("RGBA", (220, 220)); ImageDraw.Draw(e).text((20, 10), "🎛️", font=ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 160), embedded_color=True)
e = e.crop(e.getbbox()).resize((600, 600), Image.LANCZOS); base.paste(e, (212, 212), e)
os.makedirs("build/icon.iconset", exist_ok=True)
for s in (16, 32, 128, 256, 512):
    base.resize((s, s), Image.LANCZOS).save(f"build/icon.iconset/icon_{s}x{s}.png")
    base.resize((s * 2, s * 2), Image.LANCZOS).save(f"build/icon.iconset/icon_{s}x{s}@2x.png")
subprocess.run(["iconutil", "-c", "icns", "build/icon.iconset", "-o", "build/Sree Deck.app/Contents/Resources/AppIcon.icns"], check=True)
EOF

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sree Deck</string>
  <key>CFBundleDisplayName</key><string>Sree Deck</string>
  <key>CFBundleIdentifier</key><string>com.sree.deck</string>
  <key>CFBundleExecutable</key><string>SreeDeck</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF

codesign --force --deep -s - "$APP" >/dev/null
pkill -x SreeDeck 2>/dev/null || true
mkdir -p ~/Applications && rm -rf ~/Applications/"Sree Deck.app" && cp -R "$APP" ~/Applications/
open ~/Applications/"Sree Deck.app"
echo "Installed ~/Applications/Sree Deck.app"
