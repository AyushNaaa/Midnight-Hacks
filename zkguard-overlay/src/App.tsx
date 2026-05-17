import { useState, useRef, useEffect } from "react";
import { LiquidMetalButton } from "./components/ui/liquid-metal-button";
import "./index.css"; 

const theme = {
  bg: "rgba(5, 5, 5, 0.8)",
  glassBorder: "rgba(212, 175, 55, 0.15)", // Bronze/Gold subtle border
  glassHighlight: "rgba(212, 175, 55, 0.05)",
  textMain: "#ffffff",
  textMuted: "#8c8c8c",
  accent: "#d4af37", // Bronze / Gold
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
  const [data, setData] = useState(Array(30).fill(0));
  
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
    <div style={{ height: 120, position: "relative", padding: "10px 0", borderTop: `1px solid ${theme.glassBorder}`, borderBottom: `1px solid ${theme.glassBorder}` }}>
      <div style={{ fontSize: 9, color: theme.accent, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
        Kinematic Vector Stream
      </div>
      
      {/* Target Line */}
      <div style={{ position: "absolute", top: 40, left: 0, width: "100%", borderTop: `1px dashed ${theme.danger}66` }} />
      
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70, width: "100%" }}>
        {data.map((val, i) => {
          const isSpike = val > 75;
          return (
            <div key={i} style={{
              flex: 1,
              height: `${val}%`,
              background: isSpike ? theme.danger : theme.accent,
              opacity: isSpike ? 1 : (val / 100) * 0.8 + 0.2,
              borderRadius: 2,
              transition: 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSpike ? `0 0 8px ${theme.danger}` : "none"
            }} />
          );
        })}
      </div>
    </div>
  );
}

// ── MINIMAL STAT WIDGET ──
function StatWidget({ label, value, color = theme.textMain }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 8, color: theme.textMuted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: "600", color, letterSpacing: 1, textShadow: `0 0 10px ${color}44`, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
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
      setElectronWindow(null, 150, 70);
    } else {
      setElectronWindow(null, 340, 460);
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
        style={{ width: "100%", height: "100%", padding: 8, display: "flex", WebkitAppRegion: "drag", boxSizing: "border-box", justifyContent: "center", alignItems: "center" }}>
        
        <LiquidMetalButton label="[ ZK ]" viewMode="text" onClick={() => setMini(false)} color={theme.accent} />
        
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
        boxShadow: `0 0 0 1px ${theme.glassBorder}, 0 24px 48px rgba(0,0,0,0.8)`,
        display: "flex",
        flexDirection: "column",
        padding: "20px 24px",
      }}>
      
      {/* ── HEADER ── */}
      <div style={{ WebkitAppRegion: "drag", display: 'flex', alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Engram-style glowing node */}
          <div style={{ position: "relative", width: 14, height: 14 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: theme.accent, opacity: pulse ? 1 : 0.4, transition: "opacity 1s ease", boxShadow: `0 0 12px ${theme.accent}` }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: 3, color: theme.accent }}>SYNAPSE</div>
          </div>
        </div>
        
        <SpriteButton onClick={() => setMini(true)} size={16}>×</SpriteButton>
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

      {/* ── FOOTER ACTIONS (Liquid Metal) ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
        <LiquidMetalButton label="FLAG ACC" onClick={() => console.log("Flag")} color={theme.accent} />
        <LiquidMetalButton label="DISMISS" onClick={() => console.log("Dismiss")} color={theme.textMuted} />
      </div>

    </div>
  );
}
