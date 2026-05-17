"""Synthetic cheat data generator for Transformer training (§2C.1).

Generates 10,000+ sequences across 7 cheat profiles for training
the BehavioralTransformer model. Each sequence is 128 ticks of
9 input features, matching the model's expected input format.

Cheat Profiles:
  0 - aimbot_perfect    : instant snap-to-target, zero jitter post-lock
  1 - aimbot_humanized  : fast aim with slight overshoot and residual jitter
  2 - triggerbot        : fires with inhuman reaction-time consistency
  3 - spinbot           : continuous high angular velocity rotation
  4 - recoil_script     : periodic downward aim compensation while firing
  5 - macro_bot         : perfectly periodic bhop/fire inputs
  6 - wallhack_aim      : smooth confident tracking toward hidden targets

Usage:
    python scripts/generate_cheat_data.py
    # Output: data/synthetic_transformer.pt
"""
import torch
import numpy as np
import random
import os
import math


# ---------------------------------------------------------------------------
# Clean (Human) Baseline Generator
# ---------------------------------------------------------------------------

def _smooth_noise(seq_len: int, scale: float = 0.1) -> torch.Tensor:
    """Generate smooth random-walk noise simulating natural human input jitter."""
    return torch.cumsum(torch.randn(seq_len) * scale, dim=0)


def _generate_clean_sequence(seq_len: int = 128, input_dim: int = 9) -> torch.Tensor:
    """Generate one clean (human) behavior sequence.

    Features per tick (9):
      0: aim_delta_x      — horizontal crosshair movement
      1: aim_delta_y      — vertical crosshair movement
      2: velocity         — player speed magnitude
      3: acceleration     — speed change between ticks
      4: angular_velocity — magnitude of aim change
      5: jitter           — high-freq aim noise (human = nonzero)
      6: state_flags      — crouch/ADS/sprint bitmask
      7: event_flags      — fire/reload/jump
      8: delta_time       — inter-tick timing (~15.6 ms at 64 tick/s)
    """
    seq = torch.zeros(seq_len, input_dim)

    # Aim deltas — small movements with occasional flicks
    seq[:, 0] = _smooth_noise(seq_len, 0.15)
    seq[:, 1] = _smooth_noise(seq_len, 0.12)

    # Velocity — human movement with natural variation
    base_speed = random.uniform(1.0, 4.0)
    seq[:, 2] = base_speed + _smooth_noise(seq_len, 0.3)

    # Acceleration — derivative of velocity
    seq[:, 3] = torch.diff(seq[:, 2], prepend=torch.tensor([base_speed]))
    seq[:, 3] += torch.randn(seq_len) * 0.05

    # Angular velocity — magnitude of aim change
    seq[:, 4] = torch.sqrt(seq[:, 0] ** 2 + seq[:, 1] ** 2)
    seq[:, 4] += torch.randn(seq_len).abs() * 0.02

    # Jitter — always-present small noise (humans are never perfectly still)
    seq[:, 5] = torch.randn(seq_len).abs() * 0.08

    # State flags — occasional stance changes
    seq[:, 6] = (torch.rand(seq_len) > 0.92).float()

    # Event flags — sparse fire/reload
    seq[:, 7] = (torch.rand(seq_len) > 0.95).float()

    # Delta time — 64 tick/s with natural network jitter
    seq[:, 8] = 0.0156 + torch.randn(seq_len) * 0.001

    return seq


# ---------------------------------------------------------------------------
# Cheat Injectors — each modifies a clean sequence in-place
# ---------------------------------------------------------------------------

