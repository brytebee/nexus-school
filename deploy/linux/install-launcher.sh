#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-launcher.sh
# Nexus School OS — One-time desktop integration setup (temporary solution)
#
# Run this ONCE on the school Linux machine:
#   bash install-launcher.sh
#
# What this does:
#   1. Copies launch-nexus.sh to ~/.nexus/ (a stable, non-versioned location)
#   2. Extracts the app icon from the AppImage
#   3. Installs the .desktop file to the user's desktop AND applications menu
#   4. Makes everything click-ready
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config — must match launch-nexus.sh ──────────────────────────────────────
INSTALL_DIR="$HOME/Documents/nexus sch installer/10_08_2026"
NEXUS_DIR="$HOME/.nexus"
DESKTOP_DIR="$HOME/Desktop"
APPS_DIR="$HOME/.local/share/applications"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_NAME="Nexus School OS"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

echo ""
echo "════════════════════════════════════════"
echo "   Nexus School OS — Desktop Setup"
echo "════════════════════════════════════════"
echo ""

# ── Step 1: Locate AppImage ───────────────────────────────────────────────────
echo "Step 1: Locating AppImage..."
[[ -d "$INSTALL_DIR" ]] || fail "Install directory not found: $INSTALL_DIR"

APPIMAGE=$(find "$INSTALL_DIR" -maxdepth 1 -name "*.AppImage" -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1 | awk '{print substr($0, index($0,$2))}')

[[ -n "$APPIMAGE" ]] || fail "No .AppImage found in $INSTALL_DIR"
ok "Found: $(basename "$APPIMAGE")"

# ── Step 2: Make AppImage executable ─────────────────────────────────────────
echo ""
echo "Step 2: Setting permissions..."
chmod +x "$APPIMAGE"
ok "AppImage is executable"

# ── Step 3: Create ~/.nexus workspace ────────────────────────────────────────
echo ""
echo "Step 3: Creating launcher workspace..."
mkdir -p "$NEXUS_DIR"

# Copy launcher script to stable location
cp "$SCRIPT_DIR/launch-nexus.sh" "$NEXUS_DIR/launch-nexus.sh"
chmod +x "$NEXUS_DIR/launch-nexus.sh"
ok "Launcher script installed to $NEXUS_DIR/launch-nexus.sh"

# ── Step 4: Extract icon from AppImage ───────────────────────────────────────
echo ""
echo "Step 4: Extracting app icon..."
ICON_PATH="$NEXUS_DIR/nexus-school.png"
EXTRACTED=false

# Helper: pick the best PNG from an extracted squashfs-root tree.
# Prefers 512x512 or 256x256 hicolor icons; falls back to any .png found.
pick_best_png() {
  local root="$1"
  # Priority 1 — hicolor icons (standard Linux icon theme locations)
  local best
  best=$(find "$root/usr/share/icons" -name "*.png" 2>/dev/null \
    | sort -t/ -k8 -rn | head -1)
  [[ -n "$best" ]] && { echo "$best"; return; }
  # Priority 2 — top-level icon (common Electron AppImage convention)
  best=$(find "$root" -maxdepth 1 -name "*.png" 2>/dev/null | head -1)
  [[ -n "$best" ]] && { echo "$best"; return; }
  # Priority 3 — any PNG, excluding node_modules
  find "$root" -name "*.png" -not -path "*/node_modules/*" \
    -not -path "*/.tmp/*" 2>/dev/null | head -1
}

# Strategy 1 — unsquashfs (fastest: extracts only icon directories)
if command -v unsquashfs &>/dev/null && [[ "$EXTRACTED" == false ]]; then
  TMP_DIR=$(mktemp -d)
  # Extract only known icon paths — much faster than full extract
  unsquashfs -quiet -dest "$TMP_DIR/sq" "$APPIMAGE" \
    "*.png" "usr/share/icons/*" 2>/dev/null || true
  PNG=$(pick_best_png "$TMP_DIR/sq")
  if [[ -n "$PNG" && -f "$PNG" ]]; then
    cp "$PNG" "$ICON_PATH"
    EXTRACTED=true
    ok "Icon extracted via unsquashfs"
  fi
  rm -rf "$TMP_DIR"
