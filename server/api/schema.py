"""Universal telemetry schema for ZK-Guard.
Any game sends tick data matching these models — no SDK, no client-side agent.
"""
from pydantic import BaseModel, Field
from typing import Optional


class Vec3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Vec2(BaseModel):
    x: float = 0.0
    y: float = 0.0


class AimAngles(BaseModel):
    pitch: float = 0.0
    yaw: float = 0.0


class PlayerState(BaseModel):
    player_id: str
    position: Vec3 = Vec3()
    velocity: Vec3 = Vec3()
    aim: AimAngles = AimAngles()
    aim_delta: Vec2 = Vec2()
    state_flags: int = 0
    health: float = 100.0
    visible_to: list[str] = Field(default_factory=list)


class GameEvent(BaseModel):
    player_id: str
    event_type: str  # fire, hit, kill, damage, reload, jump, ability
    timestamp_ms: int
    target_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class TickData(BaseModel):
    tick: int
    timestamp_ms: int
    match_id: str
    players: list[PlayerState]
    events: list[GameEvent] = Field(default_factory=list)


# --- Detection Result Models ---

class ModuleScores(BaseModel):
    aim: float = 0.0
    reaction: float = 0.0
    macro: float = 0.0
    speed: float = 0.0
    tracking: float = 0.0
    wallhack: float = 0.0
    collab: float = 0.0


class PlayerVerdict(BaseModel):
    player_id: str
    verdict: str = "clean"  # clean, suspicious, cheating
    confidence: float = 0.0
    modules: ModuleScores = ModuleScores()


class DetectionResult(BaseModel):
    match_id: str
    tick: int
    timestamp_ms: int
    players: list[PlayerVerdict]


class SimulationStatus(BaseModel):
    running: bool = False
    match_id: Optional[str] = None
    tick: int = 0
    player_cheats: dict[str, str] = Field(default_factory=dict)
