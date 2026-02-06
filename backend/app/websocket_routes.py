"""WebSocket connection manager with error handling."""
import asyncio
import json
import logging
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/ws", tags=["websocket"])
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket connections with error handling."""

    def __init__(self, max_errors: int = 6):
        self.active_connections: Set[WebSocket] = set()
        self.max_errors = max_errors
        self.error_counts: dict[WebSocket, int] = {}

    async def connect(self, websocket: WebSocket):
        """Accept and register new connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        self.error_counts[websocket] = 0
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        """Unregister and close connection."""
        self.active_connections.discard(websocket)
        self.error_counts.pop(websocket, None)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def record_error(self, websocket: WebSocket) -> bool:
        """Record error, return True if should disconnect."""
        self.error_counts[websocket] = self.error_counts.get(websocket, 0) + 1
        if self.error_counts[websocket] >= self.max_errors:
            logger.warning(
                f"WebSocket: max errors ({self.max_errors}) reached, closing connection"
            )
            return True
        return False

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.append(connection)

        for connection in disconnected:
            await self.disconnect(connection)


manager = ConnectionManager(max_errors=6)


@router.websocket("/api/live")
async def websocket_live_data(websocket: WebSocket):
    """Stream live sensor and growth data."""
    await manager.connect(websocket)

    try:
        while True:
            # Receive client messages with timeout
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=30.0
                )
                logger.debug(f"WS message received: {data.get('type', 'unknown')}")

            except asyncio.TimeoutError:
                # Send periodic ping to client
                try:
                    await websocket.send_json({"type": "ping", "timestamp": asyncio.get_event_loop().time()})
                except Exception:
                    break

            except json.JSONDecodeError:
                # Invalid JSON received
                if await manager.record_error(websocket):
                    logger.warning("WebSocket: max JSON errors reached, closing")
                    await manager.disconnect(websocket)
                    break

                try:
                    await websocket.send_json({
                        "error": "Invalid JSON format",
                        "type": "error"
                    })
                except Exception:
                    break

            except Exception as e:
                # Unexpected error
                if await manager.record_error(websocket):
                    logger.warning(f"WebSocket: max errors reached, closing: {str(e)}")
                    await manager.disconnect(websocket)
                    break

                logger.error(f"WebSocket error: {e}")
                try:
                    await websocket.send_json({
                        "error": "Internal server error",
                        "type": "error"
                    })
                except Exception:
                    break

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        logger.info("WebSocket disconnected by client")

    except Exception as e:
        logger.error(f"WebSocket unexpected error: {e}")
        await manager.disconnect(websocket)
