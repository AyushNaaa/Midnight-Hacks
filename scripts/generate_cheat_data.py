"""Synthetic cheat data generator for Transformer training (§2C.1).

Generates 10K+ sequences across 7 cheat profiles:
  0 - aimbot_perfect    : instant snap-to-target, zero jitter
  1 - aimbot_humanized  : fast aim correction with slight overshoot/jitter
  2 - triggerbot        : inhuman reaction-time consistency on fire events
  3 - spinbot           : continuous high angular velocity rotation
  4 - recoil_script     : periodic compensation pattern in aim_delta_y
  5 - macro_bot         : perfectly periodic input (bhop / fire macro)
  6 - wallhack_aim      : tracking invisible targets (aim toward hidden players)

Outputs a PyTorch dataset compatible with train_transformer.py.
"""
import torch
import numpy as np
import random
import os
import math


def _smooth_noise(seq_len: int, scale: float = 0.1) -> torch.Tensor:
    """Generate smooth random walk noise (simulates natural human input)."""
    steps = torch.randn(seq_len) * scale
    return torch.cumsum(steps, dim=0)


def _generate_clean_sequence(seq_len: int, input_dim: int) -> torch.Tensor:
    """Generate a single clean (human) behavior sequence.

    Features (9):
    [aim_delta_x, aim_delta_y, velocity, acceleration, angular_velocity,
     jitter, state_flags, event_flags, delta_time]
    """
    seq = torch.zeros(seq_len, input_dim)

    # Aim deltas: small random movements with occasional larger adjustments
    seq[:, 0] = _smooth_noise(seq_len, 0.15)  # aim_delta_x
    seq[:, 1] = _smooth_noise(seq_len, 0.12)  # aim_delta_y

    # Velocity: human movement with natural variation
    base_speed = random.uniform(1.0, 4.0)
    seq[:, 2] = base_speed + _smooth_noise(seq_len, 0.3)  # velocity

    # Acceleration: derivative of velocity (noisy)
    seq[:, 3] = torch.diff(seq[:, 2], prepend=torch.tensor([base_speed])) + torch.randn(seq_len) * 0.05

    # Angular velocity: magnitude of aim change
    seq[:, 4] = torch.sqrt(seq[:, 0] ** 2 + seq[:, 1] ** 2) + torch.randn(seq_len).abs() * 0.02

    # Jitter: natural small random noise in aim
    seq[:, 5] = torch.randn(seq_len).abs() * 0.08

    # State flags: occasional changes (crouch, ADS, sprint)
    seq[:, 6] = (torch.rand(seq_len) > 0.92).float()

    # Event flags: sparse events (fire, reload)
    seq[:, 7] = (torch.rand(seq_len) > 0.95).float()

    # Delta time: ~15.6ms (64 tick/s) with natural variance
    seq[:, 8] = 0.0156 + torch.randn(seq_len) * 0.001

    return seq


def _inject_aimbot_perfect(seq: torch.Tensor) -> torch.Tensor:
    """Perfect aimbot: instant snap, zero jitter, straight-line tracking."""
    num_snaps = random.randint(2, 5)
    for _ in range(num_snaps):
        idx = random.randint(10, seq.size(0) - 10)
        # Massive angular velocity spike (instant snap)
        seq[idx, 4] += random.uniform(12.0, 25.0)
        seq[idx, 0] = random.uniform(5.0, 15.0) * random.choice([-1, 1])  # Big aim delta
        seq[idx, 1] = random.uniform(3.0, 10.0) * random.choice([-1, 1])
        # Zero jitter after snap (perfect lock)
        end = min(idx + random.randint(5, 15), seq.size(0))
        seq[idx:end, 5] = 0.0
        seq[idx:end, 0] = 0.01  # Near-zero aim movement after lock
        seq[idx:end, 1] = 0.01
    return seq


