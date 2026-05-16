"""WebSocket telemetry ingestion endpoint."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.schema import TickData
from detection.engine import DetectionEngine
from api.dashboard_ws import broadcast_detection

router = APIRouter()
engine = DetectionEngine()


@router.websocket("/telemetry/{match_id}")
async def telemetry_ws(websocket: WebSocket, match_id: str):
    """Accept game telemetry via WebSocket."""
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            try:
                tick_data = TickData.model_validate_json(data)
                result = engine.analyze(tick_data)
                await broadcast_detection(match_id, result)
                await websocket.send_json({"status": "ok", "tick": tick_data.tick})
            except Exception as e:
                await websocket.send_json({"status": "error", "message": str(e)})
    except WebSocketDisconnect:
        pass
