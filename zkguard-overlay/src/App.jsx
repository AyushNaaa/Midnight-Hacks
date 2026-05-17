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
  gameMode: "val",
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
  clipName: "Route 66  ·  Defense  ·  Aimbot Suite",
  gameMode: "ow",
  players: [
    // ── Defenders (POOFBALL's team - Aimbotting) ──
    { id: "poof", name: "POOFBALL777", x: 0.5, y: 0.6, team: "t", suspect: true },
    { id: "tm1",  name: "SneakyBeaky", x: 0.4, y: 0.65, team: "t", suspect: true },
    { id: "tm2",  name: "GigaChad",    x: 0.6, y: 0.65, team: "t", suspect: true },
    { id: "tm3",  name: "HealsPlz",    x: 0.45, y: 0.7, team: "t", suspect: true },
    { id: "tm4",  name: "TankDiff",    x: 0.55, y: 0.7, team: "t", suspect: true },
    // ── Attackers ──
    { id: "en1",  name: "TracerMain",  x: 0.4, y: 0.3, team: "ct" },
    { id: "en2",  name: "GenjiGod",    x: 0.6, y: 0.3, team: "ct" },
    { id: "en3",  name: "AnaMom",      x: 0.5, y: 0.2, team: "ct" },
    { id: "en4",  name: "ReinShield",  x: 0.5, y: 0.4, team: "ct" },
    { id: "en5",  name: "MercyPocket", x: 0.55, y: 0.25, team: "ct" },
  ],
  detections: {
    poof: {
      aimbot:   { active: true,  confidence: 99, note: "Perfect lock-on to head hitboxes · 0ms reaction time · 7 flicks" },
      wallhack: { active: false, confidence: 24, note: "" },
      movement: { active: true,  confidence: 91, note: "Unnatural tracking through vertical movement abilities" },
    },
    tm1: { aimbot: { active: true, confidence: 95, note: "Aimbot signature detected" } },
    tm2: { aimbot: { active: true, confidence: 96, note: "Aimbot signature detected" } },
    tm3: { aimbot: { active: true, confidence: 89, note: "Aimbot signature detected" } },
    tm4: { aimbot: { active: true, confidence: 92, note: "Aimbot signature detected" } },
  },
  knowledgeEdges: [
    { from: "poof", to: "en1", anomaly: 0.99 },
    { from: "poof", to: "en2", anomaly: 0.98 },
    { from: "poof", to: "en3", anomaly: 0.95 },
    { from: "tm1",  to: "en4", anomaly: 0.92 },
    { from: "tm2",  to: "en5", anomaly: 0.94 },
    { from: "tm3",  to: "en1", anomaly: 0.88 },
    { from: "tm4",  to: "en2", anomaly: 0.91 },
  ],
};

// ── THEME COLORS (Aegis Orange / Dark SaaS) ──
const C = {
  bg:      "rgba(5, 6, 8, 0.95)",
  surface: "transparent",
  card:    "rgba(255, 255, 255, 0.02)",
  border:  "rgba(244, 127, 36, 0.25)",
  dim:     "#8b949e",
  text:    "#f8f9fa",
  bright:  "#F47F24", // Aegis Orange
  clean:   "#22cc66",
  warn:    "#ffaa22",
  cheat:   "#ff3344",
  ct:      "#3399ff",
  t:       "#ff7733",
};

const fontMain = "'Inter', sans-serif";

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
      <span style={{ fontSize: 10, color, minWidth: 32, textAlign: "right", fontFamily: fontMain, fontWeight: 600 }}>
        {value}%
      </span>
    </div>
  );
}

