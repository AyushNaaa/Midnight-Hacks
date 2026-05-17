import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
//  EDIT THIS BLOCK FOR EACH CLIP YOU RECORD
//  Nothing else in the file needs to change between clips.
// ─────────────────────────────────────────────────────────────
const CLIP_CONFIG = {
  clipName: "de_dust2  ·  B Site Rush",
  players: [
    { id: "you", name: "You",      x: 0.22, y: 0.62, team: "ct" },
    { id: "a1",  name: "ally_1",   x: 0.18, y: 0.40, team: "ct" },
    { id: "a2",  name: "ally_2",   x: 0.30, y: 0.76, team: "ct" },
    { id: "e1",  name: "xX_snap",  x: 0.60, y: 0.28, team: "t",  suspect: true },
    { id: "e2",  name: "h3adsh0t", x: 0.74, y: 0.54, team: "t"  },
    { id: "e3",  name: "wally123", x: 0.84, y: 0.20, team: "t",  suspect: true },
  ],
  detections: {
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
    { from: "e3", to: "a1", anomaly: 0.91 },
    { from: "e3", to: "a2", anomaly: 0.74 },
  ],
};

const C = {
  bg:      "#07090e",
  surface: "#0b0e18",
  card:    "#0f1320",
  border:  "#182030",
  dim:     "#38485e",
  text:    "#6a8aaa",
  bright:  "#b0cce8",
  clean:   "#22cc66",
  warn:    "#ffaa22",
  cheat:   "#ff3344",
  ct:      "#3399ff",
  t:       "#ff7733",
};

const mono = "'Courier New', Courier, monospace";

function Bar({ value, active }) {
  const color = active
    ? C.cheat
    : value > 60 ? C.warn
    : value > 30 ? C.text
    : C.dim;

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
      <span style={{ fontSize: 10, color, minWidth: 32, textAlign: "right", fontFamily: mono }}>
        {value}%
      </span>
    </div>
  );
}

