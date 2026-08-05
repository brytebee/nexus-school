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
