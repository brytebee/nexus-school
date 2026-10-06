## What's New in v1.1.92

This release delivers the **Executive Portal for Superadmin / School Owners, Persistent SQLite PIN Pairing, Universal Device Tracking, and Android Companion v1.0.5**.

### 🏛️ Executive Portal & Management Controls
- **Executive Overview for School Owners**: Level 9 companions (Superadmin / School Owner / Principal) launch into the Executive Portal displaying live School Performance Snapshot metrics: Total Enrolled Students, Active Teachers, Configured Classes & Arms, and Last Sync Timestamp.
- **Executive Navigation Shortcuts**: Direct one-tap jump from Executive Overview to **Companion Devices & Security** and **Fee Collections & Finance Hub**.
- **Back Navigation**: Added back arrow navigation (`←`) across all management views (`ItAdminActivity` and `BursarActivity`) to seamlessly return to the overview.
- **Instant Admin Handshake (<50ms)**: Management roles omit the heavy student grading roster matrix during handshake, preventing massive 15MB gzipped payloads and eliminating client connection timeouts.

### 🔑 Persistent SQLite PIN Pairing & Universal Device Tracking
- **Restart-Resilient PINs**: Pairing PINs are now stored in SQLite (`pairing_pins` table). PINs survive desktop app and engine restarts with full 30-minute rolling TTL and single-use security.
- **Universal Connected Device Tracking**: All paired devices across all license tiers (Standalone, Silver, Gold, Diamond) are now automatically registered in `connected_devices`, eliminating `403 Forbidden` errors on `/api/devices`, `/api/dashboard-summary`, and `/api/fees/summary`.
- **String-Safe Type Casting**: All teacher and admin IDs are strictly cast to strings, resolving Kotlin deserialization type mismatches.

### 📱 Android Companion v1.0.5 (`versionCode = 6`)
- Auto-navigates management roles straight to the Executive Portal on marriage.
- Lenient JSON parser with graceful error surfacing.
- Compiled, signed, and bundled into the desktop release payload.

---

## What's New in v1.1.91

This release delivers **Camera-Free Teacher Pairing, Offline Local Web Bridge, and Release Guard Automation** — solving the barrier for teachers with older Android devices who cannot scan dense monitor QR codes.

### 🔑 Camera-Free PIN Pairing & Local Web Bridge (`/pair`)
- **Direct LAN APK Download (`GET /pair/apk`)**: Teachers connect to school local Wi-Fi, open `http://<hub-ip>:3000/pair`, and download the Android companion app directly from the PC hard drive with **zero cellular data** and no third-party transfer apps (Xender/Bluetooth).
- **Single-Use 6-Digit Pairing PIN**: Replaces manual payload copy-paste with rolling 6-digit OTP codes. Stamped with a 30-minute rolling TTL and automatically consumed and deleted on successful marriage.
- **Per-Teacher PIN Rollover**: Selecting a teacher from the dropdown immediately regenerates and recycles their active PIN code.
- **Android Chrome Intent Deep Linking**: One-tap "Launch & Pair" button dispatches `intent://pair?ip=...&port=...&pin=...#Intent;scheme=nexus;package=com.nexus.school;end` with direct anchor fallback to open the app and trigger auto-marriage without Chrome navigation blocking.
- **Sovereign Portal (Port 3002) Forwarding Bridge**: Port 3002 automatically redirects `/pair` and `/pair/apk` requests to port 3000.

### 🛡️ Release Guard & Build Automation
- **Auto-Signed Android Release Builds**: Gradle automatically falls back to debug signing when release keystore credentials are not present locally, ensuring release builds always produce installable `Nexus-release.apk` packages.
- **Pre-Distribution Packaging Guard**: `scripts/ensure-release-apk.js` integrated into `predist:*` scripts in `package.json` to verify the Android APK is compiled and signed before packaging the desktop app.
- **Version Bumps**: Electron shell bumped to `v1.1.91`; Android companion app bumped to `v1.0.4` (`versionCode = 5`).

---

## What's New in v1.0.4

This release delivers the **Phase 11 Activation Security Gate** — a server-authoritative activation layer that protects all value outputs across every license tier. PDF report generation, result dispatch, portal publishing, Nexus Pulse, and CBT are now hard-locked until a school's device is confirmed as activated in the central Nexus database. This update spans all four repositories.

### 🔐 Activation Security Gate (All Tiers — Including Standalone)

**nexus-api**
- `License` model gains `activated_at DateTime?` column. `null` = unactivated. Set on hardware binding.
- `POST /api/license/activate-silver` — sets `activated_at` on first Silver boot.
- `POST /api/license/activate-standalone` — sets `activated_at` on first Standalone boot.
- `POST /api/license/issue` — school self-service portal activation; sets `activated_at` on hardware bind.
- `GET /api/license/validate` (heartbeat) — now returns `is_activated: true/false` in Gold/Diamond heartbeat responses.
- `PATCH /api/sovereign/licenses` — accepts `activate: true/false` for back-office activation toggling.
- `GET /api/license/list` — includes `activated_at` in returned records.

**nexusos (Web Portal)**
- Portal License page (`/portal/license`) shows three distinct states: *Not yet bound*, *Pending activation*, and ✅ *Activated*.
- Sovereign Admin dashboard (`/sovereign/licenses`) gains an **Activated** column and Activate / Deactivate / Revoke action buttons via new `<LicenseActions />` Client Component.

