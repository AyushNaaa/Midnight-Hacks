"""Behavioral Mesh GAT (Graph Attention Network) Model (§2B.1)

2-layer GAT with 4 attention heads detecting wallhacks and collaborative
cheating by analyzing spatial relationships between all players in a match.

Node features (12): x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
                     health, visible_to_count, team, is_alive
Edge features  (4): distance, angle_from_aim, is_LOS, time_since_visible
Output per node (2): [wallhack_probability, collab_probability]
"""
import torch
import torch.nn as nn
from torch_geometric.nn import GATConv

class BehavioralMeshGAT(nn.Module):
    def __init__(self, node_features=12, edge_features=4,
                 hidden_channels=32, heads=4, out_classes=2):
        super().__init__()
        self.conv1 = GATConv(node_features, hidden_channels, heads=heads,
                             edge_dim=edge_features, concat=True)
        self.conv2 = GATConv(hidden_channels * heads, hidden_channels, heads=1,
                             edge_dim=edge_features, concat=False)
        self.relu = nn.ReLU()
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Linear(hidden_channels // 2, out_classes),
            nn.Sigmoid(),
        )

    def forward(self, x, edge_index, edge_attr, batch=None):
        x = self.relu(self.conv1(x, edge_index, edge_attr))
        x = self.relu(self.conv2(x, edge_index, edge_attr))
        return self.classifier(x)
