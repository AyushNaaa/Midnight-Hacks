/**
 * Match Timeline (§3.4).
 * Horizontal scrollable timeline with detection events.
 * TODO: Add hover popovers, zoom/scroll controls, and color-coded markers.
 */
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
}

export function MatchTimeline({ history }: Props) {
  const events = history.slice(-100).flatMap((r) =>
    r.players
      .filter(p => p.verdict !== 'clean')
      .map(p => ({
        tick: r.tick,
        player: p.player_id,
        verdict: p.verdict,
        confidence: p.confidence,
      }))
  );

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">📊 Match Timeline</h3>
      <div className="flex gap-0.5 items-end h-8 overflow-x-auto">
        {history.slice(-100).map((r, i) => {
          const maxScore = Math.max(...r.players.map(p => p.confidence));
          const hasCheater = r.players.some(p => p.verdict === 'cheating');
          const hasSuspicious = r.players.some(p => p.verdict === 'suspicious');
          return (
            <div
              key={i}
              className="flex-shrink-0 w-1.5 rounded-t transition-all duration-200"
              style={{
                height: `${Math.max(maxScore * 100, 5)}%`,
                backgroundColor: hasCheater ? '#ff4757' : hasSuspicious ? '#ffa502' : '#2ed57333',
              }}
              title={`Tick ${r.tick}: ${r.players.map(p => `${p.player_id}=${p.verdict}`).join(', ')}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-text-secondary mt-1">
        <span>← Earlier</span>
        <span>{events.length} detection events</span>
        <span>Now →</span>
      </div>
    </div>
  );
}
