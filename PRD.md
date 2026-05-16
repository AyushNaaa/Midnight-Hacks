# ZK-Guard — Product Requirements Document

**Tagline:** AI-powered anticheat with zero-knowledge proof privacy on Midnight.

**The Problem:** Traditional anticheats demand kernel-level access to your entire machine — reading memory, scanning processes, fingerprinting hardware — and beam all of that telemetry to centralized servers. Players sacrifice total privacy for the right to play.

**The Solution:** ZK-Guard runs a local behavioral AI model that analyzes mouse, keyboard, and controller input in real-time, cross-references it against the spatial behavior of other players in the session ("Behavioral Mesh Analysis"), and outputs a single boolean: *clean* or *cheating*.

**How It Works:** That boolean is fed as a private witness into Midnight's local Proof Server, which generates a ZK proof. A Compact smart contract verifies the proof on-chain and issues a "Verified Clean Player" session badge — without ever exposing the user's raw telemetry, game state, or device fingerprint to the ledger or the game developer.

---

## 0. Tech Stack (Locked Decisions)

| Layer | Choice | Rationale |
|---|---|---|
| Smart contracts | **Compact** (Midnight DSL) | TypeScript-inspired ZK circuit language; the only supported language for Midnight's proof system. ZK logic (circuit + ledger state) lives here. |
| Frontend framework | **React 18 + Vite + TypeScript** | HMR, TypeScript-native, no SSR needed for a demo SPA. Plays well with Midnight.js. |
| Blockchain SDK | **@midnight-ntwrk/compact-js** + **@midnight-ntwrk/dapp-connector-api** | Official Midnight SDK. compact-js wraps compiled contracts; dapp-connector-api brokers Lace wallet connection. |
| Wallet | **Lace Wallet** (Midnight-enabled build) | Only wallet with Midnight shard support. Required for signing `mintBadge` transactions. |
| Local infrastructure | **Docker** (Midnight Node + GraphQL Indexer + Proof Server) | Local proof generation is non-negotiable — raw telemetry must never leave the device. All three services run via `docker compose up`. |
| AI Model Architecture | **Behavioral Sequence Model (Autoencoder + Anomaly Detector)** | Treats user inputs over time as behavioral sequences. A lightweight autoencoder trained on human mouse/keyboard dynamics flags anomalous patterns (aimbots, macros, wallhacks) via reconstruction error. |
| Behavioral Mesh | **Cross-Player Spatial Anomaly Graph** | Unique differentiator: correlates each player's inputs against what they *should* be able to see/know based on other players' positions, detecting ESP/wallhacks at a session level. |
| AI Inference Engine | **ONNX Runtime Web (WASM/WebGL)** | Cross-platform, fast local inference inside the browser. Runs quantized models without server API calls. |
| Styling | **Tailwind CSS** | Utility speed for demo UI. No design system ceremony needed for a hackathon. |
| Package manager | **pnpm** | Workspace support; faster installs than npm for a monorepo. |

**⚠ Unresolved decisions (flagged inline):**
- ✅ **Compact circuit inputs:** **RESOLVED — single boolean witness (`isHuman: Boolean`).** Confidence is shown in the UI only. This minimizes circuit compile risk and proof latency.
- 🚩 **Session ID scheme:** wallet address hash vs. client-generated UUID. Affects replay-attack surface. Decided in §2 / §4 interface agreement.
- ✅ **Model architecture:** **RESOLVED — Autoencoder + anomaly detector.** Achievable within 48 hours using synthetic training data generated during the hackathon.

---

## Build Phase Map

- **Phase 1:** Local infrastructure (§1) — Docker services running before any contract or frontend code.
- **Phase 2:** Compact smart contract (§2) — compile + deploy before wiring the SDK.
- **Phase 3:** AI Anticheat + Behavioral Mesh (§3) — anomaly detector training, Behavioral Mesh graph, quantization, and browser inference.
- **Phase 4:** SDK integration layer (§4) — Midnight.js glue between AI output and on-chain tx.
- **Phase 5:** React frontend (§5) — demo UI wiring phases 1–4 together.
- **Phase 6:** Integration, demo polish, video (§6) — end-to-end happy path, then recording.

Each numbered section below = one discrete build task assignable to a team member. The critical path is §1 → §2 → §4 → §6; §3 and §5 can proceed in parallel.

---

# PHASE 1 — LOCAL INFRASTRUCTURE