def _inject_aimbot_humanized(seq: torch.Tensor) -> torch.Tensor:
    """Humanized aimbot: fast correction with slight overshoot and jitter."""
    num_snaps = random.randint(2, 4)
    for _ in range(num_snaps):
        idx = random.randint(10, seq.size(0) - 10)
        # Moderately large angular velocity (not instant, but inhumanly fast)
        seq[idx, 4] += random.uniform(6.0, 12.0)
        seq[idx, 0] = random.uniform(3.0, 8.0) * random.choice([-1, 1])
        seq[idx, 1] = random.uniform(2.0, 6.0) * random.choice([-1, 1])
        # Slight overshoot correction 1-2 ticks later
        if idx + 2 < seq.size(0):
            seq[idx + 1, 0] = -seq[idx, 0] * random.uniform(0.05, 0.15)
            seq[idx + 1, 1] = -seq[idx, 1] * random.uniform(0.05, 0.15)
        # Reduced (but non-zero) jitter during tracking
        end = min(idx + random.randint(3, 8), seq.size(0))
        seq[idx:end, 5] *= 0.3
    return seq


def _inject_triggerbot(seq: torch.Tensor) -> torch.Tensor:
    """Triggerbot: fires with inhuman reaction time consistency."""
    # Clusters of fire events with impossibly consistent timing
    num_bursts = random.randint(3, 6)
    for _ in range(num_bursts):
        idx = random.randint(10, seq.size(0) - 15)
        burst_len = random.randint(3, 8)
        # Fire events with near-zero variance in timing
        for k in range(burst_len):
            if idx + k < seq.size(0):
                seq[idx + k, 7] = 1.0  # Event flag: fire
                seq[idx + k, 8] = 0.0156  # Perfectly consistent timing (no variance)
    return seq


def _inject_spinbot(seq: torch.Tensor) -> torch.Tensor:
    """Spinbot: continuous high-speed rotation."""
    start = random.randint(5, 30)
    length = random.randint(40, 90)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    spin_speed = random.uniform(8.0, 20.0)
    # Continuous rotation in aim_delta_x
    seq[start:end, 0] = spin_speed
    # Angular velocity is constantly high
    seq[start:end, 4] = spin_speed
    # Aim_delta_y oscillates slightly
    seq[start:end, 1] = torch.sin(t * 0.5) * 0.5
    # Zero jitter (mechanical precision)
    seq[start:end, 5] = 0.0
    return seq


def _inject_recoil_script(seq: torch.Tensor) -> torch.Tensor:
    """Recoil script: periodic downward aim compensation during fire."""
    start = random.randint(10, 40)
    length = random.randint(30, 70)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    # Periodic sine wave compensation in aim_delta_y
    period = random.uniform(2.0, 4.0)
    amplitude = random.uniform(0.3, 0.8)
    seq[start:end, 1] = -amplitude * torch.abs(torch.sin(t / period * math.pi))
    # Fire events during compensation
    seq[start:end, 7] = 1.0
    # Very low variance in compensation (mechanical precision)
    seq[start:end, 5] = 0.01
    return seq


def _inject_macro_bot(seq: torch.Tensor) -> torch.Tensor:
    """Macro bot: perfectly periodic inputs (bhop, fire timing)."""
    start = random.randint(5, 20)
    length = random.randint(50, 100)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    # Perfectly periodic state flag changes (bhop pattern)
    period = random.choice([3, 4, 5, 6])
    seq[start:end, 6] = (t % period == 0).float()
    # Periodic event flags (fire macro)
    fire_period = random.choice([2, 3, 4])
    seq[start:end, 7] = (t % fire_period == 0).float()
    # Perfectly periodic aim compensation
    seq[start:end, 1] += torch.sin(t * 2 * math.pi / period) * 0.5
    return seq


