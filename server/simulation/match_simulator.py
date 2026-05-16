"""Match simulator — 5v5 FPS match with injectable cheat profiles.

Generates telemetry in TickData format at configurable tick rate.
TODO: Team members can improve player AI, map complexity, cheat realism.
"""
import asyncio
import math
import random
import time

from api.schema import TickData, PlayerState, GameEvent, Vec3, Vec2, AimAngles
from simulation.cheat_profiles import apply_cheat
from simulation.game_map import GameMap


class SimPlayer:
    """A simulated player."""

    def __init__(self, player_id: str, team: int, x: float, y: float):
        self.player_id = player_id
        self.team = team
        self.x, self.y = x, y
        self.vx, self.vy = 0.0, 0.0
        self.aim_yaw = random.uniform(0, 360)
        self.aim_pitch = 0.0
        self.prev_aim_yaw = self.aim_yaw
        self.prev_aim_pitch = self.aim_pitch
        self.health = 100.0
        self.state_flags = 0
        self.cheat_type = "clean"
        self.target_wp: tuple[float, float] | None = None
        self.move_timer = 0


class MatchSimulator:
    """Simulates a 5v5 match generating TickData."""

    TICK_RATE = 64
    SEND_INTERVAL = 4  # send every N ticks (= 16 msgs/sec)
    PLAYER_SPEED = 3.0  # units/tick base speed

    def __init__(self, match_id: str):
        self.match_id = match_id
        self.running = False
        self.current_tick = 0
        self.game_map = GameMap()
        self.players: list[SimPlayer] = []
        self.player_cheats: dict[str, str] = {}

        # Spawn 5v5
        spawns_a = [(15, 15), (20, 15), (15, 20), (20, 20), (17, 17)]
        spawns_b = [(85, 85), (80, 85), (85, 80), (80, 80), (82, 82)]
        for i in range(5):
            pid = f"player_{i + 1}"
            p = SimPlayer(pid, team=0, x=spawns_a[i][0], y=spawns_a[i][1])
            self.players.append(p)
            self.player_cheats[pid] = "clean"
        for i in range(5):
            pid = f"player_{i + 6}"
            p = SimPlayer(pid, team=1, x=spawns_b[i][0], y=spawns_b[i][1])
            self.players.append(p)
            self.player_cheats[pid] = "clean"

    def set_cheat(self, player_id: str, cheat_type: str):
        self.player_cheats[player_id] = cheat_type
        for p in self.players:
            if p.player_id == player_id:
                p.cheat_type = cheat_type

    def stop(self):
        self.running = False

    async def run(self):
        """Main simulation loop — generates ticks and feeds to detection."""
        from detection.engine import DetectionEngine
        from api.dashboard_ws import broadcast_detection

        self.running = True
        engine = DetectionEngine()
        tick_interval = 1.0 / self.TICK_RATE

        while self.running:
            start = time.monotonic()
            self.current_tick += 1

            # Simulate all players
            self._simulate_tick()

            # Build and send tick data every SEND_INTERVAL ticks
            if self.current_tick % self.SEND_INTERVAL == 0:
                tick_data = self._build_tick_data()
                result = engine.analyze(tick_data)
                await broadcast_detection(self.match_id, result)

            # Sleep to maintain tick rate
            elapsed = time.monotonic() - start
            sleep_time = tick_interval - elapsed
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

    def _simulate_tick(self):
        """Update all player positions and aims for one tick."""
        all_states = self._get_all_states()

        for p in self.players:
            # Save previous aim
            p.prev_aim_yaw = p.aim_yaw
            p.prev_aim_pitch = p.aim_pitch

            # Move toward waypoint
            if p.target_wp is None or p.move_timer <= 0:
                p.target_wp = self.game_map.random_waypoint()
                p.move_timer = random.randint(60, 200)

            tx, ty = p.target_wp
            dx, dy = tx - p.x, ty - p.y
            dist = math.sqrt(dx**2 + dy**2)

            if dist > 1.0:
                speed = self.PLAYER_SPEED + random.gauss(0, 0.3)
                p.vx = (dx / dist) * speed
                p.vy = (dy / dist) * speed
            else:
                p.vx, p.vy = 0.0, 0.0
                p.target_wp = None

            # Apply base movement
            p.x += p.vx * (1.0 / self.TICK_RATE)
            p.y += p.vy * (1.0 / self.TICK_RATE)

            # Clamp to map bounds
            p.x = max(1, min(99, p.x))
            p.y = max(1, min(99, p.y))

            # Natural aim drift
            p.aim_yaw += random.gauss(0, 2.0)
            p.aim_pitch += random.gauss(0, 0.5)

            # Apply cheat profile
            state_dict = {
                "player_id": p.player_id, "team": p.team,
                "x": p.x, "y": p.y, "vx": p.vx, "vy": p.vy,
                "aim_yaw": p.aim_yaw, "aim_pitch": p.aim_pitch,
                "prev_aim_yaw": p.prev_aim_yaw, "prev_aim_pitch": p.prev_aim_pitch,
                "aim_delta_x": p.aim_yaw - p.prev_aim_yaw,
                "aim_delta_y": p.aim_pitch - p.prev_aim_pitch,
                "tick": self.current_tick,
            }
            modified = apply_cheat(state_dict, p.cheat_type, all_states, self.game_map)

            # Write back modified values
            p.x, p.y = modified["x"], modified["y"]
            p.vx, p.vy = modified.get("vx", p.vx), modified.get("vy", p.vy)
            p.aim_yaw = modified.get("aim_yaw", p.aim_yaw)
            p.aim_pitch = modified.get("aim_pitch", p.aim_pitch)

            p.move_timer -= 1

    def _get_all_states(self) -> list[dict]:
        """Get all player states as dicts for cheat profiles."""
        return [
            {"player_id": p.player_id, "team": p.team,
             "x": p.x, "y": p.y, "aim_yaw": p.aim_yaw}
            for p in self.players
        ]

    def _build_tick_data(self) -> TickData:
        """Build a TickData from current simulation state."""
        player_states = []
        for p in self.players:
            # Compute visibility
            visible_to = []
            for other in self.players:
                if other.player_id == p.player_id:
                    continue
                if self.game_map.line_of_sight(p.x, p.y, other.x, other.y):
                    visible_to.append(other.player_id)

            player_states.append(PlayerState(
                player_id=p.player_id,
                position=Vec3(x=p.x, y=p.y, z=0),
                velocity=Vec3(x=p.vx, y=p.vy, z=0),
                aim=AimAngles(pitch=p.aim_pitch, yaw=p.aim_yaw),
                aim_delta=Vec2(
                    x=p.aim_yaw - p.prev_aim_yaw,
                    y=p.aim_pitch - p.prev_aim_pitch,
                ),
                state_flags=p.state_flags,
                health=p.health,
                visible_to=visible_to,
            ))

        return TickData(
            tick=self.current_tick,
            timestamp_ms=int(time.time() * 1000),
            match_id=self.match_id,
            players=player_states,
            events=[],  # TODO: Generate fire/hit/kill events
        )
