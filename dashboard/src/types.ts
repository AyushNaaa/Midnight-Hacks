/** Shared types matching the backend schema. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AimAngles {
  pitch: number;
  yaw: number;
}

export interface PlayerState {
  player_id: string;
  position: Vec3;
  velocity: Vec3;
  aim: AimAngles;
  aim_delta: { x: number; y: number };
  state_flags: number;
  health: number;
  visible_to: string[];
}

export interface ModuleScores {
  aim: number;
  reaction: number;
  macro: number;
  speed: number;
  tracking: number;
  wallhack: number;
  collab: number;
}

export interface PlayerVerdict {
  player_id: string;
  verdict: 'clean' | 'suspicious' | 'cheating';
  confidence: number;
  modules: ModuleScores;
}

export interface DetectionResult {
  match_id: string;
  tick: number;
  timestamp_ms: number;
  players: PlayerVerdict[];
}

export interface SimulationStatus {
  running: boolean;
  match_id: string | null;
  tick: number;
  player_cheats: Record<string, string>;
}

export type ModuleName = 'aim' | 'reaction' | 'macro' | 'speed' | 'tracking' | 'wallhack' | 'collab';

export const MODULE_INFO: Record<ModuleName, { label: string; icon: string; color: string }> = {
  aim:      { label: 'Aim Analysis',    icon: '🎯', color: '#ff4757' },
  reaction: { label: 'Reaction Time',   icon: '⚡', color: '#ffa502' },
  macro:    { label: 'Macro Detection',  icon: '🤖', color: '#a855f7' },
  speed:    { label: 'Speed/Movement',   icon: '💨', color: '#00d4ff' },
  tracking: { label: 'Tracking',         icon: '🎯', color: '#ff6b81' },
  wallhack: { label: 'Wallhack/ESP',     icon: '👁',  color: '#ff4757' },
  collab:   { label: 'Collab Cheat',     icon: '🤝', color: '#ffa502' },
};
