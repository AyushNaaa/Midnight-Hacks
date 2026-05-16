/**
 * Aim Analysis panel (§3.2 Module 1).
 * Shows angular velocity chart with spike markers.
 * TODO: Team members can add canvas-based aim trajectory visualization.
 */
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
  selectedPlayer: string | null;
}

export function AimAnalysis({ history, selectedPlayer }: Props) {
  // Extract aim scores over time for selected player
  const data = history.slice(-60).map((r, i) => {
    const player = r.players.find(p => p.player_id === selectedPlayer);
    return {
      tick: i,
      score: player?.modules.aim ?? 0,
    };
  });

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
        🎯 Aim Analysis
        {selectedPlayer && <span className="text-text-secondary text-xs">— {selectedPlayer}</span>}
      </h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="tick" hide />
            <YAxis domain={[0, 1]} hide />
            <ReferenceLine y={0.8} stroke="#ff4757" strokeDasharray="3 3" label="" />
            <ReferenceLine y={0.5} stroke="#ffa502" strokeDasharray="3 3" label="" />
            <Line type="monotone" dataKey="score" stroke="#ff4757" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-text-secondary mt-2">
        Red dashed = cheating threshold | Orange = suspicious
      </p>
    </div>
  );
}
