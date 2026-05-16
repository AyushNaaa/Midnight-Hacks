# ZK-Guard — Product Requirements Document

**Tagline:** Privacy-Preserving Proof-of-Humanity API.
**One-liner:** ZK-Guard is an anti-cheat and anti-bot middleware for Web3 games and DApps that uses local AI to verify human behavior (mouse movements, keystroke entropy, click timing) and generates a Zero-Knowledge proof via Midnight, issuing a "Verified Human" badge without ever exposing raw telemetry or background processes to the public ledger or game developers.

---

## 0. Tech Stack (Strict Midnight Stack)

| Layer | Choice | Rationale |
|---|---|---|
| Smart Contracts | **Compact** (Minokawa) | Midnight's domain-specific language for writing ZK circuits and defining the ledger state. |
| Frontend/Client | **React (Vite) + TypeScript** | Lightweight, fast HMR. Vite is ideal for a hackathon frontend. |
| Blockchain SDK | **Midnight.js** | Uses `@midnight-ntwrk/compact-js` for contract wrapping and `@midnight-ntwrk/dapp-connector-api` for wallet connection. |
| Wallet Integration | **Lace Wallet** (Beta) | Midnight compatible version for managing keys, signing, and submitting transactions. |
| Local Infrastructure | **Docker** | Midnight Local Network (`midnight-local-dev`) running the Midnight Node, GraphQL Indexer, and Proof Server locally. |
| "AI" Mock | **JS Script (TF.js/Math)** | A lightweight script analyzing click-speed variance and mouse entropy to simulate the behavioral ML model for the hackathon. |

---

## 1. Architecture Flow

How data moves from the user's mouse click to the game developer:

