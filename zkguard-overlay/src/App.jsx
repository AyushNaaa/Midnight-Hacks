import { useState, useRef, useEffect, useCallback } from "react";
import "./index.css"; 

// ─────────────────────────────────────────────────────────────
//  CONFIG
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

const OW_CONFIG = {
  clipName: "Rialto  ·  Payload Attack  ·  Wallhack ESP",
  players: [
    // ── Attackers (Cheater's team) ──
    { id: "widowmaker", name: "SpideySenses", x: 0.20, y: 0.80, team: "t", suspect: true },
    { id: "mercy",      name: "HealPlz",      x: 0.15, y: 0.85, team: "t" },
    { id: "rein",       name: "ShieldMan",    x: 0.35, y: 0.75, team: "t" },
    { id: "genji",      name: "IneedHealing", x: 0.40, y: 0.60, team: "t" },
    { id: "ana",        name: "Grandma",      x: 0.10, y: 0.90, team: "t" },
    // ── Defenders ──
    { id: "tracer",     name: "Blinky",       x: 0.60, y: 0.40, team: "ct" },
    { id: "zenyatta",   name: "Peace",        x: 0.85, y: 0.30, team: "ct" },
    { id: "sigma",      name: "Gravity",      x: 0.70, y: 0.50, team: "ct" },
    { id: "baptiste",   name: "Lamp",         x: 0.80, y: 0.45, team: "ct" },
    { id: "soldier",    name: "RunGunn",      x: 0.65, y: 0.35, team: "ct" },
  ],
  detections: {
    widowmaker: {
      aimbot:   { active: true,  confidence: 95, note: "Micro-flicks locking to heads within 15ms · 8 instances" },
      wallhack: { active: true,  confidence: 99, note: "Tracking Tracer's blinks through solid geometry perfectly" },
      movement: { active: false, confidence: 20, note: "" },
    },
  },
  knowledgeEdges: [
    { from: "widowmaker", to: "tracer",   anomaly: 0.98 },
    { from: "widowmaker", to: "zenyatta", anomaly: 0.91 },
    { from: "widowmaker", to: "soldier",  anomaly: 0.85 },
  ],
};

// ── THEME COLORS (Tuff, Modern, Sleek, Monochrome heavy) ──
const C = {
  bg:      "#000000",
  surface: "#09090b",
  card:    "#18181b",
  border:  "rgba(255,255,255,0.08)",
  dim:     "#a1a1aa",
  text:    "#fafafa",
  bright:  "#ffffff", 
  clean:   "#10b981", 
  warn:    "#f59e0b",
  cheat:   "#ef4444",
  ct:      "#3b82f6",
  t:       "#f97316",
};

const fontMain = "'Inter', -apple-system, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace";

