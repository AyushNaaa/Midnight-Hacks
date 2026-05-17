"""Dashboard WebSocket — streams detection results to React UI (§1.4).

- ws://localhost:8000/dashboard/{match_id} — streams detection results
- Manages client connections per match
- Broadcasts detection results from any ingestion path
- Cleans up on match end
"""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from api.schema import DetectionResult

logger = logging.getLogger("zkguard.dashboard_ws")

router = APIRouter()

# Connected dashboard clients per match
dashboard_clients: dict[str, list[WebSocket]] = {}


@router.websocket("/dashboard/{match_id}")
async def dashboard_ws(websocket: WebSocket, match_id: str):
    """Stream detection results to the dashboard.

    Dashboard frontend connects here and receives real-time
    DetectionResult JSON messages as they are produced.
    """
    await websocket.accept()
    logger.info(f"Dashboard WS connected: match={match_id}")

    if match_id not in dashboard_clients:
        dashboard_clients[match_id] = []
    dashboard_clients[match_id].append(websocket)

    try:
        # Send connection confirmation with match info
        await websocket.send_json({
            "type": "connected",
            "match_id": match_id,
            "message": "Connected to ZK-Guard detection stream",
        })
        while True:
            # Keep alive — listen for control messages from dashboard
            data = await websocket.receive_text()
            # TODO: Handle module toggle commands from dashboard
    except WebSocketDisconnect:
        logger.info(f"Dashboard WS disconnected: match={match_id}")
        _remove_client(match_id, websocket)
    except Exception as e:
        logger.error(f"Dashboard WS error: match={match_id}, error={e}")
        _remove_client(match_id, websocket)


def _remove_client(match_id: str, websocket: WebSocket) -> None:
    """Safely remove a client from the connection list."""
    if match_id in dashboard_clients:
        try:
            dashboard_clients[match_id].remove(websocket)
        except ValueError:
            pass
        # Clean up empty lists
        if not dashboard_clients[match_id]:
            del dashboard_clients[match_id]


async def broadcast_detection(match_id: str, result: DetectionResult) -> None:
    """Broadcast detection result to all connected dashboard clients.

    Called from any ingestion path (WS, REST, or simulator).
    Automatically removes disconnected clients.
    """
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
        _remove_client(match_id, ws)


def cleanup_match(match_id: str) -> None:
    """Remove all dashboard connections for a finished match."""
    if match_id in dashboard_clients:
        logger.info(f"Cleaning up {len(dashboard_clients[match_id])} dashboard clients for match={match_id}")
        del dashboard_clients[match_id]