def _inject_wallhack_aim(seq: torch.Tensor) -> torch.Tensor:
    """Wallhack aim: smooth tracking of invisible targets through walls."""
    start = random.randint(10, 40)
    length = random.randint(30, 60)
    end = min(start + length, seq.size(0))
    t = torch.arange(end - start, dtype=torch.float32)
    # Smooth, purposeful aim movement (tracking a hidden target)
    target_angle = random.uniform(-3.0, 3.0)
    seq[start:end, 0] = target_angle * torch.ones(end - start) + torch.randn(end - start) * 0.02
    seq[start:end, 1] = target_angle * 0.5 * torch.ones(end - start) + torch.randn(end - start) * 0.02
    # Low jitter (confident tracking, not searching)
    seq[start:end, 5] = 0.02
    # Angular velocity is unnaturally smooth/constant
    seq[start:end, 4] = abs(target_angle) + 0.01
    return seq


CHEAT_INJECTORS = [
    _inject_aimbot_perfect,
    _inject_aimbot_humanized,
    _inject_triggerbot,
    _inject_spinbot,
    _inject_recoil_script,
    _inject_macro_bot,
    _inject_wallhack_aim,
]

# Map 7 cheat profiles → 5 classification targets
# [aimbot, reaction, macro, speed, tracking]
CHEAT_TO_CLASS = {
    0: [0],        # aimbot_perfect → aim
    1: [0],        # aimbot_humanized → aim
    2: [1],        # triggerbot → reaction
    3: [0, 3],     # spinbot → aim + speed
    4: [2],        # recoil_script → macro
    5: [2],        # macro_bot → macro
    6: [4],        # wallhack_aim → tracking
}


def generate_synthetic_dataset(
    num_samples: int = 10000,
    seq_len: int = 128,
    input_dim: int = 9,
    save_path: str = "data/synthetic_transformer.pt",
):
    """Generate the full synthetic dataset for Transformer training.

    Produces a balanced mix of ~50% clean and ~50% cheat sequences,
    with cheats distributed evenly across 7 profiles.
    """
    print(f"Generating {num_samples} synthetic sequences of length {seq_len}...")

    X = torch.zeros((num_samples, seq_len, input_dim))
    Y_class = torch.zeros((num_samples, 5))  # 5 classification targets

    cheat_count = {i: 0 for i in range(7)}
    clean_count = 0

    for i in range(num_samples):
        # Generate clean baseline
        X[i] = _generate_clean_sequence(seq_len, input_dim)

        # 50% chance of being a cheat sample
        if random.random() > 0.5:
            cheat_type = random.randint(0, 6)
            X[i] = CHEAT_INJECTORS[cheat_type](X[i])
            for cls_idx in CHEAT_TO_CLASS[cheat_type]:
                Y_class[i, cls_idx] = 1.0
            cheat_count[cheat_type] += 1
        else:
            clean_count += 1

        if (i + 1) % 2000 == 0:
            print(f"  Generated {i + 1}/{num_samples} sequences...")

    # Normalize features to roughly mean=0, std=1
    mean = X.mean(dim=(0, 1), keepdim=True)
    std = X.std(dim=(0, 1), keepdim=True) + 1e-6
    X = (X - mean) / std

    # Next-event prediction target: shift X by 1 step
    Y_next = torch.roll(X, shifts=-1, dims=1)
    Y_next[:, -1, :] = 0  # Last step has no target

    os.makedirs(os.path.dirname(save_path) if os.path.dirname(save_path) else ".", exist_ok=True)
    torch.save({"X": X, "Y_class": Y_class, "Y_next": Y_next, "mean": mean, "std": std}, save_path)

    cheat_names = [
        "aimbot_perfect", "aimbot_humanized", "triggerbot",
        "spinbot", "recoil_script", "macro_bot", "wallhack_aim",
    ]
    print(f"\nDataset saved to {save_path}")
    print(f"  Clean: {clean_count}")
    for idx, name in enumerate(cheat_names):
        print(f"  {name}: {cheat_count[idx]}")


if __name__ == "__main__":
    generate_synthetic_dataset()
