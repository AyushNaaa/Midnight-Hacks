"""Rules-based cheat detection — placeholder for ML models.

Each method implements simple heuristic detection producing the same
output format as the future ML models. Team members can replace
individual methods with trained model inference.

TODO: Replace with Transformer (§2A) and GAT (§2B) model inference.
"""
import math
from api.schema import PlayerState, TickData, ModuleScores


class RulesDetector:
    """Heuristic-based cheat detection."""

    MAX_SPEED = 6.0       # units/tick — human movement cap
    MAX_AIM_DELTA = 15.0  # degrees/tick — human aim speed cap

    def analyze_player(
        self,
        current: PlayerState,
        history: list[PlayerState],
        tick_data: TickData,
    ) -> ModuleScores:
        """Run all detection modules on a player."""
        if len(history) < 10:
            return ModuleScores()

        return ModuleScores(
            aim=self._aim_analysis(current, history),
            reaction=self._reaction_analysis(current, history, tick_data),
            macro=self._macro_analysis(current, history),
            speed=self._speed_analysis(current, history),
            tracking=self._tracking_analysis(current, history, tick_data),
            wallhack=self._wallhack_analysis(current, history, tick_data),
            collab=self._collab_analysis(current, tick_data),
        )

    def _aim_analysis(self, current: PlayerState, history: list[PlayerState]) -> float:
        """Detect aimbot via angular velocity spikes and path straightness."""
        deltas = [math.sqrt(h.aim_delta.x**2 + h.aim_delta.y**2) for h in history[-20:]]
        if not deltas:
            return 0.0
        max_delta = max(deltas)
        avg_delta = sum(deltas) / len(deltas)
        if avg_delta > 0:
            snap_ratio = max_delta / (avg_delta + 0.01)
            if snap_ratio > 10 and max_delta > self.MAX_AIM_DELTA:
                return min(snap_ratio / 15.0, 1.0)
        return 0.0

    def _reaction_analysis(self, current: PlayerState, history: list[PlayerState], tick_data: TickData) -> float:
        """Detect triggerbot via inhuman reaction times.
        TODO: Implement reaction time tracking from kill events.
        """
        return 0.0

    def _macro_analysis(self, current: PlayerState, history: list[PlayerState]) -> float:
        """Detect macro/scripts via input periodicity."""
        if len(history) < 30:
            return 0.0
        deltas = [h.aim_delta.y for h in history[-30:]]
        mean = sum(deltas) / len(deltas)
        variance = sum((d - mean) ** 2 for d in deltas) / len(deltas)
        if abs(mean) > 0.5 and variance < 0.01:
            return 0.9
        return 0.0

    def _speed_analysis(self, current: PlayerState, history: list[PlayerState]) -> float:
        """Detect speed hack via velocity exceeding physics limits."""
        speed = math.sqrt(current.velocity.x**2 + current.velocity.y**2 + current.velocity.z**2)
        if speed > self.MAX_SPEED * 1.5:
            return min(speed / (self.MAX_SPEED * 2), 1.0)
        return 0.0

    def _tracking_analysis(self, current: PlayerState, history: list[PlayerState], tick_data: TickData) -> float:
        """Detect smooth aim / lock-on.
        TODO: Implement crosshair-target correlation analysis.
        """
        return 0.0

    def _wallhack_analysis(self, current: PlayerState, history: list[PlayerState], tick_data: TickData) -> float:
        """Detect wallhack via aiming at non-visible players."""
        for other in tick_data.players:
            if other.player_id == current.player_id:
                continue
            if current.player_id not in other.visible_to:
                dx = other.position.x - current.position.x
                dy = other.position.y - current.position.y
                if dx == 0 and dy == 0:
                    continue
                angle_to_target = math.degrees(math.atan2(dy, dx))
                aim_angle = current.aim.yaw
                angle_diff = abs((angle_to_target - aim_angle + 180) % 360 - 180)
                if angle_diff < 5:
                    return 0.9
        return 0.0

    def _collab_analysis(self, current: PlayerState, tick_data: TickData) -> float:
        """Detect collaborative cheating.
        TODO: Implement coordination analysis between player pairs.
        """
        return 0.0