## 1. Docker Compose Stack

**Goal:** Bring up the three local Midnight services — Node, GraphQL Indexer, and Proof Server — via a single `docker compose up`. Every subsequent section depends on these endpoints being stable.

**Deliverables:**
- Repo root: `docker-compose.yml` with three named services:
  - `midnight-node` — local devnet node, exposes port `9944` (RPC) and `9933` (WS).
  - `proof-server` — Midnight local proof generator, exposes port `9432`. This is the service that runs ZK circuit evaluation. It is the most resource-intensive component.
  - `graphql-indexer` — Midnight's chain indexer, exposes port `4000`. Provides the `isVerified(sessionId)` read endpoint for the game developer demo.
- `.env.example` at repo root listing:
  - `MIDNIGHT_NODE_URL=http://localhost:9944`
  - `PROOF_SERVER_URL=http://localhost:9432`
  - `INDEXER_URL=http://localhost:4000/graphql`
  - `VITE_CONTRACT_ADDRESS=` (populated after §2 deploy)
- `README.md` with verbatim startup commands:
  ```bash
  docker compose up -d
  # Verify:
  curl http://localhost:9432/health     # proof server
  curl http://localhost:4000/graphql    # indexer playground
  ```

**Acceptance criteria:**
- `docker compose up` completes without error on a cold pull.
- `curl http://localhost:9432/health` returns `{ "status": "ok" }`.
- GraphQL Playground loads at `http://localhost:4000/graphql`.
- All three containers stay running for 10 minutes without restart.

**Dependencies:** None.

**Technical notes + risks:**
- Use official Docker images from `midnight-ntwrk` on Docker Hub. Pin image tags — `latest` can drift mid-hackathon.
- Risk: Docker Desktop on macOS needs ≥ 6 GB RAM allocated; the Proof Server is memory-hungry. Verify in Docker Desktop → Settings → Resources before Friday night.
- Risk: ARM (M1/M2 Mac) — not all Midnight images have `arm64` builds. Test with Rosetta 2 emulation (`platform: linux/amd64` in compose). If this blocks, fallback to a Linux VM or a teammate's Intel machine for the Proof Server only.
- The GraphQL Indexer must fully sync before `isVerified` queries return correct results. On a fresh devnet this is near-instant; on a shared testnet it can lag.

---

# PHASE 2 — COMPACT SMART CONTRACT

## 2. ZK Circuit + Ledger State

**Goal:** Write, compile, and deploy the `zkguard.compact` contract to the local Midnight devnet. The contract must: (a) define a minimal circuit that proves the AI's clean/cheat boolean without exposing it, (b) write a badge to ledger state on successful proof verification, and (c) expose a read query for game developers. **Keep the circuit as simple as possible** — every minute debugging Compact syntax is a minute not spent on the AI demo.

**Deliverables:**
- `contracts/zkguard.compact` implementing:

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

- `contracts/deploy.ts` — script using `@midnight-ntwrk/compact-js` to deploy the compiled contract to local devnet, print contract address, and write it to `.env`.
- `contracts/smoke-test.ts` — script that submits a synthetic `mintBadge` tx with a hardcoded valid proof, then calls `isVerified` and asserts `true`. Required before any frontend work starts.

**Acceptance criteria:**
- `npx compact compile zkguard.compact` exits 0 with no errors.
- `ts-node contracts/deploy.ts` prints a contract address and writes `VITE_CONTRACT_ADDRESS` to `.env`.
- Smoke test (`ts-node contracts/smoke-test.ts`) passes end-to-end: tx confirmed, `isVerified` returns `true`.
- GraphQL Indexer reflects the `VerificationRecord` within 5 seconds of tx confirmation.

**Dependencies:** §1 (Proof Server + Node must be running).

**Technical notes + risks:**
- 🚩 **Critical risk:** Compact syntax evolves rapidly on devnet builds. If the circuit API for `Proof<T>` or `verify()` differs from docs, Dev A must debug this before Sat noon or the entire proof pipeline is blocked. Have the Midnight Discord open.
- The private witness (`isHuman`) appears only in the local circuit execution inside the Proof Server. It is **not** serialized into the transaction body — verify this by inspecting the tx hex after the smoke test.
- The circuit is intentionally minimal (single boolean assert). Confidence scores and Behavioral Mesh results are displayed in the UI but do not enter the ZK proof. This is by design: the privacy claim ("we prove a clean session without revealing how") is equally valid.
- 🚩 **Session ID collision:** two users with the same `sessionId` would overwrite each other's record. For the hackathon, generate session IDs as `keccak256(walletAddress + timestamp)` in the client. Document this as a known limitation.

