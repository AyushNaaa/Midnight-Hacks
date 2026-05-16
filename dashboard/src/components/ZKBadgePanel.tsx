/**
 * ZK Badge Panel (§3.6).
 * Shows Midnight ZK proof status per player.
 * TODO: Connect to real Midnight service when available.
 */

interface Props {
  matchId: string | null;
}

export function ZKBadgePanel({ matchId }: Props) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">🔐 ZK Verification (Midnight)</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border">
          <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center text-accent">🛡</div>
          <div className="flex-1">
            <div className="text-xs text-text-secondary">Match Session</div>
            <div className="text-sm font-mono text-text-primary">{matchId ?? 'No active match'}</div>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-warning-dim text-warning">Mock Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-bg-primary border border-border">
            <div className="text-text-secondary">What game dev sees</div>
            <div className="text-success font-bold mt-1">✅ isVerified: true</div>
          </div>
          <div className="p-2 rounded bg-bg-primary border border-border">
            <div className="text-text-secondary">What's never shared</div>
            <div className="text-danger font-bold mt-1">🔒 All telemetry data</div>
          </div>
        </div>
        <p className="text-xs text-text-secondary">
          TODO: Connect to Midnight Proof Server for real ZK proof submission. See §4.
        </p>
      </div>
    </div>
  );
}
