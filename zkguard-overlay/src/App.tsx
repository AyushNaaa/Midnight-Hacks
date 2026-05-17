import { useState, useRef, useEffect } from "react";
import "./index.css"; 

const theme = {
  bg: "rgba(5, 6, 8, 0.9)", // Darker, slightly blue-tinted SaaS dark mode
  glassBorder: "rgba(244, 127, 36, 0.25)", // Orange subtle border
  glassHighlight: "rgba(244, 127, 36, 0.05)",
  glassCard: "rgba(255, 255, 255, 0.02)", 
  textMain: "#f8f9fa",
  textMuted: "#8b949e",
  accent: "#F47F24", // Aegis Orange
  danger: "#ff3344",
  clean: "#22cc66",
  radius: 12,
};

// ── FLOATING SPRITE BUTTON (For small text links) ──
function SpriteButton({ children, onClick, active, color = theme.textMain, size = 11, disabled = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "transparent",
        border: "none",
        color: active ? theme.accent : hover ? "#fff" : color,
        fontSize: size,
        fontWeight: hover || active ? "600" : "400",
        cursor: disabled ? "default" : "pointer",
        padding: "6px 12px",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 1,
        transition: "all 0.3s ease",
        opacity: disabled ? 0.3 : 1,
        textShadow: hover || active ? `0 0 10px ${active ? theme.accent : "#fff"}66` : "none",
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        WebkitAppRegion: "no-drag"
      }}
    >
      {children}
    </button>
  );
}

// ── LIVE KINEMATICS GRAPH (AIMBOT DETECTOR) ──
function KinematicsGraph() {
  const [data, setData] = useState(Array(45).fill(0));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        const isFlick = Math.random() > 0.94; 
        const accel = isFlick ? 85 + Math.random() * 15 : 10 + Math.random() * 20;
        newData.push(accel);
        return newData;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      height: 140, 
      position: "relative", 
      padding: "16px 20px", 
      background: theme.glassCard,
      border: `1px solid ${theme.glassBorder}`,
      borderRadius: 8,
      marginBottom: 24
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: theme.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
          Kinematic Vector Stream
        </div>
        <div style={{ fontSize: 9, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          dt: 80ms
        </div>
      </div>
      
      {/* Target Line */}
      <div style={{ position: "absolute", top: 56, left: 20, right: 20, borderTop: `1px dashed ${theme.danger}66` }} />
      <div style={{ position: "absolute", top: 48, right: 20, fontSize: 8, color: theme.danger }}>THLD</div>
      
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 75, width: "100%" }}>
        {data.map((val, i) => {
          const isSpike = val > 75;
          return (
            <div key={i} style={{
              flex: 1,
              height: `${val}%`,
              background: isSpike ? theme.danger : theme.accent,
              opacity: isSpike ? 1 : (val / 100) * 0.8 + 0.2,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSpike ? `0 0 8px ${theme.danger}` : "none"
            }} />
          );
        })}
      </div>
    </div>
  );
}

