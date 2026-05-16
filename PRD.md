# ZK-Guard — Product Requirements Document

**Tagline:** Server-side AI anticheat — as accurate as Vanguard, zero invasion of your machine, privacy-proven on Midnight.

**The Problem:** Today's anticheats (Vanguard, EAC, BattlEye) install kernel-level drivers on your PC — reading memory, scanning processes, fingerprinting hardware — and beam raw telemetry to centralized servers. Players sacrifice total privacy for the right to play. Game developers are forced to choose between invasive surveillance and rampant cheating.

**The Solution:** ZK-Guard is a **server-side anticheat service** that any multiplayer game can integrate in under 10 lines of code. Game servers send lightweight telemetry (positions, aim angles, events) to ZK-Guard's AI engine via a universal REST/WebSocket API. A Transformer sequence model analyzes each player's behavior for inhuman patterns, while a Graph Attention Network analyzes the session's player graph for impossible spatial knowledge. A professional dashboard shows **live visual detection** with individually toggleable modules. A Midnight ZK proof certifies the verdict on-chain without exposing raw game data.

---

## Why This Is Better Than Vanguard

| Capability | Vanguard / EAC / BattlEye | ZK-Guard |
|---|---|---|
| Installed on player's PC | ✅ Kernel-level driver | ❌ **Nothing. Zero local footprint.** |
| Reads player's memory/files | ✅ Full system scan | ❌ Never touches the machine |
| Data sent to corp servers | ✅ Raw telemetry | ❌ ZK proof only — raw data stays private |
| Per-player input analysis | ✅ Server-side ML | ✅ Transformer sequence model |
| Cross-player session analysis | ❌ Players analyzed independently | ✅ **GNN Behavioral Mesh** (unique) |
| Game-agnostic integration | ❌ Custom per-game SDK | ✅ **10-line REST/WebSocket API** |
| Paid tools required | ✅ Licensed per-title | ❌ **100% free & open-source stack** |
| Verifiable on-chain | ❌ Opaque verdicts | ✅ Midnight ZK proof, publicly verifiable |

---

## Integration: How Any Game Plugs In (< 10 Lines)

ZK-Guard requires **zero client-side code**. The game server sends tick data via WebSocket or REST. Works with Unity, Unreal, Godot, custom engines — anything that can make an HTTP call.

**WebSocket (recommended for real-time games):**
```python
# Python game server — 6 lines to integrate
import websockets, json

async def send_tick(ws, match_id, players, events):
    await ws.send(json.dumps({
        "tick": tick_counter, "timestamp_ms": now_ms(),
        "match_id": match_id,
        "players": players,  # list of {player_id, position, velocity, aim, health}
        "events": events     # list of {player_id, event_type, timestamp_ms}
    }))

ws = await websockets.connect(f"ws://zkguard-host:8000/telemetry/{match_id}")
```

**REST (for turn-based / lower-frequency games):**
```bash
# Any language — single POST per tick
curl -X POST http://zkguard-host:8000/api/tick \
  -H "Content-Type: application/json" \
  -d '{"match_id":"abc","tick":1,"players":[...],"events":[...]}'
```

**Detection results callback:**
```python
# Game server receives verdicts via webhook or polling
GET /api/verdict/{match_id}/{player_id}
# Returns: {"verdict":"cheating","confidence":0.94,"modules":{"aim":0.97,"wallhack":0.02}}
```

**No paid tools. No SDK license. No client install. Just HTTP.**

---

## Tech Stack (100% Free & Open-Source)

| Layer | Choice | Cost | Rationale |
|---|---|---|---|
| AI Backend | **Python 3.11 + FastAPI + PyTorch** | Free | Native ML ecosystem. Async WebSocket ingestion. |
| Frontend | **React 18 + Vite + TypeScript** | Free | Real-time dashboard SPA. |
| Visualization | **Recharts + D3.js + HTML5 Canvas** | Free | Rich charts, graphs, animated minimap. No paid charting libs. |
| Smart Contracts | **Compact** (Midnight DSL) | Free | ZK circuit + ledger state for on-chain badge. |
| Blockchain SDK | **@midnight-ntwrk/compact-js** | Free | Official Midnight SDK. |
| Midnight Infra | **Docker** (Node + Indexer + Proof Server) | Free | Local devnet via `docker compose up`. |
| AI Models | **PyTorch (Transformer ~5M + GAT ~2M params)** | Free | Trained on synthetic data we generate ourselves. |
| Styling | **Tailwind CSS** | Free | Fast utility styling. |
| Package Manager | **pnpm** (frontend) + **pip** (backend) | Free | Monorepo: `/server` + `/dashboard`. |

