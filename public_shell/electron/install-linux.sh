#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nexus School OS — Linux Desktop Installer
#
# PREFERRED METHOD: Install the .deb package
#   sudo apt install ./Nexus-School-OS-*.deb
#
#   Benefits over AppImage:
#   ✓ App appears in Applications → Education with correct icon
#   ✓ Survives OS updates and new user accounts
#   ✓ Uninstalls cleanly with: sudo apt remove nexus-school-os
#   ✓ Logs to journald (visible in journalctl -u nexus-school-os)
#
# ALTERNATIVE METHOD: Use this script (AppImage only, no system integration)
#   chmod +x install-linux.sh && ./install-linux.sh
#
# If you have a previous temporary launcher installed (via the old scripts),
# this script will replace it. Run:
#   sudo apt remove nexus-school-os  (if .deb was previously installed), or
#   rm "$HOME/Applications/nexus-school-os.AppImage" \
#      "$HOME/.local/share/applications/nexus-school-os.desktop"
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_NAME="Nexus School OS"
EXEC_NAME="nexus-school-os"

# ── Prefer .deb if present ────────────────────────────────────────────────────
DEB=$(ls Nexus-School-OS-*.deb 2>/dev/null | head -1)
if [ -n "$DEB" ]; then
  echo ""
  echo "📦  Found .deb package: $DEB"
  echo "    This is the preferred installation method."
  echo ""
  if command -v apt &>/dev/null; then
    sudo apt install -y "./$DEB"
    echo ""
    echo "🎉  Done! Search for '$APP_NAME' in your application menu."
    echo "    To uninstall: sudo apt remove nexus-school-os"
  else
    echo "⚠️   apt not found. Install manually with your distro's package manager:"
    echo "    sudo dpkg -i \"./$DEB\""
  fi
  exit 0
fi

# ── Fallback: AppImage ────────────────────────────────────────────────────────
APPIMAGE=$(ls Nexus-School-OS-*.AppImage 2>/dev/null | head -1)

if [ -z "$APPIMAGE" ]; then
  echo ""
  echo "❌  No Nexus-School-OS-*.deb or Nexus-School-OS-*.AppImage found."
  echo "    Download either file and run this script from the same folder."
  echo ""
  echo "    Recommended: download the .deb for full desktop integration."
  exit 1
fi

echo ""
echo "📦  Found AppImage: $APPIMAGE"
echo "    Tip: a .deb package is also available for better desktop integration."
echo ""

# ── 1. Make executable ────────────────────────────────────────────────────────
chmod +x "$APPIMAGE"
echo "✅  Made executable"

# ── 2. Move to ~/Applications ─────────────────────────────────────────────────
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/$EXEC_NAME.AppImage"
cp "$APPIMAGE" "$DEST"
echo "✅  Copied to $DEST"

# ── 3. Install icon ───────────────────────────────────────────────────────────
ICON_DIR="$HOME/.local/share/icons/hicolor"
mkdir -p "$ICON_DIR/256x256/apps"
if "$DEST" --appimage-extract usr/share/icons/hicolor/256x256/apps/*.png 2>/dev/null; then
  EXTRACTED=$(ls squashfs-root/usr/share/icons/hicolor/256x256/apps/*.png 2>/dev/null | head -1)
  if [ -n "$EXTRACTED" ]; then
    cp "$EXTRACTED" "$ICON_DIR/256x256/apps/$EXEC_NAME.png"
    rm -rf squashfs-root
  fi
fi
echo "✅  Icon installed"

# ── 4. Create .desktop launcher ───────────────────────────────────────────────
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
Categories=Education;Office;
StartupWMClass=nexus-school-os
StartupNotify=true
EOF
chmod +x "$DESKTOP_DIR/$EXEC_NAME.desktop"
echo "✅  Desktop entry created"

# ── 5. Refresh desktop database ───────────────────────────────────────────────
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache "$ICON_DIR" 2>/dev/null || true
echo "✅  Desktop database refreshed"

echo ""
echo "🎉  Done! Search for '$APP_NAME' in your application menu."
echo "    Or double-click $DEST to launch."
echo ""
echo "    To uninstall:"
echo "    rm \"$DEST\" \"$DESKTOP_DIR/$EXEC_NAME.desktop\""
echo ""
echo "    Upgrade tip: replace the AppImage with the .deb for full OS integration:"
echo "    sudo apt install ./Nexus-School-OS-*.deb"