// ── LIVE KINEMATICS GRAPH (AIMBOT DETECTOR) ──
function KinematicsGraph({ gameMode, isHacking }) {
  const [data, setData] = useState(Array(45).fill(0));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        let accel = 10 + Math.random() * 20; // baseline noise
        
        if (isHacking) {
          if (gameMode === 'ow') {
            // Overwatch: very sudden, random, high spikes (flicking)
            const isFlick = Math.random() > 0.85; // more frequent flicks
            if (isFlick) accel = 85 + Math.random() * 15;
          } else if (gameMode === 'val') {
            // Valorant: less sudden, lower spikes, occasional tracking corrections
            const isFlick = Math.random() > 0.92;
            if (isFlick) accel = 60 + Math.random() * 25;
            else accel += Math.random() * 10; // slightly higher baseline when wallhacking
          }
        }
        
        newData.push(accel);
        return newData;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [gameMode, isHacking]);

  return (
    <div style={{ 
      height: 140, 
      position: "relative", 
      padding: "16px 20px", 
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      marginBottom: 12,
      margin: "0 14px",
      marginTop: -4
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.bright, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
          Kinematic Vector Stream
        </div>
        <div style={{ fontSize: 9, color: C.dim }}>
          dt: 80ms
        </div>
      </div>
      
      {/* Target Line */}
      <div style={{ position: "absolute", top: 56, left: 20, right: 20, borderTop: `1px dashed ${C.cheat}66` }} />
      <div style={{ position: "absolute", top: 48, right: 20, fontSize: 8, color: C.cheat, fontWeight: 700 }}>THLD</div>
      
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 75, width: "100%" }}>
        {data.map((val, i) => {
          const isSpike = val > 75;
          return (
            <div key={i} style={{
              flex: 1,
              height: `${val}%`,
              background: isSpike ? C.cheat : C.bright,
              opacity: isSpike ? 1 : (val / 100) * 0.8 + 0.2,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSpike ? `0 0 8px ${C.cheat}` : "none"
            }} />
          );
        })}
      </div>
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", borderRadius: 4, background: C.card, border: `1px solid ${C.border}` }}>
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
        
        const jitter = Math.sin(tick * (i + 1) * 0.05) * 3; 
        const displayVal = Math.round(Math.min(99, Math.max(10, (e.anomaly * 100) + jitter)));

        return (
          <text key={`lbl-${i}`} x={(px(f) + px(t)) / 2} y={(py(f) + py(t)) / 2 - 4} textAnchor="middle" fontSize={10} fontWeight="700" fontFamily={fontMain} fill={C.cheat} opacity={0.9}>
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
              <circle cx={x} cy={y} r={10} fill="none" stroke={C.cheat} strokeWidth={1}>
                <animate attributeName="r" values="9;14;9" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
            {isSel && <circle cx={x} cy={y} r={9} fill="none" stroke={C.text} strokeWidth={1.5} strokeDasharray="3 2" />}
            <circle cx={x} cy={y} r={5} fill={nodeColor} opacity={1} />
            <text x={x + 8} y={y + 3.5} fontSize={8.5} fontWeight="600" fontFamily={fontMain} fill={isSuspect ? C.cheat : C.text}>{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── CONNECTION STATUS WIDGET ──
function ConnectionWidget({ pulse }) {
  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "space-between", 
      background: C.card, 
      borderBottom: `1px solid ${C.border}`, 
      padding: "12px 16px", 
    }}>
      
      {/* Left Node: Game Client */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.text, opacity: 0.8 }} />
        </div>
        <span style={{ fontSize: 8, color: C.dim, letterSpacing: 1, fontWeight: 600 }}>CLIENT</span>
      </div>

      {/* Connection Line */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px" }}>
        <div style={{ fontSize: 8, color: C.clean, letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>
          <span style={{ opacity: pulse ? 1 : 0.4, transition: "opacity 0.3s ease" }}>●</span> SECURE HOOK
        </div>
        <div style={{ width: "100%", height: 2, background: `linear-gradient(90deg, transparent, ${C.clean}66, transparent)`, position: "relative" }}>
          <div style={{ position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)", width: 6, height: 6, borderRadius: "50%", background: C.clean, boxShadow: `0 0 8px ${C.clean}` }} />
          {/* Animated data packets */}
          <div style={{ position: "absolute", top: 0, left: pulse ? "20%" : "80%", width: 16, height: 2, background: C.clean, boxShadow: `0 0 10px ${C.clean}`, transition: "left 0.7s ease-in-out", borderRadius: 2 }} />
        </div>
      </div>

      {/* Right Node: Aegis Engine */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", width: 24, height: 24, borderRadius: 6, background: `${C.bright}11`, border: `1px solid ${C.bright}44`, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.bright, boxShadow: `0 0 10px ${C.bright}`, opacity: pulse ? 1 : 0.6, transition: "opacity 0.7s ease" }} />
        </div>
        <span style={{ fontSize: 8, color: C.bright, letterSpacing: 1, fontWeight: 600 }}>AEGIS_CORE</span>
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
      setElectronWindow(320, 680); // Adjusted height for their original overlay + connection widget
    }
  }, [mini]);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setElectronOpacity(0.99); // 0.99 instead of 1.0 prevents macOS from clipping the top pixel of the border
    }, 2000);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronOpacity(0.85); // Make it slightly translucent but fully visible
  };

  const handleClick = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronOpacity(0.99);
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
        // If we are turning hacking ON with H, load Haven config. Otherwise IDLE.
        setConfig(nextHacking ? HAVEN_CONFIG : DEFAULT_CONFIG);
        return nextHacking;
      });
      setSelected(null);
    }
    if (e.key === "j" || e.key === "J") {
      setIsHacking(v => {
        const nextHacking = !v;
        // If we are turning hacking ON with J, load OW config. Otherwise IDLE.
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
        width: 320, padding: 24, background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 12, fontFamily: fontMain, color: C.text, textAlign: 'center', boxShadow: `0 32px 64px rgba(0,0,0,0.8)`
      }}>
        <h2 style={{ color: C.bright, letterSpacing: 2, fontWeight: 700 }}>AEGIS_GUARD</h2>
        <p style={{ fontSize: 11, marginBottom: 20, color: C.dim }}>Ready to analyze clip: {clipName}</p>
        <button 
          onClick={() => { setProgramStarted(true); setElectronWindow(320, 680); setStartTime(Date.now()); }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.textShadow = `0 0 12px ${C.bright}`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.bright; e.currentTarget.style.textShadow = 'none'; }}
          style={{ WebkitAppRegion: "no-drag", background: "transparent", color: C.bright, border: `1px solid ${C.border}`, padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, letterSpacing: 2, transition: 'all 0.2s ease' }}>
          [ INITIALIZE ENGINE ]
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
          width: "100%", 
          height: "100%", 
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box", 
          justifyContent: "center", 
          alignItems: "center",
          background: "transparent"
        }}>
        
        <div 
          onMouseDown={handleLogoDown}
          style={{
            width: 48, 
            height: 48, 
            borderRadius: 12, 
            background: C.bg, 
            border: `1px solid ${C.bright}`, 
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 8px 24px rgba(244, 127, 36, 0.3)`,
            cursor: "pointer",
            transition: "box-shadow 0.2s ease, filter 0.2s ease"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 12px 32px rgba(244, 127, 36, 0.7)`; e.currentTarget.style.filter = "brightness(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 8px 24px rgba(244, 127, 36, 0.3)`; e.currentTarget.style.filter = "brightness(1)"; }}
        >
          <img src="/logo.png" alt="AEGIS" style={{ width: "85%", height: "85%", objectFit: "contain", filter: `drop-shadow(0 0 4px ${C.bright}66)`, pointerEvents: "none" }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = '<span style="color:#F47F24;font-weight:700;font-size:12px;">AEGIS</span>'; }}
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
      style={{ width: 320, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", fontFamily: fontMain, fontSize: 12, color: C.text, boxShadow: `0 32px 64px rgba(0,0,0,0.8)` }}>
      
      {/* ── Header ── */}
      <div style={{ WebkitAppRegion: "drag", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: suspects.length > 0 ? C.cheat : C.clean, opacity: pulse ? 1 : 0.3 }} />
        <span style={{ color: C.bright, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>AEGIS</span>
        <span style={{ flex: 1, color: C.dim, fontSize: 10, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "grab", fontWeight: 500 }}>{clipName}</span>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 600 }}>{elapsedStr}</span>
        <button onClick={() => setMini(true)} style={{ WebkitAppRegion: "no-drag", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>

      <ConnectionWidget pulse={pulse} />

      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        {[
          { val: suspects.length,       label: "SUSPECTS",  color: suspects.length > 0 ? C.cheat : C.dim },
          { val: players.length,        label: "PLAYERS",   color: C.text },
          { val: edges.length, label: "ANOMALIES", color: edges.length > 0 ? C.warn : C.dim },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "10px 0", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 20, fontWeight: "700", color: s.color, lineHeight: 1.2 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 14px 10px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>POSITION MESH · BEHAVIORAL ANALYSIS</div>
        <NodalGraph players={players} knowledgeEdges={edges} selected={selected} onSelect={setSelected} isHacking={isHacking} tick={tick} />
      </div>

      <KinematicsGraph gameMode={config.gameMode} isHacking={isHacking} />

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>PLAYER STATUS</div>
        {players.map(p => {
          const det = activeDetections[p.id];
          const flagged = det && Object.values(det).some(d => d.active);
          const topConf = det ? Math.max(...Object.values(det).map(d => d.confidence)) : 0;
          return (
            <div key={p.id} onClick={() => det && setSelected(selected === p.id ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", marginBottom: 2, borderRadius: 4, cursor: det ? "pointer" : "default", background: selected === p.id ? C.card : "transparent", border: `1px solid ${selected === p.id ? C.border : "transparent"}` }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: p.team === "ct" ? C.ct : C.t }} />
              <span style={{ flex: 1, color: flagged ? C.bright : C.text, fontSize: 11, fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, fontWeight: 700, color: flagged ? C.cheat : det ? C.text : C.dim, background: flagged ? `${C.cheat}18` : "transparent", border: `1px solid ${flagged ? `${C.cheat}40` : C.border}` }}>
                {flagged ? "FLAGGED" : det ? `${topConf}%` : "CLEAN"}
              </span>
            </div>
          );
        })}
      </div>

      {selDet && selPlayer && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 14px", background: C.card }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 12, fontWeight: 600 }}>ANALYSIS · {selPlayer.name.toUpperCase()}</div>
          {Object.entries(selDet).map(([mod, d]) => (
            <div key={mod} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: d.active ? C.cheat : C.text, fontWeight: 600 }}>{mod}</span>
                {d.active && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 700, color: C.cheat, border: `1px solid ${C.cheat}` }}>DETECTED</span>}
              </div>
              <Bar value={d.confidence} active={d.active} />
              {d.note && d.active && <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.4, fontWeight: 500 }}>{d.note}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 14px", display: "flex", justifyContent: "space-between", fontSize: 9, color: C.dim, background: C.surface, fontWeight: 600 }}>
        <span>AEGIS ENGINE v1.0</span>
        <span style={{ color: isHacking ? `${C.cheat}99` : C.dim }}>TICK {tick.toLocaleString()}</span>
      </div>
    </div>
  );
}
