"""Transformer Inference Wrapper (§2A)

Loads the trained BehavioralTransformer and runs inference on player
history windows. Extracts 9 features including derived acceleration
and jitter from sequential state deltas. Cross-platform: CUDA/MPS/CPU.
"""
import torch, math, os
from detection.models.transformer import BehavioralTransformer
from api.schema import PlayerState

def _dev():
    if torch.cuda.is_available(): return torch.device("cuda")
    if hasattr(torch.backends,"mps") and torch.backends.mps.is_available(): return torch.device("mps")
    return torch.device("cpu")

class TransformerInference:
    def __init__(self, weight_path="detection/models/weights/transformer_v1.pt"):
        self.device = _dev()
        self.model = BehavioralTransformer(input_dim=9, d_model=64, n_heads=4, n_layers=6)
        ap = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", weight_path))
        if os.path.exists(ap):
            self.model.load_state_dict(torch.load(ap, map_location=self.device, weights_only=True))
            print(f"[Transformer] Loaded weights from {ap}")
        else:
            print(f"[Transformer] No weights at {ap} — using untrained init")
        self.model.to(self.device).eval()

    def extract_features(self, history: list[PlayerState]) -> torch.Tensor:
        """Convert PlayerState history → [seq_len, 9] tensor.

        Features: aim_dx, aim_dy, speed, accel, ang_vel, jitter,
                  state_flags, event_flags, delta_time
        """
        feats = []; prev_spd = None; jitter_win = []
        for s in history:
            spd = math.sqrt(s.velocity.x**2 + s.velocity.y**2 + s.velocity.z**2)
            acc = (spd - prev_spd) if prev_spd is not None else 0.0
            prev_spd = spd
            av = math.sqrt(s.aim_delta.x**2 + s.aim_delta.y**2)
            jitter_win.append(s.aim_delta.x)
            if len(jitter_win) > 5: jitter_win.pop(0)
            if len(jitter_win) >= 3:
                mu = sum(jitter_win)/len(jitter_win)
                jit = sum((d-mu)**2 for d in jitter_win)/len(jitter_win)
            else: jit = 0.0
            feats.append([s.aim_delta.x, s.aim_delta.y, spd, acc, av, jit,
                          float(s.state_flags), 0.0, 0.0156])
        while len(feats) < 128: feats.insert(0, [0.0]*9)
        return torch.tensor(feats[-128:], dtype=torch.float32)

    @torch.no_grad()
    def predict(self, history: list[PlayerState]) -> dict[str, float]:
        if len(history) < 10:
            return {"aim":0,"reaction":0,"macro":0,"speed":0,"tracking":0}
        x = self.extract_features(history).unsqueeze(0).to(self.device)
        _, scores = self.model(x)
        s = scores[0].cpu().tolist()
        return {"aim":s[0],"reaction":s[1],"macro":s[2],"speed":s[3],"tracking":s[4]}