> **Zero paid tools.** No API keys, no licensed SDKs, no cloud subscriptions required. Everything runs locally on free, open-source software.

---

## Build Phase Map

| Phase | Section | What | Depends On |
|---|---|---|---|
| **Phase 1** | §1 | Universal Telemetry API | — |
| **Phase 2** | §2 | AI Detection Engine (Transformer + GNN) | §1 |
| **Phase 3** | §3 | Visual Detection Dashboard | §2 (can start with mocks) |
| **Phase 4** | §4 | Midnight ZK Integration | §1 |
| **Phase 5** | §5 | Match Simulator + Cheat Injection | §1, §2 |
| **Phase 6** | §6 | Integration, Demo + Pitch | All |

**Critical path:** §1 → §2 → §5 → §6. Phases §3 and §4 proceed in parallel.

---

# PHASE 1 — UNIVERSAL TELEMETRY API

## §1. Game-Agnostic Telemetry Ingestion

**Goal:** Build a WebSocket + REST server that accepts real-time game telemetry in a universal format. Any multiplayer game integrates by sending tick data matching our schema — no SDK, no client-side agent.

### Step 1.1 — Define Universal Schema

`server/api/schema.py` — Pydantic models:
```python
class PlayerState(BaseModel):
    player_id: str
    position: Vec3          # x, y, z
    velocity: Vec3          # vx, vy, vz
    aim: AimAngles          # pitch, yaw
    aim_delta: Vec2         # frame-to-frame aim change
    state_flags: int        # bitmask: crouching, ADS, airborne, sprinting
    health: float
    visible_to: list[str]   # IDs of players who can see this player

class GameEvent(BaseModel):
    player_id: str
    event_type: str         # fire, hit, kill, damage, reload, jump, ability
    timestamp_ms: int
    target_id: str | None
    metadata: dict          # headshot, distance, weapon, damage, etc.

class TickData(BaseModel):
    tick: int
    timestamp_ms: int
    match_id: str
    players: list[PlayerState]
    events: list[GameEvent]
```

### Step 1.2 — WebSocket Ingestion Endpoint

`server/api/ingest.py`:
- `ws://localhost:8000/telemetry/{match_id}` — accepts TickData JSON
- Validates against schema, rejects invalid messages with descriptive error
- Buffers ticks into sliding windows (128 ticks = 1 analysis window at 64 tick/s)
- Forwards detection results to dashboard clients

### Step 1.3 — REST Ingestion Endpoint

`server/api/rest_ingest.py`:
- `POST /api/tick` — accepts same TickData JSON via HTTP
- `GET /api/verdict/{match_id}/{player_id}` — returns latest detection verdict
- Enables integration from any language/engine without WebSocket support

### Step 1.4 — Dashboard WebSocket

`server/api/dashboard_ws.py`:
- `ws://localhost:8000/dashboard/{match_id}` — streams detection results to React UI

**Acceptance criteria:**
- Server starts on port 8000, accepts WebSocket + REST connections
- Telemetry at 64 ticks/sec ingested without error
- Invalid messages rejected with descriptive error
- Dashboard WebSocket streams detection data to connected clients

**Dependencies:** None.

---

# PHASE 2 — AI DETECTION ENGINE

## §2A. Behavioral Transformer (Per-Player Analysis)

**Goal:** Transformer sequence model analyzing each player's input stream for aimbots, macros, inhuman reaction times, speed hacks, and tracking anomalies.

### Step 2A.1 — Model Architecture (~5M params)

- `d_model=64, n_heads=4, n_layers=6, d_ff=256, max_seq_len=128`
- Decoder-only (causal attention)
- **Input:** 9 features per tick × 128 ticks: `[aim_delta_x, aim_delta_y, velocity, acceleration, angular_velocity, jitter, state_flags, event_flags, delta_time]`
- **Dual heads:** (1) next-event prediction → surprise score, (2) anomaly classification → P(cheat)
- **Output per player per window:** `{ aimScore, reactionScore, macroScore, speedScore, trackingScore, overallAnomaly, confidence }`

### Step 2A.2 — Detection Modules (Model A)

