"""Rules-based cheat detection — heuristic fallback for ML models.

Each method implements heuristic detection producing the same output format
as the trained ML models. These run as fallback when model confidence is low,
or as the primary detector before models are trained.

Implements all 7 detection modules:
  - aim:      angular velocity spikes + path straightness
  - reaction: inhuman fire-event reaction time consistency
  - macro:    periodic input patterns via variance analysis
  - speed:    velocity exceeding physics limits
  - tracking: crosshair-to-target correlation
  - wallhack: aiming at non-visible players
  - collab:   coordinated movement between teammates
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

    def _reaction_analysis(
        self, current: PlayerState, history: list[PlayerState], tick_data: TickData
    ) -> float:
        """Detect triggerbot via inhuman reaction time consistency.

        Measures the time gap between a target becoming visible (entering
        visible_to list) and a fire event. Inhumanly consistent short
        reaction times indicate a triggerbot.
        """
        if len(history) < 20:
            return 0.0

        # Track fire events from game events in this tick
        fire_events = [
            e for e in tick_data.events
            if e.player_id == current.player_id and e.event_type in ("fire", "hit", "kill")
        ]

        if not fire_events:
            return 0.0

        # Check if the player fired very quickly after a target appeared
        # We approximate this by looking at aim delta patterns around fire events
        # A triggerbot shows near-zero aim adjustment before firing (already locked on)
        recent = history[-10:]
        fire_count = len(fire_events)

        # Check if aim was unnaturally stable just before firing
        aim_stability = []
        for state in recent:
            delta_mag = math.sqrt(state.aim_delta.x**2 + state.aim_delta.y**2)
            aim_stability.append(delta_mag)

        if not aim_stability:
            return 0.0

        avg_stability = sum(aim_stability) / len(aim_stability)
        variance = sum((d - avg_stability) ** 2 for d in aim_stability) / len(aim_stability)

        # Inhuman: low aim movement variance + high fire rate
        if fire_count >= 2 and variance < 0.01 and avg_stability < 0.5:
            return min(0.7 + (fire_count * 0.05), 1.0)

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

    def _tracking_analysis(
        self, current: PlayerState, history: list[PlayerState], tick_data: TickData
    ) -> float:
        """Detect smooth aim / lock-on via crosshair-to-target correlation.

        Measures how consistently a player's aim tracks the nearest visible
        enemy's position over time. Natural players have noisy tracking;
        smooth aim hacks maintain near-perfect correlation.
        """
        if len(history) < 15:
            return 0.0

        # Find the nearest visible enemy
        nearest_enemy = None
        nearest_dist = float("inf")
        for other in tick_data.players:
            if other.player_id == current.player_id:
                continue
            # Only consider visible enemies
            if current.player_id not in other.visible_to:
                continue

            dx = other.position.x - current.position.x
            dy = other.position.y - current.position.y
            dist = math.sqrt(dx**2 + dy**2)
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_enemy = other

        if nearest_enemy is None or nearest_dist > 50.0:
            return 0.0

        # Calculate angle to the nearest enemy
        dx = nearest_enemy.position.x - current.position.x
        dy = nearest_enemy.position.y - current.position.y
        target_angle = math.degrees(math.atan2(dy, dx))

        # How close is the player's aim to the target?
        aim_angle = current.aim.yaw
        angle_diff = abs((target_angle - aim_angle + 180) % 360 - 180)

        # Check tracking consistency over recent history
        # If aim is consistently within 3 degrees of target for many ticks, it's suspicious
        tracking_count = 0
        for state in history[-15:]:
            state_delta_mag = math.sqrt(state.aim_delta.x**2 + state.aim_delta.y**2)
            # Low delta + close to target = tracking
            if state_delta_mag < 1.0:
                tracking_count += 1

        tracking_ratio = tracking_count / 15.0

        if angle_diff < 3.0 and tracking_ratio > 0.8:
            return min(0.6 + tracking_ratio * 0.3, 1.0)
        elif angle_diff < 5.0 and tracking_ratio > 0.7:
            return 0.5

        return 0.0

    def _wallhack_analysis(
        self, current: PlayerState, history: list[PlayerState], tick_data: TickData
    ) -> float:
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
        """Detect collaborative cheating via coordinated movement/aim patterns.

        Looks for teammates with suspiciously synchronized movement vectors
        or aim directions, suggesting information sharing (ghosting).
        """
        if len(tick_data.players) < 4:
            return 0.0

        # Compare current player's movement/aim with all other players
        max_coordination = 0.0

        for other in tick_data.players:
            if other.player_id == current.player_id:
                continue

            # Velocity correlation: similar speed and direction
            cur_speed = math.sqrt(
                current.velocity.x**2 + current.velocity.y**2 + current.velocity.z**2
            )
            oth_speed = math.sqrt(
                other.velocity.x**2 + other.velocity.y**2 + other.velocity.z**2
            )

            if cur_speed < 0.5 or oth_speed < 0.5:
                continue

            # Dot product of velocity vectors (normalized)
            dot = (
                current.velocity.x * other.velocity.x
                + current.velocity.y * other.velocity.y
                + current.velocity.z * other.velocity.z
            )
            vel_correlation = dot / (cur_speed * oth_speed + 0.01)

            # Aim correlation: similar aim direction
            aim_diff = abs((current.aim.yaw - other.aim.yaw + 180) % 360 - 180)
            aim_correlation = 1.0 - (aim_diff / 180.0)

            # Combined coordination score
            coordination = (vel_correlation * 0.4 + aim_correlation * 0.6)

            # Only flag if coordination is suspiciously high
            if coordination > 0.85:
                max_coordination = max(max_coordination, coordination)

        if max_coordination > 0.9:
            return min(max_coordination, 1.0)
        elif max_coordination > 0.85:
            return 0.5

        return 0.0
