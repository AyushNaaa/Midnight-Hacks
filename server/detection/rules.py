"""Rules-based cheat detection — heuristic fallback for ML models.

All 7 detection modules implemented with working heuristics:
  aim, reaction, macro, speed, tracking, wallhack, collab
"""
import math
from api.schema import PlayerState, TickData, ModuleScores


class RulesDetector:
    MAX_SPEED = 6.0
    MAX_AIM_DELTA = 15.0

    def analyze_player(self, current: PlayerState, history: list[PlayerState],
                       tick_data: TickData) -> ModuleScores:
        if len(history) < 10:
            return ModuleScores()
        return ModuleScores(
            aim=self._aim(current, history),
            reaction=self._reaction(current, history, tick_data),
            macro=self._macro(current, history),
            speed=self._speed(current, history),
            tracking=self._tracking(current, history, tick_data),
            wallhack=self._wallhack(current, history, tick_data),
            collab=self._collab(current, tick_data),
        )

    # ---- Aim Analysis ----
    def _aim(self, cur: PlayerState, hist: list[PlayerState]) -> float:
        deltas = [math.sqrt(h.aim_delta.x**2 + h.aim_delta.y**2) for h in hist[-20:]]
        if not deltas: return 0.0
        mx = max(deltas)
        avg = sum(deltas) / len(deltas)
        if avg > 0:
            ratio = mx / (avg + 0.01)
            if ratio > 10 and mx > self.MAX_AIM_DELTA:
                return min(ratio / 15.0, 1.0)
        return 0.0

    # ---- Reaction Time ----
    def _reaction(self, cur: PlayerState, hist: list[PlayerState],
                  td: TickData) -> float:
        if len(hist) < 20: return 0.0
        fires = [e for e in td.events
                 if e.player_id == cur.player_id and e.event_type in ("fire","hit","kill")]
        if not fires: return 0.0
        recent = hist[-10:]
        stab = [math.sqrt(s.aim_delta.x**2 + s.aim_delta.y**2) for s in recent]
        avg = sum(stab)/len(stab)
        var = sum((d-avg)**2 for d in stab)/len(stab)
        if len(fires) >= 2 and var < 0.01 and avg < 0.5:
            return min(0.7 + len(fires)*0.05, 1.0)
        return 0.0

    # ---- Macro Detection ----
    def _macro(self, cur: PlayerState, hist: list[PlayerState]) -> float:
        if len(hist) < 30: return 0.0
        dy = [h.aim_delta.y for h in hist[-30:]]
        mu = sum(dy)/len(dy)
        var = sum((d-mu)**2 for d in dy)/len(dy)
        if abs(mu) > 0.5 and var < 0.01:
            return 0.9
        return 0.0

    # ---- Speed Hack ----
    def _speed(self, cur: PlayerState, hist: list[PlayerState]) -> float:
        spd = math.sqrt(cur.velocity.x**2 + cur.velocity.y**2 + cur.velocity.z**2)
        if spd > self.MAX_SPEED * 1.5:
            return min(spd / (self.MAX_SPEED * 2), 1.0)
        return 0.0

    # ---- Tracking / Smooth Aim ----
    def _tracking(self, cur: PlayerState, hist: list[PlayerState],
                  td: TickData) -> float:
        if len(hist) < 15: return 0.0
        nearest = None; ndist = float("inf")
        for o in td.players:
            if o.player_id == cur.player_id: continue
            if cur.player_id not in o.visible_to: continue
            dx = o.position.x - cur.position.x
            dy = o.position.y - cur.position.y
            d = math.sqrt(dx**2+dy**2)
            if d < ndist: ndist = d; nearest = o
        if nearest is None or ndist > 50: return 0.0
        dx = nearest.position.x - cur.position.x
        dy = nearest.position.y - cur.position.y
        ta = math.degrees(math.atan2(dy, dx))
        ad = abs((ta - cur.aim.yaw + 180) % 360 - 180)
        tc = sum(1 for s in hist[-15:] if math.sqrt(s.aim_delta.x**2+s.aim_delta.y**2)<1.0)
        tr = tc / 15.0
        if ad < 3 and tr > 0.8: return min(0.6 + tr*0.3, 1.0)
        if ad < 5 and tr > 0.7: return 0.5
        return 0.0

    # ---- Wallhack ----
    def _wallhack(self, cur: PlayerState, hist: list[PlayerState],
                  td: TickData) -> float:
        for o in td.players:
            if o.player_id == cur.player_id: continue
            if cur.player_id not in o.visible_to:
                dx = o.position.x - cur.position.x
                dy = o.position.y - cur.position.y
                if dx == 0 and dy == 0: continue
                ta = math.degrees(math.atan2(dy, dx))
                ad = abs((ta - cur.aim.yaw + 180) % 360 - 180)
                if ad < 5: return 0.9
        return 0.0

    # ---- Collab Cheat ----
    def _collab(self, cur: PlayerState, td: TickData) -> float:
        if len(td.players) < 4: return 0.0
        best = 0.0
        cs = math.sqrt(cur.velocity.x**2+cur.velocity.y**2+cur.velocity.z**2)
        if cs < 0.5: return 0.0
        for o in td.players:
            if o.player_id == cur.player_id: continue
            os_ = math.sqrt(o.velocity.x**2+o.velocity.y**2+o.velocity.z**2)
            if os_ < 0.5: continue
            dot = (cur.velocity.x*o.velocity.x + cur.velocity.y*o.velocity.y
                   + cur.velocity.z*o.velocity.z)
            vc = dot / (cs*os_+0.01)
            ad = abs((cur.aim.yaw - o.aim.yaw + 180) % 360 - 180)
            ac = 1.0 - ad/180.0
            coord = vc*0.4 + ac*0.6
            if coord > 0.85: best = max(best, coord)
        if best > 0.9: return min(best, 1.0)
        if best > 0.85: return 0.5
        return 0.0
