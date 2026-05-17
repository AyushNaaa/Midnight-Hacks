"""Transformer Inference Wrapper (§2A)

Loads the trained BehavioralTransformer and provides a clean inference method.
"""
import torch
import os
from detection.models.transformer import BehavioralTransformer
from api.schema import PlayerState

class TransformerInference:
    def __init__(self, weight_path="detection/models/weights/transformer_v1.pt"):
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        self.model = BehavioralTransformer(input_dim=9, d_model=64, n_heads=4, n_layers=4)
        
        # Determine actual absolute path robustly
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", weight_path))
        
        if os.path.exists(abs_path):
            self.model.load_state_dict(torch.load(abs_path, map_location=self.device, weights_only=True))
            print(f"[Transformer] Loaded weights from {abs_path}")
        else:
            print(f"[Transformer] Warning: Weights not found at {abs_path}. Using untrained initialization.")
            
        self.model.to(self.device)
        self.model.eval()
        
    def extract_features(self, history: list[PlayerState]) -> torch.Tensor:
        """Convert a list of PlayerState into a tensor [seq_len, 9]"""
        features = []
        for state in history:
            # 9 features: [aim_x, aim_y, vel, accel, ang_vel, jitter, flags, events, dt]
            # Since we don't track acceleration/jitter explicitly in rules yet, we derive basic features
            vx, vy, vz = state.velocity.x, state.velocity.y, state.velocity.z
            speed = (vx**2 + vy**2 + vz**2)**0.5
            
            f = [
                state.aim_delta.x, 
                state.aim_delta.y,
                speed,
                0.0, # accel (mock)
                abs(state.aim_delta.x) + abs(state.aim_delta.y), # ang vel
                0.0, # jitter (mock)
                float(state.state_flags),
                0.0, # event flags (mock)
                0.0156 # dt (approx 64 tick)
            ]
            features.append(f)
            
        # Pad if history is less than 128
        while len(features) < 128:
            features.insert(0, [0.0] * 9)
            
        return torch.tensor(features, dtype=torch.float32)

    @torch.no_grad()
    def predict(self, history: list[PlayerState]) -> dict[str, float]:
        """Run inference on a single player's history window."""
        if len(history) < 10:
            return {"aim": 0.0, "reaction": 0.0, "macro": 0.0, "speed": 0.0, "tracking": 0.0}
            
        x = self.extract_features(history).unsqueeze(0).to(self.device) # Add batch dim
        
        _, cheat_scores = self.model(x)
        scores = cheat_scores[0].cpu().tolist()
        
        return {
            "aim": scores[0],
            "reaction": scores[1],
            "macro": scores[2],
            "speed": scores[3],
            "tracking": scores[4]
        }
