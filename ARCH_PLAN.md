# 🏫 Nexus School OS — Decentralized Grading Architecture

> **Design Principle:** Zero trust, local-first, cryptographically signed.
> **Status:** V1 Production Ready — `ui-relief` branch active development.

---

## System Components

| Component | Path | Status |
|---|---|---|
| **Desktop (Electron)** | `public_shell/electron/` | ✅ Stable |
| **Android (Kotlin)** | `public_shell/android/` | ✅ Stable |
| **Private Engine** | `private_engine/` | ✅ Stable |
| **Database** | `private_engine/nexus.sqlite` | ✅ Live |
| **Config** | `private_engine/identity.json` | ✅ Live |

---

## Core Philosophy

| Principle | Implementation |
|---|---|
| **Offline-First** | All grading operations work without network |
| **Decentralized** | No central server; peer-to-peer LAN sync |
| **LAN-Focused** | Connect via Local IP/Hotspot (No cables, no Internet) |
| **Cryptographic Trust** | Device-signed packets, signature verification |
| **Data Sovereignty** | School owns all keys; data never leaves premises |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEXUS ECOSYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────────────┐          ┌─────────────────┐        │
│   │   ELECTRON      │◄────T────│    ANDROID     │        │
│   │   (Hub)        │  THE MARRIAGE │   (Grader)    │        │
│   │                │          │                │        │
│   │  - Admin UI    │          │  - Teacher UI │        │
│   │  - Results    │          │  - Grading    │        │
│   │  - Print Hub │          │  - Biometric │        │
│   │  - Settings  │          │  - Focus Mode│        │
│   └──────────────┘          └─────────────────┘        │
│          │                           │                      │
│          │                           │                      │
│   ┌──────▼──────┐            ┌───────▼───────┐           │
│   │  SQLite    │            │  Room (Enc)   │           │
│   │  (Central) │            │   (Local)     │           │
│   └────────────┘            └───────────────┘           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema (Live V2.1)

### SQLite Tables (`nexus.sqlite`)

```sql
-- === CORE TABLES ===

-- Teachers
CREATE TABLE teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    signature TEXT DEFAULT NULL
);

-- Teacher Allocations (Many-to-Many)
CREATE TABLE teacher_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    UNIQUE(teacher_id, class_name, subject),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- Students
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    reg_no TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    photo TEXT DEFAULT NULL,
    parent_email TEXT DEFAULT '',
    parent_phone TEXT DEFAULT '',
    fee_status TEXT DEFAULT 'cleared'
);

-- Student Subjects (Explicit Enrollment)
CREATE TABLE student_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    UNIQUE(student_id, subject),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Student Records (The Ledger)
CREATE TABLE student_records (
    student_id TEXT,
    subject TEXT,
    assessment TEXT,
    score INTEGER,
    breakdown TEXT,
    teacher_id TEXT,
    academic_session TEXT DEFAULT '2024/2025',
    term TEXT DEFAULT 'First Term',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, subject, assessment, academic_session, term)
);

-- Sync Logs (for offline queue resolution)
CREATE TABLE sync_logs (
    event_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- === CONFIGURATION TABLES ===

-- School Term Config
CREATE TABLE school_term_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    academic_session TEXT NOT NULL DEFAULT '2024/2025',
    term TEXT NOT NULL DEFAULT 'First Term',
    resumption_date TEXT DEFAULT '',
    grading_scale TEXT DEFAULT '[]',
    template TEXT DEFAULT 'clean_slate',
    show_position INTEGER DEFAULT 1,
    show_domains INTEGER DEFAULT 1,
    show_subject_position INTEGER DEFAULT 0,
    show_attendance INTEGER DEFAULT 1,
    show_fee_status INTEGER DEFAULT 0,
    show_highest_lowest INTEGER DEFAULT 0,
    show_class_average INTEGER DEFAULT 1
);

-- Form Teachers (Class Mentors)
CREATE TABLE form_teachers (
    class_name TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- Teacher Remarks
CREATE TABLE teacher_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    teacher_id TEXT,
    academic_session TEXT NOT NULL,
    term TEXT NOT NULL,
    remark TEXT DEFAULT '',
    principal_remark TEXT DEFAULT '',
    teacher_signature TEXT DEFAULT NULL,
    principal_signature TEXT DEFAULT NULL,
    UNIQUE(student_id, academic_session, term)
);

-- Student Domains (Affective & Psychomotor)
CREATE TABLE student_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    academic_session TEXT NOT NULL,
    term TEXT NOT NULL,
    domain_type TEXT NOT NULL,
    trait TEXT NOT NULL,
    grade TEXT NOT NULL,
    UNIQUE(student_id, academic_session, term, domain_type, trait)
);

-- Student Attendance
CREATE TABLE student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    academic_session TEXT NOT NULL,
    term TEXT NOT NULL,
    total_days INTEGER DEFAULT 0,
    days_attended INTEGER DEFAULT 0,
    UNIQUE(student_id, academic_session, term),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- === REVENUE & CBT TABLES ===

-- CBT Exams
CREATE TABLE cbt_exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    price REAL DEFAULT 0.0,
    is_external INTEGER DEFAULT 0, -- 1 for guest candidates
    academic_session TEXT,
    term TEXT
);

-- CBT Questions
CREATE TABLE cbt_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id TEXT,
    question_text TEXT,
    options TEXT, -- JSON array
    correct_option INTEGER,
    FOREIGN KEY (exam_id) REFERENCES cbt_exams(id) ON DELETE CASCADE
);

-- Fee Records
CREATE TABLE fee_records (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    amount_due REAL,
    amount_paid REAL,
    status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'cleared'
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Staff Profiles (Extended teacher data)
CREATE TABLE staff_profiles (
    id TEXT PRIMARY KEY,
    teacher_id TEXT,
    role TEXT DEFAULT 'Teacher', -- 'Admin', 'Accountant', 'Form Teacher'
    bio TEXT,
    bank_details TEXT, -- Encrypted or local-only
    joining_date TEXT,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
```

