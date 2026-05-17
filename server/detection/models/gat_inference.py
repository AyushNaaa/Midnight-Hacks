"""GAT Inference Wrapper (§2B)

Loads the trained BehavioralMeshGAT and runs inference on game tick data.
Constructs PyG graphs with 12 node + 4 edge features. Cross-platform.
"""
import torch, math, os
from torch_geometric.data import Data
from detection.models.gat import BehavioralMeshGAT
from api.schema import TickData

def _dev():
    if torch.cuda.is_available(): return torch.device("cuda")
    if hasattr(torch.backends,"mps") and torch.backends.mps.is_available(): return torch.device("mps")
    return torch.device("cpu")

class GATInference:
    def __init__(self, weight_path="detection/models/weights/gat_v1.pt"):
        self.device = _dev()
        self.model = BehavioralMeshGAT(node_features=12, edge_features=4,
                                        hidden_channels=32, heads=4, out_classes=2)
        ap = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", weight_path))
        if os.path.exists(ap):
            self.model.load_state_dict(torch.load(ap, map_location=self.device, weights_only=True))
            print(f"[GAT] Loaded weights from {ap}")
        else:
            print(f"[GAT] No weights at {ap} — using untrained init")
        self.model.to(self.device).eval()

    def _build_graph(self, td: TickData):
        if not td.players: return None
        n = len(td.players)
        x = []; pid_map = {}
        for i, p in enumerate(td.players):
            pid_map[p.player_id] = i
            alive = 1.0 if p.health > 0 else 0.0
            x.append([p.position.x, p.position.y, p.velocity.x, p.velocity.y,
                      p.aim.pitch, p.aim.yaw, p.aim_delta.x, p.aim_delta.y,
                      p.health/100, float(len(p.visible_to)), 0.0, alive])
        x = torch.tensor(x, dtype=torch.float32)
        ei = []; ea = []
        for i, p1 in enumerate(td.players):
            for j, p2 in enumerate(td.players):
                if i == j: continue
                ei.append([i, j])
                dx = p1.position.x - p2.position.x
                dy = p1.position.y - p2.position.y
                d = math.sqrt(dx**2 + dy**2)
                a2 = math.degrees(math.atan2(dy, dx)) if (dx or dy) else 0
                ad = abs((a2 - p1.aim.yaw + 180) % 360 - 180)
                los = 1.0 if p1.player_id in p2.visible_to else 0.0
                tsv = 0.0 if los > 0.5 else 1.0
                ea.append([d/100, ad/180, los, tsv])
        if not ei: return None
        return (Data(x=x,
                     edge_index=torch.tensor(ei, dtype=torch.long).t().contiguous(),
                     edge_attr=torch.tensor(ea, dtype=torch.float32)),
                pid_map)

    @torch.no_grad()
    def predict(self, td: TickData) -> dict[str, dict[str, float]]:
        r = self._build_graph(td)
        if not r: return {}
        g, pm = r; g = g.to(self.device)
        s = self.model(g.x, g.edge_index, g.edge_attr).cpu().tolist()
        return {pid: {"wallhack": s[i][0], "collab": s[i][1]} for pid, i in pm.items()}
