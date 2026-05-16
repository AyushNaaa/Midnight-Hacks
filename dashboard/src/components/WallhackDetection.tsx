/**
 * Wallhack Detection / Behavioral Mesh panel (§3.2 Module 2 + §3.5).
 * Placeholder minimap showing player positions.
 * TODO: Team members should add canvas-based minimap with:
 *   - Directional aim cones
 *   - Visibility arcs
 *   - Red pulsing edges for knowledge anomalies
 *   - Real-time 16fps update
 */
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
}

export function WallhackDetection({ history }: Props) {
  const latest = history[history.length - 1];
  const players = latest?.players ?? [];

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">👁 Wallhack / Behavioral Mesh</h3>
      <div className="relative w-full aspect-square bg-bg-primary rounded-lg border border-border overflow-hidden">
        {/* Simple grid */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(#2a2a3e 1px, transparent 1px), linear-gradient(90deg, #2a2a3e 1px, transparent 1px)',
            backgroundSize: '10% 10%',
          }}
        />
        {/* Map walls */}
        <div className="absolute left-0 top-1/2 w-[45%] h-px bg-border" />
        <div className="absolute left-[55%] top-1/2 w-[45%] h-px bg-border" />
        <div className="absolute top-0 left-1/2 w-px h-[45%] bg-border" />
        <div className="absolute top-[55%] left-1/2 w-px h-[45%] bg-border" />

        {/* Player dots — placeholder positions */}
        {players.map((p) => {
          const isWallhack = p.modules.wallhack > 0.5;
          const isCheating = p.verdict === 'cheating';
          // Simple hash to get consistent positions per player
          const num = parseInt(p.player_id.replace(/\D/g, ''), 10) || 0;
          const team = num <= 5 ? 0 : 1;
          const x = 10 + (num * 17) % 80;
          const y = 10 + (num * 23) % 80;

          return (
            <div key={p.player_id} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
              <div
                className={`w-3 h-3 rounded-full border-2 transition-all duration-300
                  ${team === 0 ? 'bg-accent border-accent' : 'bg-danger border-danger'}
                  ${isWallhack ? 'pulse-danger' : ''}`}
                title={`${p.player_id} — wallhack: ${(p.modules.wallhack * 100).toFixed(0)}%`}
              />
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-text-secondary whitespace-nowrap">
                {p.player_id.replace('player_', 'P')}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-text-secondary mt-2">
        TODO: Canvas minimap with aim cones, LOS arcs, anomaly edges
      </p>
    </div>
  );
}
