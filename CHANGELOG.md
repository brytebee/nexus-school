# Changelog

All notable changes to the **Nexus School OS** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0] - 2026-07-06

### Added
- **Paystack Refund API (Diamond)**: Support for triggering full or partial refunds for online transactions directly from the ledger. Handles automatic creation of negative reversal entries in `fee_transactions`, decrementing student outstanding payments, registering refund logs in `fee_refunds`, and sending immediate WhatsApp reversal notifications.
- **Branded PDF Receipts via WhatsApp (Diamond)**: Automatic generation of styled A4 PDF receipts utilizing `pdfkit` (including school logo, metadata, and item allocation breakdowns) dispatched to parents' WhatsApp numbers immediately upon online payment success, with manual re-send capabilities from the roster.
- **Local On-Site Print Hub (Diamond)**: Hidden browser window print dispatcher using `receipt-print.html` allowing admins to print A4 sheets or 80mm thermal receipts directly to physical printers.
- **Scrollable Roster Layout**: Added overflow-x auto and minimum widths to the fee roster table to permit smooth horizontal scrolling on smaller laptop displays.

### Fixed
- **Pre-existing Calendar Status Test Failure**: Fixed missing vitest imports causing describe/test failures.
- **WhatsApp State Resilience**: Added comprehensive unit test suites covering the AWAITING_EMAIL_INPUT state machine and PDF receipt buffer generation.

## [2.4.0] - 2026-07-06

### Added
- **WhatsApp Parent Email Verification**: Interactive verification flow asking parents to confirm on file email, type new address to auto-update SQLite `students.parent_email` table, or skip.
- **Fallback Checkout Email Setting**: School-level fallback email configurator inside Financial Hub Settings drawer for skipped WhatsApp checkouts.
- **Settings Danger Zone**: A secure, red-styled card in Financial Hub Settings permitting administrative data wipes (Current Term / Full Session / Everything) protected by admin PIN authentication and double `"DELETE"` prompt.
- **DB Performance Indexes**: Added compound SQLite indexes `idx_students_class_name` and `idx_student_fees_session_term_status` to support 100k-record scale queries.

### Fixed
- **Paystack Positional Param Contract**: Resolved failures in `paystackService.initializeTransaction` by matching single object parameter signature and converting amount to kobo.
- **Financial Hub Session Dropdowns**: Unified school academic session lists with other modules using the central `generateSessionsList()` generator.
- **Roster Status Filtering**: Forwarded filter selections to `fees:get-roster` IPC, executing matching server-side queries for Unpaid/Partial/Cleared rosters.

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
