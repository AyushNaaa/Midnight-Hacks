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
| AI Model Architecture | **Dual-Model Deep Learning Pipeline** | **Model A:** Fine-tuned Transformer sequence model (~5-10M params) trained via next-event prediction on behavioral input streams. Detects aimbots, macros, and inhuman reaction times through temporal probability analysis. **Model B:** Graph Attention Network (GAT) for Behavioral Mesh — learns spatial awareness anomalies across all players in a session. Both exported to ONNX, run locally in-browser. |
| Behavioral Mesh | **GNN-Powered Cross-Player Spatial Anomaly Graph** | Unique differentiator: a trained Graph Attention Network correlates each player's inputs against what they *should* be able to see/know based on other players' positions. Learns normal vs. impossible awareness patterns — not just heuristic correlation, but a *trained* understanding of spatial behavior at the session level. |
| AI Inference Engine | **ONNX Runtime Web (WASM/WebGL)** | Cross-platform, fast local inference inside the browser. Handles models up to ~100MB via streaming load + WebGL acceleration. No server API calls. |
| Styling | **Tailwind CSS** | Utility speed for demo UI. No design system ceremony needed for a hackathon. |
| Package manager | **pnpm** | Workspace support; faster installs than npm for a monorepo. |

**⚠ Unresolved decisions (flagged inline):**
- ✅ **Compact circuit inputs:** **RESOLVED — single boolean witness (`isHuman: Boolean`).** Confidence is shown in the UI only. This minimizes circuit compile risk and proof latency.
- 🚩 **Session ID scheme:** wallet address hash vs. client-generated UUID. Affects replay-attack surface. Decided in §2 / §4 interface agreement.
- ✅ **Model architecture:** **RESOLVED — Dual deep learning pipeline.** (1) Transformer sequence model for individual input anomaly detection, (2) Graph Attention Network for cross-player Behavioral Mesh. Both trained overnight Saturday on GPU, exported to ONNX for browser inference.

---

## Build Phase Map

- **Phase 1:** Local infrastructure (§1) — Docker services running before any contract or frontend code.
- **Phase 2:** Compact smart contract (§2) — compile + deploy before wiring the SDK.
- **Phase 3:** AI Anticheat + Deep Behavioral Mesh (§3) — Transformer sequence model training, GNN mesh training, ONNX export, and browser inference pipeline.
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

# PHASE 3 — DEEP AI ANTICHEAT + GNN-POWERED BEHAVIORAL MESH

## 3A. Transformer Behavioral Sequence Model (Input Analysis) 🧠

**Goal:** Build a **Transformer-based sequence model** — architecturally analogous to a language model (LLM), but trained on behavioral input streams instead of text — that analyzes mouse, keyboard, and controller input as temporal token sequences and detects cheating through next-event probability analysis. This is the same class of architecture that powers GPT, but applied to the "language" of human motor behavior. The model runs **100% locally in the browser** via ONNX Runtime Web.

**Why a Transformer Beats an Autoencoder:**
- **Temporal reasoning:** Autoencoders see fixed windows. Transformers with causal attention understand *sequences* — they learn that a 250ms average reaction time that suddenly drops to 50ms mid-game is suspicious, even if each individual frame looks plausible.
- **Next-event prediction:** Like a language model predicting the next word, our model predicts the probability distribution of the next input event. Cheaters produce low-probability events *consistently*. A humanized aimbot might fool a frame-by-frame detector, but it produces improbable *sequences* that a Transformer catches.
- **Scalability:** Transformers scale with data and compute. Train longer = better model. An autoencoder plateaus quickly.

**Technical Specifications:**

1. **Data Ingestion & Tokenization:**
   - **Input Stream:** Capture DOM mouse/keyboard events at native browser event rate (~60–120Hz). Each event produces a feature vector: `[delta_time_ms, dx, dy, velocity, acceleration, angular_velocity, jitter, mouse_btn_state, keys_bitmask, path_curvature]` (10 features).
   - **Temporal Tokenization:** Each input event is projected through a learned `Dense(10→64)` embedding layer, producing a 64-dimensional token. A 2-second window at 60Hz = 120 tokens = one input sequence.
   - **Positional Encoding:** Sinusoidal positional encoding (standard Transformer PE) applied to the token sequence to preserve temporal ordering.
   - **Feature Engineering (supplementary):** Per-window statistical features are also computed as auxiliary inputs: path straightness ratio, jitter variance, velocity kurtosis, reaction time distribution, click-to-kill timing. These feed into a secondary classification head.

