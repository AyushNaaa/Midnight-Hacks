/**
 * Player Score Card component (§3.3).
 * Compact card with mini-gauge arcs and verdict badge.
 * TODO: Team members can add expanded view with historical trends.
 */
import { type PlayerVerdict, MODULE_INFO, type ModuleName } from '../types';

interface Props {
  player: PlayerVerdict;
  cheatType: string;
  onToggleCheat: (playerId: string, cheat: string) => void;
}

const CHEAT_OPTIONS = ['clean', 'aimbot', 'wallhack', 'speedhack', 'macro', 'collab'];

const verdictStyles: Record<string, { bg: string; border: string; text: string; className: string }> = {
  clean:      { bg: 'bg-success-dim', border: 'border-success', text: 'text-success', className: 'pulse-success' },
  suspicious: { bg: 'bg-warning-dim', border: 'border-warning', text: 'text-warning', className: '' },
  cheating:   { bg: 'bg-danger-dim', border: 'border-danger', text: 'text-danger', className: 'pulse-danger' },
};

export function PlayerScoreCard({ player, cheatType, onToggleCheat }: Props) {
  const style = verdictStyles[player.verdict] || verdictStyles.clean;
  const modules = Object.entries(player.modules) as [ModuleName, number][];

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-3 transition-all duration-300 ${style.className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-text-primary">{player.player_id}</span>
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${style.text} ${style.bg}`}>
          {player.verdict === 'clean' ? '✅' : player.verdict === 'suspicious' ? '⚠️' : '❌'} {player.verdict}
        </span>
      </div>

      {/* Module scores as mini bars */}
      <div className="space-y-1 mb-2">
        {modules.map(([key, score]) => {
          const info = MODULE_INFO[key];
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-4">{info.icon}</span>
              <span className="w-16 text-text-secondary truncate">{info.label}</span>
              <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${score * 100}%`,
                    backgroundColor: score > 0.8 ? '#ff4757' : score > 0.5 ? '#ffa502' : '#2ed573',
                  }}
                />
              </div>
              <span className="w-8 text-right text-text-secondary">{(score * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {/* Cheat toggle (for demo) */}
      <select
        value={cheatType}
        onChange={(e) => onToggleCheat(player.player_id, e.target.value)}
        className="w-full text-xs bg-bg-primary border border-border rounded px-2 py-1 text-text-primary"
      >
        {CHEAT_OPTIONS.map(c => (
          <option key={c} value={c}>{c === 'clean' ? '🟢 Clean' : `🔴 ${c}`}</option>
        ))}
      </select>
    </div>
  );
}