def _inject_aimbot_perfect(seq: torch.Tensor) -> torch.Tensor:
    """Perfect aimbot: instant snap-to-target, zero jitter post-lock."""
    for _ in range(random.randint(2, 5)):
        t = random.randint(10, seq.size(0) - 10)
        snap_mag = random.uniform(12.0, 25.0)
        # Massive instantaneous aim movement
        seq[t, 0] = random.uniform(5.0, 15.0) * random.choice([-1, 1])
        seq[t, 1] = random.uniform(3.0, 10.0) * random.choice([-1, 1])
        seq[t, 4] = snap_mag  # Angular velocity spike
        # Perfect lock: zero movement and zero jitter after snap
        lock_end = min(t + random.randint(5, 15), seq.size(0))
        seq[t + 1:lock_end, 0] = 0.01
        seq[t + 1:lock_end, 1] = 0.01
        seq[t:lock_end, 5] = 0.0  # Zero jitter
    return seq


def _inject_aimbot_humanized(seq: torch.Tensor) -> torch.Tensor:
    """Humanized aimbot: fast correction with overshoot and reduced jitter."""
    for _ in range(random.randint(2, 4)):
        t = random.randint(10, seq.size(0) - 10)
        # Fast but not instant
        seq[t, 4] += random.uniform(6.0, 12.0)
        seq[t, 0] = random.uniform(3.0, 8.0) * random.choice([-1, 1])
        seq[t, 1] = random.uniform(2.0, 6.0) * random.choice([-1, 1])
        # Overshoot correction 1-2 ticks later
        if t + 2 < seq.size(0):
            seq[t + 1, 0] = -seq[t, 0] * random.uniform(0.05, 0.15)
            seq[t + 1, 1] = -seq[t, 1] * random.uniform(0.05, 0.15)
        # Reduced jitter during tracking (but not zero — that's the humanization)
        lock_end = min(t + random.randint(3, 8), seq.size(0))
        seq[t:lock_end, 5] *= 0.3
    return seq


def _inject_triggerbot(seq: torch.Tensor) -> torch.Tensor:
    """Triggerbot: fires with impossibly consistent sub-frame timing."""
    for _ in range(random.randint(3, 6)):
        t = random.randint(10, seq.size(0) - 15)
        burst = random.randint(3, 8)
        for k in range(burst):
            if t + k < seq.size(0):
                seq[t + k, 7] = 1.0   # Fire event every tick
                seq[t + k, 8] = 0.0156  # Perfectly consistent timing
    return seq


def _inject_spinbot(seq: torch.Tensor) -> torch.Tensor:
    """Spinbot: continuous mechanical rotation at inhuman speed."""
    start = random.randint(5, 30)
    length = random.randint(40, 90)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    spin_speed = random.uniform(8.0, 20.0)
    seq[start:end, 0] = spin_speed  # Constant aim_delta_x
    seq[start:end, 4] = spin_speed  # Constant angular velocity
    seq[start:end, 1] = torch.sin(t * 0.5) * 0.5  # Slight y oscillation
    seq[start:end, 5] = 0.0  # No jitter
    return seq


def _inject_recoil_script(seq: torch.Tensor) -> torch.Tensor:
    """Recoil script: periodic downward compensation during sustained fire."""
    start = random.randint(10, 40)
    length = random.randint(30, 70)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    period = random.uniform(2.0, 4.0)
    amplitude = random.uniform(0.3, 0.8)
    seq[start:end, 1] = -amplitude * torch.abs(torch.sin(t / period * math.pi))
    seq[start:end, 7] = 1.0   # Firing throughout
    seq[start:end, 5] = 0.01  # Mechanically precise
    return seq


def _inject_macro_bot(seq: torch.Tensor) -> torch.Tensor:
    """Macro bot: perfectly periodic bhop + fire timing."""
    start = random.randint(5, 20)
    length = random.randint(50, 100)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    bhop_period = random.choice([3, 4, 5, 6])
    fire_period = random.choice([2, 3, 4])
    seq[start:end, 6] = (t % bhop_period == 0).float()
    seq[start:end, 7] = (t % fire_period == 0).float()
    seq[start:end, 1] += torch.sin(t * 2 * math.pi / bhop_period) * 0.5
    return seq