// ── ANALYTICAL KEY-VALUE WIDGET ──
function KVWidget({ label, value, color = theme.textMain }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px dashed ${theme.glassBorder}`, paddingBottom: 6, marginBottom: 6 }}>
      <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: "600", color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

// ── MINIMAL STAT WIDGET ──
function StatWidget({ label, value, color = theme.textMain }) {
  return (
    <div style={{ 
      flex: 1, 
      display: "flex", 
      flexDirection: "column", 
      gap: 6,
      padding: "16px",
      background: theme.glassCard,
      border: `1px solid ${theme.glassBorder}`,
      borderRadius: 8
    }}>
      <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: "600", color, letterSpacing: 1, textShadow: `0 0 10px ${color}44`, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

export default function App() {
  const [mini, setMini] = useState(false);
  const hoverTimerRef = useRef(null);
  const [pulse, setPulse] = useState(true);

  // Live fluctuating stats
  const [smoothness, setSmoothness] = useState(4.2);
  const [raycasts, setRaycasts] = useState(18);
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const pulseId = setInterval(() => setPulse(v => !v), 1000);
    
    // Fluctuate stats to look alive
    const statsId = setInterval(() => {
      setSmoothness(prev => Math.max(0.1, prev + (Math.random() - 0.5) * 0.4));
      if (Math.random() > 0.8) {
        setRaycasts(prev => Math.max(0, prev + Math.floor((Math.random() - 0.5) * 3)));
      }
      if (Math.random() > 0.9) {
        setLatency(prev => (prev === 0 ? Math.floor(Math.random() * 4) : 0));
      }
    }, 400);

    return () => {
      clearInterval(pulseId);
      clearInterval(statsId);
    };
  }, []);

  const setElectronWindow = (opacity, width, height) => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        if (opacity !== null) ipcRenderer.send('set-opacity', opacity);
        if (width && height) ipcRenderer.send('resize-window', { width, height });
      } catch (e) { }
    }
  };

  useEffect(() => {
    if (mini) {
      setElectronWindow(null, 150, 150);
    } else {
      setElectronWindow(null, 440, 520);
    }
  }, [mini]);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => { setElectronWindow(1.0); }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setElectronWindow(0.7); // Fades beautifully into the background when not active
  };

  if (mini) {
    return (
      <div 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setMini(false)}
        style={{ 
          width: "100%", 
          height: "100%", 
          padding: 8, 
          display: "flex", 
          WebkitAppRegion: "drag", 
          boxSizing: "border-box", 
          justifyContent: "center", 
          alignItems: "center",
          cursor: "pointer"
        }}>
        
        {/* Make sure the user saves their logo as public/logo.png */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 16,
          background: theme.bg,
          border: `1px solid ${theme.glassBorder}`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
          WebkitAppRegion: "no-drag",
          transition: "transform 0.2s ease"
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          <img src="/logo.png" alt="AEGIS Logo" style={{ width: "70%", height: "70%", objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(244, 127, 36, 0.4))" }} />
        </div>
        
      </div>
    );
  }

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: "100%", 
        height: "100%",
        boxSizing: "border-box",
        background: theme.bg,
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRadius: theme.radius, 
        overflow: "hidden", 
        color: theme.textMain,
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: `0 0 0 1px ${theme.glassBorder}, 0 32px 64px rgba(0,0,0,0.8)`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 32px",
      }}>
      
      {/* ── HEADER ── */}
      <div style={{ WebkitAppRegion: "drag", display: 'flex', alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Engram-style glowing node */}
          <div style={{ position: "relative", width: 14, height: 14 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: theme.accent, opacity: pulse ? 1 : 0.4, transition: "opacity 1s ease", boxShadow: `0 0 12px ${theme.accent}` }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: 4, color: theme.accent }}>AEGIS_GUARD</div>
            <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: 1 }}>BEHAVIORAL ANALYSIS ENGINE</div>
          </div>
        </div>
        
        <div style={{ WebkitAppRegion: "no-drag" }}>
          <SpriteButton onClick={() => setMini(true)} size={16}>−</SpriteButton>
        </div>
      </div>

      {/* ── ANALYTICAL METADATA BLOCK ── */}
      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <KVWidget label="TARGET_ID" value="usr_492x" color={theme.textMain} />
          <KVWidget label="MATCH_ID" value="0x7a...f42" color={theme.textMuted} />
        </div>
        <div style={{ flex: 1 }}>
          <KVWidget label="ZK_PROOF" value="PENDING" color={theme.accent} />
          <KVWidget label="TICK_RATE" value="64Hz" color={theme.textMuted} />
        </div>
      </div>

      {/* ── METRICS GRID ── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <StatWidget label="SMOOTHNESS" value={`${smoothness.toFixed(1)}%`} color={smoothness < 5 ? theme.danger : theme.textMain} />
        <StatWidget label="RAYCASTS" value={`${raycasts}`} color={raycasts > 15 ? theme.accent : theme.textMain} />
        <StatWidget label="LATENCY" value={`${latency}ms`} color={latency === 0 ? theme.danger : theme.textMain} />
      </div>

      {/* ── DYNAMIC VISUALIZATION ── */}
      <KinematicsGraph />

      <div style={{ flex: 1 }} />

      {/* ── COMPACT CONTROL INTERFACE (Analytical Readout Only) ── */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        paddingTop: 16,
        borderTop: `1px solid ${theme.glassBorder}`
      }}>
        <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ 
            width: 8, height: 8, borderRadius: "50%", background: theme.danger, 
            boxShadow: `0 0 8px ${theme.danger}`, 
            opacity: pulse ? 1 : 0.3, transition: "opacity 1s ease" 
          }} /> 
          ANOMALY DETECTED
        </div>
        
        <div style={{ fontSize: 9, color: theme.accent, letterSpacing: 1 }}>
          STATUS: <span style={{ fontWeight: "600", color: theme.textMain }}>MONITORING</span>
        </div>
      </div>

    </div>
  );
}
