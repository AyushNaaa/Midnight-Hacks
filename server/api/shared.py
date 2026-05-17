"""Shared state — singleton instances used across all API endpoints.

This avoids multiple DetectionEngine instances with separate histories.
All endpoints share one engine and one verdict cache.
"""
from detection.engine import DetectionEngine
from api.schema import PlayerVerdict

# Single shared detection engine — maintains tick history across all ingestion paths
engine = DetectionEngine()

# Shared verdict cache — populated by both WS/REST ingestion and simulator
latest_verdicts: dict[str, dict[str, PlayerVerdict]] = {}


def cache_verdicts(match_id: str, players: list[PlayerVerdict]) -> None:
    """Update the shared verdict cache from any detection result."""
    if match_id not in latest_verdicts:
        latest_verdicts[match_id] = {}
    for pv in players:
        latest_verdicts[match_id][pv.player_id] = pv


def clear_match(match_id: str) -> None:
    """Clean up all state for a finished match."""
    latest_verdicts.pop(match_id, None)
    engine.history.pop(match_id, None)