---

## Data Flow: The Marriage Handshake

### Phase 1: Device Pairing

```
Desktop (Electron)                          Android (Kotlin)
    │                                            │
    │◄── QR Code Display {sid, ip, port, key} ────│
    │                                            │
    │── Scans QR, generates UUID + pubkey ────────►│
    │                                            │
    │◄── Device Registration Request ─────────────│
    │     { device_name, UUID, pubkey }            │
    ���                                            │
    │── Admin approves via dropdown ──────────────►│
    │     Device added to whitelist              │
```

### Phase 2: Grade Sync

```
Android                                     Desktop
   │                                           │
   │── Grade Packet ──────────────────────────►│
   │   { student_id, subject_id,              │
   │     score, device_uuid, signature,        │
   │     timestamp }                           │
   │                                           │
   │◀── ACK / Reject ───────────────────────────│
   │     (signature verification)             │
```

---

## Server API Endpoints (Express)

| Endpoint | Method | Description |
|---|---|---|
| `/handshake` | POST | Initialize pairing, receive device config |
| `/api/students` | GET | List students (filtered by teacher allocation) |
| `/api/grades` | POST | Submit grade packet |
| `/api/grades` | GET | Fetch grades (by session/term) |
| `/api/sync` | POST | Batch sync event receiver |
| `/api/teachers` | GET | List teachers |
| `/api/config` | GET | School term configuration |
| `/upload/csv` | POST | CSV bulk import |

---

## Android Components (Kotlin)

| Component | Path | Purpose |
|---|---|---|
| `NexusApp.kt` | `ui/` | Application entry, biometric setup |
| `MainActivity.kt` | `ui/` | Home dashboard |
| `LockActivity.kt` | `ui/` | Biometric authentication |
| `HandshakeActivity.kt` | `ui/` | QR scanner + pairing |
| `StudentRosterActivity.kt` | `ui/` | Student list view |
| `IdentityManager.kt` | `security/` | School identity retrieval |
| `HandshakeService.kt` | `network/` | HTTP handshake client |
| `SyncWorker.kt` | `network/` | Background sync worker |
| `SyncManager.kt` | `data/` | Sync queue management |
| `SyncQueue.kt` | `data/` | Offline sync queue |
| `StudentData.kt` | `data/` | Room database |
| `ThermalMonitor.kt` | `utils/` | Hardware thermal detection |
| `FeatureGate.kt` | `ui/components/` | Tier-based feature gating |

---

## Configuration (`identity.json`)

```json
{
  "school": {
    "name": "Nexus Academy",
    "branding": {
      "primaryColor": "#0A0A0A",
      "accentColor": "#FFD700",
      "logoPath": "assets/logo.png"
    }
  },
  "grading": {
    "scales": [{ "name": "Standard", "min": 0, "max": 100 }]
  },
  "modules": {
    "attendance": true,
    "gradebook": true,
    "fees": false,
    "ecoMode": true
  }
}
```

---

## Security Layers

### 1. Device Authentication
- Ed25519 key pairs per device
- QR code contains `handshake_key` for initial trust
- Device public key stored in whitelist after admin approval