| Module | Catches | Visual Signal |
|---|---|---|
| 🎯 Aim Analysis | Aimbot, flick bot, silent aim | Path straightness plot, angular velocity spikes, snap markers |
| ⚡ Reaction Time | Triggerbot, pre-fire | Reaction scatter plot, inhuman consistency bands |
| 🤖 Macro Detection | Recoil scripts, bhop | FFT spectrum peaks, variance chart, click histogram |
| 💨 Speed/Movement | Speed hack, teleport | Velocity graph with physics-limit overlay |
| 🎯 Tracking | Smooth aim, lock-on | Crosshair-to-target correlation graph |

## §2B. Behavioral Mesh GAT (Cross-Player Analysis)

**Goal:** Graph Attention Network taking ALL players as a graph, detecting wallhacks, ESP, and collaborative cheating through impossible spatial knowledge.

### Step 2B.1 — Model Architecture (~2M params)

- 2-layer GAT, 4 attention heads per layer
- Temporal aggregation via mini-Transformer (`d_model=32`)
- **Nodes:** Each player (12 features: position, velocity, aim, health, visible_to_flags)
- **Edges:** Fully connected (4 features: distance, angle_from_aim, is_LOS, time_since_visible)
- **Output:** `knowledgeScore (0–1)` per player

### Step 2B.2 — Detection Modules (Model B)

| Module | Catches | Visual Signal |
|---|---|---|
| 👁 Wallhack / ESP | Acting on invisible info | Mesh minimap with red knowledge-anomaly edges |
| 🤝 Collab Cheat | Ghosting, info sharing | Coordination heatmap, synchronized movement viz |

## §2C. Training Pipeline (All Free Tools)

### Step 2C.1 — Synthetic Data Generation

- `scripts/generateCheatData.py` — 500K+ events across 7 cheat profiles (aimbot_perfect, aimbot_humanized, triggerbot, spinbot, recoil_script, macro_bot, wallhack_aim)
- `scripts/generateMeshData.py` — 10K+ sessions with clean/wallhack/ESP/collab profiles
- **No paid datasets.** All training data is synthetically generated.

### Step 2C.2 — Model Training

- `scripts/trainTransformer.py` — PyTorch training with cosine LR, checkpoints every 10 epochs
- `scripts/trainGAT.py` — PyTorch Geometric training on synthetic sessions
- **No cloud GPU required.** Models are small enough to train on a consumer GPU (RTX 3060+) or even CPU overnight.

## §2D. Detection Fusion Engine

`server/detection/engine.py`:
- Combines Model A per-player + Model B cross-player scores
- Per-player breakdown: confidence per module (aim, reaction, macro, speed, tracking, wallhack, collab)
- Session verdict: `clean` / `suspicious` / `cheating` with confidence
- Streams results via WebSocket to dashboard

**Acceptance criteria:**
- Perfect aimbot detected >99% on synthetic data
- Humanized aimbot >85%, Wallhack >90% via GNN
- False positive rate <5%
- Detection results stream within 200ms of window completion

**Dependencies:** §1.

---

# PHASE 3 — VISUAL DETECTION DASHBOARD

## §3. Professional Detection UI with Live Visuals

**Goal:** React dashboard displaying ALL detection data in real-time with animated, professional visualizations. Every detection module is independently toggleable. The dashboard is the **"wow moment"** for judges.

### Step 3.1 — Dashboard Layout

`dashboard/src/components/DetectionDashboard.tsx`:
- **Top bar:** Match info, player count, elapsed time, pulsing global threat level indicator
- **Left sidebar:** 7 toggleable detection modules (each with animated ON/OFF switch)
- **Center:** Active visualization panels (dynamically change based on active modules)
- **Right sidebar:** Player score cards with mini-gauges, sortable by threat level
- **Bottom:** Match timeline with color-coded detection event markers

### Step 3.2 — Visual Detection Modules (7 Toggleable Panels)

Each module is a self-contained visual panel with **animated, real-time charts:**

