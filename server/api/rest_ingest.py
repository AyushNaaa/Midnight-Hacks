"""REST telemetry ingestion endpoints (§1.3).

- POST /api/tick — accepts TickData JSON via HTTP
- GET /api/verdict/{match_id}/{player_id} — returns latest detection verdict
- Enables integration from any language/engine without WebSocket support
"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from api.schema import TickData, PlayerVerdict
from api.shared import engine, cache_verdicts, latest_verdicts
from api.dashboard_ws import broadcast_detection

logger = logging.getLogger("zkguard.rest")

router = APIRouter(prefix="/api", tags=["telemetry"])


@router.post("/tick")
async def ingest_tick(tick_data: TickData):
    """Accept a single tick via REST POST.

    Same schema as WebSocket endpoint. Use this for turn-based or
    lower-frequency games, or from languages without WebSocket support.
    """
    # Buffer and analyze
    engine._buffer_tick(tick_data)
    result = engine.analyze(tick_data)

    # Cache verdicts for polling
    cache_verdicts(tick_data.match_id, result.players)

    # Also broadcast to any connected dashboard
    await broadcast_detection(tick_data.match_id, result)

    return {
        "status": "ok",
        "tick": tick_data.tick,
        "match_id": tick_data.match_id,
        "detections": len(result.players),
        "verdicts": {pv.player_id: pv.verdict for pv in result.players},
    }


@router.get("/verdict/{match_id}/{player_id}")
async def get_verdict(match_id: str, player_id: str):
    """Get latest detection verdict for a specific player.

    Returns the full PlayerVerdict with per-module scores.
    Game servers can poll this to get detection results without WebSocket.
    """
    if match_id not in latest_verdicts:
        raise HTTPException(
            status_code=404,
            detail=f"No active match with id '{match_id}'. Start a simulation or send telemetry first.",
        )
    if player_id not in latest_verdicts[match_id]:
        available = list(latest_verdicts[match_id].keys())
        raise HTTPException(
            status_code=404,
            detail=f"No verdict for player '{player_id}' in match '{match_id}'. Available players: {available}",
        )
    return latest_verdicts[match_id][player_id]


@router.get("/verdict/{match_id}")
async def get_all_verdicts(match_id: str):
    """Get latest detection verdicts for ALL players in a match."""
    if match_id not in latest_verdicts:
        raise HTTPException(
            status_code=404,
            detail=f"No active match with id '{match_id}'.",
        )
    return {
        "match_id": match_id,
        "player_count": len(latest_verdicts[match_id]),
        "verdicts": latest_verdicts[match_id],
    }
