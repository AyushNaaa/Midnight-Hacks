/**
 * Tracking Analysis panel (§3.2 Module 6).
 * TODO: Crosshair-to-hitbox correlation graph, lock-on bar chart.
 */
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
  selectedPlayer: string | null;
}

export function TrackingAnalysis({ history, selectedPlayer }: Props) {
  const latest = history[history.length - 1];
  const player = latest?.players.find(p => p.player_id === selectedPlayer);
  const score = player?.modules.tracking ?? 0;

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">🎯 Tracking Analysis</h3>
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="text-4xl font-bold" style={{
            color: score > 0.8 ? '#ff4757' : score > 0.5 ? '#ffa502' : '#2ed573'
          }}>
            {(score * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-text-secondary mt-1">Lock-on Probability</div>
          <p className="text-xs text-text-secondary mt-3">
            TODO: Crosshair-to-target correlation graph
          </p>
        </div>
      </div>
    </div>
  );
}
