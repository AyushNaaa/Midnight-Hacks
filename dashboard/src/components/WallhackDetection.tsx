/**
 * Wallhack Detection / Behavioral Mesh panel (§3.2 Module 2 + §3.5).
 * Canvas minimap showing player positions, aim cones, and anomaly tracking.
 */
import { useEffect, useRef } from 'react';
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
}

export function WallhackDetection({ history }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas setup
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw map grid
    ctx.strokeStyle = 'rgba(42, 42, 62, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (canvas.height / 10) * i);
      ctx.lineTo(canvas.width, (canvas.height / 10) * i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo((canvas.width / 10) * i, 0);
      ctx.lineTo((canvas.width / 10) * i, canvas.height);
      ctx.stroke();
    }

    // Draw walls
    ctx.strokeStyle = '#3e3e5e';
    ctx.lineWidth = 2;
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width * 0.45, canvas.height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.55, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height * 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, canvas.height * 0.55);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    const latest = history[history.length - 1];
    if (!latest) return;
    const players = latest.players;

    // Helper to map 0-100 coords to canvas
    const mapX = (x: number) => (x / 100) * canvas.width;
    const mapY = (y: number) => (y / 100) * canvas.height;

    // First pass: Draw tracking anomaly lines (wallhack snapping)
    players.forEach(p => {
      if (p.modules.wallhack > 0.5 && p.position) {
        // Draw red line in aim direction indicating tracking through wall
        const aimRad = (p.aim_yaw || 0) * (Math.PI / 180);
        const px = mapX(p.position.x);
        const py = mapY(p.position.y);
        
        ctx.strokeStyle = 'rgba(255, 71, 87, 0.4)'; // Red anomaly line
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(aimRad) * canvas.width, py + Math.sin(aimRad) * canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Second pass: Draw players
    players.forEach(p => {
      if (!p.position) return;
      
      const num = parseInt(p.player_id.replace(/\D/g, ''), 10) || 0;
      const isTeamA = num <= 5;
      const px = mapX(p.position.x);
      const py = mapY(p.position.y);
      const aimRad = (p.aim_yaw || 0) * (Math.PI / 180);

      // Draw aim cone
      ctx.fillStyle = isTeamA ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 71, 87, 0.15)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 40, aimRad - 0.5, aimRad + 0.5);
      ctx.lineTo(px, py);
      ctx.fill();

      // Draw player dot
      ctx.fillStyle = isTeamA ? '#00d4ff' : '#ff4757';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw cheating glow if high wallhack score
      if (p.modules.wallhack > 0.8) {
        ctx.strokeStyle = 'rgba(255, 71, 87, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 8 + Math.sin(Date.now() / 100) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = 'white';
      ctx.font = '9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(`P${num}`, px, py - 8);
    });

  }, [history]);

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-text-primary mb-3 shrink-0">👁 Wallhack / Behavioral Mesh</h3>
      <div className="relative flex-1 w-full bg-bg-primary rounded-lg border border-border overflow-hidden min-h-[250px]">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
        />
      </div>
      <p className="text-xs text-text-secondary mt-2 shrink-0">
        Aim cones shown. Dashed red lines = spatial tracking anomaly (wallhack).
      </p>
    </div>
  );
}