| # | Component | Live Visual |
|---|---|---|
| 1 | `AimAnalysis.tsx` | **Animated aim trajectory** on 2D canvas — draws the player's crosshair path in real-time. Angular velocity line chart with red spike markers. Path straightness gauge with animated needle. Snap-to-target event markers pulse on detection. |
| 2 | `WallhackDetection.tsx` | **Animated 2D minimap** (HTML5 Canvas) — all players as colored dots with directional aim cones. Visibility arcs as translucent wedges. **Red pulsing edges** between players when knowledge anomaly detected. Knowledge score bars per player. |
| 3 | `SpeedHackDetection.tsx` | **Velocity line chart** with physics-limit overlay (red dashed line). Position delta scatter plot. Teleport flags as animated warning icons on the timeline. |
| 4 | `MacroDetection.tsx` | **FFT frequency spectrum** (bar chart) — periodic peaks glow when macro detected. Input variance analysis chart. Click interval histogram with distribution overlay. |
| 5 | `ReactionTimeAnalysis.tsx` | **Scatter plot** of per-kill reaction times — human range band (green), inhuman zone (red). Statistical distribution curve overlay. CDF curve comparison vs. human baseline. |
| 6 | `TrackingAnalysis.tsx` | **Crosshair-to-hitbox correlation graph** — animated line showing how closely aim tracks target center. Lock-on duration bar chart. Smooth-aim probability gauge. |
| 7 | `CollabCheatDetection.tsx` | **Player-pair coordination heatmap** — color intensity = coordination anomaly. Synchronized movement visualization. Info-flow directed graph with animated arrows. |

### Step 3.3 — Player Score Cards

`dashboard/src/components/PlayerScoreCard.tsx`:
- Compact card per player with mini-gauge arcs for each detection type
- Color-coded verdict badge: ✅ Clean (green pulse) / ⚠️ Suspicious (amber pulse) / ❌ Cheating (red pulse)
- Click to expand → full per-module breakdown with historical trend graphs
- **Animated transitions** when scores change — smooth color morphs, gauge animations

### Step 3.4 — Match Timeline

`dashboard/src/components/MatchTimeline.tsx`:
- Horizontal scrollable timeline spanning match duration
- Color-coded detection event markers by type and severity
- Hover popover with event details
- Zoom/scroll controls

### Step 3.5 — Behavioral Mesh Minimap

`dashboard/src/components/BehavioralMeshPanel.tsx`:
- Full 2D top-down canvas minimap of the match
- Players: colored dots with directional aim indicators
- Visibility cones as translucent arcs
- **Knowledge anomaly edges:** animated red pulsing lines between players
- Real-time update from server telemetry stream at 16fps

### Step 3.6 — ZK Badge Panel

`dashboard/src/components/ZKBadgePanel.tsx`:
- Midnight ZK proof status per player
- Badge mint status, tx hash, session ID
- Side-by-side: "What the game dev sees" (single boolean) vs. "What ZK-Guard analyzed" (all detection data — never shared)

### Step 3.7 — WebSocket Hook

`dashboard/src/hooks/useDetectionStream.ts`:
- Connects to `ws://localhost:8000/dashboard/{matchId}`
- Manages real-time state for all modules
- Exports: `{ players, detections, meshData, timeline, toggleModule, activeModules }`

**Acceptance criteria:**
- All 7 modules render with animated visuals and toggle ON/OFF independently
- Dashboard updates in real-time (<200ms latency)
- Behavioral Mesh minimap renders all players with animated visibility cones and anomaly edges
- Player score cards animate smoothly on score changes
- Professional, technically impressive appearance — not a toy
- Works in Chrome, no console errors

**Dependencies:** §2 (can begin with mock data).

---

# PHASE 4 — MIDNIGHT ZK INTEGRATION

## §4. On-Chain Verification

**Goal:** Detection verdict fed as private witness into Midnight's Proof Server. Compact contract verifies ZK proof on-chain, issues session badge. Game dev queries badge — gets verified boolean, sees zero telemetry.

### Step 4.1 — Compact Smart Contract

`contracts/zkguard.compact`:
```compact
ledger {
  verifiedSessions: Map<Bytes32, VerificationRecord>;
}

struct VerificationRecord {
  isVerified: Boolean;
  timestamp:  Uint64;
  sessionId:  Bytes32;
}

circuit verifyHumanity(
  private isHuman:   Boolean,
  public  sessionId: Bytes32
): Boolean {
  assert(isHuman == true);
  return true;
}

export transaction mintBadge(
  proof:     Proof<verifyHumanity>,
  sessionId: Bytes32
): Void {
  verify(verifyHumanity, proof, sessionId);
  verifiedSessions.set(sessionId, VerificationRecord {
    isVerified: true,
    timestamp:  ledger.blockTime,
    sessionId:  sessionId,
  });
}

export query isVerified(sessionId: Bytes32): Boolean {
  return verifiedSessions.lookup(sessionId)?.isVerified ?? false;
}
```

### Step 4.2 — Deploy & Test

- `contracts/deploy.ts` — deploy to local devnet, write address to `.env`
- `contracts/smoke-test.ts` — submit synthetic proof, verify `isVerified` returns `true`

### Step 4.3 — Service Integration

