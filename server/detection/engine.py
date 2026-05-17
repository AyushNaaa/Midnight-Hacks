"""Detection fusion engine — combines per-player + cross-player analysis (§2D).

Combines heuristic rules with trained Transformer (Model A) + GAT (Model B) models.
Buffers tick history internally. External callers should only call analyze().
"""
import logging
from api.schema import TickData, DetectionResult, PlayerVerdict, ModuleScores
from detection.rules import RulesDetector
from detection.models.transformer_inference import TransformerInference
from detection.models.gat_inference import GATInference

logger = logging.getLogger("zkguard.engine")


class DetectionEngine:
    """Main detection engine. Analyzes tick data and produces verdicts.

    Maintains a sliding window of player states (128 ticks) for each
    player in each match. External code should call analyze() only —
    buffering is handled internally.
    """

    WINDOW_SIZE = 128  # ticks per analysis window (2 seconds at 64 tick/s)

    def __init__(self):
        self.rules = RulesDetector()
        self.transformer = TransformerInference()
        self.gat = GATInference()
        # match_id -> player_id -> [PlayerState, ...]
        self.history: dict[str, dict[str, list]] = {}

    def buffer_tick(self, tick_data: TickData) -> None:
        """Buffer player states into the sliding window.

        Safe to call multiple times — duplicate ticks are appended.
        Called by analyze() automatically, so external callers that
        only use analyze() do not need to call this separately.
        """
        mid = tick_data.match_id
        if mid not in self.history:
            self.history[mid] = {}
        for p in tick_data.players:
            pid = p.player_id
            if pid not in self.history[mid]:
                self.history[mid][pid] = []
            self.history[mid][pid].append(p)
            if len(self.history[mid][pid]) > self.WINDOW_SIZE:
                self.history[mid][pid] = self.history[mid][pid][-self.WINDOW_SIZE:]

    def analyze(self, tick_data: TickData) -> DetectionResult:
        """Analyze a tick and return detection results for all players.

        Automatically buffers the tick before analysis.
        """
        mid = tick_data.match_id

        # Always buffer before analysis
        self.buffer_tick(tick_data)

        # Cross-player analysis (GAT)
        gat_scores = self.gat.predict(tick_data)

        verdicts = []
        for player in tick_data.players:
            pid = player.player_id
            history = self.history.get(mid, {}).get(pid, [])

            # 1. Heuristic rules
            rule = self.rules.analyze_player(player, history, tick_data)

            # 2. Transformer (per-player sequence)
            tf = self.transformer.predict(history)

            # 3. GAT scores for this player
            gs = gat_scores.get(pid, {"wallhack": 0.0, "collab": 0.0})

            # Sensor fusion: take the max of rules vs ML for each module
            fused = ModuleScores(
                aim=max(rule.aim, tf["aim"]),
                reaction=max(rule.reaction, tf["reaction"]),
                macro=max(rule.macro, tf["macro"]),
                speed=max(rule.speed, tf["speed"]),
                tracking=max(rule.tracking, tf["tracking"]),
                wallhack=max(rule.wallhack, gs["wallhack"]),
                collab=max(rule.collab, gs["collab"]),
            )

            peak = max(fused.aim, fused.reaction, fused.macro,
                       fused.speed, fused.tracking, fused.wallhack, fused.collab)

            verdict = "cheating" if peak > 0.8 else "suspicious" if peak > 0.5 else "clean"

            verdicts.append(PlayerVerdict(
                player_id=pid,
                verdict=verdict,
                confidence=min(peak * 1.2, 1.0),
                modules=fused,
                position={"x": player.position.x, "y": player.position.y},
                aim_yaw=player.aim.yaw,
            ))

        return DetectionResult(
            match_id=mid,
            tick=tick_data.tick,
            timestamp_ms=tick_data.timestamp_ms,
            players=verdicts,
        )
