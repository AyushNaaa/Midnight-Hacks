"""Injectable cheat profiles for the match simulator.

Each function modifies a player's state to simulate a specific cheat.
TODO: Team members can make these more sophisticated/realistic.
"""
import math
import random
from api.schema import PlayerState, Vec3, Vec2, AimAngles


def apply_cheat(player_state: dict, cheat_type: str, all_players: list[dict], game_map) -> dict:
    """Apply a cheat profile to a player's simulated state.
    
    Args:
        player_state: Mutable dict with player sim data (x, y, vx, vy, aim_yaw, etc.)
        cheat_type: One of: clean, aimbot, wallhack, speedhack, macro, collab
        all_players: All players for cross-player cheats
        game_map: The game map for LOS checks
    
    Returns:
        Modified player_state dict
    """
    if cheat_type == "clean":
        return player_state

    cheats = {
        "aimbot": _apply_aimbot,
        "wallhack": _apply_wallhack,
        "speedhack": _apply_speedhack,
        "macro": _apply_macro,
        "collab": _apply_collab,
    }

    fn = cheats.get(cheat_type)
    if fn:
        return fn(player_state, all_players, game_map)
    return player_state


def _apply_aimbot(state: dict, all_players: list[dict], game_map) -> dict:
    """Snap aim to nearest enemy with inhuman precision."""
    nearest = _find_nearest_enemy(state, all_players)
    if nearest:
        dx = nearest["x"] - state["x"]
        dy = nearest["y"] - state["y"]
        target_yaw = math.degrees(math.atan2(dy, dx))
        # Snap to target with tiny random jitter
        state["aim_yaw"] = target_yaw + random.gauss(0, 0.3)
        state["aim_delta_x"] = state["aim_yaw"] - state.get("prev_aim_yaw", state["aim_yaw"])
        state["aim_delta_y"] = random.gauss(0, 0.1)
    return state


def _apply_wallhack(state: dict, all_players: list[dict], game_map) -> dict:
    """Track enemies through walls — aim toward non-visible players."""
    for other in all_players:
        if other["team"] == state["team"] or other["player_id"] == state["player_id"]:
            continue
        # Aim toward enemies even through walls
        has_los = game_map.line_of_sight(state["x"], state["y"], other["x"], other["y"])
        if not has_los:
            dx = other["x"] - state["x"]
            dy = other["y"] - state["y"]
            target_yaw = math.degrees(math.atan2(dy, dx))
            # Slowly drift aim toward hidden player
            state["aim_yaw"] = state["aim_yaw"] * 0.7 + target_yaw * 0.3
            break
    return state


def _apply_speedhack(state: dict, all_players: list[dict], game_map) -> dict:
    """Move at 2.5x normal speed."""
    state["vx"] *= 2.5
    state["vy"] *= 2.5
    return state


def _apply_macro(state: dict, all_players: list[dict], game_map) -> dict:
    """Perfectly periodic recoil compensation."""
    # Sine-wave recoil comp — very regular, detectable by FFT
    tick = state.get("tick", 0)
    state["aim_delta_y"] = -0.8 * math.sin(tick * 0.5)
    state["aim_delta_x"] = 0.1 * math.cos(tick * 0.3)
    return state


def _apply_collab(state: dict, all_players: list[dict], game_map) -> dict:
    """Coordinate with teammate — mirror movement patterns.
    TODO: Make this more sophisticated with info sharing simulation.
    """
    # Find teammate
    for other in all_players:
        if other["team"] == state["team"] and other["player_id"] != state["player_id"]:
            # Mirror teammate's aim direction (ghosting)
            state["aim_yaw"] = other.get("aim_yaw", state["aim_yaw"])
            break
    return state


def _find_nearest_enemy(state: dict, all_players: list[dict]) -> dict | None:
    """Find the nearest enemy player."""
    nearest = None
    min_dist = float("inf")
    for other in all_players:
        if other["team"] == state["team"]:
            continue
        dx = other["x"] - state["x"]
        dy = other["y"] - state["y"]
        dist = math.sqrt(dx**2 + dy**2)
        if dist < min_dist:
            min_dist = dist
            nearest = other
    return nearest
