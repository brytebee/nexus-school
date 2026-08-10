#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nexus School OS — Linux AppImage Desktop Installer
# Run this once after downloading the AppImage:
#   chmod +x install-linux.sh && ./install-linux.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_NAME="Nexus School OS"
EXEC_NAME="nexus-school-os"
APPIMAGE=$(ls Nexus-School-OS-*.AppImage 2>/dev/null | head -1)

if [ -z "$APPIMAGE" ]; then
  echo "❌  No Nexus-School-OS-*.AppImage found in the current directory."
  echo "    Download the AppImage and run this script from the same folder."
  exit 1
fi

echo "📦  Found: $APPIMAGE"

# ── 1. Make executable ───────────────────────────────────────────────────────
chmod +x "$APPIMAGE"
echo "✅  Made executable"

# ── 2. Move to ~/Applications ────────────────────────────────────────────────
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/$EXEC_NAME.AppImage"
cp "$APPIMAGE" "$DEST"
echo "✅  Copied to $DEST"

# ── 3. Install icon ──────────────────────────────────────────────────────────
ICON_DIR="$HOME/.local/share/icons/hicolor"
mkdir -p "$ICON_DIR/256x256/apps"
# Extract icon from AppImage if possible, fall back to bundled fallback
if "$DEST" --appimage-extract usr/share/icons/hicolor/256x256/apps/*.png 2>/dev/null; then
  EXTRACTED=$(ls squashfs-root/usr/share/icons/hicolor/256x256/apps/*.png 2>/dev/null | head -1)
  if [ -n "$EXTRACTED" ]; then
    cp "$EXTRACTED" "$ICON_DIR/256x256/apps/$EXEC_NAME.png"
    rm -rf squashfs-root
  fi
fi
echo "✅  Icon installed"

# ── 4. Create .desktop launcher ──────────────────────────────────────────────
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/$EXEC_NAME.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=$APP_NAME
Comment=Sovereign school management system
Exec=$DEST --no-sandbox %U
Icon=$EXEC_NAME
Terminal=false
Categories=Education;
StartupWMClass=nexus-school-os
StartupNotify=true
EOF
chmod +x "$DESKTOP_DIR/$EXEC_NAME.desktop"
echo "✅  Desktop entry created"

# ── 5. Refresh desktop database ──────────────────────────────────────────────
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache "$ICON_DIR" 2>/dev/null || true
echo "✅  Desktop database refreshed"

echo ""
echo "🎉  Done! Search for '$APP_NAME' in your application menu."
echo "    Or double-click $DEST to launch."
echo ""
echo "    To uninstall:"
echo "    rm \"$DEST\" \"$DESKTOP_DIR/$EXEC_NAME.desktop\""
