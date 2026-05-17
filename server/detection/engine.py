"""Detection fusion engine — combines per-player + cross-player analysis (§2D).

Combines heuristic rules with trained Transformer (Model A) + GAT (Model B) models.
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
    player in each match. Analysis uses the full window to detect
    patterns over time rather than single-tick anomalies.
    """

    WINDOW_SIZE = 128  # ticks per analysis window (2 seconds at 64 tick/s)

    def __init__(self):
        # Fallback heuristic rules
        self.rules = RulesDetector()
        
        # Load trained ML Models
        self.transformer = TransformerInference()
        self.gat = GATInference()

        # Per-player tick history: match_id -> player_id -> [PlayerState, ...]
        self.history: dict[str, dict[str, list]] = {}

    def _buffer_tick(self, tick_data: TickData) -> None:
        """Buffer player states into the sliding window."""
        match_id = tick_data.match_id

        if match_id not in self.history:
            self.history[match_id] = {}

        for player in tick_data.players:
            pid = player.player_id
            if pid not in self.history[match_id]:
                self.history[match_id][pid] = []
            self.history[match_id][pid].append(player)
            # Trim to window size
            if len(self.history[match_id][pid]) > self.WINDOW_SIZE:
                self.history[match_id][pid] = self.history[match_id][pid][-self.WINDOW_SIZE:]

    def analyze(self, tick_data: TickData) -> DetectionResult:
        """Analyze a tick and return detection results for all players."""
        match_id = tick_data.match_id

        # Always buffer the tick first — before any analysis
        self._buffer_tick(tick_data)

        # Run GAT inference on the current tick (Cross-player analysis)
        gat_scores = self.gat.predict(tick_data)

        # Run detection on each player
        verdicts = []
        for player in tick_data.players:
            pid = player.player_id
            history = self.history.get(match_id, {}).get(pid, [])
            
            # 1. Heuristic Rules fallback
            rule_scores = self.rules.analyze_player(player, history, tick_data)
            
            # 2. Transformer inference (Per-player sequence analysis)
            tf_scores = self.transformer.predict(history)
            
            # 3. Get GAT scores for this player
            g_scores = gat_scores.get(pid, {"wallhack": 0.0, "collab": 0.0})

            # Sensor Fusion: Combine predictions
            # If the ML model says cheating, we trust it. If it's untrained (0.5), we fall back to rules.
            fused_scores = ModuleScores(
                aim=max(rule_scores.aim, tf_scores["aim"]),
                reaction=max(rule_scores.reaction, tf_scores["reaction"]),
                macro=max(rule_scores.macro, tf_scores["macro"]),
                speed=max(rule_scores.speed, tf_scores["speed"]),
                tracking=max(rule_scores.tracking, tf_scores["tracking"]),
                wallhack=max(rule_scores.wallhack, g_scores["wallhack"]),
                collab=max(rule_scores.collab, g_scores["collab"])
            )

            max_score = max(
                fused_scores.aim, fused_scores.reaction, fused_scores.macro,
                fused_scores.speed, fused_scores.tracking, fused_scores.wallhack, fused_scores.collab
            )
            
            if max_score > 0.8:
                verdict = "cheating"
            elif max_score > 0.5:
                verdict = "suspicious"
            else:
                verdict = "clean"

            verdicts.append(PlayerVerdict(
                player_id=pid,
                verdict=verdict,
                confidence=min(max_score * 1.2, 1.0),
                modules=fused_scores,
                position={"x": player.position.x, "y": player.position.y},
                aim_yaw=player.aim.yaw,
            ))

        return DetectionResult(
            match_id=match_id,
            tick=tick_data.tick,
            timestamp_ms=tick_data.timestamp_ms,
            players=verdicts,
        )
