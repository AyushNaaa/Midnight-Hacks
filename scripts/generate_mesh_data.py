"""Synthetic mesh data generator for GAT training (§2C.1).

Generates PyTorch Geometric graph datasets representing 10-player game
snapshots. Each graph is one tick of a match. Supports 4 behavioral
profiles: clean, wallhack, ESP, collab.

Node features (12): x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
                     health, visible_to_count, team, is_alive
Edge features  (4): distance, angle_from_aim, is_LOS, time_since_visible
Labels per node (2): [is_wallhacking, is_collabing]

Usage:
    python scripts/generate_mesh_data.py
    # Output: data/synthetic_gat.pt
"""
import torch
import numpy as np
import random
import math
import os
from torch_geometric.data import Data


def _angle_from_to(src: torch.Tensor, dst: torch.Tensor) -> float:
    """Angle in degrees from src position to dst position."""
    dx = dst[0].item() - src[0].item()
    dy = dst[1].item() - src[1].item()
    return math.degrees(math.atan2(dy, dx))


def _make_player(team: float = 0.0) -> torch.Tensor:
    """Generate one clean player feature vector (12 dims)."""
    return torch.tensor([
        random.uniform(0, 100),       # x
        random.uniform(0, 100),       # y
        random.gauss(0, 2.0),         # vx
        random.gauss(0, 2.0),         # vy
        random.gauss(0, 15.0),        # aim_pitch
        random.uniform(-180, 180),    # aim_yaw
        random.gauss(0, 0.5),         # aim_dx
        random.gauss(0, 0.3),         # aim_dy
        random.uniform(20, 100),      # health
        0.0,                          # visible_to_count (computed later)
        team,                         # team
        1.0,                          # is_alive
    ])


def generate_synthetic_mesh_data(
    num_graphs: int = 2000,
    num_players: int = 10,
    save_path: str = "data/synthetic_gat.pt",
) -> None:
    """Generate synthetic graph dataset for GAT training."""
    print(f"[generate_mesh_data] Generating {num_graphs} graphs ({num_players} players each)…")
    data_list = []

    for g in range(num_graphs):
        # --- Node features ---
        x = torch.stack([_make_player(0.0 if p < num_players // 2 else 1.0)
                         for p in range(num_players)])
        pos = x[:, :2]
        yaw = x[:, 5]

        # --- Labels ---
        y = torch.zeros(num_players, 2)  # [wallhack, collab]

        profile = random.choices(
            ["clean", "wallhack", "esp", "collab"],
            weights=[0.4, 0.25, 0.15, 0.2],
        )[0]

        cheaters = []
        collab_pair = None

        if profile == "wallhack":
            cheaters = random.sample(range(num_players), random.randint(1, 2))
            for c in cheaters:
                y[c, 0] = 1.0
        elif profile == "esp":
            c = random.randint(0, num_players - 1)
            cheaters = [c]
            y[c, 0] = 1.0
        elif profile == "collab":
            team = list(range(num_players // 2)) if random.random() < 0.5 \
                   else list(range(num_players // 2, num_players))
            collab_pair = random.sample(team, 2)
            for c in collab_pair:
                y[c, 1] = 1.0

        # --- Edges (fully connected, no self-loops) ---
        src, dst, eattr = [], [], []
        for i in range(num_players):
            for j in range(num_players):
                if i == j:
                    continue
                src.append(i)
                dst.append(j)
                d = torch.norm(pos[i] - pos[j]).item()
                ang = _angle_from_to(pos[i], pos[j])
                diff = abs((ang - yaw[i].item() + 180) % 360 - 180)
                p_los = max(0.0, 0.8 - d / 120.0)
                los = 1.0 if random.random() < p_los else 0.0
                tsv = random.uniform(0.0, 1.0) if los < 0.5 else 0.0
                eattr.append([d / 100.0, diff / 180.0, los, tsv])

        edge_index = torch.tensor([src, dst], dtype=torch.long)
        edge_attr  = torch.tensor(eattr, dtype=torch.float32)

        # --- Inject cheat behaviors ---
        if profile == "wallhack":
            for c in cheaters:
                opps = [j for j in range(num_players) if j != c and x[j, 10] != x[c, 10]]
                if opps:
                    t = random.choice(opps)
                    x[c, 5] = _angle_from_to(pos[c], pos[t]) + random.gauss(0, 2.0)
                    x[c, 6] = random.gauss(0, 0.1)
                    x[c, 7] = random.gauss(0, 0.08)
                    dx = pos[t][0] - pos[c][0]
                    dy = pos[t][1] - pos[c][1]
                    m = math.sqrt(dx.item()**2 + dy.item()**2) + 0.01
                    x[c, 2] = (dx / m).item() * random.uniform(2, 4)
                    x[c, 3] = (dy / m).item() * random.uniform(2, 4)

        elif profile == "esp" and cheaters:
            c = cheaters[0]
            opps = [j for j in range(num_players) if j != c and x[j, 10] != x[c, 10]]
            if opps:
                dists = [(j, torch.norm(pos[c] - pos[j]).item()) for j in opps]
                dists.sort(key=lambda t: t[1])
                x[c, 5] = _angle_from_to(pos[c], pos[dists[0][0]]) + random.gauss(0, 8)

        elif profile == "collab" and collab_pair:
            a, b = collab_pair
            sv = random.gauss(0, 3.0)
            sw = random.gauss(0, 3.0)
            x[a, 2] = sv + random.gauss(0, 0.3)
            x[a, 3] = sw + random.gauss(0, 0.3)
            x[b, 2] = sv + random.gauss(0, 0.3)
            x[b, 3] = sw + random.gauss(0, 0.3)
            sy = random.uniform(-180, 180)
            x[a, 5] = sy + random.gauss(0, 5)
            x[b, 5] = sy + random.gauss(0, 5)

        # --- Compute visible_to_count ---
        for i in range(num_players):
            vis = 0
            for j in range(num_players):
                if i == j:
                    continue
                eidx = j * (num_players - 1) + (i if i < j else i - 1)
                if eidx < edge_attr.size(0) and edge_attr[eidx, 2] > 0.5:
                    vis += 1
            x[i, 9] = float(vis)

        data_list.append(Data(x=x, edge_index=edge_index, edge_attr=edge_attr, y=y))

        if (g + 1) % 500 == 0:
            print(f"  {g + 1}/{num_graphs}")

    os.makedirs(os.path.dirname(save_path) or ".", exist_ok=True)
    torch.save(data_list, save_path)
    print(f"\n✓ Saved to {save_path}")


if __name__ == "__main__":
    generate_synthetic_mesh_data()