---

# PHASE 3 — AI ANTICHEAT + BEHAVIORAL MESH ANALYSIS

## 3A. Behavioral Anomaly Detector (Input Analysis)

**Goal:** Build a local anomaly detection model that analyzes mouse/keyboard input streams and flags non-human behavior patterns (aimbots, macros, inhuman reaction times). The model must be **trainable within the hackathon** using synthetic data we generate ourselves, and must **run in the browser** via ONNX Runtime Web.

**Technical Specifications:**
1. **Data Ingestion & Feature Extraction:**
   - **Input Stream:** Capture DOM mouse/keyboard events at native browser event rate (~60Hz). Each event produces a feature vector: `[delta_time_ms, dx, dy, velocity, acceleration, angular_velocity, mouse_btn_state, keys_bitmask]` (8 features).
   - **Windowing:** Sliding window of 64 consecutive events (~1 second of input). Each window produces a `Float32Array` tensor of shape `[1, 64, 8]`.
   - **Feature Engineering:** Compute derived features per-window: path straightness ratio (distance / path length), jitter variance, velocity distribution kurtosis. These statistical features catch the most obvious cheat signatures.

2. **Model Architecture (Achievable in 48 Hours):**
   - **Primary Model — Convolutional Autoencoder:**
     - Encoder: `Conv1D(8→32, k=5) → ReLU → Conv1D(32→16, k=3) → ReLU → Flatten → Dense(16)`
     - Decoder: `Dense(16) → Reshape → ConvTranspose1D(16→32, k=3) → ReLU → ConvTranspose1D(32→8, k=5)`
     - **Detection method:** Train on *human-only* input sequences. At inference, compute reconstruction error (MSE). Cheat inputs (unnaturally smooth, perfectly linear, zero-jitter) produce high reconstruction error → flagged as anomalous.
     - **Why autoencoder over a classifier:** No labeled "cheat" data needed for training. We train on human data only. Anything the model *can't reconstruct* is suspicious.
   - **Secondary Model — Statistical Feature Classifier (Fallback):**
     - Lightweight `Dense(6→32→16→2)` classifier operating on the per-window statistical features.
     - Trained on labeled synthetic data: human vs. scripted cheat trajectories.
     - Used as a fast fallback if the autoencoder is not ready in time.
   - **Final output:** Ensemble both scores → `{ isHuman: boolean; confidence: number; anomalyScore: number }`.

3. **Training Data Strategy (Critical — This Is How We Ship a Real Model):**
   - **Human data:** Captured live during development. Every team member spends 15 minutes interacting with the GameplayTestPanel (see §5), generating ~54,000 human input events. Augmented with open-source mouse dynamics datasets (Balabit Mouse Dynamics Dataset, DFL Dataset).
   - **Cheat data (synthetic):** Generated programmatically via `src/ai/cheatSimulator.ts`:
     - `aimbot` — linear interpolation from current position to target at constant velocity, zero jitter
     - `triggerBot` — human-like movement with inhuman reaction time (< 50ms snap-to-target)
     - `spinBot` — constant angular velocity rotation, uniform speed
     - `macroBot` — perfectly periodic click patterns with zero variance
   - **Training script:** `scripts/trainModel.py` — PyTorch script, trains in < 10 minutes on CPU, exports to ONNX with Int8 quantization. Final model size target: < 5MB.

4. **Inference Pipeline:**
   - Load ONNX model in browser via `onnxruntime-web` (WASM execution provider, WebGL as fallback).
   - Inference latency target: < 50ms per window on a modern laptop.
   - Runs on a `requestAnimationFrame` loop, scoring every ~1 second of accumulated input.

## 3B. Behavioral Mesh Analysis (Cross-Player Detection) ⭐ UNIQUE DIFFERENTIATOR

**Goal:** This is what makes ZK-Guard different from every other anticheat. Traditional anticheats only analyze one player at a time. Behavioral Mesh Analysis builds a **spatial knowledge graph** across all players in a session and detects when a player's inputs reveal knowledge they *shouldn't have* — the defining signature of wallhacks and ESP.

