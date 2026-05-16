"""Dashboard WebSocket — streams detection results to React UI."""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.schema import DetectionResult

router = APIRouter()

# Connected dashboard clients per match
dashboard_clients: dict[str, list[WebSocket]] = {}


@router.websocket("/dashboard/{match_id}")
async def dashboard_ws(websocket: WebSocket, match_id: str):
    """Stream detection results to the dashboard."""
    await websocket.accept()

    if match_id not in dashboard_clients:
        dashboard_clients[match_id] = []
    dashboard_clients[match_id].append(websocket)

    try:
        # Send initial connection confirmation
        await websocket.send_json({"type": "connected", "match_id": match_id})
        while True:
            # Keep alive, listen for control messages from dashboard
            data = await websocket.receive_text()
            # TODO: Handle module toggle commands from dashboard
    except WebSocketDisconnect:
        if match_id in dashboard_clients:
            dashboard_clients[match_id].remove(websocket)


async def broadcast_detection(match_id: str, result: DetectionResult):
    """Broadcast detection result to all connected dashboard clients."""
    if match_id not in dashboard_clients:
        return

    data = result.model_dump_json()
    disconnected = []

    for ws in dashboard_clients[match_id]:
        try:
            await ws.send_text(data)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        dashboard_clients[match_id].remove(ws)
