/**
 * Speed Hack Detection panel (§3.2 Module 3).
 * Velocity line chart with physics-limit overlay.
 * TODO: Add position delta scatter plot and teleport markers.
 */
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
  selectedPlayer: string | null;
}

export function SpeedHackDetection({ history, selectedPlayer }: Props) {
  const data = history.slice(-60).map((r, i) => {
    const player = r.players.find(p => p.player_id === selectedPlayer);
    return { tick: i, score: player?.modules.speed ?? 0 };
  });

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">💨 Speed/Movement</h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="tick" hide />
            <YAxis domain={[0, 1]} hide />
            <ReferenceLine y={0.8} stroke="#ff4757" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="score" stroke="#00d4ff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