**How It Works:**
1. **Spatial Graph Construction:** Each player is a node. Edges represent **line-of-sight visibility** computed from position + orientation + level geometry (simplified as raycast against obstacle bitmask).
2. **Knowledge Score:** For each player, compute: *"Is this player's aim direction / movement direction correlated with the position of players they CANNOT see?"* A high correlation = the player has information they shouldn't → ESP/wallhack detected.
3. **Implementation:**
   - `src/ai/meshAnalyzer.ts`:
     - `BehavioralMesh` class maintains a graph of `PlayerNode` objects.
     - `updatePlayerState(playerId, x, y, z, pitch, yaw)` — updates the graph.
     - `computeVisibilityEdges()` — recalculates line-of-sight between all player pairs.
     - `computeKnowledgeAnomaly(playerId)` — returns a `knowledgeScore: number` (0–1). High score = aiming at / moving toward invisible players.
   - `src/ai/meshVisualizer.ts` — renders a real-time 2D top-down minimap showing:
     - Player positions as colored dots
     - Visibility cones as translucent arcs
     - Knowledge anomaly edges as red lines connecting a player to targets they're tracking but can't see
     - This visualization is the **money shot** for the demo video

4. **Demo Integration:** The GameplayTestPanel simulates a 4-player session. In "Wallhack Mode" (see cheat simulator), the local player's aim tracks hidden players. The mesh visualizer shows the red anomaly edges appearing in real-time.

**Deliverables (Combined §3A + §3B):**
- `src/ai/modelLoader.ts` wrapping `onnxruntime-web` to load the `anticheat-model.onnx` file asynchronously.
- `src/ai/featureExtractor.ts` to convert raw DOM mouse/keyboard events into `Float32Array` tensors formatted as `[batch, sequence_length, features]`, plus statistical feature computation.
- `src/ai/behaviorAnalyzer.ts` with:
  - `BehaviorResult` type: `{ isHuman: boolean; confidence: number; anomalyScore: number; knowledgeScore: number; sessionId: string; }`.
  - `BehaviorAnalyzer` class:
    - Maintains a sliding window buffer of the last N input events.
    - `analyze()` — runs the autoencoder forward pass, computes reconstruction error, queries the `BehavioralMesh` for knowledge anomaly, ensembles both signals, returns `BehaviorResult`.
- `src/ai/meshAnalyzer.ts` — Behavioral Mesh spatial graph (described above).
- `src/ai/meshVisualizer.ts` — Canvas-based 2D minimap renderer for the mesh.
- `src/ai/cheatSimulator.ts` — programmatic cheat trajectory generators:
  - `simulateAimbot(targetX, targetY)` → linear snap trajectory
  - `simulateWallhack(hiddenPlayerPositions)` → aim tracking through walls
  - `simulateSpinbot()` → constant-velocity rotation
  - `simulateHuman()` → replay captured human data with slight noise
- `scripts/trainModel.py` — PyTorch training script (autoencoder + optional classifier).
- `src/ai/behaviorAnalyzer.test.ts` — unit tests:
  - Human input → `isHuman: true`, low anomaly score.
  - Aimbot simulation → `isHuman: false`, high anomaly score.
  - Wallhack simulation → `isHuman: false`, high knowledge score.
  - Clean local input, clean spatial state → all scores green.

**Acceptance criteria:**
- Trained model size is `< 5MB` and loads via `onnxruntime-web` in under 2 seconds.
- Inference for a single window takes `< 50ms` in Chrome on a standard laptop.
- Aimbot and wallhack simulations are detected with > 90% accuracy on synthetic test set.
- Clean human input passes with `isHuman: true` and confidence > 70.
- Behavioral Mesh visualizer renders in real-time without frame drops.
- **Cheat simulation toggle in the demo UI works smoothly** (this is the key demo moment).
- Zero reliance on external backend server API calls for inference.

**Dependencies:** None. Can build in parallel with §2. Training data from team members collected Saturday morning.

**Technical notes + risks:**
- **Risk:** Autoencoder may not generalize beyond training team's input style. **Mitigation:** Augment training data with the Balabit dataset. For the demo, the synthetic cheat signatures (zero-jitter linear paths, constant angular velocity) are SO different from human input that even a weak model catches them trivially.
- **Risk:** ONNX Runtime Web WASM can be slow on first load. **Mitigation:** Pre-warm the model during the wallet connection step (load ONNX while user clicks "Connect Lace Wallet").
- **Risk:** Behavioral Mesh requires simulated multiplayer data. **Mitigation:** The demo runs a 4-player simulation with scripted bot paths. We don't need a real multiplayer server — the mesh operates on position/orientation data regardless of source.
- **Fallback plan:** If ONNX inference is too slow or the autoencoder doesn't converge, the statistical feature classifier alone can catch aimbot signatures (path straightness ratio < 0.1 is an instant flag). This is ugly but ships.