def _inject_wallhack_aim(seq: torch.Tensor) -> torch.Tensor:
    """Wallhack aim: smooth, confident tracking toward hidden targets."""
    start = random.randint(10, 40)
    length = random.randint(30, 60)
    end = min(start + length, seq.size(0))
    target_angle = random.uniform(-3.0, 3.0)
    n = end - start
    # Steady aim toward hidden target (unnaturally smooth)
    seq[start:end, 0] = target_angle + torch.randn(n) * 0.02
    seq[start:end, 1] = target_angle * 0.5 + torch.randn(n) * 0.02
    seq[start:end, 5] = 0.02  # Confident, low jitter
    seq[start:end, 4] = abs(target_angle) + 0.01  # Smooth angular velocity
    return seq


# Ordered list matches profile index 0-6
CHEAT_INJECTORS = [
    _inject_aimbot_perfect,   # 0
    _inject_aimbot_humanized, # 1
    _inject_triggerbot,       # 2
    _inject_spinbot,          # 3
    _inject_recoil_script,    # 4
    _inject_macro_bot,        # 5
    _inject_wallhack_aim,     # 6
]

# Map each cheat profile → classification target indices
# Classification targets: [aim=0, reaction=1, macro=2, speed=3, tracking=4]
CHEAT_TO_CLASS = {
    0: [0],     # aimbot_perfect  → aim
    1: [0],     # aimbot_humanized → aim
    2: [1],     # triggerbot      → reaction
    3: [0, 3],  # spinbot         → aim + speed
    4: [2],     # recoil_script   → macro
    5: [2],     # macro_bot       → macro
    6: [4],     # wallhack_aim    → tracking
}

CHEAT_NAMES = [
    "aimbot_perfect", "aimbot_humanized", "triggerbot",
    "spinbot", "recoil_script", "macro_bot", "wallhack_aim",
]


# ---------------------------------------------------------------------------
# Main Generator
# ---------------------------------------------------------------------------

def generate_synthetic_dataset(
    num_samples: int = 10000,
    seq_len: int = 128,
    input_dim: int = 9,
    save_path: str = "data/synthetic_transformer.pt",
) -> None:
    """Generate the full synthetic dataset.

    Balanced ~50 % clean / ~50 % cheat, cheats distributed uniformly
    across 7 profiles. Saves normalized tensors + next-event prediction
    targets ready for the training loop.
    """
    print(f"[generate_cheat_data] Generating {num_samples} sequences (len={seq_len})…")

    X = torch.zeros((num_samples, seq_len, input_dim))
    Y_class = torch.zeros((num_samples, 5))

    stats = {i: 0 for i in range(7)}
    clean_count = 0

    for i in range(num_samples):
        X[i] = _generate_clean_sequence(seq_len, input_dim)

        if random.random() > 0.5:
            profile = random.randint(0, 6)
            X[i] = CHEAT_INJECTORS[profile](X[i])
            for cls in CHEAT_TO_CLASS[profile]:
                Y_class[i, cls] = 1.0
            stats[profile] += 1
        else:
            clean_count += 1

        if (i + 1) % 2000 == 0:
            print(f"  {i + 1}/{num_samples}")

    # Normalize features → mean 0, std 1
    mean = X.mean(dim=(0, 1), keepdim=True)
    std  = X.std(dim=(0, 1), keepdim=True) + 1e-6
    X = (X - mean) / std

    # Next-event prediction target: shift by 1 step
    Y_next = torch.roll(X, shifts=-1, dims=1)
    Y_next[:, -1, :] = 0.0

    os.makedirs(os.path.dirname(save_path) or ".", exist_ok=True)
    torch.save({"X": X, "Y_class": Y_class, "Y_next": Y_next,
                "mean": mean, "std": std}, save_path)

    print(f"\n✓ Saved to {save_path}")
    print(f"  clean: {clean_count}")
    for idx, name in enumerate(CHEAT_NAMES):
        print(f"  {name}: {stats[idx]}")


if __name__ == "__main__":
    generate_synthetic_dataset()
