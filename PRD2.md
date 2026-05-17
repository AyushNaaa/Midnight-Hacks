# ZK-Guard Demo Overlay — Step-by-Step Build Plan

**What you're building:** A small always-on-top browser window that sits in the corner of your screen while you play back a recorded gaming clip. It shows fake anticheat detection scores and a nodal graph visualizing wallhack detection. All data is hardcoded — nothing is real or live.

---

## Before You Start

You need the following installed:
- Node.js (v18 or later) — https://nodejs.org
- A code editor (VS Code recommended)
- Chrome browser

Estimated total build time: 3–5 hours.

---

## Step 1 — Create the Project

Open a terminal and run these commands in order:

```bash
npm create vite@latest zkguard-overlay -- --template react
cd zkguard-overlay
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome. You should see the default Vite + React welcome screen. If you do, the project is working.

Then clean out the boilerplate:
- Delete everything inside `src/App.jsx` and replace it with `export default function App() { return <div>hello</div> }`
- Delete `src/App.css`
- Delete `src/index.css` contents (leave the file, just empty it)

---

## Step 2 — Set Up the Config Block

This is the most important step. Everything the overlay displays comes from one config object. Open `src/App.jsx` and paste this at the very top of the file, above everything else:

```js
// ─────────────────────────────────────────────────────────────
//  EDIT THIS BLOCK FOR EACH CLIP YOU RECORD
//  Nothing else in the file needs to change between clips.
// ─────────────────────────────────────────────────────────────
const CLIP_CONFIG = {

  clipName: "de_dust2  ·  B Site Rush",
  // Change this to describe your clip. Shows in the overlay header.

  players: [
    // One entry per player visible in the clip.
    // id:   any short unique string — you'll reference it in detections and knowledgeEdges
    // name: their in-game name as it appears in the scoreboard
    // x, y: position on the nodal map. 0.0 = top-left, 1.0 = bottom-right.
    //        Pause your clip where you can see everyone on the minimap
    //        and estimate their rough position.
    // team: "ct" = blue dot, "t" = orange dot
    // suspect: true = red pulsing ring appears around the node

    { id: "you", name: "You",      x: 0.22, y: 0.62, team: "ct" },
    { id: "a1",  name: "ally_1",   x: 0.18, y: 0.40, team: "ct" },
    { id: "a2",  name: "ally_2",   x: 0.30, y: 0.76, team: "ct" },
    { id: "e1",  name: "xX_snap",  x: 0.60, y: 0.28, team: "t",  suspect: true },
    { id: "e2",  name: "h3adsh0t", x: 0.74, y: 0.54, team: "t"  },
    { id: "e3",  name: "wally123", x: 0.84, y: 0.20, team: "t",  suspect: true },
  ],

  detections: {
    // Add one entry here for each player that has suspect: true above.
    // The key must match the player's id exactly.
    //
    // confidence: pick any number 0–100. Higher = more suspicious.
    // active:     true = shows a red "DETECTED" badge. false = just shows the bar.
    // note:       one-line description. Make it specific to the clip
    //             (e.g. "Pre-fired tunnel before door opened").

    e1: {
      aimbot:   { active: true,  confidence: 94, note: "Snap-to-target · 0ms reaction time · 100% headshot rate at 47m" },
      wallhack: { active: false, confidence: 11, note: "" },
    },
    e3: {
      aimbot:   { active: false, confidence: 18, note: "" },
      wallhack: { active: true,  confidence: 89, note: "Tracking 2 players through solid wall for 4.2 seconds" },
    },
  },

  knowledgeEdges: [
    // These draw animated red dashed lines on the nodal map.
    // Each line represents a suspect player "impossibly aware" of another player.
    // Use this to visualize wallhack detection for your audience.
    //
    // from:    the suspect's id
    // to:      the id of whoever they're tracking through a wall
    // anomaly: 0.0–1.0 — controls line thickness and opacity. Use 0.7–0.95.

    { from: "e3", to: "a1", anomaly: 0.91 },
    { from: "e3", to: "a2", anomaly: 0.74 },
  ],
};
```

Save the file. You'll reference `CLIP_CONFIG` throughout the rest of the build. Every time you record a new clip, you come back to this block and update it — nothing else changes.

---

## Step 3 — Define the Color Palette

Directly below the config block, paste the color palette object. These values are used by every component, so define them once here rather than scattering hex codes everywhere:

```js
const C = {
  bg:      "#07090e",   // outermost panel background
  surface: "#0b0e18",   // header, footer, graph background
  card:    "#0f1320",   // selected player detail background
  border:  "#182030",   // all dividing lines and borders
  dim:     "#38485e",   // muted labels and secondary text
  text:    "#6a8aaa",   // default body text
  bright:  "#b0cce8",   // primary labels, highlighted player names
  clean:   "#22cc66",   // green — used for the live dot when no suspects
  warn:    "#ffaa22",   // amber — medium confidence scores
  cheat:   "#ff3344",   // red — detected cheats, suspect rings, anomaly edges
  ct:      "#3399ff",   // CT team node color
  t:       "#ff7733",   // T team node color
};

