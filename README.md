# Aegis

**Server-side AI anticheat — as accurate as Vanguard, zero invasion of your machine, privacy-proven on Midnight.**

## Quick Start

### 1. Backend (Python/FastAPI)

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend (React/Vite)

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 → Click **"Start Demo Match"** → Toggle cheats on players from the right sidebar.

---

## Project Structure

```
Midnight-Hacks/
├── server/                    # Python FastAPI backend
│   ├── main.py               # Entry point
│   ├── api/
│   │   ├── schema.py         # Universal telemetry schema (Pydantic)
│   │   ├── ingest.py         # WebSocket telemetry ingestion
│   │   ├── rest_ingest.py    # REST endpoints
│   │   ├── dashboard_ws.py   # Dashboard WebSocket stream
│   │   └── simulation_control.py  # Sim start/stop/cheat toggle
│   ├── detection/
│   │   ├── engine.py         # Detection fusion engine
│   │   ├── rules.py          # Rules-based detection (placeholder for ML)
│   │   └── models/           # TODO: Trained ML models
│   └── simulation/
│       ├── match_simulator.py # 5v5 match simulator
│       ├── cheat_profiles.py  # Injectable cheat behaviors
│       └── game_map.py        # 2D map with walls/LOS
│
├── dashboard/                 # React + Vite + TypeScript frontend
│   └── src/
│       ├── components/
│       │   ├── DetectionDashboard.tsx  # Main dashboard page
│       │   ├── ModuleSidebar.tsx       # 7 toggleable detection modules
│       │   ├── PlayerScoreCard.tsx     # Per-player score card
│       │   ├── AimAnalysis.tsx         # Aim detection chart
│       │   ├── WallhackDetection.tsx   # Minimap placeholder
│       │   ├── SpeedHackDetection.tsx  # Speed detection chart
│       │   ├── MacroDetection.tsx      # FFT bar chart
│       │   ├── ReactionTimeAnalysis.tsx # Stub
│       │   ├── TrackingAnalysis.tsx     # Stub
│       │   ├── CollabCheatDetection.tsx # Heatmap stub
│       │   ├── ZKBadgePanel.tsx         # ZK verification panel
│       │   └── MatchTimeline.tsx        # Event timeline
│       ├── hooks/
│       │   └── useDetectionStream.ts   # WebSocket hook
│       ├── services/
│       │   └── midnightService.ts      # Mock Midnight ZK service
│       └── types.ts                     # Shared TypeScript types
│
├── scripts/                   # Training & data gen (stubs)
│   ├── generate_cheat_data.py
│   ├── generate_mesh_data.py
│   ├── train_transformer.py
│   └── train_gat.py
│
├── contracts/                 # Midnight smart contracts (stubs)
│   ├── zkguard.compact
│   ├── deploy.ts
│   └── smoke-test.ts
│
└── PRD.md                     # Product Requirements Document
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| WS | `/telemetry/{match_id}` | Game server sends tick data |
| POST | `/api/tick` | REST tick ingestion |
| GET | `/api/verdict/{match_id}/{player_id}` | Get detection verdict |
| WS | `/dashboard/{match_id}` | Dashboard detection stream |
| POST | `/sim/start` | Start simulated match |
| POST | `/sim/stop` | Stop simulation |
| POST | `/sim/player/{id}/cheat/{type}` | Toggle cheat profile |
| GET | `/sim/status` | Get simulation status |

## Team Task Distribution

Each section below maps to a PRD phase. Stubs are in place — pick a task and flesh it out.

### 🔴 High Priority
- [ ] **§2A** — Implement Transformer model in `server/detection/models/` + `scripts/train_transformer.py`
- [ ] **§2B** — Implement GAT model in `server/detection/models/` + `scripts/train_gat.py`
- [ ] **§2C** — Generate synthetic training data in `scripts/generate_cheat_data.py` + `scripts/generate_mesh_data.py`
- [ ] **§3** — Polish dashboard visualization components (canvas minimap, FFT, scatter plots)

### 🟡 Medium Priority
- [ ] **§5** — Improve match simulator realism (events, combat, respawning)
- [ ] **§2D** — Upgrade `detection/rules.py` — implement reaction, tracking, collab analysis
- [ ] **§3** — Add canvas-based aim trajectory + behavioral mesh minimap

### 🟢 Lower Priority / Stretch
- [ ] **§4** — Midnight ZK integration (Compact contract deployment + proof server)
- [ ] **§6** — Record 90-second demo video
- [ ] **§6** — Write PITCH.md

## Cheat Types (for demo)

| Cheat | API Value | What it does |
|-------|-----------|--------------|
| Clean | `clean` | Normal behavior |
| Aimbot | `aimbot` | Snaps aim to nearest enemy |
| Wallhack | `wallhack` | Tracks enemies through walls |
| Speed Hack | `speedhack` | 2.5x movement speed |
| Macro | `macro` | Periodic recoil compensation |
| Collab | `collab` | Mirrors teammate's aim direction |
