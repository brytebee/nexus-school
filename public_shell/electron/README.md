# Nexus School OS (Public Shell)

A professional-grade, offline-first school management system shell built with Electron. Designed for premium Nigerian private schools to automate grading and administrative workflows without internet dependency.

## 🚀 Recent Updates (V1 Launch Prep)

### 🎨 UI/UX Refinement
- **Frameless Window Experience:** Fully custom titlebar with native macOS traffic-light integration and Windows/Linux custom window controls.
- **Identity Sync:** School name, branding, and color tokens automatically propagate from the Identity Packet to the UI.
- **Naija-Futurism Design:** Deep navy glassmorphism theme with high-performance animations.

### 📥 Data Management
- **Flexible CSV Import:** Robust parser to handle multi-entry rosters. 
  - **Teachers:** Import IDs, names, and pipe-delimited subject allocations (e.g., `Mathematics|English`).
  - **Students:** Bulk import student names and class assignments.
- **SQLite Ledger:** High-concurrency database with WAL-mode enabled for secure, offline grade syncing.

### 📂 Repository Structure
- `assets/`: Contains application icons in `.png`, `.svg`, and macOS-native `.icns` formats.
- `database.js`: SQLite initialization and schema management.
- `server.js`: Local Express server for Android-to-Desktop handshakes and grade syncing.
- `main.js`: Electron core logic and IPC handlers.

## 🛠 Setup & Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Application:**
   ```bash
   npm start
   ```

3. **Package for Production:**
   ```bash
   npm run pack
   ```

## 📋 CSV Formatting Guide

### Teacher Import (`Sample_Teachers.csv`)
| Teacher_ID | Teacher_Name | Teacher_Phone | Class | Subjects |
| :--- | :--- | :--- | :--- | :--- |
| T001 | John Doe | 080... | JSS1 | Math\|English |

### Student Import (`Sample_Students.csv`)
| Student_ID | First_Name | Last_Name | Class |
| :--- | :--- | :--- | :--- |
| NEX/001 | Samuel | Okafor | JSS1 |
