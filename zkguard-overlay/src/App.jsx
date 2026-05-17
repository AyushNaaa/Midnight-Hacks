import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
//  EDIT THIS BLOCK FOR EACH CLIP YOU RECORD
//  Nothing else in the file needs to change between clips.
// ─────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  clipName: "SYSTEM IDLE  ·  WAITING FOR MATCH HOOK",
  players: [
    { id: "a1", name: "Alpha_1", x: 0.22, y: 0.62, team: "ct" },
    { id: "a2", name: "Alpha_2", x: 0.18, y: 0.40, team: "ct" },
    { id: "a3", name: "Alpha_3", x: 0.30, y: 0.76, team: "ct" },
    { id: "a4", name: "Alpha_4", x: 0.38, y: 0.74, team: "ct" },
    { id: "a5", name: "Alpha_5", x: 0.22, y: 0.50, team: "ct" },
    { id: "b1", name: "Bravo_1", x: 0.72, y: 0.30, team: "t" },
    { id: "b2", name: "Bravo_2", x: 0.80, y: 0.64, team: "t" },
    { id: "b3", name: "Bravo_3", x: 0.68, y: 0.82, team: "t" },
    { id: "b4", name: "Bravo_4", x: 0.88, y: 0.45, team: "t" },
    { id: "b5", name: "Bravo_5", x: 0.75, y: 0.52, team: "t" },
  ],
  detections: {},
  knowledgeEdges: [],
};

