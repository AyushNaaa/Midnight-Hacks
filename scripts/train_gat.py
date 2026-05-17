"""Training script for the Behavioral Mesh GAT (§2C.2)."""
import torch
import torch.nn as nn
import torch.optim as optim
from torch_geometric.loader import DataLoader
import sys
import os

# Add server to path so we can import models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))
from detection.models.gat import BehavioralMeshGAT

def train_gat(data_path="data/synthetic_gat.pt", epochs=15, batch_size=32):
    print("Loading synthetic graph data...")
    dataset = torch.load(data_path, weights_only=False)
    
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    # Initialize Model
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")
    
    model = BehavioralMeshGAT(
        node_features=5, 
        edge_features=2, 
        hidden_channels=32, 
        heads=4, 
        out_classes=2
    ).to(device)
    
    # Loss & Optimizer
    criterion = nn.BCELoss() # Binary Cross Entropy for node classification
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    
    print("Starting training loop...")
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        
        for batch in dataloader:
            batch = batch.to(device)
            
            optimizer.zero_grad()
            
            # Forward pass
            out = model(batch.x, batch.edge_index, batch.edge_attr, batch.batch)
            
            # Compute loss
            loss = criterion(out, batch.y)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
        print(f"Epoch [{epoch+1}/{epochs}] | Loss: {total_loss/len(dataloader):.4f}")
        
    # Save model
    os.makedirs("server/detection/models/weights", exist_ok=True)
    save_path = "server/detection/models/weights/gat_v1.pt"
    torch.save(model.state_dict(), save_path)
    print(f"Model saved to {save_path}")

if __name__ == "__main__":
    train_gat()