function NodalGraph({ players, knowledgeEdges, selected, onSelect, isHacking }) {
  const W = 292, H = 200;
  const px = p => p.x * (W - 28) + 14;
  const py = p => p.y * (H - 28) + 14;
  const byId = Object.fromEntries(players.map(p => [p.id, p]));

  // Only show red knowledge edges and suspect rings if isHacking is true
  const edgesToRender = isHacking ? knowledgeEdges : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", borderRadius: 4, background: C.surface }}>
      {[1, 2, 3].map(i => (
        <g key={i}>
          <line x1={i * W / 4} y1={0} x2={i * W / 4} y2={H} stroke={C.border} strokeWidth={0.5} />
          <line x1={0} y1={i * H / 4} x2={W} y2={i * H / 4} stroke={C.border} strokeWidth={0.5} />
        </g>
      ))}

      {edgesToRender.map((e, i) => {
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
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.9s" repeatCount="indefinite" />
          </line>
        );
      })}

      {edgesToRender.map((e, i) => {
        const f = byId[e.from], t = byId[e.to];
        if (!f || !t) return null;
        return (
          <text key={`lbl-${i}`} x={(px(f) + px(t)) / 2} y={(py(f) + py(t)) / 2 - 4} textAnchor="middle" fontSize={7} fontFamily={mono} fill={C.cheat} opacity={0.85}>
            {Math.round(e.anomaly * 100)}%
          </text>
        );
      })}

      {players.map(p => {
        const x = px(p), y = py(p);
        const nodeColor = p.team === "ct" ? C.ct : C.t;
        const isSel = selected === p.id;
        const isSuspect = isHacking && p.suspect;

        return (
          <g key={p.id} onClick={() => onSelect(p.id === selected ? null : p.id)} style={{ cursor: "pointer" }}>
            {isSuspect && (
              <circle cx={x} cy={y} r={9} fill="none" stroke={C.cheat} strokeWidth={0.8}>
                <animate attributeName="r" values="8;13;8" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
            {isSel && <circle cx={x} cy={y} r={8} fill="none" stroke={C.bright} strokeWidth={1} strokeDasharray="3 2" />}
            <circle cx={x} cy={y} r={4.5} fill={nodeColor} opacity={0.9} />
            <text x={x + 7} y={y + 3.5} fontSize={7.5} fontFamily={mono} fill={isSuspect ? C.cheat : C.text}>{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [selected, setSelected] = useState(null);
  const [mini, setMini] = useState(false);
  const [pulse, setPulse] = useState(true);
  
  // Custom states added for the demo
  const [programStarted, setProgramStarted] = useState(false);
  const [isHacking, setIsHacking] = useState(false);

  const { clipName, players, detections, knowledgeEdges } = CLIP_CONFIG;
  
  // Filter suspects based on if the hack toggle is ON
  const suspects = isHacking ? players.filter(p => p.suspect) : [];
  const edges = isHacking ? knowledgeEdges : [];
  const activeDetections = isHacking ? detections : {};
  
  const selDet = selected ? activeDetections[selected] : null;
  const selPlayer = players.find(p => p.id === selected);

  useEffect(() => {
    const id = setInterval(() => setPulse(v => !v), 700);
    return () => clearInterval(id);
  }, []);

  if (!programStarted) {
    return (
      <div style={{
        width: 320, padding: 20, background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, fontFamily: mono, color: C.text, textAlign: 'center'
      }}>
        <h2 style={{ color: C.bright, letterSpacing: 2 }}>ZK-GUARD OVERLAY</h2>
        <p style={{ fontSize: 11, marginBottom: 20, color: C.dim }}>Ready to analyze clip: {clipName}</p>
        <button 
          onClick={() => setProgramStarted(true)}
          style={{ background: C.clean, color: '#000', border: 'none', padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
          START PROGRAM
        </button>
      </div>
    );
  }

  if (mini) {
    return (
      <div onClick={() => setMini(false)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", background: C.bg, border: `1px solid ${suspects.length > 0 ? C.cheat : C.border}44`, borderRadius: 20, cursor: "pointer", fontFamily: mono, fontSize: 11, color: suspects.length > 0 ? C.cheat : C.text, userSelect: "none" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.25, flexShrink: 0 }} />
        ZK-GUARD · {suspects.length} SUSPECT{suspects.length !== 1 ? "S" : ""}
        <span style={{ color: C.dim, fontSize: 10, marginLeft: 4 }}>▲ expand</span>
      </div>
    );
  }

  return (
    <div style={{ width: 320, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontFamily: mono, fontSize: 12, color: C.text }}>
      
      {/* ── Demo Control Bar (Added for Demo) ── */}
      <div style={{ display: 'flex', gap: 4, padding: 8, background: '#000', borderBottom: `1px solid ${C.border}` }}>
        <button 
          onClick={() => setIsHacking(false)}
          style={{ flex: 1, padding: 6, fontSize: 10, cursor: 'pointer', background: !isHacking ? C.clean : 'transparent', color: !isHacking ? '#000' : C.text, border: `1px solid ${C.clean}`, borderRadius: 4 }}>
          NOT HACKING (CLEAN)
        </button>
        <button 
          onClick={() => setIsHacking(true)}
          style={{ flex: 1, padding: 6, fontSize: 10, cursor: 'pointer', background: isHacking ? C.cheat : 'transparent', color: isHacking ? '#fff' : C.text, border: `1px solid ${C.cheat}`, borderRadius: 4 }}>
          HACKING (INJECT CHEATS)
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.3 }} />
        <span style={{ color: C.bright, fontSize: 10, letterSpacing: 2 }}>ZK-GUARD</span>
        <span style={{ flex: 1, color: C.dim, fontSize: 10, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clipName}</span>
        <button onClick={() => setMini(true)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        {[
          { val: suspects.length,       label: "SUSPECTS",  color: suspects.length > 0 ? C.cheat : C.dim },
          { val: players.length,        label: "PLAYERS",   color: C.bright },
          { val: edges.length, label: "ANOMALIES", color: edges.length > 0 ? C.warn : C.dim },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "8px 0", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 20, fontWeight: "bold", color: s.color, lineHeight: 1.2 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 12px 8px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>POSITION MESH · WALLHACK ANALYSIS</div>
        <NodalGraph players={players} knowledgeEdges={edges} selected={selected} onSelect={setSelected} isHacking={isHacking} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 12px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>PLAYER STATUS</div>
        {players.map(p => {
          const det = activeDetections[p.id];
          const flagged = det && Object.values(det).some(d => d.active);
          const topConf = det ? Math.max(...Object.values(det).map(d => d.confidence)) : 0;
          return (
            <div key={p.id} onClick={() => det && setSelected(selected === p.id ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 7px", marginBottom: 2, borderRadius: 4, cursor: det ? "pointer" : "default", background: selected === p.id ? C.card : "transparent", border: `1px solid ${selected === p.id ? C.border : "transparent"}` }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: p.team === "ct" ? C.ct : C.t }} />
              <span style={{ flex: 1, color: flagged ? C.bright : C.text, fontSize: 11 }}>{p.name}</span>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, color: flagged ? C.cheat : det ? C.text : C.dim, background: flagged ? `${C.cheat}18` : "transparent", border: `1px solid ${flagged ? `${C.cheat}40` : C.border}` }}>
                {flagged ? "FLAGGED" : det ? `${topConf}%` : "CLEAN"}
              </span>
            </div>
          );
        })}
      </div>

      {selDet && selPlayer && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 12px", background: C.card }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 10 }}>ANALYSIS · {selPlayer.name.toUpperCase()}</div>
          {Object.entries(selDet).map(([mod, d]) => (
            <div key={mod} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: d.active ? C.cheat : C.text }}>{mod}</span>
                {d.active && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 2, color: C.cheat, border: `1px solid ${C.cheat}` }}>DETECTED</span>}
              </div>
              <Bar value={d.confidence} active={d.active} />
              {d.note && d.active && <div style={{ fontSize: 9, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{d.note}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "4px 12px", display: "flex", justifyContent: "space-between", fontSize: 9, color: C.dim, background: C.surface }}>
        <span>ZK-GUARD DEMO v1.0</span>
        <span>SIMULATED DATA · NOT LIVE</span>
      </div>
    </div>
  );
}
