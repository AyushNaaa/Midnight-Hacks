"""GAT Inference Wrapper (§2B)

Loads the trained BehavioralMeshGAT and provides inference over the game tick data.
"""
import torch
import os
from torch_geometric.data import Data
from detection.models.gat import BehavioralMeshGAT
from api.schema import TickData

class GATInference:
    def __init__(self, weight_path="detection/models/weights/gat_v1.pt"):
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        self.model = BehavioralMeshGAT(node_features=5, edge_features=2, hidden_channels=32, heads=4, out_classes=2)
        
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", weight_path))
        
        if os.path.exists(abs_path):
            self.model.load_state_dict(torch.load(abs_path, map_location=self.device, weights_only=True))
            print(f"[GAT] Loaded weights from {abs_path}")
        else:
            print(f"[GAT] Warning: Weights not found at {abs_path}. Using untrained initialization.")
            
        self.model.to(self.device)
        self.model.eval()

    def construct_graph(self, tick_data: TickData) -> Data | None:
        """Construct a PyTorch Geometric Data object from the TickData."""
        if not tick_data.players:
            return None
            
        num_players = len(tick_data.players)
        
        # Build node features
        x = []
        pid_to_idx = {}
        for idx, p in enumerate(tick_data.players):
            pid_to_idx[p.player_id] = idx
            # Node features: [x, y, vx, vy, team]
            # Since we don't have explicit team in schema, we approximate (e.g. by spawn side or just 0)
            team = 0.0 # Placeholder
            x.append([p.position.x, p.position.y, p.velocity.x, p.velocity.y, team])
            
        x = torch.tensor(x, dtype=torch.float32)
        
        # Build edges
        edge_index = []
        edge_attr = []
        
        for i, p1 in enumerate(tick_data.players):
            for j, p2 in enumerate(tick_data.players):
                if i != j:
                    edge_index.append([i, j])
                    
                    dx = p1.position.x - p2.position.x
                    dy = p1.position.y - p2.position.y
                    dist = (dx**2 + dy**2)**0.5
                    
                    has_los = 1.0 if p1.player_id in p2.visible_to else 0.0
                    edge_attr.append([dist / 100.0, has_los])
                    
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
