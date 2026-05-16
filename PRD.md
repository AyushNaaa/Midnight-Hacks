# ZK-Guard — Product Requirements Document

**Tagline:** Privacy-preserving proof-of-humanity and advanced LLM-powered anticheat for Web3 games and DApps.
**One-liner:** An advanced local AI model, built on LLM sequence-modeling architectures and trained on industry-standard anticheat datasets, analyzes high-frequency standard input (mouse, keyboard, controller) and spatial multiplayer game states to detect cheating locally. It feeds a boolean result into Midnight's local Proof Server, which generates a ZK proof. A Compact smart contract verifies the proof on-chain and issues a "Verified Human / Clean Player" session badge — without ever exposing the user's raw telemetry, game state, or device fingerprint to the ledger or the game developer.

---

## 0. Tech Stack (Locked Decisions)

| Layer | Choice | Rationale |
|---|---|---|
| Smart contracts | **Compact** (Midnight DSL) | TypeScript-inspired ZK circuit language; the only supported language for Midnight's proof system. ZK logic (circuit + ledger state) lives here. |
| Frontend framework | **React 18 + Vite + TypeScript** | HMR, TypeScript-native, no SSR needed for a demo SPA. Plays well with Midnight.js. |
| Blockchain SDK | **@midnight-ntwrk/compact-js** + **@midnight-ntwrk/dapp-connector-api** | Official Midnight SDK. compact-js wraps compiled contracts; dapp-connector-api brokers Lace wallet connection. |
| Wallet | **Lace Wallet** (Midnight-enabled build) | Only wallet with Midnight shard support. Required for signing `mintBadge` transactions. |
| Local infrastructure | **Docker** (Midnight Node + GraphQL Indexer + Proof Server) | Local proof generation is non-negotiable — raw telemetry must never leave the device. All three services run via `docker compose up`. |
| AI Model Architecture | **Transformer-based Sequence Model (LLM)** | Treats user inputs over time as a "language" sequence. A miniaturized Transformer model trained to identify anomalies, aimbots, and macro patterns from raw input tokens. |
| AI Inference Engine | **ONNX Runtime Web (WASM/WebGL)** | Cross-platform, fast local inference inside the browser. Allows running highly compressed/quantized Transformer models without server API calls. |
| Styling | **Tailwind CSS** | Utility speed for demo UI. No design system ceremony needed for a hackathon. |
| Package manager | **pnpm** | Workspace support; faster installs than npm for a monorepo. |

**⚠ Unresolved decisions (flagged inline):**
- 🚩 **Compact circuit inputs:** Can the hackathon devnet handle a two-private-witness circuit (`isHuman: Boolean` + `confidence: Uint8`) or should we reduce to a single boolean witness to minimize compile risk? Decided in §2 after first successful compile.
- 🚩 **Session ID scheme:** wallet address hash vs. client-generated UUID. Affects replay-attack surface. Decided in §2 / §4 interface agreement.
- 🚩 **Model Quantization:** Int8 vs. Float16 quantization for the LLM sequence model to balance accuracy and browser memory limits.

---

## Build Phase Map

- **Phase 1:** Local infrastructure (§1) — Docker services running before any contract or frontend code.
- **Phase 2:** Compact smart contract (§2) — compile + deploy before wiring the SDK.
- **Phase 3:** Advanced AI Anticheat module (§3) — LLM sequence model training, quantization, and multiplayer state processing.
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

