# Changelog

All notable changes to the **Nexus School OS** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.0] - 2026-06-27

### Added
- **OTA Auto-Updates**: Enabled background updates check and notification using `electron-updater` and GitHub releases channel.
- **UpdateBanner Component**: Added a glassmorphic bottom notification banner to alert users when a new version is downloaded and ready to apply.
- **Biometric Action Safeguards**: Protected destructive options (like terminal disconnect and scanning new QR codes) on Android with biometric credentials validation.
- **Link Redirection Dispatcher**: Connected electron-renderer shell events to native Electron shell modules.

### Fixed
- **Admin auto-login session mapping**: Resolved SQLite Foreign Key constraints violation by looking up real super admin database IDs for dev environments.
- **Footer Horizontal Alignment**: Fixed lock screen layouts to center information cards symmetrically.
- **Key mappings on Handshake syncs**: Supported on-the-fly normalization of database grade component values to match configuration keys.

---

## [2.2.0] - 2026-06-19

### Added
- **Multi-Admin RBAC**: Created database structure supporting staff roles, permissions, and session authorization.
- **Admin Profile forms**: Support display name configurations, recovery emails, and custom avatar uploads.
- **Speakeasy 2FA Integration**: Enabled TOTP two-factor security for desktop administrator screens.

---

## [2.1.0] - 2026-06-08

### Added
- **CSV Data Imports**: Created bulk import flows for students, teachers, grades, attendance, and identity config files.
- **Single-Port Server Consolidation**: Extracted parent portals and sync endpoints into a unified Port 3000 LAN router topology.

---

## [1.0.0] - 2026-04-01
- Initial release of Nexus School OS (V1) including basic classroom registries and offline sync capabilities.