**nexus-school (Desktop App)**
- IPC channels `generate-reports`, `results:dispatch`, `results:publish`, `pulse:*`, and `cbt:*` are blocked for unactivated schools via `assertActivated()`.
- 30-day payment grace period from first boot (`_sys_registration_ts`). Fee recording hard-locks on day 31 (`PAYMENT_LOCKED`).
- `_sys_is_activated` and `_sys_registration_ts` persisted to SQLite `system_settings`; updated reactively via OTA callbacks without app restart.
- Red **Unactivated School Warning Banner** in the app header with a direct link to the activation portal.
- **Result Studio**: Generate PDF, Dispatch, and Publish buttons disabled with lock tooltips when unactivated.
- **Nexus Pulse**: Bot start toggle disabled; auto-start checkbox forced unchecked and greyed out with *(requires activation)* hint.
- **Print Hub**: Navigation to result generation blocked when unactivated.
- Defense-in-depth: `result-dispatcher.js` (`compileStudentPdf`, `dispatchResults`) also verifies `is_activated` at the LAN engine level.

**nexus-school (Android Companion App)**
- No changes in this release. Companion app remains at v1.0.3.

### 🐛 Bug Fixes
- **`query-results` crash on existing installs**: `COALESCE(status, 'active')` in the results query threw `no such column: status` on databases created before Phase 11. Fixed via `alterSafe` migration in `database.js` — applied automatically on first app restart.
- **`setActivationStatus` silent bypass**: The function was exported from `server.js` but omitted from the `main.js` server destructure, causing the `typeof` guard to always evaluate `false` and leaving the LAN engine's gate uncalled. Fixed.

### ⚠️ Deployment Checklist for This Release

> Before pushing this release to clients, complete the following in order:

1. **nexus-api**: Run `npx prisma db push` against production to add the `activated_at` column to the `License` table.
2. **nexus-api**: Deploy the updated API to your hosting provider.
3. **nexusos**: Deploy the updated portal. Confirm `LicenseActions` renders on `/sovereign/licenses`.
4. **nexus-school**: Pack updated engine tarball (`npm pack` in `private_engine/`, copy to `public_shell/electron/`), bump version, and build installers.
5. **Activate existing client licenses**: Log into the Sovereign Admin dashboard and activate all existing paid licenses. Client desktops will unlock on their next heartbeat (within a week) or on relaunch.

---

## What's New in v1.0.3



This is the **landmark Phase 1–10 release**, completing the full initial feature set for Nexus School OS — a sovereign desktop school management system for Nigerian private schools.

### 🏫 Individualized Learning System (ILS / ACE PAC)
- **Swappable Curriculum Add-on**: Classes can be individually switched between Standard Nigerian grading and ILS/ACE PAC mode from within Class Manager (Level 7+ authorization required).
- **Custom PAC Labels**: Configure 5–25 custom PAC column headers per class (e.g. G1U1, G1U2 … G6U10).
- **Verse Memory Tracking**: Termly Bible verse memorization counter per student in ILS classes.
- **No Position Ranking**: Class rank is suppressed on ILS report cards by design.
- **Landscape Report Cards**: All delivery channels (WhatsApp, Email, Portal) produce landscape PDF reports for ILS students automatically.
- **7-Tile Summary Bar**: PACs Completed, Total Score, Average, 100s, Completion Rate, Verse Memory, and Days Present.

### 🔐 Admin Passwords, RBAC & Soft-Deactivation
- **Admin Password Field**: Admin creation and edit now includes a secure password field for role authentication.
- **Soft-Deactivation**: Students and teachers can be deactivated (removed from grade entry, attendance, fee billing) without permanent deletion.
- **RBAC Delete Guards**: Managers (Level < 9) cannot delete staff or students — only Superadmins (Level ≥ 9) can, with full audit logging.

### 💰 Optional Fees & Multi-Bank Routing
- **Optional Extras**: Schools can define optional items (uniforms, sports kits, trips) separate from mandatory tuition fees.
- **Multi-Bank Account Routing**: Each fee item can be routed to a different bank account on payment.
- **Itemized Receipts**: Payment receipts are broken down by fee item and bank account.

### 🔄 OTA Update Pipeline
- **Seamless Updates**: Linux AppImage and Windows users receive automatic over-the-air updates on new releases.
- **UpdateBanner**: Persistent update notification banner with localStorage state survives app restarts.
- **macOS**: Update detection works; unsigned builds show Gatekeeper warning on first install only.

### 🏷️ Sovereign Portal Slug & Seat Expansion
- **Custom Portal Slug**: Schools can claim a custom URL slug (e.g. `sch.nexusos.com.ng/your-school`) from the desktop app.
- **Seat Capacity**: Schools can view and request seat upgrades directly from the Student Manager header.

### 📋 Multi-Department Manager Signatures
- **Section Signatories**: Separate digital signatures for Primary (Headmaster), Secondary (Principal), and Nursery (Manager) sections on report cards, resolved automatically by class prefix.

### 📊 Paystack 0.99% Enabling-Fee Split
- **Zero-Cost for Schools**: The 0.99% platform enabling fee is added on top of the base invoice and routed directly to the Nexus platform account — schools receive 100% of their base fee.

### 📱 Android Companion App
- Updated to **v1.0.3 (versionCode 4)** — includes all new sync capabilities including ILS/PAC score sync via the LAN mobile gateway.

---

> **Downloads**: Choose the installer for your platform below.
> - **Windows**: `Nexus-School-OS-Setup-1.0.3.exe`
> - **Linux (AppImage — OTA)**: `Nexus-School-OS-1.0.3.AppImage`
> - **Linux (.deb — package manager)**: `nexus-school-os_1.0.3_amd64.deb`
> - **macOS**: `Nexus-School-OS-1.0.3-arm64.dmg` or `Nexus-School-OS-1.0.3.dmg`
> - **Android**: `Nexus-release.apk`
