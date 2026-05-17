"""WebSocket telemetry ingestion endpoint (§1.2).

- ws://localhost:8000/telemetry/{match_id} — accepts TickData JSON
- Validates against schema, rejects invalid messages with descriptive error
- Buffers ticks into sliding windows (128 ticks = 1 analysis window at 64 tick/s)
- Forwards detection results to dashboard clients
"""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from api.schema import TickData
from api.shared import engine, cache_verdicts
from api.dashboard_ws import broadcast_detection

logger = logging.getLogger("zkguard.ingest")

router = APIRouter()

# Track tick count per match to trigger windowed analysis
tick_buffers: dict[str, int] = {}  # match_id -> tick count since last analysis

WINDOW_SIZE = 128  # ticks per analysis window
ANALYSIS_INTERVAL = 4  # analyze every N ticks (16 analyses/sec at 64 tick/s)


@router.websocket("/telemetry/{match_id}")
async def telemetry_ws(websocket: WebSocket, match_id: str):
    """Accept game telemetry via WebSocket.

    Game servers connect here and send TickData JSON messages.
    Each message is validated, buffered into the detection engine's
    sliding window, and analyzed at regular intervals.
    """
    await websocket.accept()
    logger.info(f"Telemetry WS connected: match={match_id}")

    if match_id not in tick_buffers:
        tick_buffers[match_id] = 0

    try:
        while True:
            data = await websocket.receive_text()

            # --- Validation ---
            try:
                tick_data = TickData.model_validate_json(data)
            except ValidationError as e:
                error_details = []
                for err in e.errors():
                    loc = " -> ".join(str(l) for l in err["loc"])
                    error_details.append(f"{loc}: {err['msg']}")
                await websocket.send_json({
                    "status": "error",
                    "type": "validation_error",
                    "message": f"Invalid TickData: {'; '.join(error_details)}",
                    "error_count": len(error_details),
                })
                continue

            # Enforce match_id matches the URL
            if tick_data.match_id != match_id:
                await websocket.send_json({
                    "status": "error",
                    "type": "match_id_mismatch",
                    "message": f"TickData match_id '{tick_data.match_id}' does not match URL match_id '{match_id}'",
                })
                continue

            # --- Buffer into engine + analyze at intervals ---
            engine.buffer_tick(tick_data)
            tick_buffers[match_id] = tick_buffers.get(match_id, 0) + 1

            # --- Analyze at regular intervals ---
            if tick_buffers[match_id] % ANALYSIS_INTERVAL == 0:
                result = engine.analyze(tick_data)
                cache_verdicts(match_id, result.players)
                await broadcast_detection(match_id, result)

            # Acknowledge
            await websocket.send_json({
                "status": "ok",
                "tick": tick_data.tick,
                "buffered": tick_buffers[match_id],
            })

    except WebSocketDisconnect:
        logger.info(f"Telemetry WS disconnected: match={match_id}")
    except Exception as e:
        logger.error(f"Telemetry WS error: match={match_id}, error={e}")