const mono = "'Courier New', Courier, monospace";
// Use this as fontFamily everywhere. Monospace gives it the HUD feel.
```

---

## Step 4 — Build the Confidence Bar Component

This is a small reusable bar that appears inside the player detail panel. It shows how confident the system is that a specific cheat type is active.

Create this as a function inside `src/App.jsx`, below the color palette:

```jsx
function Bar({ value, active }) {
  // value: number 0–100
  // active: boolean — if true, the bar glows red

  const color = active
    ? C.cheat                          // red if flagged
    : value > 60 ? C.warn              // amber if moderately high
    : value > 30 ? C.text              // gray-blue if moderate
    : C.dim;                           // dim if low

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 2,
        background: C.border,
        borderRadius: 1,
        overflow: "hidden",
      }}>
        <div style={{
          width: `${value}%`,
          height: "100%",
          background: color,
          borderRadius: 1,
        }} />
      </div>
      <span style={{
        fontSize: 10,
        color,
        minWidth: 32,
        textAlign: "right",
        fontFamily: mono,
      }}>
        {value}%
      </span>
    </div>
  );
}
```

---

## Step 5 — Build the Nodal Graph Component

This is the main visual. It renders an SVG minimap showing all players as dots, with animated red dashed lines between wallhack suspects and whoever they're tracking.

Create this function below `Bar`:

```jsx
function NodalGraph({ players, knowledgeEdges, selected, onSelect }) {
  const W = 292, H = 200;
  // W and H are the SVG internal coordinate dimensions.
  // The graph always fills the panel width regardless of these values
  // because of viewBox + width="100%".

  // Convert a player's 0–1 x/y into SVG pixel coordinates.
  // The 14px padding on each side keeps nodes off the very edge.
  const px = p => p.x * (W - 28) + 14;
  const py = p => p.y * (H - 28) + 14;

  // Build a lookup so edges can find both endpoints by id.
  const byId = Object.fromEntries(players.map(p => [p.id, p]));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: "100%",
        display: "block",
        borderRadius: 4,
        background: C.surface,
      }}
    >
      {/* ── Grid lines ── */}
      {[1, 2, 3].map(i => (
        <g key={i}>
          <line
            x1={i * W / 4} y1={0}
            x2={i * W / 4} y2={H}
            stroke={C.border} strokeWidth={0.5}
          />
          <line
            x1={0} y1={i * H / 4}
            x2={W} y2={i * H / 4}
            stroke={C.border} strokeWidth={0.5}
          />
        </g>
      ))}

      {/* ── Knowledge anomaly edges ── */}
      {/* These are the red dashed lines that show wallhack detection. */}
      {/* They animate using SVG's native <animate> tag — no JS timer needed. */}
      {knowledgeEdges.map((e, i) => {
        const f = byId[e.from], t = byId[e.to];
        if (!f || !t) return null;
        return (
          <line
            key={i}
            x1={px(f)} y1={py(f)}
            x2={px(t)} y2={py(t)}
            stroke={C.cheat}
            strokeWidth={e.anomaly * 2 + 0.5}
            strokeOpacity={0.4 + e.anomaly * 0.5}
            strokeDasharray="5 4"
          >
            {/* Marching ants animation — the dash pattern moves continuously */}
            <animate
              attributeName="stroke-dashoffset"
              from="0" to="-18"
              dur="0.9s"
              repeatCount="indefinite"
            />
          </line>
        );
      })}

      {/* ── Anomaly score labels ── */}
      {/* Small percentage shown at the midpoint of each anomaly edge */}
      {knowledgeEdges.map((e, i) => {
        const f = byId[e.from], t = byId[e.to];
        if (!f || !t) return null;
        return (
          <text
            key={`lbl-${i}`}
            x={(px(f) + px(t)) / 2}
            y={(py(f) + py(t)) / 2 - 4}
            textAnchor="middle"
            fontSize={7}
            fontFamily={mono}
            fill={C.cheat}
            opacity={0.85}
          >
            {Math.round(e.anomaly * 100)}%
          </text>
        );
      })}

      {/* ── Player nodes ── */}
      {players.map(p => {
        const x = px(p), y = py(p);
        const nodeColor = p.team === "ct" ? C.ct : C.t;
        const isSel = selected === p.id;

        return (
          <g
            key={p.id}
            onClick={() => onSelect(p.id === selected ? null : p.id)}
            style={{ cursor: "pointer" }}
          >
            {/* Pulsing ring — only shown on suspect players */}
            {p.suspect && (
              <circle cx={x} cy={y} r={9} fill="none" stroke={C.cheat} strokeWidth={0.8}>
                <animate
                  attributeName="r"
                  values="8;13;8"
                  dur="1.8s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.7;0.1;0.7"
                  dur="1.8s"
                  repeatCount="indefinite"
                />
              </circle>
            )}

            {/* Selection ring — shown when this node is clicked */}
            {isSel && (
              <circle
                cx={x} cy={y} r={8}
                fill="none"
                stroke={C.bright}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}

            {/* Main dot */}
            <circle cx={x} cy={y} r={4.5} fill={nodeColor} opacity={0.9} />

            {/* Player name label */}
            <text
              x={x + 7} y={y + 3.5}
              fontSize={7.5}
              fontFamily={mono}
              fill={p.suspect ? C.cheat : C.text}
            >
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

---

## Step 6 — Build the Main Overlay Component

This is the full panel. Replace your placeholder `App` function with the following. Read the inline comments — they explain what each section renders and why it's structured the way it is.

```jsx
export default function App() {
  // selected: the id of the player whose detail panel is open, or null
  const [selected, setSelected] = useState(null);
  // mini: whether the overlay is collapsed to its badge form
  const [mini, setMini] = useState(false);
  // pulse: toggles the live indicator dot between full and dim opacity
  const [pulse, setPulse] = useState(true);

  // Add this import at the top of the file:
  // import { useState, useEffect } from "react";

  const { clipName, players, detections, knowledgeEdges } = CLIP_CONFIG;
  const suspects = players.filter(p => p.suspect);
  const selDet    = selected ? detections[selected] : null;
  const selPlayer = players.find(p => p.id === selected);

  // Blink the live dot every 700ms
  useEffect(() => {
    const id = setInterval(() => setPulse(v => !v), 700);
    return () => clearInterval(id);
  }, []);


  // ── Minimized state ──────────────────────────────────────────────
  // When mini is true, render only a small badge.
  // Clicking it sets mini back to false and expands the full panel.

  if (mini) {
    return (
      <div
        onClick={() => setMini(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          background: C.bg,
          border: `1px solid ${C.cheat}44`,
          borderRadius: 20,
          cursor: "pointer",
          fontFamily: mono,
          fontSize: 11,
          color: C.cheat,
          userSelect: "none",
        }}
      >
        <span style={{
          width: 6, height: 6,
          borderRadius: "50%",
          display: "inline-block",
          background: C.cheat,
          opacity: pulse ? 1 : 0.25,
          flexShrink: 0,
        }} />
        ZK-GUARD · {suspects.length} SUSPECT{suspects.length !== 1 ? "S" : ""}
        <span style={{ color: C.dim, fontSize: 10, marginLeft: 4 }}>▲ expand</span>
      </div>
    );
  }


  // ── Full panel ───────────────────────────────────────────────────

  return (
    <div style={{
      width: 320,
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: "hidden",
      fontFamily: mono,
      fontSize: 12,
      color: C.text,
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Live dot — pulses red if suspects exist, green if all clear */}
        <span style={{
          width: 6, height: 6,
          borderRadius: "50%",
          flexShrink: 0,
          background: suspects.length > 0 ? C.cheat : C.clean,
          opacity: pulse ? 1 : 0.3,
        }} />
        <span style={{ color: C.bright, fontSize: 10, letterSpacing: 2 }}>
          ZK-GUARD
        </span>
        <span style={{
          flex: 1,
          color: C.dim,
          fontSize: 10,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {clipName}
        </span>
        {/* Minimize button */}
        <button
          onClick={() => setMini(true)}
          style={{
            background: "none",
            border: "none",
            color: C.dim,
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Stat row ── */}
      {/* Three numbers: suspects detected / total players / anomaly edges */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        {[
          { val: suspects.length,       label: "SUSPECTS",  color: suspects.length > 0 ? C.cheat : C.dim },
          { val: players.length,        label: "PLAYERS",   color: C.bright },
          { val: knowledgeEdges.length, label: "ANOMALIES", color: knowledgeEdges.length > 0 ? C.warn : C.dim },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1,
            padding: "8px 0",
            textAlign: "center",
            borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ fontSize: 20, fontWeight: "bold", color: s.color, lineHeight: 1.2 }}>
              {s.val}
            </div>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Nodal graph section ── */}
      <div style={{ padding: "10px 12px 8px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>
          POSITION MESH  ·  WALLHACK ANALYSIS
        </div>
        <NodalGraph
          players={players}
          knowledgeEdges={knowledgeEdges}
          selected={selected}
          onSelect={setSelected}
        />
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 9, color: C.dim }}>
          <span><span style={{ color: C.ct }}>●</span> CT</span>
          <span><span style={{ color: C.t }}>●</span> T</span>
          <span><span style={{ color: C.cheat }}>- -</span> Knowledge anomaly</span>
          <span style={{ marginLeft: "auto" }}>click node to inspect</span>
        </div>
      </div>

      {/* ── Player list ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 12px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>
          PLAYER STATUS
        </div>
        {players.map(p => {
          const det     = detections[p.id];
          const flagged = det && Object.values(det).some(d => d.active);
          const topConf = det ? Math.max(...Object.values(det).map(d => d.confidence)) : 0;

          return (
            <div
              key={p.id}
              onClick={() => det && setSelected(selected === p.id ? null : p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 7px",
                marginBottom: 2,
                borderRadius: 4,
                cursor: det ? "pointer" : "default",
                background: selected === p.id ? C.card : "transparent",
                border: `1px solid ${selected === p.id ? C.border : "transparent"}`,
              }}
            >
              <span style={{
                width: 5, height: 5,
                borderRadius: "50%",
                flexShrink: 0,
                background: p.team === "ct" ? C.ct : C.t,
              }} />
              <span style={{ flex: 1, color: flagged ? C.bright : C.text, fontSize: 11 }}>
                {p.name}
              </span>
              <span style={{
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 3,
                color:      flagged ? C.cheat : det ? C.text : C.dim,
                background: flagged ? `${C.cheat}18` : "transparent",
                border:     `1px solid ${flagged ? `${C.cheat}40` : C.border}`,
              }}>
                {flagged ? "FLAGGED" : det ? `${topConf}%` : "CLEAN"}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Player detail panel ── */}
      {/* Only renders when a suspect is selected. Shows per-module breakdown. */}
      {selDet && selPlayer && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: "8px 12px",
          background: C.card,
        }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 10 }}>
            ANALYSIS  ·  {selPlayer.name.toUpperCase()}
          </div>
          {Object.entries(selDet).map(([mod, d]) => (
            <div key={mod} style={{ marginBottom: 10 }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}>
                <span style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: d.active ? C.cheat : C.text,
                }}>
                  {mod}
                </span>
                {d.active && (
                  <span style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 2,
                    color: C.cheat,
                    border: `1px solid ${C.cheat}`,
                  }}>
                    DETECTED
                  </span>
                )}
              </div>
              <Bar value={d.confidence} active={d.active} />
              {d.note && d.active && (
                <div style={{ fontSize: 9, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>
                  {d.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        padding: "4px 12px",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        color: C.dim,
        background: C.surface,
      }}>
        <span>ZK-GUARD DEMO v1.0</span>
        <span>SIMULATED DATA · NOT LIVE</span>
      </div>

    </div>
  );
}
```

---

## Step 7 — Add the React Import

At the very top of `src/App.jsx`, add this single import line. Nothing else is needed from external libraries:

```js
import { useState, useEffect } from "react";
```

Your final `src/App.jsx` file structure should read top-to-bottom in this order:

1. `import { useState, useEffect } from "react";`
2. `const CLIP_CONFIG = { ... }` (from Step 2)
3. `const C = { ... }` (from Step 3)
4. `const mono = "..."` (from Step 3)
5. `function Bar(...) { ... }` (from Step 4)
6. `function NodalGraph(...) { ... }` (from Step 5)
7. `export default function App() { ... }` (from Step 6)

---

## Step 8 — Run It and Check

Start the dev server if it isn't already running:

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome. You should see the overlay panel. Check the following:

- The header shows your clip name
- The stat row shows the correct number of suspects, players, and anomaly edges
- The nodal graph shows colored dots at roughly the positions you set
- Suspect player dots have a pulsing red ring
- Red dashed lines animate between the players you listed in `knowledgeEdges`
- Clicking a suspect's dot selects it and expands the detail panel below
- The `×` button collapses the panel to a badge
- Clicking the badge expands it again

If anything looks wrong, the most common cause is a typo in a player `id` that doesn't match the key in `detections` or a `from`/`to` in `knowledgeEdges`.

---

## Step 9 — Make It an Overlay on Your Screen

Chrome can make any browser tab float as a small always-on-top window:

1. With the overlay open in Chrome, click the three-dot menu (⋮) in the top right
2. Go to **More tools → Create shortcut**
3. Check **"Open as window"** and click Create
4. This opens the overlay as a standalone Chrome window with no browser UI
5. On Windows: right-click the taskbar icon → **Always on top** (if available) or use a tool like PowerToys
6. On Mac: right-click the Dock icon → **Options → All Desktops**, then drag it to your corner

Alternatively, resize the window to roughly 360×700px and drag it to whichever corner doesn't block your clip.

---

## Step 10 — Customizing for a New Clip

When you record a new clip and want to demo it, do only these things:

1. Open `src/App.jsx`
2. Update `clipName` to identify the new clip
3. Replace the `players` array:
   - Pause the clip at a moment where you can see everyone on the in-game minimap
   - Estimate each player's position as x/y values from 0.0 to 1.0
   - Set `suspect: true` on whoever you want the red ring on
4. Replace the `detections` object:
   - Add an entry for each suspect using their exact `id`
   - Set `confidence` scores to whatever looks convincing for the moment in the clip
   - Set `active: true` on the cheat type you're demonstrating
   - Write a specific `note` (e.g. "Pre-fired banana 1.8s before enemy turned the corner")
5. Replace `knowledgeEdges`:
   - Add a line between each suspect and whoever they appear to track through a wall
   - Set `anomaly` between 0.7 and 0.95 so the line is clearly visible
6. Save. The overlay hot-reloads instantly.

Total time to update for a new clip: 2–3 minutes.

---

## Final File Checklist

| File | Status |
|---|---|
| `src/App.jsx` | Contains config, palette, Bar, NodalGraph, and App — in that order |
| `src/main.jsx` | Left exactly as Vite created it |
| `src/index.css` | Empty (no styles needed — everything is inline) |
| `index.html` | Left exactly as Vite created it |
| `package.json` | Left exactly as Vite created it |

No additional files. No additional dependencies. No `.env` files.


workflow:
Member 1: The AI & Data Engineer (Backend)

Workspace: server/detection/, scripts/
Job: Focus purely on Python, PyTorch, and the math. They write the scripts to generate fake data and build the ML models.
Independence: They don't need the frontend or the blockchain to test their models.


Member 2: The Frontend Architect (React Dashboard)

Workspace: dashboard/
Job: Focus on making the React UI look stunning, wiring up Recharts, and building the Canvas minimap.
Independence: They can mock the websocket data locally so they can build the entire UI without waiting for Member 1 to finish the backend.


Member 3: The Blockchain Developer (Midnight ZK)

Workspace: contracts/, docker-compose.yml
Job: Focus on writing the Midnight Compact smart contract to generate the ZK proof and handle Lace wallet integration.
Independence: Their smart contract is completely isolated from the game server. It just takes a boolean (isHuman), verifies it, and mints a badge.


Member 4: The Simulator & Integration Lead

Workspace: server/simulation/
Job: Write the Python physics loop that moves the 10 fake players around the map. Crucially, they also act as the "director" for the final demo video, orchestrating when to toggle the cheats to make the UI spike.
Independence: They define the physics independently. They just send their raw physics data to Member 1's backend.
The Golden Rule for the Team: Before anyone writes code, Member 1, 2, and 4 must sit down and agree on the exact JSON schema for the telemetry data. Once that JSON structure is agreed upon, all three members can write code independently and it will magically plug together on Sunday morning!

Does this distribution plan make sense for your team's skills?

Great, it looks like the task distribution has been approved!

You now have a complete Phase 1 and Phase 2 backend pipeline with trained ML models, a beautifully upgraded Phase 3 dashboard that renders the players on a canvas minimap, and a clear distribution plan for your team to build the overlay and tackle the Midnight ZK integration.

What would you like to work on next? We can either start working on the Midnight Compact smart contracts (Phase 4), or I can help you set up the new React overlay you just pasted into the PRD.