### 2. Packet Signing
- Every grade packet signed with device private key
- Desktop verifies signature before accepting
- Rejects packets from non-whitelisted devices

### 3. Biometric Lock (Android)
- Fingerprint required to unlock grading app
- Thermal monitoring to detect tampering

### 4. Date-Proof License
- Ed25519-signed license token
- Hardware binding (motherboard serial)
- Clock rollback detection

---

## Sync Modes

| Mode | Description | Use Case |
|---|---|---|
| **Standard** | LAN-only peer-to-peer | Normal operations |
| **Cloud Relay** | Via school's Google Drive | Off-site backup |
| **Hub Hotspot** | Phone AP mode | Emergency grading |

### Sync Protocol (The Pulse)

```
Android sends: { type: "GRADE_UPDATE", payload: {...}, signature: "..." }
Desktop receives:
  1. Verify signature against device whitelist
  2. If valid → write to SQLite → broadcast to UI
  3. If invalid ��� reject with error
```

---

## Conflict Resolution

| Scenario | Resolution |
|---|---|
| Same student, same subject, multiple devices | Latest timestamp wins |
| Offline edits → reconnect | Merge with desktop state |
| Device revoked mid-session | Reject all new packets |

---

## Deployment Topology

```
┌────────────────────────────────────────────────────────────┐
│                    SCHOOL NETWORK                          │
│                                                            │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│  │ Teacher │      │ Teacher │      │ Teacher │        │
│  │ Phone 1 │      │ Phone 2 │      │ Phone 3 │        │
│  └────┬────┘      └────┬────┘      └────┬────┘        │
│       │                │                │              │
│       └────────────────┼────────────────┘              │
│                        │                                │
│                  ┌─────▼─────┐                          │
│                  │   LAPTOP  │                          │
│                  │  (Hub)   │                          │
│                  └──────────┘                          │
│                       │                                │
│                 ┌─────▼──────┐                         │
│                 │  LOCAL DB  │                         │
│                 │ (SQLite)   │                         │
│                 └───────────┘                         │
└────────────────────────────────────────────────────────────┘
```

---

## Report Templates

| Template | Style |
|---|---|
| `clean_slate` | Minimal, clean |
| `apex` | Modern, bold |
| `royal` | Classic, traditional |
| `monarch` | Elegant |
| `sterling` | Professional |
| `azure` | Blue accent |
| `prestige` | Premium |
| `sovereign` | Authoritative |

---

## Ecosystem Modules (The Master Plan)

### 1. CBT-as-a-Service
- **Internal Use:** Class tests, term exams, mock results.
- **Revenue Stream:** External guest candidates pay a "Test Access Fee" to use school facilities for JAMB/WAEC prep.
- **Connectivity:** Clients connect to the Hub via Local Wi-Fi (Hostspot). No internet required.

### 2. WhatsApp Bot "Nexus Pulse"
- **Function:** Parents query `FEE_STATUS` or `RESULT_SUMMARY` via WhatsApp.
- **Source of Truth:** A mini-hosted mirror of the `nexus.sqlite` ledger.
- **Sync:** The Hub pushes encrypted updates to a lightweight cloud relay every 1 hour.

### 3. Financial Management
- **Fee Shield:** Automated payment tracking and receipt generation.
- **Payroll:** Basic salary calculation based on staff profiles and attendance.

### 4. Global Adaptations
- **Skill Mastery (US/EU):** Beyond grades, track vocational progress (e.g., Coding, Crafting).
- **Student Pulse (AU):** Anonymous welfare and bullying detection system.
- **Nexus Notes (Global):** A marketplace for teachers to sell their proprietary study materials to parents.

---

## Deployment & Networking

### Zero-Config LAN
The Nexus Hub acts as a local server. Clients (Phones, Tablets, Laptops) connect via:
1. **School Router:** Standard Wi-Fi router (Internet disconnected).
2. **Mobile Hotspot:** If no router exists, the Hub laptop can share its network.
3. **Connectivity URL:** `http://<hub-ip>:3000` (Encoded in the Pairing QR Code).

---

## Branch Strategy

| Branch | Purpose | Status |
|---|---|---|
| `main` | Stable — Demo Ready | Production |
| `ui-relief` | Print Hub 2-col, Android fixes | Active Development |
| `nexus-shield` | License/Payment enforcement | Future |
| `feature/*` | Isolated feature work | As needed |

---

*Nexus School OS — Decentralized Grading Architecture*
*Version 1.0 — Strategic Infrastructure Partner Edition*
*Updated: 2026-04-22*