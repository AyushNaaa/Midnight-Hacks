/**
 * Reaction Time Analysis panel (§3.2 Module 5).
 * TODO: Implement scatter plot of reaction times with human/inhuman bands.
 */
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
  selectedPlayer: string | null;
}

export function ReactionTimeAnalysis({ history, selectedPlayer }: Props) {
  const latest = history[history.length - 1];
  const player = latest?.players.find(p => p.player_id === selectedPlayer);
  const score = player?.modules.reaction ?? 0;

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">⚡ Reaction Time</h3>
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="text-4xl font-bold" style={{
            color: score > 0.8 ? '#ff4757' : score > 0.5 ? '#ffa502' : '#2ed573'
          }}>
            {(score * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-text-secondary mt-1">Anomaly Score</div>
          <p className="text-xs text-text-secondary mt-3">
            TODO: Scatter plot with human/inhuman reaction bands
          </p>
        </div>
      </div>
    </div>
  );
}
