"""Synthetic cheat data generator for Transformer training (§2C.1).

Generates events across cheat profiles.
Outputs a PyTorch dataset.
"""
import torch
import numpy as np
import random
import os

def generate_synthetic_dataset(num_samples=1000, seq_len=128, input_dim=9, save_path="data/synthetic_transformer.pt"):
    """
    Generates a synthetic dataset for training the Behavioral Transformer.
    
    Features (9): 
    [aim_delta_x, aim_delta_y, velocity, acceleration, angular_velocity, jitter, state_flags, event_flags, delta_time]
    
    Classes (5):
    [aimbot, reaction_time, macro, speedhack, tracking]
    """
    print(f"Generating {num_samples} synthetic sequences of length {seq_len}...")
    
    X = torch.zeros((num_samples, seq_len, input_dim))
    # Labels for the 5 classification targets
    Y_class = torch.zeros((num_samples, 5))
    
    for i in range(num_samples):
        # Base natural behavior (random walk / smooth noise)
        for j in range(input_dim):
            # Generate random smooth noise for natural input
            steps = torch.randn(seq_len) * 0.1
            X[i, :, j] = torch.cumsum(steps, dim=0)
            
        # Delta time is roughly constant (~16ms for 64 tick/s)
        X[i, :, 8] = 0.0156 + torch.randn(seq_len) * 0.001
        
        # Decide if this sample contains a cheat
        is_cheat = random.random() > 0.5
        
        if is_cheat:
            cheat_type = random.randint(0, 4)
            Y_class[i, cheat_type] = 1.0 # Set label
            
            if cheat_type == 0:
                # Aimbot: sudden spikes in angular velocity (feat 4), low jitter (feat 5)
                spike_idx = random.randint(10, seq_len - 10)
                X[i, spike_idx:spike_idx+3, 4] += 15.0 # Massive angular velocity spike
                X[i, spike_idx:spike_idx+5, 5] = 0.0   # Zero jitter (perfect tracking post-snap)
                
            elif cheat_type == 1:
                # Reaction (Triggerbot): Event flags (feat 7) fire instantly after state changes
                X[i, :, 7] += (torch.rand(seq_len) > 0.95).float() * 1.0 # Unnatural event firing
                
            elif cheat_type == 2:
                # Macro: Perfectly repeating sine wave in aim_delta_y (feat 1)
                t = torch.linspace(0, 10, seq_len)
                X[i, :, 1] += torch.sin(t * 3.0) * 0.5
                
            elif cheat_type == 3:
                # Speedhack: Velocity (feat 2) and Acceleration (feat 3) exceed physics limits
                X[i, :, 2] += 10.0 # Base speed way too high
                
            elif cheat_type == 4:
                # Tracking / Smooth Aim: Perfectly zero aim_delta (feat 0, 1) over long periods
                start_idx = random.randint(10, 50)
                length = random.randint(30, 60)
                X[i, start_idx:start_idx+length, 0] = 0.01 
                X[i, start_idx:start_idx+length, 1] = 0.01
                
    # Normalize features roughly to mean 0, std 1 for better training
    mean = X.mean(dim=(0, 1), keepdim=True)
    std = X.std(dim=(0, 1), keepdim=True) + 1e-6
    X = (X - mean) / std
    
    # Next-event prediction target: Shift X by 1 step
    Y_next = torch.roll(X, shifts=-1, dims=1)
    Y_next[:, -1, :] = 0 # Last step prediction is zeroed out
    
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    torch.save({"X": X, "Y_class": Y_class, "Y_next": Y_next}, save_path)
    print(f"Saved dataset to {save_path}")

if __name__ == "__main__":
    generate_synthetic_dataset()
