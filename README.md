# Milestone Yearbook — Collaborative High School Publishing Platform

[![Build Status](https://img.shields.io/badge/Build-Passing-emerald.svg)](https://github.com/adonix26/yearbook-management)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite / TanStack Start](https://img.shields.io/badge/Framework-TanStack%20Start-orange.svg)](https://tanstack.com/start)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

**Milestone Yearbook** is a modern, collaborative publishing platform designed for high school journalism advisers, student editorial boards, and commercial print service bureaus. Plan your page ladder, sync Canva Connect spreads in real time, manage multi-stage pre-flight proofing, and submit certified press packages.

---

## 🌟 Key Highlights & Capabilities

### 1. 📖 Interactive Page Ladder & 2-Page Facing Spreads
- **Visual Spread Mode**: Side-by-side Left (Even) and Right (Odd) facing page mockups with realistic center spine crease and safe-zone margin guides.
- **Section Category Styling**: Color-coded category tags across all 8 high school sections (*Senior Portraits, Academics, Athletics, Student Life, Clubs, Performing Arts, Graduation*).
- **Quota & Asset Tracking**: Track high-resolution portrait quotas, candid slots, and copy requirements per page.

### 2. 🎨 Direct Canva Connect Studio Integration
- **Bidirectional Cloud Sync**: Seamlessly launch into Canva Connect API layout editor and return to Milestone with automatic thumbnail rendering and metadata caching.
- **Role-Scoped Layout Workbenches**: Staff members only see and edit their assigned page ranges.

### 3. 🎓 Student Submission Portal
- **Real-Time Print Preview**: Simulated 300 DPI high-gloss printed book spread rendering senior portraits, quotes, nicknames, extracurriculars, and future ambitions in real time.
- **Guided 4-Step Checklist**: Visual progress tracking from portrait upload to adviser sign-off.

### 4. 🖨️ Production Control & Print Bureau Manufacturing
- **Manufacturing Blueprint Card**: Hardcover Smythe-Sewn, Matte Soft-Touch + Gold Foil Stamping, 100# Gloss Enamel specs.
- **Automated Pre-Flight Inspection**: Verification of safe zones, 0.125" bleeds, 300 DPI native resolution, and font vector embedding.
- **Certified Binary Packages**: Export ISO 12647-2 press packages with SHA-256 integrity checksums.

### 5. 🛡️ Multi-School Database Row-Level Security (RLS)
- Strict PostgreSQL RLS policies enforce isolation between school centers, student privacy, and coordinator privileges directly at the data layer.

---

## 🚀 Quick Start & Local Development

### Prerequisites
- Node.js 20+ (Node 22 recommended)
- Docker & Docker Compose

### 1. Clone & Setup
```bash
git clone https://github.com/adonix26/yearbook-management.git
cd yearbook-management
cp .env.example .env
npm install
```

### 2. Run with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
The application will be available at `http://localhost:8080` (or your configured `HOST_PORT`).

---

## 🔑 Demo Access Personas (LocalDev)

Pre-seeded testing accounts with standard password: **`Yearbook2026!`**

| Role | Persona Name | Email | Password | Scope |
|---|---|---|---|---|
| **School Coordinator** | Elena Rostova | `coordinator@test.yearbook` | `Yearbook2026!` | School A (Demo High School) |
| **Global Super Admin** | System Admin | `admin@test.yearbook` | `Yearbook2026!` | Global Administration |
| **Faculty Advisor** | Sarah Jenkins | `teacher@test.yearbook` | `Yearbook2026!` | School A (Demo High School) |
| **Editorial Staff** | Marcus Vance | `member@test.yearbook` | `Yearbook2026!` | School A (Demo High School) |
| **Student Contributor** | Alex Rivera | `student@test.yearbook` | `Yearbook2026!` | School A (Demo High School) |
| **School B Coordinator** | David Kim | `coordinator-b@test.yearbook` | `Yearbook2026!` | School B (RLS Isolation) |

---

## 🏗️ Architecture & Technology Stack

- **SSR Framework**: TanStack Start / Nitro / Vite
- **Frontend**: React 18, TailwindCSS, Radix UI primitives, Lucide icons
- **Data Layer**: PostgreSQL 16 with Row-Level Security (RLS) & Server Functions
- **OAuth & Storage**: Direct Canva Connect API, Google Drive API v3, Box API v2 with AES-256-GCM token encryption
- **Deployment**: Docker container with multi-stage build & portable Node.js SSR runtime

---

## 📄 License

This project is licensed under the MIT License.
