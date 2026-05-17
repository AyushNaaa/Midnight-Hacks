"""Synthetic mesh data generator for GAT training (§2C.1).

Generates game state graphs with 10 players (nodes) and their spatial
relationships (edges). Supports 4 cheat profiles:
  - clean     : normal human gameplay
  - wallhack  : acting on information about invisible players
  - ESP       : pre-aiming at hidden targets (more subtle than wallhack)
  - collab    : two players sharing hidden information (coordinated movement)

Node features (12): [x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
                      health, visible_to_count, team, is_alive]
Edge features (4):  [distance, angle_from_aim, is_LOS, time_since_visible]
Labels per node (2): [is_wallhacking, is_collabing]
"""
import torch
import numpy as np
import random
import math
import os
from torch_geometric.data import Data


def _angle_between(pos_from: torch.Tensor, pos_to: torch.Tensor) -> float:
    """Compute angle in degrees from pos_from to pos_to."""
    dx = pos_to[0].item() - pos_from[0].item()
    dy = pos_to[1].item() - pos_from[1].item()
    return math.degrees(math.atan2(dy, dx))


def _generate_clean_player(pos_range: float = 100.0, team: float = 0.0) -> torch.Tensor:
    """Generate a single clean player node feature vector (12 features)."""
    x = random.uniform(0, pos_range)
    y = random.uniform(0, pos_range)
    vx = random.gauss(0, 2.0)
    vy = random.gauss(0, 2.0)
    aim_pitch = random.gauss(0, 15.0)
    aim_yaw = random.uniform(-180, 180)
    aim_dx = random.gauss(0, 0.5)
    aim_dy = random.gauss(0, 0.3)
    health = random.uniform(20, 100)
    visible_to_count = 0.0  # Will be computed after edges
    is_alive = 1.0
    return torch.tensor([x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
                         health, visible_to_count, team, is_alive])