2. **Model A Architecture — Behavioral Transformer (~5–10M parameters):**
   - **Configuration:**
     - `d_model = 64`, `n_heads = 4`, `n_layers = 6`, `d_ff = 256`, `max_seq_len = 128`
     - Causal attention mask (decoder-only, like GPT)
     - Total parameters: ~5–8M depending on final layer sizes
   - **Dual Output Heads:**
     - **Head 1 — Next-Event Prediction (Pre-training task):** Predict the probability distribution of the next input vector given the preceding sequence. Trained with MSE loss on continuous features. At inference, compute the *surprise score*: how far the actual next event deviates from the model's prediction. Consistent high surprise = non-human behavior.
     - **Head 2 — Anomaly Classification (Fine-tuning task):** Binary classifier head on the `[CLS]` token equivalent (final hidden state). Fine-tuned with cross-entropy loss on labeled clean/cheat sequences. Outputs `P(cheat)` directly.
   - **Final Score:** Weighted ensemble of surprise score (Head 1) and cheat probability (Head 2): `anomalyScore = 0.4 * surprise + 0.6 * P(cheat)`.

3. **Training Strategy (Overnight Saturday — GPU Required):**

   **Phase 1: Data Collection (Saturday morning, ~2 hours)**
   - **Human data (real):** Each team member records 30 minutes of mouse/keyboard interaction in the GameplayTestPanel → ~108,000 events per person × 3 people = **~324,000 human events**.
   - **Human data (open-source):** Download and preprocess the Balabit Mouse Dynamics Dataset (~3.6M mouse events from 10 users), DFL Keystroke Dataset, and any available FPS replay datasets (CS:GO demo parser → input stream converter).
   - **Combined human dataset target: 2–5 million input events.**
   - **Cheat data (synthetic, large-scale):** `scripts/generateCheatData.py` generates 500,000+ cheat events across multiple profiles:
     - `aimbot_perfect` — zero-jitter linear snap to target
     - `aimbot_humanized` — adds Gaussian noise to trajectories but maintains inhuman reaction times and path straightness
     - `triggerbot` — human-like aim with < 30ms reaction clicks when crosshair passes target
     - `spinbot` — constant angular velocity, sometimes with random speed variation
     - `recoil_script` — perfectly compensated recoil patterns (frame-perfect downward pull)
     - `macro_bot` — periodic input patterns with < 1ms jitter variance
     - `wallhack_aim` — aim direction correlated with invisible player positions (uses mesh simulation)
   - **Combined cheat dataset target: 500K–1M synthetic cheat events.**

   **Phase 2: Pre-training (Saturday night, ~4–6 hours on GPU)**
   - Pre-train the Transformer on the full human dataset using next-event prediction (self-supervised). This teaches the model the statistical structure of human motor behavior.
   - Training infrastructure: PyTorch + HuggingFace Trainer, 1x NVIDIA GPU (RTX 3080+ or cloud GPU via Lambda/RunPod).
   - Hyperparameters: `lr=3e-4`, `batch_size=64`, `epochs=50`, `warmup_steps=1000`, cosine LR schedule.
   - Checkpoint saved every 10 epochs. Best model selected by validation loss on held-out human data.

   **Phase 3: Fine-tuning (Sunday morning, ~1–2 hours)**
   - Fine-tune the classification head (Head 2) using contrastive learning on labeled clean/cheat pairs.
   - Loss function: Binary Cross-Entropy + Triplet Margin Loss (anchor=human, positive=human, negative=cheat).
   - Freeze the Transformer backbone for first 5 epochs, then unfreeze last 2 layers for final 10 epochs.

   **Phase 4: Export**
   - Export to ONNX via `torch.onnx.export()`.
   - Apply mixed Int8/Float16 quantization via ONNX Runtime quantization tools.
   - Target model size: **20–50MB** (small enough for browser, large enough to impress judges).
   - Validate ONNX inference output matches PyTorch output within tolerance < 0.01.

4. **Inference Pipeline (Browser):**
   - Load ONNX model via `onnxruntime-web` with WebGL execution provider (primary) and WASM fallback.
   - Streaming model load during wallet connection phase to hide latency.
   - Inference latency target: **< 100ms per 2-second window** on a modern laptop with WebGL.
   - Continuous scoring via `setInterval` every 2 seconds. Maintains a rolling anomaly score over the last 10 windows.

## 3B. GNN-Powered Behavioral Mesh Analysis (Cross-Player Detection) ⭐ UNIQUE DIFFERENTIATOR