---

# PHASE 4 — SDK INTEGRATION LAYER

## 4. Midnight.js Service

**Goal:** Write a typed service module that sequences wallet connection, proof input construction, proof generation + tx submission, and badge status query. This is the bridge between Phase 3's AI output and Phase 2's on-chain contract.

**Deliverables:**
- `src/services/midnightService.ts` implementing four exported async functions:

  ```typescript
  // 1. Connect Lace wallet via dapp-connector-api
  connectLaceWallet(): Promise<MidnightWallet>

  // 2. Run behavioral analysis + generate proof + submit mintBadge tx
  submitVerification(
    wallet: MidnightWallet,
    result: BehaviorResult
  ): Promise<{ txHash: string; sessionId: string }>

  // 3. Poll the GraphQL Indexer for badge status
  queryBadgeStatus(sessionId: string): Promise<boolean>

  // 4. Utility: disconnect and clear local state
  disconnect(wallet: MidnightWallet): Promise<void>
  ```

- `src/services/midnightService.ts` internals:
  - `connectLaceWallet` — calls `DAppConnectorAPI.connect({ dAppName: 'ZK-Guard', networkId: 'Undeployed' })`, returns wallet handle.
  - `submitVerification` — constructs `privateWitness: { isHuman }` and `publicInputs: { sessionId }`, instantiates `CompactRuntime` pointing at `PROOF_SERVER_URL`, calls `runtime.mintBadge(...)`, awaits tx receipt. Note: `confidence`, `anomalyScore`, and `knowledgeScore` from the `BehaviorResult` are displayed in the UI but NOT included in the ZK proof — only the boolean enters the circuit.
  - `queryBadgeStatus` — `fetch` POST to `INDEXER_URL` with `{ query: 'query { isVerified(sessionId: "...") }' }`, returns `data.isVerified`.
- `src/services/midnightService.mock.ts` — drop-in mock that skips the real Proof Server: `submitVerification` resolves in 2 seconds with a fake `txHash`, `queryBadgeStatus` always returns `true`. Controlled by `VITE_USE_MOCK_SDK=true`. Use this to unblock frontend development in §5 while §2 is still in progress.

**Acceptance criteria:**
- `connectLaceWallet()` opens the Lace Wallet prompt in a Midnight-enabled browser.
- `submitVerification()` with a valid `BehaviorResult` returns a non-empty `txHash`.
- `queryBadgeStatus()` with that session ID returns `true` within 10 seconds of tx confirmation.
- Mock mode (`VITE_USE_MOCK_SDK=true`) makes the frontend fully usable without a running Docker stack.

**Dependencies:** §2 (contract address must be in `.env`), §3 (`BehaviorResult` type).

**Technical notes + risks:**
- 🚩 **Highest-risk integration point.** `CompactRuntime` proof generation can take 5–60 seconds depending on circuit complexity and Proof Server load. Set a 90-second timeout in the `fetch` call wrapping the Proof Server. Surface progress state to the UI (see §5).
- The `DAppConnectorAPI` requires the Lace extension to be installed in the same browser. Test on Chrome. Brave may block the extension communication — verify on Friday night.
- Private witness serialization: `isHuman` must be serialized as a Compact `Boolean` (likely `0x00` / `0x01` byte), not a JS boolean. Inspect the `compact-js` types carefully — type mismatch here is a silent failure that produces an invalid proof.
- Fallback plan: if proof generation fails consistently, mock the `CompactRuntime.mintBadge` call to return a hardcoded proof bytes value and submit a pre-built tx. This lets the demo show wallet signing and badge query even if the Proof Server is misbehaving. Document the workaround explicitly in the pitch as "circuit execution validated separately."

---

# PHASE 5 — REACT FRONTEND

## 5. Demo UI

**Goal:** Build a demo UI that tells a **story**, not just shows a flow. The key demo moment: the judge watches the user toggle between Human/Aimbot/Wallhack modes and sees the AI catch the cheat in real-time, then watches the ZK proof + badge mint happen with zero data exposure. The UI must make the Behavioral Mesh visualization impossible to ignore.