- `dashboard/src/services/midnightService.ts` — wallet connection, proof submission, badge query
- `dashboard/src/services/midnightService.mock.ts` — mock mode (`VITE_USE_MOCK_SDK=true`)
- Docker Compose: Midnight Node + GraphQL Indexer + Proof Server

**Acceptance criteria:**
- Circuit compiles. Badge mints. `isVerified` returns `true`.
- Mock mode allows full dashboard demo without Docker.

**Dependencies:** §1 Docker stack running.

---

# PHASE 5 — MATCH SIMULATOR

## §5. Demo Match Simulation with Cheat Injection

**Goal:** Simulate a realistic 5v5 FPS match with configurable cheat profiles. Judges can **toggle cheats ON/OFF per player** from the dashboard and watch visual detection modules respond in real-time.

### Step 5.1 — Match Simulator Engine

`server/simulation/matchSimulator.py`:
- 5v5 match on a 2D map with obstacles (walls, corridors)
- 10 AI-controlled players with human-like movement and aim
- Outputs telemetry in standard `TickData` schema at 64 ticks/sec
- Feeds directly into the telemetry ingestion pipeline (§1)

### Step 5.2 — Injectable Cheat Profiles

| Profile | Behavior | Visual Detection Response |
|---|---|---|
| 🟢 `clean` | Baseline human behavior | All gauges green, no anomalies |
| 🎯 `aimbot` | Snap-to-target aim | Aim trajectory straightens, angular velocity spikes red |
| 👁 `wallhack` | Aim tracks invisible players | Mesh minimap lights up with red pulsing edges |
| ⚡ `speedhack` | Velocity exceeds limits | Velocity chart breaks above red physics-limit line |
| 🤖 `macro` | Periodic recoil comp | FFT spectrum shows periodic peaks glowing |
| 🤝 `collab` | Coordinated info sharing | Coordination heatmap intensifies between player pair |

### Step 5.3 — Simulation Control API

`server/api/simulation_control.py`:
- `POST /sim/start` — start match
- `POST /sim/player/{id}/cheat/{type}` — toggle cheat profile
- `POST /sim/stop` — end match
- `GET /sim/status` — current match state

Dashboard integrates toggle buttons per player so judges can inject cheats live.

**Acceptance criteria:**
- Match runs at 64 ticks/sec without frame drops
- Toggling cheat → corresponding visual module flags player within 3 seconds
- Toggling back to clean → scores normalize within 5 seconds
- Clean players stay green throughout

**Dependencies:** §1, §2.

---

# PHASE 6 — INTEGRATION, DEMO + PITCH

## §6. End-to-End Demo

**Goal:** Run the full pipeline, record a 90-second demo video, finalize pitch.

### Step 6.1 — Integration Checklist

- [ ] Server starts: FastAPI + AI models loaded
- [ ] Docker Compose: Midnight Node + Indexer + Proof Server
- [ ] Dashboard connects via WebSocket
- [ ] Match simulator starts 5v5 match
- [ ] All 7 visual detection modules render with live animated data
- [ ] Toggle aimbot ON → Aim Analysis visuals spike red ✅
- [ ] Toggle wallhack ON → Mesh minimap shows red pulsing edges ✅
- [ ] Toggle back to clean → visuals normalize ✅
- [ ] ZK verification → badge minted on Midnight ✅
- [ ] `isVerified(sessionId)` returns `true` ✅

### Step 6.2 — Demo Video (90 Seconds)

```
0–10s: THE HOOK
  "Vanguard reads your memory. EAC scans your files. BattlEye
  fingerprints your hardware. What if an anticheat never touched
  your machine — and was even more accurate?"

10–30s: THE DASHBOARD
  - Show the detection dashboard monitoring a live 5v5 match
  - All 10 players visible — animated score cards, mesh minimap, timeline
  - Everything green — all players clean

30–55s: THE DETECTION (WOW MOMENT — VISUALS)
  - Toggle "Aimbot" on Player 3 → Aim Analysis canvas shows straight-line
    trajectory → angular velocity chart spikes red → snap markers pulse
  - Toggle "Wallhack" on Player 7 → Mesh minimap lights up →
    red pulsing edges show Player 7 tracking through walls
  - Toggle "Macro" on Player 5 → FFT spectrum shows glowing periodic peaks
  - Show player score cards animating from green → red in real-time
  - "ZK-Guard caught 3 cheaters in 3 seconds. Without touching
    a single player's machine."

55–75s: THE PRIVACY PROOF
  - Run ZK verification → badge minted on Midnight
  - Show: "What the game dev sees" = single boolean ✅
  - Show: "What was never shared" = all telemetry + detection data
  - "Zero kernel access. Zero data exposure. Just math."

75–90s: THE INTEGRATION PITCH
  - Show the 6-line integration code snippet
  - "Any game. Any engine. 10 lines of code. No SDK license.
    No paid tools. No client install. Just HTTP."
  - "ZK-Guard: server-side AI anticheat with Behavioral Mesh,
    zero invasion, and zero-knowledge privacy on Midnight."
```