**Goal:** This is what makes ZK-Guard fundamentally different from Vanguard, EAC, BattlEye, and every other anticheat in existence. Traditional anticheats analyze one player at a time. ZK-Guard's Behavioral Mesh uses a **trained Graph Attention Network (GAT)** that takes the entire player session as a graph and *learns* to detect when a player's behavior reveals impossible spatial knowledge — the defining signature of wallhacks, ESP, and information-sharing cheats.

**Why a GNN Beats a Heuristic Correlation:**
- A heuristic "dot-product correlation between aim direction and hidden player position" is easily defeated by adding random look-around noise.
- A trained GAT *learns* the complex, non-linear relationship between spatial awareness and aim behavior across *thousands* of simulated sessions. It catches subtle patterns that no hand-crafted rule can express.
- The GAT can also detect *collaborative cheating* — two players whose behaviors are suspiciously coordinated despite no apparent communication channel.

**Technical Specifications:**

1. **Graph Structure:**
   - **Nodes:** Each player in the session. Node features: `[x, y, z, pitch, yaw, velocity_x, velocity_y, velocity_z, aim_delta_x, aim_delta_y, health, is_visible_to_i]` (12 features per node, per frame).
   - **Edges:** Fully connected graph (every player pair). Edge features: `[distance, angle_from_aim, is_line_of_sight, time_since_last_visible]` (4 features per edge).
   - **Temporal stacking:** 30 frames (~0.5s) of graph snapshots stacked as a temporal sequence, giving the GAT both spatial AND temporal context.

2. **Model B Architecture — Temporal Graph Attention Network (~2–5M parameters):**
   - **Per-Frame GAT Block:** 2-layer GAT with 4 attention heads each. Node features → attention-weighted aggregation → updated node representations.
   - **Temporal Aggregation:** The sequence of 30 per-frame GAT outputs is fed through a small 2-layer Transformer (same architecture as Model A but with `d_model=32, n_layers=2`) to capture temporal evolution of the spatial relationships.
   - **Output Head:** Per-node classification: `knowledgeScore: number (0–1)`. High score = this player's behavior reveals impossible spatial knowledge.
   - **Session-Level Output:** Max-pool across all player knowledge scores → `sessionAnomalyScore`.

3. **Training Strategy:**
   - **Synthetic session generation:** `scripts/generateMeshData.py` creates thousands of simulated 4–10 player sessions:
     - **Clean sessions:** Players navigate a simple 2D map with obstacles. Aim direction correlated ONLY with visible targets. Movement follows pathfinding between objectives.
     - **Wallhack sessions:** One player's aim direction is correlated with ALL player positions, including those behind walls. Subtle versions add noise and delayed reactions to mimic realistic wallhack usage.
     - **ESP sessions:** Player movement patterns pre-react to enemy positions before line-of-sight is established.
     - **Collaborative cheat sessions:** Two players exhibit coordinated flanking behavior that's statistically improbable without shared information.
   - **Dataset size: 10,000+ simulated sessions** (each 30–120 seconds, sampled at 60Hz).
   - **Training:** PyTorch Geometric (PyG), `GATConv` layers, same GPU as Model A. Trains in ~2–3 hours.
   - **Export:** ONNX via `torch.onnx.export()` with dynamic axes for variable player counts. Int8 quantization. Target size: **10–20MB**.

4. **Why This Is Better Than Vanguard:**

   | Capability | Vanguard / EAC / BattlEye | ZK-Guard |
   |---|---|---|
   | **Kernel access** | ✅ Ring-0 driver, reads all memory | ❌ No kernel access. Browser-only. |
   | **Data sent to server** | ✅ Telemetry beamed to Riot/EA | ❌ Nothing leaves the device. ZK proof only. |
   | **Individual input analysis** | ✅ Server-side ML on input streams | ✅ Transformer sequence model (local) |
   | **Cross-player analysis** | ❌ Players analyzed independently | ✅ **GNN Behavioral Mesh** — session-level graph analysis |
   | **Collaborative cheat detection** | ❌ Not addressed | ✅ GAT detects coordinated behavior anomalies |
   | **Privacy** | ❌ Total surveillance | ✅ Zero-knowledge proof. Game dev sees boolean only. |