**Deliverables:**
- `src/components/GameplayTestPanel.tsx`:
  - Renders a **game-like canvas** capture zone where the user moves the mouse (dark background, subtle grid, target markers).
  - **🎯 Cheat Simulation Toggle** (THIS IS THE DEMO WOW MOMENT):
    - Three-button toggle bar at the top of the panel:
      - 🟢 **Human Mode** — user moves mouse naturally. AI scores it as clean.
      - 🔴 **Aimbot Mode** — mouse snaps in perfect straight lines to random target markers. AI catches the zero-jitter linear trajectory.
      - 🟡 **Wallhack Mode** — cursor tracks a "hidden" player marker (shown as translucent/behind-wall indicator). The Behavioral Mesh lights up with red anomaly edges.
    - In cheat modes, the `cheatSimulator.ts` module generates synthetic input events injected into the analysis pipeline.
  - **Cursor Trajectory Heatmap**: Canvas overlay rendering the last 3 seconds of mouse path.
    - Human input: organic, noisy, curved paths with color gradient (cool→warm).
    - Bot input: ruler-straight lines, sharp angles, uniform color. Judges can *see* the difference before the AI even scores it.
  - **Live Score Dashboard**: Real-time display of:
    - `anomalyScore` (0–1) — color-coded gauge (green→yellow→red)
    - `knowledgeScore` (0–1) — from Behavioral Mesh
    - `confidence` (%) — overall assessment
    - Event counter showing total events captured
  - "Verify & Mint Badge" button triggers the full verification flow (§4).

- `src/components/BehavioralMeshPanel.tsx`:
  - Embeds the `meshVisualizer.ts` canvas — 2D top-down minimap of the simulated 4-player session.
  - Shows player positions, visibility cones, and **red knowledge anomaly edges** when wallhack mode is active.
  - This panel sits alongside the GameplayTestPanel so the judge sees both simultaneously.

- `src/components/VerificationStatus.tsx`:
  - Renders 5 states driven by a `VerificationState` enum: `idle | capturing | analyzing | proving | verified | flagged`.
  - `idle`: prompt to move mouse in the capture zone.
  - `capturing`: live — "Capturing input trajectory… move your mouse naturally."
  - `analyzing`: spinner + "Behavioral AI analyzing input patterns and spatial mesh…"
  - `proving`: spinner + "Generating ZK proof locally — your raw data stays on your device." (5–30s; copy manages expectation.)
  - `verified`: green badge animation, tx hash (truncated, linked to explorer), session ID.
  - `flagged`: red alert — "⚠ Anomalous behavior detected. Verification denied." (shown when cheat mode is active)

- `src/components/GameDevView.tsx`:
  - Simulates the game developer's server-side check.
  - Shows a "Check Badge" button that calls `queryBadgeStatus(sessionId)`.
  - Renders `✅ Verified Clean Player — session admitted` or `❌ Unverified — session rejected`.
  - **Key visual**: a "What the game dev sees" vs. "What's on your device" comparison. The game dev side shows ONLY the boolean. Your device side shows the full heatmap, scores, and mesh — proving the privacy guarantee visually.

- `src/components/WalletConnect.tsx`:
  - "Connect Lace Wallet" button.
  - Shows wallet address (truncated) when connected.
  - Disables `GameplayTestPanel` until connected.
  - **Pre-warms ONNX model** during wallet connection (load model while user is clicking through the Lace popup).

- `src/App.tsx`:
  - Layout: `WalletConnect` header → two-row body:
    - **Top row:** `GameplayTestPanel` (left, ~60% width) + `BehavioralMeshPanel` (right, ~40% width).
    - **Bottom row:** `VerificationStatus` (left) + `GameDevView` (right).
  - `useVerification()` hook manages shared state across all panels.

- `src/hooks/useVerification.ts`:
  - Encapsulates the full state machine: wallet → capture → analyze → prove → badge.
  - Exports: `{ state, walletAddress, sessionId, txHash, behaviorResult, cheatMode, setCheatMode, connect, analyze, queryBadge }`.