def generate_synthetic_mesh_data(
    num_graphs: int = 2000,
    num_players: int = 10,
    save_path: str = "data/synthetic_gat.pt",
):
    """Generate synthetic graph datasets for GAT training.

    Each graph represents a single tick of a game with 10 players.
    Cheat behaviors are injected at the node/edge feature level.
    """
    print(f"Generating {num_graphs} synthetic graph states...")

    data_list = []

    for g_idx in range(num_graphs):
        # 1. Generate all players
        node_features = []
        for p in range(num_players):
            team = 0.0 if p < num_players // 2 else 1.0
            node_features.append(_generate_clean_player(team=team))

        x = torch.stack(node_features)  # [num_players, 12]
        positions = x[:, :2]  # [num_players, 2]
        aim_yaws = x[:, 5]    # [num_players]

        # 2. Decide cheat injection
        y = torch.zeros(num_players, 2)  # [wallhack, collab]

        profile = random.choices(
            ["clean", "wallhack", "esp", "collab"],
            weights=[0.4, 0.25, 0.15, 0.2],
        )[0]

        cheater_indices = []
        collab_pair = None

        if profile == "wallhack":
            num_cheaters = random.randint(1, 2)
            cheater_indices = random.sample(range(num_players), num_cheaters)
            for idx in cheater_indices:
                y[idx, 0] = 1.0  # wallhack label

        elif profile == "esp":
            # ESP is a subtle form of wallhack
            idx = random.randint(0, num_players - 1)
            cheater_indices = [idx]
            y[idx, 0] = 1.0  # wallhack label (ESP is a subset)

        elif profile == "collab":
            # Pick two players on the same team
            team_0 = list(range(num_players // 2))
            team_1 = list(range(num_players // 2, num_players))
            team = random.choice([team_0, team_1])
            collab_pair = random.sample(team, 2)
            for idx in collab_pair:
                y[idx, 1] = 1.0  # collab label

        # 3. Build edges (fully connected, excluding self)
        edge_src = []
        edge_dst = []
        edge_features = []

        for i in range(num_players):
            for j in range(num_players):
                if i == j:
                    continue

                edge_src.append(i)
                edge_dst.append(j)

                # Distance (normalized by map size)
                dist = torch.norm(positions[i] - positions[j]).item()
                norm_dist = dist / 100.0

                # Angle from player i's aim to player j
                angle_to_j = _angle_between(positions[i], positions[j])
                aim_angle = aim_yaws[i].item()
                angle_diff = abs((angle_to_j - aim_angle + 180) % 360 - 180)
                norm_angle = angle_diff / 180.0  # 0 = looking right at them

                # Line of sight (distance-based probability with randomness)
                prob_los = max(0.0, 0.8 - (dist / 120.0))
                has_los = 1.0 if random.random() < prob_los else 0.0

                # Time since visible (random, normalized 0-1)
                time_since = random.uniform(0.0, 1.0) if has_los < 0.5 else 0.0

                edge_features.append([norm_dist, norm_angle, has_los, time_since])

        edge_index = torch.tensor([edge_src, edge_dst], dtype=torch.long)
        edge_attr = torch.tensor(edge_features, dtype=torch.float32)

        # 4. Inject cheat behaviors into node/edge features
        if profile == "wallhack":
            for idx in cheater_indices:
                # Wallhacker aims toward hidden targets
                # Pick a random non-visible opponent
                opponents = [j for j in range(num_players)
                             if j != idx and x[j, 10] != x[idx, 10]]
                if opponents:
                    target = random.choice(opponents)
                    target_angle = _angle_between(positions[idx], positions[target])
                    # Aim yaw tracks hidden target (within 5 degrees)
                    x[idx, 5] = target_angle + random.gauss(0, 2.0)
                    # Reduced aim delta (confident tracking)
                    x[idx, 6] = random.gauss(0, 0.1)
                    x[idx, 7] = random.gauss(0, 0.08)
                    # Slightly faster movement toward target
                    dx = positions[target][0] - positions[idx][0]
                    dy = positions[target][1] - positions[idx][1]
                    mag = math.sqrt(dx.item() ** 2 + dy.item() ** 2) + 0.01
                    x[idx, 2] = (dx / mag).item() * random.uniform(2.0, 4.0)
                    x[idx, 3] = (dy / mag).item() * random.uniform(2.0, 4.0)

        elif profile == "esp":
            idx = cheater_indices[0]
            # ESP: pre-aiming — aim yaw biased toward nearest hidden enemy
            opponents = [j for j in range(num_players)
                         if j != idx and x[j, 10] != x[idx, 10]]
            if opponents:
                # Aim between two nearest enemies (subtler than wallhack)
                dists_to_enemies = [(j, torch.norm(positions[idx] - positions[j]).item())
                                    for j in opponents]
                dists_to_enemies.sort(key=lambda t: t[1])
                nearest = dists_to_enemies[0][0]
                angle_to_nearest = _angle_between(positions[idx], positions[nearest])
                # Aim is biased toward hidden target but not perfectly
                x[idx, 5] = angle_to_nearest + random.gauss(0, 8.0)

        elif profile == "collab" and collab_pair:
            p1, p2 = collab_pair
            # Coordinated movement: both move in similar direction
            shared_vx = random.gauss(0, 3.0)
            shared_vy = random.gauss(0, 3.0)
            x[p1, 2] = shared_vx + random.gauss(0, 0.3)
            x[p1, 3] = shared_vy + random.gauss(0, 0.3)
            x[p2, 2] = shared_vx + random.gauss(0, 0.3)
            x[p2, 3] = shared_vy + random.gauss(0, 0.3)
            # Similar aim direction (info sharing)
            shared_yaw = random.uniform(-180, 180)
            x[p1, 5] = shared_yaw + random.gauss(0, 5.0)
            x[p2, 5] = shared_yaw + random.gauss(0, 5.0)

        # 5. Compute visible_to_count per node (feature index 9)
        for i in range(num_players):
            vis_count = 0
            for j in range(num_players):
                if i == j:
                    continue
                # Find edge j→i and check LOS
                edge_idx = j * (num_players - 1) + (i if i < j else i - 1)
                if edge_idx < edge_attr.size(0) and edge_attr[edge_idx, 2] > 0.5:
                    vis_count += 1
            x[i, 9] = float(vis_count)

        graph = Data(x=x, edge_index=edge_index, edge_attr=edge_attr, y=y)
        data_list.append(graph)

        if (g_idx + 1) % 500 == 0:
            print(f"  Generated {g_idx + 1}/{num_graphs} graphs...")

    os.makedirs(os.path.dirname(save_path) if os.path.dirname(save_path) else ".", exist_ok=True)
    torch.save(data_list, save_path)
    print(f"\nDataset saved to {save_path}")


if __name__ == "__main__":
    generate_synthetic_mesh_data()
