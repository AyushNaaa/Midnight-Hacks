"""Detection fusion engine — combines per-player + cross-player analysis.

Currently uses rules-based detection. 
TODO: Replace with trained Transformer (Model A) + GAT (Model B) models.
"""
from api.schema import TickData, DetectionResult, PlayerVerdict, ModuleScores
from detection.rules import RulesDetector


class DetectionEngine:
    """Main detection engine. Analyzes tick data and produces verdicts."""

    def __init__(self):
        self.rules = RulesDetector()
        # TODO: Load trained Transformer model (Model A) — see §2A
        # self.transformer = TransformerModel.load("models/transformer.pt")
        # TODO: Load trained GAT model (Model B) — see §2B
        # self.gat = GATModel.load("models/gat.pt")

        # Per-player tick history for windowed analysis
        self.history: dict[str, dict[str, list]] = {}
        self.window_size = 128

    def analyze(self, tick_data: TickData) -> DetectionResult:
        """Analyze a tick and return detection results for all players."""
        match_id = tick_data.match_id

        if match_id not in self.history:
            self.history[match_id] = {}

        # Update history
        for player in tick_data.players:
            pid = player.player_id
            if pid not in self.history[match_id]:
                self.history[match_id][pid] = []
            self.history[match_id][pid].append(player)
            if len(self.history[match_id][pid]) > self.window_size:
                self.history[match_id][pid] = self.history[match_id][pid][-self.window_size:]

        # Run detection on each player
        verdicts = []
        for player in tick_data.players:
            pid = player.player_id
            history = self.history[match_id].get(pid, [])
            scores = self.rules.analyze_player(player, history, tick_data)

            max_score = max(
                scores.aim, scores.reaction, scores.macro,
                scores.speed, scores.tracking, scores.wallhack, scores.collab
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
                modules=scores,
            ))

        return DetectionResult(
            match_id=match_id,
            tick=tick_data.tick,
            timestamp_ms=tick_data.timestamp_ms,
            players=verdicts,
        )
