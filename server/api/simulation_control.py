"""Simulation control API — start/stop matches, toggle cheats."""
import asyncio
import uuid
from fastapi import APIRouter, HTTPException
from api.schema import SimulationStatus
from simulation.match_simulator import MatchSimulator

router = APIRouter(prefix="/sim", tags=["simulation"])

simulator: MatchSimulator | None = None
sim_task: asyncio.Task | None = None


@router.post("/start")
async def start_simulation():
    """Start a new simulated 5v5 match."""
    global simulator, sim_task

    if simulator and simulator.running:
        raise HTTPException(status_code=400, detail="Simulation already running")

    match_id = f"match_{uuid.uuid4().hex[:8]}"
    simulator = MatchSimulator(match_id=match_id)
    sim_task = asyncio.create_task(simulator.run())

    return {"status": "started", "match_id": match_id}


@router.post("/stop")
async def stop_simulation():
    """Stop the current simulation."""
    global simulator, sim_task

    if not simulator or not simulator.running:
        raise HTTPException(status_code=400, detail="No simulation running")

    simulator.stop()
    if sim_task:
        sim_task.cancel()

    return {"status": "stopped"}


@router.post("/player/{player_id}/cheat/{cheat_type}")
async def toggle_cheat(player_id: str, cheat_type: str):
    """Toggle a cheat profile on a player. Use 'clean' to remove cheats."""
    if not simulator or not simulator.running:
        raise HTTPException(status_code=400, detail="No simulation running")

    valid_cheats = ["clean", "aimbot", "wallhack", "speedhack", "macro", "collab"]
    if cheat_type not in valid_cheats:
        raise HTTPException(status_code=400, detail=f"Invalid cheat. Valid: {valid_cheats}")

    simulator.set_cheat(player_id, cheat_type)
    return {"status": "ok", "player_id": player_id, "cheat_type": cheat_type}


@router.get("/status")
async def get_status():
    """Get current simulation status."""
    if not simulator:
        return SimulationStatus()
    return SimulationStatus(
        running=simulator.running,
        match_id=simulator.match_id,
        tick=simulator.current_tick,
        player_cheats=simulator.player_cheats,
    )
