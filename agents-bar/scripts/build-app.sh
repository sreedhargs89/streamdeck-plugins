#!/bin/zsh
# Builds "Agents.app" (menu-bar indicator for herdr agents), installs it to ~/Applications and launches it.
set -euo pipefail
cd "${0:A:h}/.."
APP="build/Agents.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O app/main.swift -o "$APP/Contents/MacOS/Agents" -framework AppKit -framework UserNotifications -framework ServiceManagement

# app icon: 🔴 dot on the terminal-aubergine tile
python3 - <<'EOF'
from PIL import Image, ImageDraw
import os, subprocess
base = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)); d = ImageDraw.Draw(base)
d.rounded_rectangle([64, 64, 960, 960], radius=200, fill=(0x30, 0x0a, 0x24))
for (x, c) in ((300, (0xFF, 0x17, 0x44)), (512, (0x40, 0xC4, 0xFF)), (724, (0x00, 0xE6, 0x76))):
    d.ellipse([x - 90, 422, x + 90, 602], fill=c)
os.makedirs("build/icon.iconset", exist_ok=True)
for s in (16, 32, 128, 256, 512):
    base.resize((s, s), Image.LANCZOS).save(f"build/icon.iconset/icon_{s}x{s}.png")
    base.resize((s * 2, s * 2), Image.LANCZOS).save(f"build/icon.iconset/icon_{s}x{s}@2x.png")
subprocess.run(["iconutil", "-c", "icns", "build/icon.iconset", "-o", "build/Agents.app/Contents/Resources/AppIcon.icns"], check=True)
EOF

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Agents</string>
  <key>CFBundleDisplayName</key><string>Agents</string>
  <key>CFBundleIdentifier</key><string>com.sree.agents</string>
  <key>CFBundleExecutable</key><string>Agents</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF

# stable signature (Apple Development / Developer ID if present) so notification permission sticks across rebuilds
IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Apple Development|Developer ID Application/ {print $2; exit}')
codesign --force --deep -s "${IDENTITY:--}" "$APP" >/dev/null 2>&1 || codesign --force --deep -s - "$APP" >/dev/null
echo "signed with: ${IDENTITY:-ad-hoc}"
pkill -x Agents 2>/dev/null || true
mkdir -p ~/Applications && rm -rf ~/Applications/Agents.app && cp -R "$APP" ~/Applications/
open ~/Applications/Agents.app
echo "Installed ~/Applications/Agents.app"