**Goal:** Write, compile, and deploy the `zkguard.compact` contract to the local Midnight devnet. The contract must: (a) define a circuit that proves the AI boolean without exposing it, (b) write a badge to ledger state on successful proof verification, and (c) expose a read query for game developers.

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
    private isHuman:    Boolean,
    private confidence: Uint8,
    public  sessionId:  Bytes32,
    public  threshold:  Uint8
  ): Boolean {
    assert(isHuman == true);
    assert(confidence >= threshold);
    return true;
  }

  export transaction mintBadge(
    proof:     Proof<verifyHumanity>,
    sessionId: Bytes32
  ): Void {
    verify(verifyHumanity, proof, sessionId, 80u8);
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
- Private witnesses (`isHuman`, `confidence`) appear only in the local circuit execution inside the Proof Server. They are **not** serialized into the transaction body — verify this by inspecting the tx hex after the smoke test.
- If the two-private-input circuit is too complex to compile or prove in reasonable time (> 30 seconds per proof), reduce to a single `private isHuman: Boolean` and drop the `confidence` field. The MVP claim holds either way.
- 🚩 **Session ID collision:** two users with the same `sessionId` would overwrite each other's record. For the hackathon, generate session IDs as `keccak256(walletAddress + timestamp)` in the client. Document this as a known limitation.

---

# PHASE 3 — ADVANCED AI ANTICHEAT MODULE (LLM SEQUENCE MODEL)

## 3. Local Anticheat Sequence Model Architecture

**Goal:** Implement a local, Transformer-based sequence model (analogous to an LLM, but modeling "input behavior" instead of language) trained on datasets from existing anticheat systems. The model processes high-frequency standard input (mouse, keyboard, controller) as continuous token sequences, identifying cheating anomalies, while cross-referencing multi-agent spatial game state to catch widespread session abuse.

**Technical Specifications:**
1. **Data Ingestion & Tokenization:**
   - **Input Stream Formatting:** High-frequency polling (e.g., 60Hz-120Hz) of `[delta_time, dx, dy, mouse_btn_state, keys_pressed]`.
   - **Spatial Networking:** Real-time extraction of multiplayer state snapshots formatted as `[player_id, x, y, z, pitch, yaw, health]`.
   - **Token Generation:** The continuous float values are embedded into a dense vector space, creating sequence tokens. E.g., a 1-second window becomes a sequence of 60-120 embedded tokens.
2. **Model Architecture:**
   - **Base:** Miniaturized Decoder-Only Transformer (e.g., a variant of GPT/Llama architecture scaled down to <10M parameters).
   - **Attention Mechanism:** Causal self-attention allows the model to predict the probability of the *next* input event. If actual input deviates massively from human-probability distributions (e.g., perfect pixel-snapping to a target), the sequence is flagged as non-human.
   - **Multiplayer State Fusion:** Uses a secondary cross-attention layer mapping the user's input embeddings against the embeddings of other entities in the spatial network state, effectively spotting "ESP" or "Wallhacks" (e.g., aiming at an entity behind a wall before it's visible).
3. **Training Methodology (Off-Chain):**
   - Pre-training on massive open-source competitive gaming datasets (e.g., CS:GO or Valorant demo files converted to input streams).
   - Fine-tuning with Contrastive Learning on labeled "Clean" vs "Cheat" datasets.
4. **Inference Pipeline:**
   - Export the trained PyTorch model to ONNX.
   - Apply dynamic Int8 Quantization to reduce the model size to < 10MB.
   - Run inference in the browser via `onnxruntime-web` utilizing WebAssembly and WebGL execution providers.

**Deliverables:**
- `src/ai/modelLoader.ts` wrapping `onnxruntime-web` to load the `anticheat-sequence-model.onnx` file asynchronously.
- `src/ai/tokenizers.ts` to convert raw DOM mouse/keyboard events and mock spatial network updates into Float32Array tensors formatted as `[batch, sequence_length, features]`.
- `src/ai/behaviorAnalyzer.ts` with:
  - `BehaviorResult` type: `{ isHuman: boolean; confidence: number; sessionId: string; }`.
  - `BehaviorAnalyzer` class:
    - Maintains a sliding window buffer of the last N input events and network state snapshots.
    - `analyze()` — packages the sliding window into an ONNX tensor, executes the model forward pass, applies a Softmax over the anomaly classification logits, and returns a `BehaviorResult`.
- `src/ai/behaviorAnalyzer.test.ts` — unit tests:
  - Simulate typical human inputs and clean game state → `isHuman: true`.
  - Simulate known cheat signatures (e.g., aimbot input snapping, impossible reaction times) → `isHuman: false`.
  - Simulate clean local input but compromised multiplayer state (others cheating) → properly flags the session anomaly.

**Acceptance criteria:**
- AI model size is `< 20MB` and loads locally via `onnxruntime-web` in under 3 seconds.
- Inference for a single sequence window takes `< 100ms` in a standard browser environment to avoid interrupting gameplay.
- Cheating input simulations are accurately flagged (`isHuman: false`).
- Clean input simulations pass verification (`isHuman: true`, `confidence` > 50).
- Zero reliance on external backend server API calls for inference.

