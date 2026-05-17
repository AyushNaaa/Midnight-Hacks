"""Transformer Inference Wrapper (§2A)

Loads the trained BehavioralTransformer and provides a clean inference method.
Extracts 9 features from player history, including derived features
(acceleration, jitter) computed from sequential state deltas.
"""
import torch
import math
import os
from detection.models.transformer import BehavioralTransformer
from api.schema import PlayerState


def _get_device() -> torch.device:
    """Select the best available device (CUDA > MPS > CPU)."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class TransformerInference:
    def __init__(self, weight_path="detection/models/weights/transformer_v1.pt"):
        self.device = _get_device()
        self.model = BehavioralTransformer(input_dim=9, d_model=64, n_heads=4, n_layers=6)
        
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
        """Convert a list of PlayerState into a tensor [seq_len, 9].

        Features:
          0: aim_delta_x    — frame-to-frame horizontal aim change
          1: aim_delta_y    — frame-to-frame vertical aim change
          2: velocity       — speed magnitude (from velocity vector)
          3: acceleration   — speed change between consecutive ticks
          4: angular_velocity — magnitude of aim change
          5: jitter         — variance of aim delta over a small window
          6: state_flags    — bitmask (crouch, ADS, sprint, etc.)
          7: event_flags    — fire/reload events (approximated from state)
          8: delta_time     — time between ticks (~15.6ms at 64 tick/s)
        """
        features = []
        prev_speed = None
        aim_dx_window = []

        for i, state in enumerate(history):
            vx, vy, vz = state.velocity.x, state.velocity.y, state.velocity.z
            speed = math.sqrt(vx ** 2 + vy ** 2 + vz ** 2)

            # Acceleration: change in speed from previous tick
            if prev_speed is not None:
                accel = speed - prev_speed
            else:
                accel = 0.0
            prev_speed = speed

            # Angular velocity: magnitude of aim delta
            ang_vel = math.sqrt(state.aim_delta.x ** 2 + state.aim_delta.y ** 2)

            # Jitter: rolling variance of aim_delta over last 5 ticks
            aim_dx_window.append(state.aim_delta.x)
            if len(aim_dx_window) > 5:
                aim_dx_window.pop(0)
            if len(aim_dx_window) >= 3:
                mean_dx = sum(aim_dx_window) / len(aim_dx_window)
                jitter = sum((d - mean_dx) ** 2 for d in aim_dx_window) / len(aim_dx_window)
            else:
                jitter = 0.0

            f = [
                state.aim_delta.x,
                state.aim_delta.y,
                speed,
                accel,
                ang_vel,
                jitter,
                float(state.state_flags),
                0.0,   # event_flags — populated when events are tracked per-player
                0.0156,  # dt (approx 64 tick)
            ]
            features.append(f)
            
        # Pad if history is less than 128
        while len(features) < 128:
            features.insert(0, [0.0] * 9)
            
        # Truncate if longer than 128
        features = features[-128:]
            
        return torch.tensor(features, dtype=torch.float32)

    @torch.no_grad()
    def predict(self, history: list[PlayerState]) -> dict[str, float]:
        """Run inference on a single player's history window."""
        if len(history) < 10:
            return {"aim": 0.0, "reaction": 0.0, "macro": 0.0, "speed": 0.0, "tracking": 0.0}
            
        x = self.extract_features(history).unsqueeze(0).to(self.device)  # Add batch dim
        
        _, cheat_scores = self.model(x)
        scores = cheat_scores[0].cpu().tolist()
        
        return {
            "aim": scores[0],
            "reaction": scores[1],
            "macro": scores[2],
            "speed": scores[3],
            "tracking": scores[4]
        }