**Acceptance criteria:**
- Full happy path (Human Mode) completable in one browser tab without touching the terminal.
- **Cheat simulation toggle visibly changes the AI scores in real-time** — this must work flawlessly for the demo.
- Cursor heatmap clearly distinguishes human vs. bot trajectories visually.
- Behavioral Mesh minimap shows red anomaly edges in Wallhack Mode.
- `proving` spinner appears for ≥ 2 seconds (even in mock mode) to demonstrate the ZK step.
- `flagged` state appears when running verification in cheat mode.
- `GameDevView` correctly shows the badge status without showing any of the raw behavioral data.
- UI renders without error in Chrome with Lace extension installed.
- `VITE_USE_MOCK_SDK=true` allows a full demo run without Docker.

**Dependencies:** §3 (analyzer + mesh + cheat simulator), §4 (service + mock service). Can begin with mock from Saturday morning.

**Technical notes + risks:**
- Do not use `<form>` tags — use `onClick` handlers on `<button>` elements.
- State machine tip: use a `useReducer` in `useVerification.ts` with explicit `VerificationState` enum transitions. Avoid a sprawl of `useState` calls that can get out of sync during the async proof step.
- Risk: Lace Wallet popup is blocked by some browsers on non-user-gesture events. The `connectLaceWallet()` call must be triggered directly from a button `onClick` — not from a `useEffect`.
- 🚩 **Demo polish risk:** the `proving` state takes real time. Test the full flow on the demo machine (not just localhost) before Sunday. Latency to the local Proof Server varies by machine.
- **Heatmap performance:** Use a separate offscreen canvas for the trajectory trail to avoid repainting the entire heatmap every frame. Clear with alpha fade (`globalAlpha = 0.05`) for a smooth trail effect.

---

# PHASE 6 — INTEGRATION, DEMO + PITCH

## 6. End-to-End Integration, Demo Video, and Pitch Assets

**Goal:** Run the full happy path on the actual demo machine, record a 2-minute demo video, and finalize the three pitch deck bullets.

**Deliverables:**
- End-to-end integration test checklist:
  - [ ] `docker compose up` — all 3 services healthy
  - [ ] Contract deployed, address in `.env`
  - [ ] Lace Wallet connected in Chrome with devnet MIDNIGHT loaded
  - [ ] **Human Mode:** natural input captured → `isHuman: true`, low anomaly score
  - [ ] **Aimbot Mode:** toggle → AI flags anomaly, scores spike, heatmap shows straight lines
  - [ ] **Wallhack Mode:** toggle → Behavioral Mesh shows red anomaly edges, knowledge score spikes
  - [ ] **Back to Human Mode:** run full verification → proof generated by local Proof Server (not mocked) → tx submitted
  - [ ] `isVerified(sessionId)` via GraphQL Indexer returns `true`
  - [ ] GameDevView shows ✅ badge with zero raw data visible on the game dev side
- Demo video (90 seconds max) — **STORY-DRIVEN, NOT FLOW-DRIVEN:**
  ```
  0–10s: THE HOOK
    "Every competitive game uses kernel-level anticheats that spy on
    your entire computer. What if the anticheat ran locally, used AI
    to detect cheats, and proved it with zero-knowledge — without
    ever seeing your data?"

  10–30s: THE PLAYER EXPERIENCE (HAPPY PATH)
    - Show natural mouse input → cursor heatmap shows organic paths
    - AI scores: green, clean, confidence high
    - ZK proof generated → badge minted on Midnight
    - Quick: show the tx on-chain, show absence of raw data

  30–55s: THE "HOLY SHIT" MOMENT ← THIS IS WHAT WINS
    - Toggle "Aimbot Mode" → heatmap shows straight lines
      → AI catches it instantly, anomaly score spikes red
    - Toggle "Wallhack Mode" → Behavioral Mesh minimap lights up
      → red edges show player tracking targets through walls
      → "The AI doesn't just watch you — it builds a behavioral
        mesh across all players and catches impossible knowledge."
    - Verification DENIED. Flagged state shown.

  55–75s: THE PRIVACY GUARANTEE
    - Show GameDevView: game dev gets ONLY "verified / not verified"
    - Split screen: "What's on your device" (heatmap, scores, mesh)
      vs. "What the game dev sees" (single boolean)
    - "The game dev never sees your mouse movements, your screen,
      your files — just a cryptographic proof."

  75–90s: PITCH CLOSE
    - "ZK-Guard: Privacy-preserving anticheat powered by behavioral
      AI, cross-player mesh analysis, and Midnight's zero-knowledge
      proofs. Your gameplay data stays yours."
  ```