**Dependencies:** None. Can build in parallel with §2.

**Technical notes + risks:**
- **Risk:** Training a high-quality model from scratch takes too much time for a hackathon. **Mitigation:** Rely on pre-existing behavioral datasets (e.g., mouse dynamics datasets) and overfit a small model to obvious cheating signatures (like zero-jitter linear paths) to prove the concept for the demo.
- **Risk:** ONNX Runtime Web can struggle with memory management on some mobile devices. **Mitigation:** Ensure sequence length window is kept small (e.g., max 100 tokens).

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
  - `submitVerification` — constructs `privateWitness: { isHuman, confidence }` and `publicInputs: { sessionId, threshold: 80 }`, instantiates `CompactRuntime` pointing at `PROOF_SERVER_URL`, calls `runtime.mintBadge(...)`, awaits tx receipt.
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

**Goal:** Build a three-panel demo UI that shows the full ZK-Guard flow: gameplay input capture → LLM sequence anticheat analysis → proof generation → badge display → game developer query. The UI must be compelling enough to drive the 2-minute demo video.

**Deliverables:**
- `src/components/GameplayTestPanel.tsx`:
  - Renders a mock game environment or standard input capture zone (canvas/div).
  - Listens for comprehensive inputs (mouse movement trajectories, button hold times, keyboard presses) and feeds them to the tokenizer.
  - Simulates multiplayer state data feed.
  - Shows a live event sequence counter and AI inference confidence score.
  - "Analyze Input & State" button triggers the full verification flow (§4).
- `src/components/VerificationStatus.tsx`:
  - Renders 4 states driven by a `VerificationState` enum: `idle | analyzing | proving | verified`.
  - `idle`: prompt to test gameplay input.
  - `analyzing`: spinner + "LLM sequence model analyzing input trajectories and spatial networks…".
  - `proving`: spinner + "Generating ZK proof locally — your data stays on your device." (This state can take 5–30s; the copy manages expectation.)
  - `verified`: green badge, tx hash (truncated), session ID display.
- `src/components/GameDevView.tsx`:
  - Simulates the game developer's server-side check.
  - Shows a "Check badge" button that calls `queryBadgeStatus(sessionId)`.
  - Renders `✅ Verified Clean Player — session admitted` or `❌ Unverified — session rejected`.
  - This is the money shot for the demo: show that the game dev gets a binary answer with zero access to the underlying telemetry or local AI process.
- `src/components/WalletConnect.tsx`:
  - "Connect Lace Wallet" button.
  - Shows wallet address (truncated) when connected.
  - Disables `GameplayTestPanel` until connected.
- `src/App.tsx`:
  - Three-column layout: `WalletConnect` header → `GameplayTestPanel` (left) → `VerificationStatus` (center) → `GameDevView` (right).
  - `useVerification()` hook manages shared state across all panels.
- `src/hooks/useVerification.ts`:
  - Encapsulates the full state machine: wallet → analyzer → service → badge.
  - Exports: `{ state, walletAddress, sessionId, txHash, connect, analyze, queryBadge }`.

**Acceptance criteria:**
- Full happy path completable in one browser tab without touching the terminal.
- `proving` spinner appears for ≥ 2 seconds (even in mock mode) to demonstrate the ZK step.
- `GameDevView` correctly shows the badge status without showing any of the raw behavioral data.
- UI renders without error in Chrome with Lace extension installed.
- `VITE_USE_MOCK_SDK=true` allows a full demo run without Docker.

**Dependencies:** §3 (analyzer), §4 (service + mock service). Can begin with mock from Saturday morning.

**Technical notes + risks:**
- Do not use `<form>` tags — use `onClick` handlers on `<button>` elements.
- State machine tip: use a `useReducer` in `useVerification.ts` with explicit `VerificationState` enum transitions. Avoid a sprawl of `useState` calls that can get out of sync during the async proof step.
- Risk: Lace Wallet popup is blocked by some browsers on non-user-gesture events. The `connectLaceWallet()` call must be triggered directly from a button `onClick` — not from a `useEffect`.
- 🚩 **Demo polish risk:** the `proving` state takes real time. Test the full flow on the demo machine (not just localhost) before Sunday. Latency to the local Proof Server varies by machine.

