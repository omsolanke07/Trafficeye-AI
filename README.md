# TrafficEye AI 🚦🔍

**TrafficEye AI** is an intelligent, real-time traffic surveillance, violation detection, and Automatic Number Plate Recognition (ANPR) platform. It leverages state-of-the-art computer vision (YOLOv11, OCR) and interactive dashboards to monitor traffic streams, detect violations, manage challans, and analyze intersection throughput.

---

## 🌟 Key Features

- **Live Traffic Monitoring**: Real-time camera feeds with bounding box overlays for detected vehicles, number plates, and violations.
- **ANPR (Automatic Number Plate Recognition)**: Plate localization and optical character recognition with confidence scoring and vehicle classification.
- **Violation Detection**:
  - Speed limit violations
  - Helmetless riding
  - Triple riding detection
  - Wrong-way driving & illegal turns
- **Interactive City Map**: Leaflet-based geospatial camera management with status indicators and quick-feed inspect.
- **Automated Challan Generation**: E-challan generation with snapshot evidence, vehicle owner lookup, and PDF export.
- **Analytics & Reporting**: Hourly traffic counts, peak congestion graphs, violation heatmaps, and audit logs.
- **WebSocket Streaming**: Low-latency live events and real-time alert dispatching to the dashboard.

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: React 19, Vite, Leaflet / React-Leaflet, Lucide Icons, Custom CSS Design System
- **Backend**: Node.js, Express 5, WebSocket (`ws`), Better-SQLite3, PDFKit, JWT Authentication
- **AI / Vision Pipeline**: Python 3, Ultralytics YOLOv11, OpenCV, PaddleOCR / EasyOCR

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- Python 3.10+ (for AI inference pipeline)
- Git

### 1. Installation

Clone the repository and install frontend & backend dependencies:

```bash
git clone https://github.com/omsolanke07/Trafficeye-AI.git
cd Trafficeye-AI
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and adjust configuration if needed:

```bash
cp .env.example .env
```

### 3. Database Migration & Seeding

Initialize the SQLite database schema and load initial junction and camera seed data:

```bash
npm run migrate
npm run seed
```

### 4. Running the Application Locally

To start both the Express backend API (Port 5000) and the Vite frontend (Port 5173) concurrently:

```bash
npm run dev:all
```

Or run them in separate terminals:

```bash
# Terminal 1: Backend Server
npm run server

# Terminal 2: Frontend Client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to access the dashboard.

---

## 📜 Available Scripts

- `npm run dev`: Runs the Vite development server.
- `npm run server`: Runs the Express backend server (`server/index.js`).
- `npm run dev:all`: Concurrently runs both backend and frontend servers.
- `npm run migrate`: Runs database migrations.
- `npm run seed`: Seeds the database with mock cameras, violations, and vehicles.
- `npm run build`: Builds the production frontend bundle.
- `npm run preview`: Previews the production build locally.
- `npm run lint`: Runs Oxlint for ultra-fast linting.

---

## 🛡️ License

This project is licensed under the MIT License.