fi

# Strategy 2 — AppImage built-in full extract (no glob argument!)
# NOTE: do NOT pass a filename pattern here — the AppImage runtime treats the
# argument as a literal path, not a shell glob. Omit it to extract everything.
if [[ "$EXTRACTED" == false ]]; then
  TMP_DIR=$(mktemp -d)
  pushd "$TMP_DIR" &>/dev/null
  "$APPIMAGE" --appimage-extract &>/dev/null || true
  PNG=$(pick_best_png "$TMP_DIR/squashfs-root")
  if [[ -n "$PNG" && -f "$PNG" ]]; then
    cp "$PNG" "$ICON_PATH"
    EXTRACTED=true
    ok "Icon extracted via AppImage --appimage-extract"
  fi
  popd &>/dev/null
  rm -rf "$TMP_DIR"
fi

# Strategy 3 — 7z (if available and above strategies failed)
if command -v 7z &>/dev/null && [[ "$EXTRACTED" == false ]]; then
  TMP_DIR=$(mktemp -d)
  7z e "$APPIMAGE" "*.png" -o"$TMP_DIR" -r &>/dev/null || true
  PNG=$(find "$TMP_DIR" -name "*.png" | sort -rn | head -1)
  if [[ -n "$PNG" && -f "$PNG" ]]; then
    cp "$PNG" "$ICON_PATH"
    EXTRACTED=true
    ok "Icon extracted via 7z"
  fi
  rm -rf "$TMP_DIR"
fi

if [[ "$EXTRACTED" == false ]]; then
  warn "Could not extract icon — using system fallback (application-x-executable)"
  ICON_PATH="application-x-executable"
fi

# ── Step 5: Build .desktop file ──────────────────────────────────────────────
echo ""
echo "Step 5: Creating desktop entry..."

DESKTOP_CONTENT="[Desktop Entry]
Version=1.0
Type=Application
Name=$APP_NAME
GenericName=School Management System
Comment=Sovereign school management — results, fees, attendance & WhatsApp bot
Exec=bash \"$NEXUS_DIR/launch-nexus.sh\"
Icon=$ICON_PATH
Terminal=false
StartupNotify=true
StartupWMClass=nexus-school-os
Categories=Education;Office;
Keywords=school;fees;results;attendance;nexus;"

# Install to Applications menu
mkdir -p "$APPS_DIR"
echo "$DESKTOP_CONTENT" > "$APPS_DIR/nexus-school.desktop"
chmod 644 "$APPS_DIR/nexus-school.desktop"
ok "Installed to applications menu: $APPS_DIR/nexus-school.desktop"

# Install to Desktop (if it exists)
if [[ -d "$DESKTOP_DIR" ]]; then
  echo "$DESKTOP_CONTENT" > "$DESKTOP_DIR/nexus-school.desktop"
  chmod 755 "$DESKTOP_DIR/nexus-school.desktop"

  # Mark as trusted on GNOME (required to make the icon clickable)
  if command -v gio &>/dev/null; then
    gio set "$DESKTOP_DIR/nexus-school.desktop" metadata::trusted true 2>/dev/null || true
  fi
  # Fallback for older GNOME
  if command -v dconf &>/dev/null; then
    dconf write /org/gnome/nautilus/preferences/show-image-thumbnails "'always'" 2>/dev/null || true
  fi
  ok "Installed to desktop: $DESKTOP_DIR/nexus-school.desktop"
else
  warn "Desktop folder not found — skipping desktop shortcut (applications menu entry is enough)"
fi

# ── Step 6: Refresh application database ─────────────────────────────────────
echo ""
echo "Step 6: Refreshing application database..."
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APPS_DIR" 2>/dev/null && ok "Application database updated"
fi
if command -v xdg-desktop-menu &>/dev/null; then
  xdg-desktop-menu forceupdate 2>/dev/null || true
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "  • Double-click 'Nexus School OS' on your Desktop"
echo "  • Or find it in Applications → Education"
echo ""
echo "  Launch log: $NEXUS_DIR/launch.log"
echo "════════════════════════════════════════"
echo ""