- `PITCH.md`: three technical moat bullets:
  1. **Behavioral Mesh Analysis** — the only anticheat that reasons about cross-player knowledge graphs, not just individual input.
  2. **Zero-Knowledge Proof of Humanity** — game developers get a verified boolean, never your raw data.
  3. **100% Local AI** — no kernel access, no server uploads, no privacy invasion.
- `README.md` updated with full local run instructions for judges.

**Acceptance criteria:**
- Happy path runs clean 3× in a row without error on the demo machine.
- Demo video is ≤ 90 seconds with no visible error states.
- Judges can run `docker compose up && pnpm dev` and reach a working frontend.

**Dependencies:** All previous sections.

**Technical notes + risks:**
- Shoot the demo video with `VITE_USE_MOCK_SDK=false` (real proof) if the pipeline is stable. Fall back to mock mode only if the Proof Server is unstable on demo day — but disclose this in the video voiceover.
- Risk: proof generation time varies by machine. If it takes > 45 seconds on the demo machine, the video pacing breaks. Pre-warm the Proof Server (`docker compose up` and run one proof) before recording.
- Keep `contracts/smoke-test.ts` running in a terminal during the recording as a sanity check that the devnet is live.

---

# Cross-Cutting Concerns

## Open Questions (Roll-Up)

| # | Question | Owner | Resolved by |
|---|---|---|---|
| 1 | ~~Single vs. two-input circuit~~ | Dev A | ✅ **RESOLVED — single boolean.** |
| 2 | Session ID scheme: `crypto.randomUUID()` vs. `keccak256(wallet + timestamp)` | Dev A + Dev B | §2/§4 interface agreement, Friday night |
| 3 | ~~AI model architecture~~ | Dev B | ✅ **RESOLVED — Autoencoder + anomaly detector.** |
| 4 | ARM Mac compatibility for Midnight Docker images | Dev A | §1 Friday night — if blocked, assign Proof Server to Intel machine |
| 5 | Lace Wallet compatibility on Brave vs. Chrome | Dev C | §1/§5 Friday night browser test |
| 6 | Demo: real proof or mock mode for video recording | All | §6 Sunday morning based on pipeline stability |

## Risks Roll-Up (Top 5)

1. **Compact circuit compile failure or API mismatch** — Midnight devnet tooling is pre-production. If `compact compile` fails or the `Proof<T>` API doesn't match the docs, the entire proof pipeline is blocked. Mitigation: Dev A validates the simplified single-boolean circuit by end of Friday night. If blocked, mock the proof server call for the demo.
2. **Autoencoder training doesn't converge** — the model may not learn a useful representation from limited human data. Mitigation: the statistical feature classifier (path straightness, jitter variance) works as a deterministic fallback and catches aimbot signatures trivially. The demo works either way.
3. **Lace Wallet devnet mode not functional** — Lace may require specific Midnight devnet configuration flags. Mitigation: test wallet connection before writing any contract code. If wallet connection fails, the signing step can be bypassed with a pre-signed tx for demo purposes.
4. **Proof generation latency > 60 seconds** — makes the demo awkward and video pacing impossible. Mitigation: the circuit is now minimal (single boolean). Pre-warm the Proof Server before recording. Use mock mode for the video if latency is > 30s.
5. **Cheat simulation toggle doesn't demo well** — if the AI scores don't visibly change when toggling modes, the demo loses its impact. Mitigation: test the toggle flow 10+ times before recording. Ensure the heatmap, scores, and mesh visualization update in real-time. This is the most important demo rehearsal item.

## Definition of Done — Whole Product

The full ZK-Guard demo is done when:
- A new user on Chrome with Lace Wallet installed can: connect wallet → move mouse naturally → see the AI score it as clean → toggle Aimbot/Wallhack mode → watch the AI catch it in real-time → toggle back to Human → run verification → watch proof generate locally → see the Verified Clean Player badge → see a simulated game developer query return `true` — **in under 90 seconds, with zero console errors, on the demo machine.**
- The cheat simulation toggle produces **visibly different** AI scores, heatmap patterns, and Behavioral Mesh states.
- The on-chain `isVerified(sessionId)` query (against the real GraphQL Indexer, not a mock) returns `true`.
- The raw input data, anomaly scores, and mesh graph are verifiably absent from the transaction body (show this in the demo — inspect the tx in the Midnight block explorer or via GraphQL).
- The pitch video is recorded with the story-driven structure and the three technical moat bullets are locked.