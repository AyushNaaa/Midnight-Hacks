"""GAT Inference Wrapper (§2B)

Loads the trained BehavioralMeshGAT and provides inference over the game tick data.
Constructs a PyTorch Geometric graph from TickData with expanded features:
  Node features (12): position, velocity, aim, health, visibility, team, alive
  Edge features (4):  distance, angle_from_aim, LOS, time_since_visible
"""
import torch
import math
import os
from torch_geometric.data import Data
from detection.models.gat import BehavioralMeshGAT
from api.schema import TickData


def _get_device() -> torch.device:
    """Select the best available device (CUDA > MPS > CPU)."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class GATInference:
    def __init__(self, weight_path="detection/models/weights/gat_v1.pt"):
        self.device = _get_device()
        self.model = BehavioralMeshGAT(
            node_features=12, edge_features=4,
            hidden_channels=32, heads=4, out_classes=2,
        )
        
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", weight_path))
        
        if os.path.exists(abs_path):
            self.model.load_state_dict(torch.load(abs_path, map_location=self.device, weights_only=True))
            print(f"[GAT] Loaded weights from {abs_path}")
        else:
            print(f"[GAT] Warning: Weights not found at {abs_path}. Using untrained initialization.")
            
        self.model.to(self.device)
        self.model.eval()

    def construct_graph(self, tick_data: TickData) -> tuple[Data, dict[str, int]] | None:
        """Construct a PyTorch Geometric Data object from the TickData.

        Returns:
            Tuple of (Data, pid_to_idx mapping) or None if no players.
        """
        if not tick_data.players:
            return None
            
        num_players = len(tick_data.players)
        
        # Build node features (12 per player)
        x = []
        pid_to_idx = {}
        for idx, p in enumerate(tick_data.players):
            pid_to_idx[p.player_id] = idx

            # Count how many players can see this player
            visible_to_count = len(p.visible_to)

            # Node features: [x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
            #                  health, visible_to_count, team, is_alive]
            # Team is approximated from player_id convention or defaults to 0
            team = 0.0  # Will be overridden if team info available
            is_alive = 1.0 if p.health > 0 else 0.0

            x.append([
                p.position.x, p.position.y,
                p.velocity.x, p.velocity.y,
                p.aim.pitch, p.aim.yaw,
                p.aim_delta.x, p.aim_delta.y,
                p.health / 100.0,  # Normalize health
                float(visible_to_count),
                team,
                is_alive,
            ])
            
        x = torch.tensor(x, dtype=torch.float32)
        
        # Build edges (fully connected, excluding self)
        edge_index = []
        edge_attr = []
        
        for i, p1 in enumerate(tick_data.players):
            for j, p2 in enumerate(tick_data.players):
                if i != j:
                    edge_index.append([i, j])
                    
                    # Distance (normalized)
                    dx = p1.position.x - p2.position.x
                    dy = p1.position.y - p2.position.y
                    dist = math.sqrt(dx ** 2 + dy ** 2)
                    
                    # Angle from p1's aim to p2
                    angle_to_p2 = math.degrees(math.atan2(dy, dx)) if (dx != 0 or dy != 0) else 0.0
                    aim_angle = p1.aim.yaw
                    angle_diff = abs((angle_to_p2 - aim_angle + 180) % 360 - 180)
                    
                    # Line of sight
                    has_los = 1.0 if p1.player_id in p2.visible_to else 0.0
                    
                    # Time since visible (approximated — 0 if currently visible, else 1.0)
                    time_since = 0.0 if has_los > 0.5 else 1.0
                    
                    edge_attr.append([
                        dist / 100.0,          # Normalized distance
                        angle_diff / 180.0,    # Normalized angle difference
                        has_los,
                        time_since,
                    ])
                    
        if not edge_index:
            return None
            
        edge_index = torch.tensor(edge_index, dtype=torch.long).t().contiguous()
        edge_attr = torch.tensor(edge_attr, dtype=torch.float32)
        
        return Data(x=x, edge_index=edge_index, edge_attr=edge_attr), pid_to_idx

    @torch.no_grad()
    def predict(self, tick_data: TickData) -> dict[str, dict[str, float]]:
        """Run inference on the current game tick to detect spatial cheats.
        
        Returns:
            Dict mapping player_id to {"wallhack": float, "collab": float}
        """
        result = self.construct_graph(tick_data)
        if not result:
            return {}
            
        graph, pid_to_idx = result
        graph = graph.to(self.device)
        
        # GAT Forward pass
        scores = self.model(graph.x, graph.edge_index, graph.edge_attr)
        scores = scores.cpu().tolist()
        
        verdicts = {}
        for pid, idx in pid_to_idx.items():
            verdicts[pid] = {
                "wallhack": scores[idx][0],
                "collab": scores[idx][1]
            }
            
        return verdicts