### Step 6.3 — Pitch Bullets (PITCH.md)

1. **Zero Local Footprint** — nothing on the player's machine. No kernel driver, no agent, no scanning.
2. **10-Line Integration** — any multiplayer game integrates via REST or WebSocket. No SDK license, no paid tools.
3. **Behavioral Mesh Analysis** — the only anticheat using a trained GNN to analyze cross-player spatial graphs, catching wallhacks and collaborative cheating that per-player analysis misses.
4. **Visual Real-Time Detection** — 7 animated detection modules with live charts, graphs, and an interactive minimap.
5. **ZK-Verified on Midnight** — on-chain proof of clean status. Game devs get a verified boolean, never raw data.

---

# Cross-Cutting Concerns

## Game Integration Examples (Multiple Engines)

### Unity C# (6 lines)
```csharp
var ws = new ClientWebSocket();
await ws.ConnectAsync(new Uri($"ws://zkguard:8000/telemetry/{matchId}"), ct);
// Each tick:
var tick = JsonConvert.SerializeObject(new { tick=t, timestamp_ms=ms,
    match_id=matchId, players=playerStates, events=gameEvents });
await ws.SendAsync(Encoding.UTF8.GetBytes(tick), WebSocketMessageType.Text, true, ct);
```

### Unreal C++ (REST)
```cpp
FHttpRequestRef Req = FHttpModule::Get().CreateRequest();
Req->SetURL(TEXT("http://zkguard:8000/api/tick"));
Req->SetVerb(TEXT("POST"));
Req->SetContentAsString(TickDataJson);
Req->ProcessRequest();
```

### Godot GDScript
```gdscript
var ws = WebSocketPeer.new()
ws.connect_to_url("ws://zkguard:8000/telemetry/" + match_id)
# Each tick:
ws.send_text(JSON.stringify({"tick":t,"match_id":match_id,"players":states,"events":evts}))
```

### Node.js (custom server)
```javascript
const ws = new WebSocket(`ws://zkguard:8000/telemetry/${matchId}`);
ws.send(JSON.stringify({ tick, timestamp_ms, match_id, players, events }));
```

## Open Questions

| # | Question | Owner | Resolved by |
|---|---|---|---|
| 1 | Session ID scheme: UUID vs. keccak256(matchId + playerId) | Dev A + B | §4 interface agreement |
| 2 | GPU for overnight training (local RTX vs. cloud free tier) | Dev B | Friday night |
| 3 | Demo: real ZK proof or mock mode for video | All | Sunday morning based on stability |

## Risks (Top 5)

1. **Compact circuit compile failure** — Midnight tooling is pre-production. Mitigation: validate trivial circuit Friday night. Mock if blocked.
2. **Transformer / GNN training doesn't converge** — Mitigation: checkpoint every 10 epochs. Statistical classifier as fallback.
3. **Match simulator behavior too simple** — Mitigation: detection module visual responses matter more than game realism for judges.
4. **WebSocket performance at 64 tick/s** — Mitigation: batch ticks (send every 4 = 16 msg/sec).
5. **Dashboard too complex to polish** — Mitigation: prioritize 3 core visual modules (Aim, Wallhack, Macro) first. 3 polished > 7 rough.

## Definition of Done

The full ZK-Guard demo is done when:
- The dashboard monitors a live simulated 5v5 match with all players visible and animated visualizations running
- A judge can **toggle cheats ON/OFF per player** and watch visual detection modules respond in real-time — charts spike when cheat is ON, normalize when OFF
- At least 3 detection modules (Aim Analysis, Wallhack/Mesh, Macro) show professional animated visualizations
- All detection modules are independently toggleable ON/OFF
- The ZK proof flow works: verdict → proof → on-chain badge → `isVerified` returns `true`
- Raw telemetry is absent from the on-chain transaction
- Any game can integrate via the 10-line REST/WebSocket API — no paid tools required
- The demo video is recorded with the story-driven structure
- **Nothing is installed on the player's machine. Zero local footprint. This is non-negotiable.**