---

# PHASE 6 — INTEGRATION, DEMO + PITCH

## 6. End-to-End Integration, Demo Video, and Pitch Assets

**Goal:** Run the full happy path on the actual demo machine, record a 2-minute demo video, and finalize the three pitch deck bullets.

**Deliverables:**
- End-to-end integration test checklist:
  - [ ] `docker compose up` — all 3 services healthy
  - [ ] Contract deployed, address in `.env`
  - [ ] Lace Wallet connected in Chrome with devnet MIDNIGHT loaded
  - [ ] Sequence inputs and network state captured in GameplayTestPanel → `isHuman: true` result
  - [ ] Proof generated by local Proof Server (not mocked) → tx submitted
  - [ ] `isVerified(sessionId)` via GraphQL Indexer returns `true`
  - [ ] GameDevView shows ✅ badge
- Demo video (90 seconds max):
  - 0–15s: problem statement voiceover ("Traditional anti-cheat requires kernel access and intrudes on privacy…")
  - 15–45s: live input trajectory capture + LLM Sequence analysis → proof generation → badge
  - 45–75s: GameDevView query → badge confirmed, zero raw data exposed
  - 75–90s: pitch bullet summary
- `PITCH.md`: three technical moat bullets (already drafted above in §0 of this PRD — finalize here).
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
| 1 | Single vs. two-input circuit (`isHuman` only vs. `isHuman + confidence`) | Dev A (Compact) | After first `compact compile` attempt in §2 |
| 2 | Session ID scheme: `crypto.randomUUID()` vs. `keccak256(wallet + timestamp)` | Dev A + Dev B | §2/§4 interface agreement, Friday night |
| 3 | AI Model constraints: Optimizing the Transformer for memory via ONNX | Dev B (AI) | §3 implementation decision |
| 4 | ARM Mac compatibility for Midnight Docker images | Dev A | §1 Friday night — if blocked, assign Proof Server to Intel machine |
| 5 | Lace Wallet compatibility on Brave vs. Chrome | Dev C | §1/§5 Friday night browser test |
| 6 | Demo: real proof or mock mode for video recording | All | §6 Sunday morning based on pipeline stability |

## Risks Roll-Up (Top 5)

1. **Compact circuit compile failure or API mismatch** — Midnight devnet tooling is pre-production. If `compact compile` fails or the `Proof<T>` API doesn't match the docs, the entire proof pipeline is blocked. Mitigation: Dev A validates a trivial circuit (boolean assert only) by end of Friday night. If blocked, mock the proof server call for the demo.
2. **LLM Sequence Model Size and Complexity** — Advanced ML models trained on anticheat systems can be large and slow. Mitigation: heavily compress/quantize the Transformer model using ONNX INT8 and keep the sequence token window extremely short.
3. **Lace Wallet devnet mode not functional** — Lace may require specific Midnight devnet configuration flags. Mitigation: test wallet connection before writing any contract code. If wallet connection fails, the signing step can be bypassed with a pre-signed tx for demo purposes.
4. **Proof generation latency > 60 seconds** — makes the demo awkward and video pacing impossible. Mitigation: reduce circuit complexity (single boolean witness, not two). Pre-warm the Proof Server before recording. Use mock mode for the video if latency is > 30s.
5. **GraphQL Indexer sync lag** — if the indexer doesn't reflect the tx immediately, the GameDevView shows `false` right after the badge is minted. Mitigation: poll `isVerified` with a 3-second retry loop (max 5 retries) before showing the result in `GameDevView`.

## Definition of Done — Whole Product

The full ZK-Guard demo is done when:
- A new user on Chrome with Lace Wallet installed can: connect wallet → provide high-frequency gameplay input trajectories → watch the local LLM analyze it and the spatial state → watch proof generate locally → see the Verified Clean Player badge → see a simulated game developer query return `true` — **in under 90 seconds, with zero console errors, on the demo machine.**
- The on-chain `isVerified(sessionId)` query (against the real GraphQL Indexer, not a mock) returns `true`.
- The raw sequence data and gameplay tensors are verifiably absent from the transaction body (show this in the demo — inspect the tx in the Midnight block explorer or via GraphQL).
- The pitch video is recorded and the three technical moat bullets are locked.