/**
 * Collaborative Cheat Detection panel (§3.2 Module 7).
 * TODO: Player-pair coordination heatmap, synchronized movement viz, info-flow graph.
 */
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
}

export function CollabCheatDetection({ history }: Props) {
  const latest = history[history.length - 1];
  const players = latest?.players ?? [];

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">🤝 Collab Cheat Detection</h3>
      <div className="grid grid-cols-5 gap-1">
        {/* Placeholder heatmap grid */}
        {players.slice(0, 5).map((p1) => (
          players.slice(5, 10).map((p2) => {
            const score = Math.max(p1.modules.collab, p2.modules.collab);
            return (
              <div
                key={`${p1.player_id}-${p2.player_id}`}
                className="aspect-square rounded"
                style={{
                  backgroundColor: score > 0.5
                    ? `rgba(255, 71, 87, ${score})`
                    : `rgba(46, 213, 115, ${0.2 + score * 0.3})`,
                }}
                title={`${p1.player_id} ↔ ${p2.player_id}: ${(score * 100).toFixed(0)}%`}
              />
            );
          })
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-text-secondary mt-1">
        <span>Team A →</span>
        <span>← Team B</span>
      </div>
      <p className="text-xs text-text-secondary mt-2">
        TODO: Coordination heatmap, info-flow directed graph
      </p>
    </div>
  );
}
