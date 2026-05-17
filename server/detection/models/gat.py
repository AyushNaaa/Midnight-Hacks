"""Behavioral Mesh GAT (Graph Attention Network) Model (§2B.1)

Models all 10 players as nodes with edges representing line-of-sight and distance.
Detects collaborative cheating (sharing hidden information) and wallhacks
by identifying anomalies in spatial awareness relative to valid graph edges.

Node features (12): [x, y, vx, vy, aim_pitch, aim_yaw, aim_dx, aim_dy,
                      health, visible_to_count, team, is_alive]
Edge features (4):  [distance, angle_from_aim, is_LOS, time_since_visible]
"""
import torch
import torch.nn as nn
from torch_geometric.nn import GATConv, global_mean_pool

class BehavioralMeshGAT(nn.Module):
    def __init__(
        self, 
        node_features: int = 12,
        edge_features: int = 4,
        hidden_channels: int = 32, 
        heads: int = 4,
        out_classes: int = 2     # [wallhack_prob, collab_prob]
    ):
        super().__init__()
        
        # GAT Layer 1: Learn spatial relationships between players
        # We use edge_dim to incorporate edge features (LOS/distance) into attention
        self.conv1 = GATConv(
            in_channels=node_features, 
            out_channels=hidden_channels, 
            heads=heads, 
            edge_dim=edge_features,
            concat=True
        )
        
        # GAT Layer 2
        self.conv2 = GATConv(
            in_channels=hidden_channels * heads, 
            out_channels=hidden_channels, 
            heads=1, 
            edge_dim=edge_features,
            concat=False
        )
        
        self.relu = nn.ReLU()
        
        # Classifier: Node-level anomaly detection
        # We predict a probability for each node (player) in the graph
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Linear(hidden_channels // 2, out_classes),
            nn.Sigmoid()
        )

    def forward(self, x, edge_index, edge_attr, batch=None):
        """
        Args:
            x: Node feature matrix [num_nodes, node_features]
            edge_index: Graph connectivity [2, num_edges]
            edge_attr: Edge feature matrix [num_edges, edge_features]
            batch: Batch vector indicating which graph a node belongs to
            
        Returns:
            anomaly_scores: Shape [num_nodes, out_classes]
        """
        # Node embeddings based on graph structure
        x = self.conv1(x, edge_index, edge_attr)
        x = self.relu(x)
        
        x = self.conv2(x, edge_index, edge_attr)
        x = self.relu(x)
        
        # We want to classify *individual* players based on their graph context,
        # so we don't use global_mean_pool here. We pass node embeddings directly to classifier.
        anomaly_scores = self.classifier(x)
        
        return anomaly_scores