**Deliverables (Combined §3A + §3B):**
- `src/ai/modelLoader.ts` — wraps `onnxruntime-web` to load both `behavioral-transformer.onnx` (~20–50MB) and `mesh-gat.onnx` (~10–20MB) asynchronously with progress callbacks.
- `src/ai/tokenizer.ts` — converts raw DOM mouse/keyboard events into Transformer-compatible token sequences: `[batch, seq_len, d_model]` tensors.
- `src/ai/featureExtractor.ts` — computes supplementary statistical features per-window (path straightness, jitter variance, reaction time distribution, velocity kurtosis).
- `src/ai/behaviorAnalyzer.ts`:
  - `BehaviorResult` type: `{ isHuman: boolean; confidence: number; anomalyScore: number; surpriseScore: number; knowledgeScore: number; sessionId: string; }`.
  - `BehaviorAnalyzer` class:
    - Maintains a sliding window buffer of the last N input events.
    - `analyze()` — runs the Transformer forward pass (next-event prediction + classification heads), queries the Behavioral Mesh GAT for knowledge anomaly, ensembles all signals, returns `BehaviorResult`.
- `src/ai/meshAnalyzer.ts` — Behavioral Mesh powered by the trained GAT:
  - `BehavioralMesh` class maintains a graph of `PlayerNode` objects with full spatial state.
  - `updatePlayerState(playerId, x, y, z, pitch, yaw)` — updates graph nodes.
  - `computeVisibilityEdges()` — recalculates line-of-sight between all player pairs.
  - `analyzeGraph()` — serializes the graph to a tensor, runs GAT inference via ONNX, returns per-player `knowledgeScore`.
- `src/ai/meshVisualizer.ts` — Canvas-based 2D top-down minimap renderer:
  - Player positions as colored dots with directional aim indicators
  - Visibility cones as translucent arcs
  - **Knowledge anomaly edges** as animated red lines (pulse when score is high)
  - Per-player knowledge score as floating labels
  - This visualization is the **demo's visual proof** that the AI is doing something no other anticheat does
- `src/ai/cheatSimulator.ts` — programmatic cheat trajectory generators:
  - `simulateAimbot(targetX, targetY, humanization?)` → linear snap trajectory, optionally with noise
  - `simulateWallhack(hiddenPlayerPositions, reactionDelay?)` → aim tracking through walls
  - `simulateSpinbot()` → constant-velocity rotation
  - `simulateHumanizedAimbot()` → realistic aim with inhuman reaction time distribution
  - `simulateCollabCheat(partnerPositions)` → coordinated movement patterns
  - `simulateHuman()` → replay captured human data with augmentation noise
- `scripts/generateCheatData.py` — large-scale synthetic cheat data generator (500K+ events).
- `scripts/generateMeshData.py` — synthetic session generator for GNN training (10K+ sessions).
- `scripts/trainTransformer.py` — PyTorch training script for Model A (Behavioral Transformer). Pre-train + fine-tune pipeline.
- `scripts/trainGAT.py` — PyTorch Geometric training script for Model B (Mesh GAT).
- `scripts/exportONNX.py` — export both models to ONNX with quantization and validation.
- `src/ai/behaviorAnalyzer.test.ts` — unit tests:
  - Human input → `isHuman: true`, low anomaly + surprise scores.
  - Perfect aimbot → `isHuman: false`, high anomaly score.
  - Humanized aimbot (with noise) → `isHuman: false` — **this is the key test that proves the Transformer catches what an autoencoder misses**.
  - Wallhack simulation → `isHuman: false`, high knowledge score from GAT.
  - Collaborative cheat → both players flagged by mesh analysis.
  - Clean local input, clean spatial state → all scores green.

**Acceptance criteria:**
- Combined model size is **< 70MB** and loads via `onnxruntime-web` in under 5 seconds (streamed during wallet connection).
- Transformer inference for a single 2-second window takes **< 100ms** in Chrome with WebGL.
- GAT inference for a 4-player graph takes **< 50ms**.
- **Perfect aimbot detected with > 99% accuracy** on synthetic test set.
- **Humanized aimbot detected with > 85% accuracy** — this proves the Transformer's temporal reasoning.
- **Wallhack detected with > 90% accuracy** via GNN mesh analysis.
- Clean human input passes with `isHuman: true` and confidence > 80.
- Behavioral Mesh visualizer renders in real-time without frame drops.
- **Cheat simulation toggle in the demo UI works smoothly** (key demo moment).
- Zero reliance on external backend server API calls for inference.

**Dependencies:** GPU access for overnight training (RTX 3080+ or cloud GPU). Can build inference pipeline in parallel with §2. Training data collected Saturday morning. Models trained Saturday night → Sunday morning.