const HAVEN_CONFIG = {
  clipName: "Haven  ·  Mid Control  ·  Wallhack ESP",
  players: [
    // ── Attackers (POOFBALL's team) ──
    { id: "poof",   name: "POOFBALL777",  x: 0.42, y: 0.48, team: "t",  suspect: true },
    { id: "krissy", name: "KrissyKrems",  x: 0.34, y: 0.62, team: "t"  },
    { id: "latino", name: "Latino",       x: 0.28, y: 0.38, team: "t"  },
    { id: "jbents", name: "jbents",       x: 0.38, y: 0.74, team: "t"  },
    { id: "viper",  name: "ViperMain99",  x: 0.22, y: 0.50, team: "t"  },
    // ── Defenders ──
    { id: "trit",   name: "tritonium",    x: 0.85, y: 0.75, team: "ct" },
    { id: "reel",   name: "reelfate",     x: 0.72, y: 0.85, team: "ct" },
    { id: "iced",   name: "Iced Mocha",   x: 0.70, y: 0.20, team: "ct" },
    { id: "ash",    name: "Ashton",       x: 0.80, y: 0.55, team: "ct" },
    { id: "ben",    name: "benjamin",     x: 0.75, y: 0.40, team: "ct" },
  ],
  detections: {
    poof: {
      aimbot:   { active: false, confidence: 12, note: "" },
      wallhack: { active: true,  confidence: 98, note: "ESP overlay detected · Omni-directional tracking of 5 enemies through Haven walls" },
      movement: { active: true,  confidence: 87, note: "Pre-rotated to enemy positions 1.8s before line of sight · 5 instances" },
    },
  },
  knowledgeEdges: [
    { from: "poof", to: "iced", anomaly: 0.96 },
    { from: "poof", to: "ben",  anomaly: 0.92 },
    { from: "poof", to: "ash",  anomaly: 0.88 },
    { from: "poof", to: "trit", anomaly: 0.85 },
    { from: "poof", to: "reel", anomaly: 0.81 },
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

function NodalGraph({ players, knowledgeEdges, selected, onSelect, isHacking, tick }) {
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
        
        // Jitter the confidence number by +/- 3% based on the live tick
        const jitter = Math.sin(tick * (i + 1) * 0.05) * 3; 
        const displayVal = Math.round(Math.min(99, Math.max(10, (e.anomaly * 100) + jitter)));

        return (
          <text key={`lbl-${i}`} x={(px(f) + px(t)) / 2} y={(py(f) + py(t)) / 2 - 4} textAnchor="middle" fontSize={9} fontWeight="bold" fontFamily="sans-serif" fill={C.cheat} opacity={0.9}>
            {displayVal}%
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
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tick, setTick] = useState(Math.floor(Math.random() * 40000) + 10000);
  const [startTime, setStartTime] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Opacity tracking
  const hoverTimerRef = useRef(null);

  const setElectronOpacity = (val) => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('set-opacity', val);
      } catch (e) {
        // Ignore if not running in Electron
      }
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setElectronOpacity(1.0);
    }, 2000);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronOpacity(0.75);
  };

  const handleClick = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronOpacity(1.0);
  };

  const { clipName, players, detections, knowledgeEdges } = config;
  
  const [visibleEdgesCount, setVisibleEdgesCount] = useState(0);

  useEffect(() => {
    if (isHacking) {
      setVisibleEdgesCount(1); // Start with 1 instantly
      let timeouts = [];
      // Fast, randomized sequential pop-in for the rest of the edges
      for (let i = 1; i < knowledgeEdges.length; i++) {
        // Between 150ms and 500ms per step cumulative delay
        let delay = i * 150 + Math.random() * 350;
        let t = setTimeout(() => {
          setVisibleEdgesCount(prev => prev + 1);
        }, delay);
        timeouts.push(t);
      }
      return () => timeouts.forEach(clearTimeout);
    } else {
      setVisibleEdgesCount(0);
    }
  }, [isHacking, knowledgeEdges.length]);

  // Filter suspects based on if the hack toggle is ON
  const suspects = isHacking ? players.filter(p => p.suspect) : [];
  const edges = isHacking ? knowledgeEdges.slice(0, visibleEdgesCount) : [];
  const activeDetections = isHacking ? detections : {};
  
  const selDet = selected ? activeDetections[selected] : null;
  const selPlayer = players.find(p => p.id === selected);

  useEffect(() => {
    const id = setInterval(() => setPulse(v => !v), 700);
    return () => clearInterval(id);
  }, []);

  // Live tick counter + elapsed time
  useEffect(() => {
    if (!programStarted) return;
    const id = setInterval(() => {
      setTick(t => t + Math.floor(Math.random() * 3) + 2);
      setElapsedMs(Date.now() - startTime);
    }, 80);
    return () => clearInterval(id);
  }, [programStarted, startTime]);

  // Keyboard shortcuts — H toggles detection, M minimizes
  const handleKey = useCallback((e) => {
    if (!programStarted) return;
    if (e.key === "h" || e.key === "H") {
      setIsHacking(v => {
        const nextHacking = !v;
        setConfig(nextHacking ? HAVEN_CONFIG : DEFAULT_CONFIG);
        return nextHacking;
      });
      setSelected(null);
    }
    if (e.key === "m" || e.key === "M") {
      setMini(v => !v);
    }
  }, [programStarted]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const elapsed = Math.floor(elapsedMs / 1000);
  const elapsedStr = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  if (!programStarted) {
    return (
      <div 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
        WebkitAppRegion: "drag",
        width: 320, padding: 20, background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, fontFamily: mono, color: C.text, textAlign: 'center'
      }}>
        <h2 style={{ color: C.bright, letterSpacing: 2 }}>ZK-GUARD OVERLAY</h2>
        <p style={{ fontSize: 11, marginBottom: 20, color: C.dim }}>Ready to analyze clip: {clipName}</p>
        <button 
          onClick={() => { setProgramStarted(true); setStartTime(Date.now()); }}
          style={{ WebkitAppRegion: "no-drag", background: C.clean, color: '#000', border: 'none', padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
          START PROGRAM
        </button>
      </div>
    );
  }

  if (mini) {
    return (
      <div 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => { handleClick(); setMini(false); }} 
        style={{ WebkitAppRegion: "drag", display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", background: C.bg, border: `1px solid ${suspects.length > 0 ? C.cheat : C.border}44`, borderRadius: 20, cursor: "pointer", fontFamily: mono, fontSize: 11, color: suspects.length > 0 ? C.cheat : C.text, userSelect: "none" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.25, flexShrink: 0 }} />
        ZK-GUARD · {suspects.length} SUSPECT{suspects.length !== 1 ? "S" : ""}
        <span style={{ color: C.dim, fontSize: 10, marginLeft: 4 }}>▲ expand</span>
      </div>
    );
  }

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ width: 320, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontFamily: mono, fontSize: 12, color: C.text }}>
      
      {/* ── Header (no visible toggle buttons — use H key) ── */}
      <div style={{ WebkitAppRegion: "drag", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.3 }} />
        <span style={{ color: C.bright, fontSize: 10, letterSpacing: 2 }}>ZK-GUARD</span>
        <span style={{ flex: 1, color: C.dim, fontSize: 10, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "grab" }}>{clipName}</span>
        <span style={{ color: C.dim, fontSize: 9 }}>{elapsedStr}</span>
        <button onClick={() => setMini(true)} style={{ WebkitAppRegion: "no-drag", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
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
        <NodalGraph players={players} knowledgeEdges={edges} selected={selected} onSelect={setSelected} isHacking={isHacking} tick={tick} />
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
        <span>ZK-GUARD v1.0</span>
        <span style={{ color: isHacking ? `${C.cheat}99` : C.dim }}>TICK {tick.toLocaleString()}</span>
      </div>
    </div>
  );
}
