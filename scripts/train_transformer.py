"""Training script for the Behavioral Transformer (§2C.2)."""
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
import sys
import os

# Add server to path so we can import models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))
from detection.models.transformer import BehavioralTransformer

def train_transformer(data_path="data/synthetic_transformer.pt", epochs=10, batch_size=32):
    print("Loading synthetic data...")
    data = torch.load(data_path)
    X = data["X"]
    Y_class = data["Y_class"]
    Y_next = data["Y_next"]
    
    dataset = TensorDataset(X, Y_class, Y_next)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    # Initialize Model
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")
    
    model = BehavioralTransformer(input_dim=9, d_model=64, n_heads=4, n_layers=4).to(device)
    
    # Losses & Optimizer
    class_criterion = nn.BCELoss() # Binary Cross Entropy for multi-label classification
    next_event_criterion = nn.MSELoss() # MSE for sequence prediction
    optimizer = optim.AdamW(model.parameters(), lr=1e-3)
    
    print("Starting training loop...")
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        total_class_loss = 0.0
        total_seq_loss = 0.0
        
        for batch_x, batch_y_class, batch_y_next in dataloader:
            batch_x, batch_y_class, batch_y_next = batch_x.to(device), batch_y_class.to(device), batch_y_next.to(device)
            
            optimizer.zero_grad()
            
            # Forward pass
            next_pred, class_pred = model(batch_x)
            
            # Compute losses
            loss_seq = next_event_criterion(next_pred, batch_y_next)
            loss_class = class_criterion(class_pred, batch_y_class)
            
            # Total loss (weighted sum)
            loss = loss_seq + (loss_class * 2.0)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            total_class_loss += loss_class.item()
            total_seq_loss += loss_seq.item()
            
        print(f"Epoch [{epoch+1}/{epochs}] | Loss: {total_loss/len(dataloader):.4f} "
              f"(Class: {total_class_loss/len(dataloader):.4f}, Seq: {total_seq_loss/len(dataloader):.4f})")
        
    # Save model
    os.makedirs("server/detection/models/weights", exist_ok=True)
    save_path = "server/detection/models/weights/transformer_v1.pt"
    torch.save(model.state_dict(), save_path)
    print(f"Model saved to {save_path}")

if __name__ == "__main__":
    train_transformer()
