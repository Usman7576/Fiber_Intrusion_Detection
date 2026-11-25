import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["stream"])


@router.websocket("/stream")
async def stream(ws: WebSocket):
    """Live simulated feed. See app/services/streamer.py for the message format."""
    streamer = ws.app.state.streamer
    await ws.accept()
    await ws.send_json(streamer.hello())
    sub = streamer.subscribe()

    async def receive():
        while True:
            msg = await ws.receive_json()
            cmd = msg.get("cmd") if isinstance(msg, dict) else None
            if cmd == "pause":
                sub.paused = True
            elif cmd == "resume":
                sub.paused = False
            elif cmd == "speed":
                with contextlib.suppress(TypeError, ValueError):
                    streamer.set_speed(float(msg.get("value", 1)))

    async def send():
        while True:
            await ws.send_json(await sub.queue.get())

    tasks = [asyncio.create_task(receive()), asyncio.create_task(send())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in done:                                        # surface real errors, ignore normal disconnects
            if t.exception() and not isinstance(t.exception(), WebSocketDisconnect):
                raise t.exception()
    finally:
        for t in tasks:
            t.cancel()
        streamer.unsubscribe(sub)