1. **User Interaction (Client-Side):** The user interacts with the Web3 game/DApp frontend (React). Telemetry data (mouse clicks, timing variance) is captured locally.
2. **Local AI Analysis (Off-Chain):** The lightweight JS script (AI Mock) processes the telemetry data locally on the user's machine. It determines a boolean result: `is_human = true` or `false`.
3. **Witness Execution (Off-Chain):** The DApp calls the Compact contract's `witness` function. The witness function fetches the `is_human` boolean from the local AI context. *No raw telemetry data leaves the client.*
4. **Local Proof Generation (Proof Server):** The DApp calls the `circuit` via Midnight.js. The local Docker-based Proof Server executes the circuit using the private witness data. It generates a ZK proof asserting: "I ran the behavioral analysis, and the result was 'Human', here is the proof," without revealing the underlying data.
5. **Transaction Signing (Lace Wallet):** The Lace wallet prompts the user to sign the transaction containing the generated ZK proof and the public state updates.
6. **Smart Contract Verification (On-Chain):** The transaction is submitted to the Midnight Node. The Compact smart contract verifies the ZK proof on-chain. If valid, it updates the `ledger` state (e.g., mapping the user's public key to a "Clean Player" status).
7. **Game Developer Access (Indexer):** The Game Developer queries the Midnight GraphQL Indexer to check the user's public address. They see the "Verified Human" badge and grant access to the game, never seeing the telemetry.

---

## 2. Compact Contract Structure

The Compact contract handles the public ledger state and the ZK verification circuit.

### Structure Outline

```compact
import CompactStandardLibrary;

// 1. Ledger State (Public)
// Stores a mapping of public keys to their verification status and timestamp
export ledger verification_registry: Map<Bytes<32>, { is_verified: Boolean, timestamp: Uint<64> }>;

// 2. Witness (Private Off-Chain Context)
// Fetches the private boolean result from the local AI analysis
witness get_ai_verification_result(): Boolean;

// 3. Circuit (ZK Logic)
// Executes off-chain in the Proof Server, generates proof verified on-chain
export circuit verify_humanity(user_pub_key: Bytes<32>, current_timestamp: Uint<64>): Void {
    
    // a. Retrieve the private AI result via the witness
    const is_human = get_ai_verification_result();
    
    // b. Assert that the user is indeed human.
    // If this fails, the proof generation fails, and no transaction happens.
    assert(is_human == true, "Behavioral analysis failed: User flagged as bot.");
    
    // c. Update the public ledger state to reflect the verified status.
    // This is the only information revealed publicly.
    ledger.verification_registry.insert(user_pub_key, { 
        is_verified: true, 
        timestamp: current_timestamp 
    });
}
```

### Key Considerations:
*   The `verify_humanity` circuit only succeeds if `is_human` is true. The public only sees that a proof was successfully submitted and the registry updated.

---

## 3. Frontend & SDK Integration

How the React frontend triggers the Midnight stack:

### Step-by-Step Integration

1.  **Initialize Providers:** Set up the Midnight `providers` required by `@midnight-ntwrk/midnight-js-contracts`.
    *   `walletProvider`: Connect via `window.midnight.mnLace.enable()` using the DApp Connector API.
    *   `proofProvider`: Point to the local Docker Proof Server (`http://localhost:6300`).
    *   `publicDataProvider`: Point to the local GraphQL Indexer (`http://localhost:8088/api/v4/graphql`).
2.  **Telemetry Collection:** Use React hooks (`useEffect`) to track `mousemove` and `click` events, calculating variance in intervals.
3.  **Trigger AI Mock:** When the user clicks "Verify Humanity", pass the collected metrics to the mock JS function. It returns a boolean.
4.  **Inject Witness Data:** Store the AI result locally so the Compact `witness` function can read it during proof generation.
5.  **Execute Contract Call:**
    ```typescript
    // Pseudo-code for React component
    const handleVerification = async () => {
        // 1. Run AI Mock
        const isHuman = mockAiAnalyze(telemetryData); 
        
        // 2. Set context for the witness
        setWitnessContext({ aiResult: isHuman });
        
        // 3. Call the compiled Compact contract circuit
        // This implicitly calls the Proof Server to generate the ZK proof
        // and prompts Lace wallet to sign the Tx.
        const tx = await zkGuardContract.verify_humanity(userPubKey, Date.now());
        
        await tx.wait();
        alert("Verified Human Badge Issued!");
    }
    ```

---

## 4. Weekend Execution Timeline

Strict Friday night to Sunday morning schedule for a 3-person team.

**Friday Night: Infrastructure & Scaffolding (Hours 0-4)**
*   **Dev 1 (Smart Contracts):** Install Midnight toolchain. Write, compile, and test the `verify_humanity` Compact contract.
*   **Dev 2 (Frontend/Infra):** Spin up `midnight-local-dev` Docker environment (Node, Indexer, Proof Server). Scaffold Vite React app.
*   **Dev 3 (AI/Mocking):** Write the telemetry gathering script in React and the mock AI variance analyzer.

**Saturday Morning: Core Integration (Hours 4-12)**
*   **Dev 1 & 2:** Integrate Midnight.js into the React app. Set up `providers` and connect the Lace Wallet using `@midnight-ntwrk/dapp-connector-api`.
*   **Dev 3:** Finalize UI layout (Telemetry dashboard, "Verify" button, Success state).

**Saturday Afternoon: The "ZK" Loop (Hours 12-20)**
*   **All Hands:** Hook up the frontend AI result to the contract's `witness`. Ensure the Proof Server correctly generates the proof based on the frontend action, and Lace successfully signs and submits it to the local node.

**Saturday Night: UI Polish & Indexer Verification (Hours 20-28)**
*   **Dev 1/2:** Query the local GraphQL Indexer to prove the ledger updated successfully (the "Game Developer View").
*   **Dev 3:** Polish the UI to visually explain the ZK flow (e.g., showing what stays local vs. what goes on-chain).

**Sunday Morning: Pitch Deck & Video (Hours 28-36)**
*   **All Hands:** Record the 2-minute demo video. Freeze code. Finalize the pitch deck.

---

## 5. Pitch Deck Value (Technical Moat)

For the 2-minute demo video, emphasize these 3 points:

1.  **Kernel-Free Privacy:** Unlike traditional anti-cheat (Vanguard, Easy Anti-Cheat) that require invasive OS-level rootkits, ZK-Guard runs locally in the browser/client, preserving absolute user privacy.
2.  **Cryptographic Verification:** We don't just ask "are you human?"; the Midnight Proof Server generates mathematically verifiable Zero-Knowledge proofs of behavioral entropy, securing Web3 game economies against script injection.
3.  **Selective Disclosure:** Game developers only receive a boolean "Clean Player" badge on-chain. Raw telemetry, biometric inputs, and background process data never leave the user's device and are never exposed to the public ledger.

---

## Open Questions / Clarifications Needed

1.  **Demo Network:** Are we deploying the final hackathon submission to the local undeployed network (Docker) or a public Midnight Testnet/Preprod network? (Assuming local Docker for now).
2.  **AI Complexity:** Does the "mock AI" need to run any specific tensor operations, or is a pure math variance check (e.g., standard deviation of click intervals) sufficient for the hackathon judges?
3.  **Wallet Requirement:** Since we need the Lace Beta Wallet, do all team members and judges have the specific Midnight-compatible version installed?