function Bar({ value, active }) {
  const color = active
    ? C.cheat
    : value > 60 ? C.warn
    : value > 30 ? C.text
    : C.dim;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 4,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          width: `${value}%`,
          height: "100%",
          background: color,
        }} />
      </div>
      <span style={{ fontSize: 10, color, minWidth: 28, textAlign: "right", fontFamily: fontMono, fontWeight: 500 }}>
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

  const edgesToRender = isHacking ? knowledgeEdges : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}` }}>
      {[1, 2, 3].map(i => (
        <g key={i}>
          <line x1={i * W / 4} y1={0} x2={i * W / 4} y2={H} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
          <line x1={0} y1={i * H / 4} x2={W} y2={i * H / 4} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
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
            strokeWidth={1.5}
            strokeOpacity={0.6 + e.anomaly * 0.4}
            strokeDasharray="4 4"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1s" repeatCount="indefinite" />
          </line>
        );
      })}

      {edgesToRender.map((e, i) => {
        const f = byId[e.from], t = byId[e.to];
        if (!f || !t) return null;
        
        const jitter = Math.sin(tick * (i + 1) * 0.05) * 3; 
        const displayVal = Math.round(Math.min(99, Math.max(10, (e.anomaly * 100) + jitter)));

        return (
          <text key={`lbl-${i}`} x={(px(f) + px(t)) / 2} y={(py(f) + py(t)) / 2 - 6} textAnchor="middle" fontSize={9} fontWeight="500" fontFamily={fontMono} fill={C.cheat}>
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
              <circle cx={x} cy={y} r={10} fill="rgba(239, 68, 68, 0.1)" stroke={C.cheat} strokeWidth={1} />
            )}
            {isSel && <circle cx={x} cy={y} r={8} fill="none" stroke={C.text} strokeWidth={1} strokeDasharray="2 2" />}
            <circle cx={x} cy={y} r={4} fill={nodeColor} />
            <text x={x + 8} y={y + 3} fontSize={9} fontWeight="500" fontFamily={fontMono} fill={isSuspect ? C.cheat : C.dim}>{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── JERK KINEMATICS GRAPH ──
function JerkGraph({ isHacking }) {
  const [dataPoints, setDataPoints] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDataPoints(prev => {
        const newData = [...prev];
        if (newData.length > 50) newData.shift();
        
        let nextVal = Math.random() * 100; 
        
        if (isHacking && Math.random() > 0.5) {
          nextVal = 90 + Math.random() * 10; 
        }
        
        if (newData.length === 0) return [nextVal];
        newData.push(nextVal);
        return newData;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isHacking]);

  const pointsString = dataPoints.map((val, i) => `${(i / 50) * 100},${100 - (val / 120) * 100}`).join(" ");
  
  return (
     <div style={{ padding: "16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
       <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, display: "flex", justifyContent: "space-between", fontFamily: fontMono }}>
         <span>KINEMATIC_JERK_HZ</span>
         <span style={{ color: isHacking ? C.cheat : C.clean }}>
           {isHacking ? "ANOMALOUS" : "NOMINAL"}
         </span>
       </div>
       <div style={{ width: "100%", height: 48, position: "relative", background: C.card, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
         <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
           <polyline points={pointsString} fill="none" stroke={isHacking ? C.cheat : C.dim} strokeWidth="1" vectorEffect="non-scaling-stroke" />
           <line x1="0" y1="33" x2="100" y2="33" stroke={C.cheat} strokeWidth="1" strokeDasharray="4 4" opacity={0.4} />
         </svg>
       </div>
     </div>
  );
}

// ── MIDNIGHT ZK-PROOF WIDGET ──
function MidnightWidget({ isHacking, pulse }) {
  const [hash, setHash] = useState("0x...");
  useEffect(() => {
    const int = setInterval(() => {
      setHash("0x" + Math.random().toString(16).substring(2, 10).toUpperCase() + "..." + Math.random().toString(16).substring(2, 6).toUpperCase());
    }, isHacking ? 800 : 3000);
    return () => clearInterval(int);
  }, [isHacking]);

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px", background: C.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, background: "#8b5cf6", borderRadius: "50%" }} />
          <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: fontMono, fontWeight: 600 }}>MIDNIGHT_LEDGER</span>
        </div>
        <span style={{ fontSize: 9, color: C.dim, padding: "2px 6px", background: C.card, borderRadius: 4, border: `1px solid ${C.border}`, fontFamily: fontMono }}>COMPACT_SC</span>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: fontMono, fontSize: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.dim }}>VERDICT_RECORD</span>
          <span style={{ color: isHacking ? C.cheat : C.clean }}>
            {isHacking ? "FLAGGED_ANOMALY" : "SESSION_CLEAN"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.dim }}>DATA_EXPOSURE</span>
          <span style={{ color: C.dim }}>ZERO_KNOWLEDGE</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: C.dim }}>RECEIPT_HASH</span>
          <span style={{ color: "#a78bfa", opacity: pulse ? 1 : 0.6, transition: "opacity 0.2s" }}>{hash}</span>
        </div>
      </div>
    </div>
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

  // Custom drag tracking state
  const [dragState, setDragState] = useState(null);

  // Opacity tracking
  const hoverTimerRef = useRef(null);

  const setElectronOpacity = (val) => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('set-opacity', val);
      } catch (e) {}
    }
  };

  const setElectronWindow = (width, height) => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('resize-window', { width, height });
      } catch (e) {}
    }
  };

  const handleLogoDown = (e) => {
    setDragState({
      startX: e.screenX,
      startY: e.screenY,
      offsetX: e.clientX,
      offsetY: e.clientY
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      if (window.require) {
        const newX = e.screenX - dragState.offsetX;
        const newY = e.screenY - dragState.offsetY;
        window.require('electron').ipcRenderer.send('move-window', { x: newX, y: newY });
      }
    };

    const handleUp = (e) => {
      const dx = Math.abs(e.screenX - dragState.startX);
      const dy = Math.abs(e.screenY - dragState.startY);
      if (dx < 4 && dy < 4) {
        setMini(false);
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragState]);

  // Resize window appropriately
  useEffect(() => {
    if (mini) {
      setElectronWindow(110, 110);
    } else {
      setElectronWindow(320, 720);
    }
  }, [mini]);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setElectronOpacity(1.0);
    }, 2000);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronOpacity(0.9);
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
      for (let i = 1; i < knowledgeEdges.length; i++) {
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

  const suspects = isHacking ? players.filter(p => p.suspect) : [];
  const edges = isHacking ? knowledgeEdges.slice(0, visibleEdgesCount) : [];
  const activeDetections = isHacking ? detections : {};
  
  const selDet = selected ? activeDetections[selected] : null;
  const selPlayer = players.find(p => p.id === selected);

  useEffect(() => {
    const id = setInterval(() => setPulse(v => !v), 700);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!programStarted) return;
    const id = setInterval(() => {
      setTick(t => t + Math.floor(Math.random() * 3) + 2);
      setElapsedMs(Date.now() - startTime);
    }, 80);
    return () => clearInterval(id);
  }, [programStarted, startTime]);

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
    if (e.key === "j" || e.key === "J") {
      setIsHacking(v => {
        const nextHacking = !v;
        setConfig(nextHacking ? OW_CONFIG : DEFAULT_CONFIG);
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
        width: 320, padding: 32, background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, fontFamily: fontMain, color: C.text, textAlign: 'center', boxShadow: `0 24px 48px rgba(0,0,0,0.5)`
      }}>
        <h2 style={{ color: C.text, letterSpacing: 1, fontWeight: 500, fontSize: 16 }}>AEGIS_GUARD</h2>
        <p style={{ fontSize: 11, marginBottom: 32, color: C.dim, fontFamily: fontMono }}>READY TO ANALYZE</p>
        <button 
          onClick={() => { setProgramStarted(true); setElectronWindow(320, 720); setStartTime(Date.now()); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.text; e.currentTarget.style.color = C.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.text; }}
          style={{ WebkitAppRegion: "no-drag", background: "transparent", color: C.text, border: `1px solid ${C.border}`, padding: '12px 24px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 11, letterSpacing: 1, transition: 'all 0.15s ease', fontFamily: fontMono, width: "100%" }}>
          INITIALIZE ENGINE
        </button>
      </div>
    );
  }

  if (mini) {
    return (
      <div 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ 
          width: "100%", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", justifyContent: "center", alignItems: "center", background: "transparent"
        }}>
        
        <div 
          onMouseDown={handleLogoDown}
          style={{
            width: 64, height: 64, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, 
            display: "flex", justifyContent: "center", alignItems: "center",
            boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5)`, cursor: "pointer", transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.card; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.bg; }}
        >
          <img src="/logo.png" alt="AEGIS" style={{ width: "60%", height: "60%", objectFit: "contain", pointerEvents: "none", opacity: 0.8, filter: "grayscale(100%) brightness(200%)" }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = '<span style="color:#fff;font-weight:500;font-size:12px;">AEGIS</span>'; }}
          />
        </div>
      </div>
    );
  }

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ width: 320, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", fontFamily: fontMain, fontSize: 12, color: C.text, boxShadow: `0 24px 48px rgba(0,0,0,0.5)` }}>
      
      {/* ── Header ── */}
      <div style={{ WebkitAppRegion: "drag", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.4 }} />
        <span style={{ color: C.text, fontSize: 12, fontWeight: 500, letterSpacing: 1 }}>AEGIS</span>
        <span style={{ flex: 1, color: C.dim, fontSize: 10, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "grab", fontFamily: fontMono }}>{clipName}</span>
        <span style={{ color: C.dim, fontSize: 10, fontFamily: fontMono }}>{elapsedStr}</span>
        <button onClick={() => setMini(true)} style={{ WebkitAppRegion: "no-drag", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>

      <JerkGraph isHacking={suspects.length > 0} />

      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        {[
          { val: suspects.length,       label: "SUSPECTS",  color: suspects.length > 0 ? C.cheat : C.dim },
          { val: players.length,        label: "PLAYERS",   color: C.text },
          { val: edges.length, label: "ANOMALIES", color: edges.length > 0 ? C.warn : C.dim },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "16px 0", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 16, fontFamily: fontMono, color: s.color, lineHeight: 1.2 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.dim, marginTop: 4, fontFamily: fontMono }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px", background: C.surface }}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, fontFamily: fontMono }}>TOPOLOGY_MESH</div>
        <NodalGraph players={players} knowledgeEdges={edges} selected={selected} onSelect={setSelected} isHacking={isHacking} tick={tick} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px", background: C.bg }}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, fontFamily: fontMono }}>ENTITY_STATUS</div>
        {players.map(p => {
          const det = activeDetections[p.id];
          const flagged = det && Object.values(det).some(d => d.active);
          return (
            <div key={p.id} onClick={() => det && setSelected(selected === p.id ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px", marginBottom: 4, borderRadius: 4, cursor: det ? "pointer" : "default", background: selected === p.id ? C.card : "transparent", border: `1px solid ${selected === p.id ? C.border : "transparent"}`, transition: "all 0.1s" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: p.team === "ct" ? C.ct : C.t }} />
              <span style={{ flex: 1, color: flagged ? C.text : C.dim, fontSize: 11, fontFamily: fontMono }}>{p.name}</span>
              <span style={{ fontSize: 9, fontFamily: fontMono, color: flagged ? C.cheat : det ? C.text : C.dim }}>
                {flagged ? "FLAGGED" : det ? "ANALYZING" : "NOMINAL"}
              </span>
            </div>
          );
        })}
      </div>

      {selDet && selPlayer && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px", background: C.surface }}>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 16, fontFamily: fontMono }}>INSPECTION_{selPlayer.id.toUpperCase()}</div>
          {Object.entries(selDet).map(([mod, d]) => (
            <div key={mod} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: d.active ? C.cheat : C.dim, fontFamily: fontMono }}>{mod}</span>
                {d.active && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, color: C.bg, background: C.cheat, fontFamily: fontMono }}>DETECTED</span>}
              </div>
              <Bar value={d.confidence} active={d.active} />
              {d.note && d.active && <div style={{ fontSize: 10, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>{d.note}</div>}
            </div>
          ))}
        </div>
      )}

      <MidnightWidget isHacking={isHacking} pulse={pulse} />

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", justifyContent: "space-between", fontSize: 9, color: C.dim, background: C.surface, fontFamily: fontMono }}>
        <span>AEGIS_ENGINE_V3</span>
        <span style={{ color: isHacking ? C.cheat : C.dim }}>TICK_{tick.toLocaleString()}</span>
      </div>
    </div>
  );
}
