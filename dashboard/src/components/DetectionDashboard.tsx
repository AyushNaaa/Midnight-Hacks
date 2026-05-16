/**
 * Detection Dashboard — main page component (§3.1).
 * Wires together all detection modules, player cards, and controls.
 */
import { useState } from 'react';
import { useDetectionStream } from '../hooks/useDetectionStream';
import { ModuleSidebar } from './ModuleSidebar';
import { PlayerScoreCard } from './PlayerScoreCard';
import { AimAnalysis } from './AimAnalysis';
import { WallhackDetection } from './WallhackDetection';
import { SpeedHackDetection } from './SpeedHackDetection';
import { MacroDetection } from './MacroDetection';
import { ReactionTimeAnalysis } from './ReactionTimeAnalysis';
import { TrackingAnalysis } from './TrackingAnalysis';
import { CollabCheatDetection } from './CollabCheatDetection';
import { ZKBadgePanel } from './ZKBadgePanel';
import { MatchTimeline } from './MatchTimeline';
import type { SimulationStatus } from '../types';

export function DetectionDashboard() {
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>('player_1');
  const [loading, setLoading] = useState(false);

  const { connected, matchId, players, history, activeModules, toggleModule } =
    useDetectionStream(simStatus?.match_id ?? null);

  const startSim = async () => {
    setLoading(true);
    try {
      const res = await fetch('/sim/start', { method: 'POST' });
      const data = await res.json();
      setSimStatus({ running: true, match_id: data.match_id, tick: 0, player_cheats: {} });
      // Poll status for cheat state
      pollStatus(data.match_id);
    } catch (e) {
      console.error('Failed to start simulation:', e);
    }
    setLoading(false);
  };

  const stopSim = async () => {
    try {
      await fetch('/sim/stop', { method: 'POST' });
      setSimStatus(null);
    } catch (e) {
      console.error('Failed to stop simulation:', e);
    }
  };

  const toggleCheat = async (playerId: string, cheatType: string) => {
    try {
      await fetch(`/sim/player/${playerId}/cheat/${cheatType}`, { method: 'POST' });
      // Refresh status
      if (simStatus?.match_id) pollStatus(simStatus.match_id);
    } catch (e) {
      console.error('Failed to toggle cheat:', e);
    }
  };

  const pollStatus = async (_matchId: string) => {
    try {
      const res = await fetch('/sim/status');
      const data: SimulationStatus = await res.json();
      setSimStatus(data);
    } catch { /* ignore */ }
  };

  const playerList = Object.values(players).sort((a, b) => b.confidence - a.confidence);
  const hasCheaters = playerList.some(p => p.verdict === 'cheating');

  return (
    <div className="flex h-screen bg-bg-primary">
      {/* Left Sidebar — Module Toggles */}
      <ModuleSidebar activeModules={activeModules} toggleModule={toggleModule} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-bg-secondary border-b border-border flex items-center px-6 gap-4 shrink-0">
          <h1 className="text-lg font-bold text-text-primary">
            <span className="text-accent">ZK</span>-Guard
          </h1>
          <div className="h-6 w-px bg-border" />
          <span className="text-xs text-text-secondary">
            {simStatus?.match_id ?? 'No active match'}
          </span>
          <span className="text-xs text-text-secondary">
            Tick: {history[history.length - 1]?.tick ?? 0}
          </span>

          {/* Connection status */}
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-xs text-text-secondary">{connected ? 'Connected' : 'Disconnected'}</span>

          {/* Threat level */}
          {hasCheaters && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1 rounded-full bg-danger-dim border border-danger pulse-danger">
              <span className="text-xs font-bold text-danger">⚠ THREAT DETECTED</span>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            {!simStatus?.running ? (
              <button
                onClick={startSim}
                disabled={loading}
                className="px-4 py-1.5 bg-accent text-bg-primary text-sm font-semibold rounded-lg hover:brightness-110 transition disabled:opacity-50"
              >
                {loading ? 'Starting...' : '▶ Start Match'}
              </button>
            ) : (
              <button
                onClick={stopSim}
                className="px-4 py-1.5 bg-danger text-white text-sm font-semibold rounded-lg hover:brightness-110 transition"
              >
                ■ Stop
              </button>
            )}
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center — Detection Panels */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!simStatus?.running && history.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-4">🛡️</div>
                  <h2 className="text-2xl font-bold text-text-primary mb-2">ZK-Guard Detection Dashboard</h2>
                  <p className="text-text-secondary mb-6">
                    Server-side AI anticheat — zero invasion, privacy-proven on Midnight.
                  </p>
                  <button
                    onClick={startSim}
                    disabled={loading}
                    className="px-6 py-3 bg-accent text-bg-primary font-bold rounded-xl hover:brightness-110 transition text-lg"
                  >
                    ▶ Start Demo Match
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Detection module panels — only show active ones */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {activeModules.has('aim') && <AimAnalysis history={history} selectedPlayer={selectedPlayer} />}
                  {activeModules.has('wallhack') && <WallhackDetection history={history} />}
                  {activeModules.has('speed') && <SpeedHackDetection history={history} selectedPlayer={selectedPlayer} />}
                  {activeModules.has('macro') && <MacroDetection history={history} selectedPlayer={selectedPlayer} />}
                  {activeModules.has('reaction') && <ReactionTimeAnalysis history={history} selectedPlayer={selectedPlayer} />}
                  {activeModules.has('tracking') && <TrackingAnalysis history={history} selectedPlayer={selectedPlayer} />}
                  {activeModules.has('collab') && <CollabCheatDetection history={history} />}
                </div>

                {/* ZK Badge + Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ZKBadgePanel matchId={simStatus?.match_id ?? null} />
                  <MatchTimeline history={history} />
                </div>
              </>
            )}
          </div>

          {/* Right Sidebar — Player Score Cards */}
          {simStatus?.running && (
            <div className="w-64 bg-bg-secondary border-l border-border p-3 overflow-y-auto space-y-2 shrink-0">
              <h2 className="text-xs font-bold uppercase text-text-secondary tracking-wider mb-2">
                Players ({playerList.length})
              </h2>
              {playerList.map(player => (
                <div
                  key={player.player_id}
                  onClick={() => setSelectedPlayer(player.player_id)}
                  className={`cursor-pointer rounded-lg transition ${
                    selectedPlayer === player.player_id ? 'ring-1 ring-accent' : ''
                  }`}
                >
                  <PlayerScoreCard
                    player={player}
                    cheatType={simStatus.player_cheats[player.player_id] ?? 'clean'}
                    onToggleCheat={toggleCheat}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
