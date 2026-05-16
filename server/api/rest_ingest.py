"""REST telemetry ingestion endpoints."""
from fastapi import APIRouter, HTTPException
from api.schema import TickData, PlayerVerdict
from detection.engine import DetectionEngine
from api.dashboard_ws import broadcast_detection

router = APIRouter(prefix="/api", tags=["telemetry"])
engine = DetectionEngine()

# Cache latest verdicts
latest_verdicts: dict[str, dict[str, PlayerVerdict]] = {}


@router.post("/tick")
async def ingest_tick(tick_data: TickData):
    """Accept a single tick via REST POST."""
    result = engine.analyze(tick_data)

    if tick_data.match_id not in latest_verdicts:
        latest_verdicts[tick_data.match_id] = {}
    for pv in result.players:
        latest_verdicts[tick_data.match_id][pv.player_id] = pv

    await broadcast_detection(tick_data.match_id, result)
    return {"status": "ok", "tick": tick_data.tick, "detections": len(result.players)}


@router.get("/verdict/{match_id}/{player_id}")
async def get_verdict(match_id: str, player_id: str):
    """Get latest detection verdict for a player."""
    if match_id not in latest_verdicts or player_id not in latest_verdicts[match_id]:
        raise HTTPException(status_code=404, detail="No verdict available")
    return latest_verdicts[match_id][player_id]
