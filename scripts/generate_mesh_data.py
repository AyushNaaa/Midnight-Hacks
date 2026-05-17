"""Synthetic mesh data generator for GAT training (§2C.1).

Generates game state graphs with 10 players (nodes) and their
line-of-sight/distance relationships (edges).
"""
import torch
import numpy as np
import random
import os
from torch_geometric.data import Data

def generate_synthetic_mesh_data(num_graphs=500, num_players=10, save_path="data/synthetic_gat.pt"):
    """
    Generates synthetic graph datasets.
    
    Nodes (10 players): [x, y, vx, vy, team]
    Edges: Fully connected (excluding self)
    Edge Attr: [distance, has_line_of_sight]
    Labels (per node): [is_wallhacking, is_collabing]
    """
    print(f"Generating {num_graphs} synthetic graph states...")
    
    data_list = []
    
    for _ in range(num_graphs):
        # 1. Node Features [num_players, 5]
        # Random positions 0-100, speeds 0-5
        positions = torch.rand(num_players, 2) * 100
        velocities = torch.randn(num_players, 2) * 2
        # Teams (0 or 1)
        teams = torch.zeros(num_players, 1)
        teams[num_players // 2:] = 1.0
        
        x = torch.cat([positions, velocities, teams], dim=1)
        
        # 2. Labels [num_players, 2]
        y = torch.zeros(num_players, 2)
        
        # Inject cheats into 1-2 random players
        num_cheaters = random.randint(0, 2)
        cheater_indices = random.sample(range(num_players), num_cheaters)
        
        for idx in cheater_indices:
            cheat_type = random.randint(0, 1) # 0=wallhack, 1=collab
            y[idx, cheat_type] = 1.0
            
            # Modify node features to reflect cheat (e.g., wallhacker moves faster towards walls)
            if cheat_type == 0:
                x[idx, 2:4] *= 1.5 # Slight speed boost for wallhackers tracking targets
        
        # 3. Edges (Fully connected graph, 10 * 9 = 90 edges)
        edge_index = []
        edge_attr = []
        
        for i in range(num_players):
            for j in range(num_players):
                if i != j:
                    edge_index.append([i, j])
                    
                    # Calculate distance
                    dist = torch.norm(positions[i] - positions[j])
                    
                    # Determine line of sight (simulate walls blocking sight)
                    # For synthetic data, say 30% chance of LOS, less if far
                    prob_los = max(0.0, 0.8 - (dist.item() / 100))
                    has_los = 1.0 if random.random() < prob_los else 0.0
                    
                    # If wallhacking (y[i, 0]==1), they act as if they have LOS even if they don't
                    if y[i, 0] == 1.0 and random.random() > 0.5:
                        # We don't change the graph (they don't actually have LOS), 
                        # but their behavior node features are correlated with this hidden target.
                        pass
                        
                    edge_attr.append([dist / 100.0, has_los]) # Normalize distance
                    
        edge_index = torch.tensor(edge_index, dtype=torch.long).t().contiguous()
        edge_attr = torch.tensor(edge_attr, dtype=torch.float)
        
        # Create PyTorch Geometric Data object
        graph_data = Data(x=x, edge_index=edge_index, edge_attr=edge_attr, y=y)
        data_list.append(graph_data)
        
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    torch.save(data_list, save_path)
    print(f"Saved dataset to {save_path}")

if __name__ == "__main__":
    generate_synthetic_mesh_data()
