/**
 * Macro Detection panel (§3.2 Module 4).
 * Shows macro detection score with FFT-style visualization.
 * TODO: Implement actual FFT spectrum and click interval histogram.
 */
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import type { DetectionResult } from '../types';

interface Props {
  history: DetectionResult[];
  selectedPlayer: string | null;
}

export function MacroDetection({ history, selectedPlayer }: Props) {
  // Simulate FFT-like frequency bars from macro scores
  const recent = history.slice(-30);
  const data = Array.from({ length: 16 }, (_, i) => {
    const slice = recent.slice(i * 2, i * 2 + 2);
    const avg = slice.length > 0
      ? slice.reduce((s, r) => {
          const p = r.players.find(p => p.player_id === selectedPlayer);
          return s + (p?.modules.macro ?? 0);
        }, 0) / slice.length
      : 0;
    return { freq: `${i * 4}Hz`, value: avg + Math.random() * 0.05 };
  });

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">🤖 Macro Detection (FFT)</h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="freq" tick={{ fontSize: 9, fill: '#8888a0' }} />
            <YAxis domain={[0, 1]} hide />
            <Bar dataKey="value" fill="#a855f7" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
