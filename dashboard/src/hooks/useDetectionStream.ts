/**
 * WebSocket hook for real-time detection data streaming (§3.7).
 * Connects to ws://localhost:8000/dashboard/{matchId}
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { DetectionResult, PlayerVerdict, ModuleName } from '../types';

interface DetectionStreamState {
  connected: boolean;
  matchId: string | null;
  players: Record<string, PlayerVerdict>;
  history: DetectionResult[];
  activeModules: Set<ModuleName>;
  toggleModule: (module: ModuleName) => void;
}

export function useDetectionStream(matchId: string | null): DetectionStreamState {
  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<Record<string, PlayerVerdict>>({});
  const [history, setHistory] = useState<DetectionResult[]>([]);
  const [activeModules, setActiveModules] = useState<Set<ModuleName>>(
    new Set(['aim', 'reaction', 'macro', 'speed', 'tracking', 'wallhack', 'collab'])
  );
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!matchId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/dashboard/${matchId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DetectionResult;
        if (!data.players) return; // skip non-detection messages

        // Update player verdicts
        const updated: Record<string, PlayerVerdict> = {};
        for (const pv of data.players) {
          updated[pv.player_id] = pv;
        }
        setPlayers(prev => ({ ...prev, ...updated }));

        // Append to history (keep last 500)
        setHistory(prev => [...prev.slice(-499), data]);
      } catch {
        // Ignore non-JSON messages (e.g. connection confirmation)
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [matchId]);

  const toggleModule = useCallback((module: ModuleName) => {
    setActiveModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }, []);

  return { connected, matchId, players, history, activeModules, toggleModule };
}