**Technical notes + risks:**
- **Risk:** Transformer pre-training takes longer than expected. **Mitigation:** Start training Saturday 6pm and let it run overnight. If the model hasn't converged by Sunday 8am, use the best checkpoint available — even a partially trained Transformer outperforms an autoencoder on temporal patterns. The classification head fine-tuning only takes 1–2 hours.
- **Risk:** ONNX Runtime Web WebGL can be slow on older hardware. **Mitigation:** Test on the actual demo machine Saturday night. If WebGL inference is too slow, fall back to WASM (slower but more compatible). Reduce `max_seq_len` to 64 if needed.
- **Risk:** GNN training on synthetic mesh data may not transfer perfectly. **Mitigation:** The synthetic session generator is configurable. If the GAT underperforms, increase the diversity of cheat profiles in the training data. The heuristic correlation score remains as a lightweight fallback — but the trained GAT should massively outperform it.
- **Risk:** Combined model size (60–70MB) is large for browser load. **Mitigation:** Stream both models during wallet connection using `fetch` with `ReadableStream`. Show a progress bar. Most users on modern connections can download 70MB in < 10 seconds. Aggressive Int8 quantization can reduce this to ~30MB with minimal accuracy loss.
- **Risk:** PyTorch Geometric (PyG) dependency for GNN training. **Mitigation:** Install PyG in a conda environment Saturday morning. If PyG installation fails on the training machine, implement the GAT manually using base PyTorch `nn.Module` — it's only 2 attention layers.
- **Fallback plan:** If both deep learning models fail to train or export, a statistical feature classifier (path straightness, jitter, reaction time thresholds) combined with the heuristic mesh correlation can still detect blatant cheats. This is the absolute floor — it ships but won't win the AI track.

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
| 3 | ~~AI model architecture~~ | Dev B | ✅ **RESOLVED — Dual deep learning pipeline.** Transformer sequence model (5–10M params) + Graph Attention Network for Behavioral Mesh (2–5M params). Trained overnight Saturday on GPU. |
| 4 | ARM Mac compatibility for Midnight Docker images | Dev A | §1 Friday night — if blocked, assign Proof Server to Intel machine |
| 5 | Lace Wallet compatibility on Brave vs. Chrome | Dev C | §1/§5 Friday night browser test |
| 6 | Demo: real proof or mock mode for video recording | All | §6 Sunday morning based on pipeline stability |

## Risks Roll-Up (Top 5)

1. **Compact circuit compile failure or API mismatch** — Midnight devnet tooling is pre-production. If `compact compile` fails or the `Proof<T>` API doesn't match the docs, the entire proof pipeline is blocked. Mitigation: Dev A validates the simplified single-boolean circuit by end of Friday night. If blocked, mock the proof server call for the demo.
2. **Transformer / GNN training fails or doesn't converge overnight** — deep learning models are sensitive to hyperparameters and data quality. Mitigation: (a) checkpoint every 10 epochs, use best checkpoint even if training is incomplete, (b) a partially-trained Transformer still outperforms an autoencoder on temporal patterns, (c) statistical feature classifier remains as an absolute-floor fallback. Start training by Saturday 6pm to maximize training time.
3. **Lace Wallet devnet mode not functional** — Lace may require specific Midnight devnet configuration flags. Mitigation: test wallet connection before writing any contract code. If wallet connection fails, the signing step can be bypassed with a pre-signed tx for demo purposes.
4. **Proof generation latency > 60 seconds** — makes the demo awkward and video pacing impossible. Mitigation: the circuit is now minimal (single boolean). Pre-warm the Proof Server before recording. Use mock mode for the video if latency is > 30s.
5. **Cheat simulation toggle doesn't demo well** — if the AI scores don't visibly change when toggling modes, the demo loses its impact. Mitigation: test the toggle flow 10+ times before recording. Ensure the heatmap, scores, and mesh visualization update in real-time. This is the most important demo rehearsal item.

## Definition of Done — Whole Product

The full ZK-Guard demo is done when:
- A new user on Chrome with Lace Wallet installed can: connect wallet → move mouse naturally → see the AI score it as clean → toggle Aimbot/Wallhack mode → watch the AI catch it in real-time → toggle back to Human → run verification → watch proof generate locally → see the Verified Clean Player badge → see a simulated game developer query return `true` — **in under 90 seconds, with zero console errors, on the demo machine.**
- The cheat simulation toggle produces **visibly different** AI scores (including Transformer surprise score and GNN knowledge score), heatmap patterns, and Behavioral Mesh states.
- The on-chain `isVerified(sessionId)` query (against the real GraphQL Indexer, not a mock) returns `true`.
- The raw input data, anomaly scores, and mesh graph are verifiably absent from the transaction body (show this in the demo — inspect the tx in the Midnight block explorer or via GraphQL).
- The pitch video is recorded with the story-driven structure and the three technical moat bullets are locked.