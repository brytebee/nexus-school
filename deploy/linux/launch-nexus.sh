#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# launch-nexus.sh
# Nexus School OS — AppImage launcher (temporary desktop integration helper)
#
# Usage:
#   bash launch-nexus.sh           # run directly in terminal
#   Double-click the .desktop file # triggered automatically by the desktop
#
# What this does:
#   1. Locates the Nexus AppImage in the known installer directory
#   2. Makes it executable (idempotent — safe to re-run)
#   3. Launches it with --no-sandbox (required on many school Linux setups)
#   4. Logs startup to ~/.nexus/launch.log for diagnosis
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
INSTALL_DIR="$HOME/Documents/nexus sch installer/10_08_2026"
LOG_DIR="$HOME/.nexus"
LOG_FILE="$LOG_DIR/launch.log"
APP_NAME="Nexus School OS"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ── Locate AppImage ───────────────────────────────────────────────────────────
log "Searching for AppImage in: $INSTALL_DIR"

if [[ ! -d "$INSTALL_DIR" ]]; then
  log "ERROR: Install directory not found: $INSTALL_DIR"
  if command -v zenity &>/dev/null; then
    zenity --error --title="$APP_NAME" \
      --text="Installer directory not found:\n$INSTALL_DIR\n\nPlease check the installation." 2>/dev/null
  fi
  exit 1
fi

# Find the most recently modified AppImage (handles version bumps automatically)
APPIMAGE=$(find "$INSTALL_DIR" -maxdepth 1 -name "*.AppImage" -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1 | awk '{print substr($0, index($0,$2))}')

if [[ -z "$APPIMAGE" ]]; then
  log "ERROR: No .AppImage file found in $INSTALL_DIR"
  if command -v zenity &>/dev/null; then
    zenity --error --title="$APP_NAME" \
      --text="No AppImage found in:\n$INSTALL_DIR\n\nPlease re-download the application." 2>/dev/null
  fi
  exit 1
fi

log "Found AppImage: $APPIMAGE"

# ── Make executable ───────────────────────────────────────────────────────────
if [[ ! -x "$APPIMAGE" ]]; then
  log "Setting executable bit on AppImage..."
  chmod +x "$APPIMAGE"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
log "Launching $APP_NAME..."

# --no-sandbox is needed on Ubuntu/Debian school setups where the kernel
# restricts user namespaces. Remove it if your distro supports it natively.
exec "$APPIMAGE" --no-sandbox >> "$LOG_FILE" 2>&1
