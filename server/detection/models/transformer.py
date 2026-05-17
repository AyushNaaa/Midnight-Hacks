"""Behavioral Transformer Model (§2A.1)

A decoder-only causal Transformer sequence model analyzing each player's input
stream over a sliding window (128 ticks) to detect aimbots, macros, inhuman
reaction times, and speed hacks.
"""
import torch
import torch.nn as nn
import math

class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model))
        pe = torch.zeros(max_len, 1, d_model)
        pe[:, 0, 0::2] = torch.sin(position * div_term)
        pe[:, 0, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor, shape [seq_len, batch_size, embedding_dim]
        """
        x = x + self.pe[:x.size(0)]
        return x

class BehavioralTransformer(nn.Module):
    def __init__(
        self, 
        input_dim: int = 9, 
        d_model: int = 64, 
        n_heads: int = 4, 
        n_layers: int = 6, 
        d_ff: int = 256, 
        max_seq_len: int = 128,
        num_cheat_classes: int = 5 # aim, reaction, macro, speed, tracking
    ):
        super().__init__()
        self.input_dim = input_dim
        self.d_model = d_model
        
        # Project raw features (9) to embedding dimension (64)
        self.feature_projection = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_len=max_seq_len)
        
        # Transformer Decoder (Causal)
        decoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, 
            nhead=n_heads, 
            dim_feedforward=d_ff, 
            batch_first=True,
            norm_first=True
        )
        # We use TransformerEncoder instead of Decoder because we just need 
        # causal self-attention over the sequence, without cross-attention to an external memory.
        self.transformer = nn.TransformerEncoder(decoder_layer, num_layers=n_layers)
        
        # Dual Heads
        # 1. Next-event prediction (Surprise score) - Predict next feature vector
        self.next_event_head = nn.Linear(d_model, input_dim)
        
        # 2. Anomaly Classification (P(cheat)) - Output scores for each module
        self.classification_head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Linear(d_model // 2, num_cheat_classes),
            nn.Sigmoid() # Bound scores between 0 and 1
        )

    def generate_square_subsequent_mask(self, sz: int) -> torch.Tensor:
        """Generate a causal mask to prevent attending to future ticks."""
        mask = (torch.triu(torch.ones(sz, sz)) == 1).transpose(0, 1)
        mask = mask.float().masked_fill(mask == 0, float('-inf')).masked_fill(mask == 1, float(0.0))
        return mask

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: Input sequence of shape [batch_size, seq_len, input_dim]
            
        Returns:
            next_event_pred: Shape [batch_size, seq_len, input_dim]
            cheat_scores: Shape [batch_size, num_cheat_classes]
        """
        batch_size, seq_len, _ = x.shape
        
        # 1. Project and add positional encoding
        x = self.feature_projection(x) # [batch_size, seq_len, d_model]
        
        # PositionalEncoding expects [seq_len, batch_size, d_model]
        x = x.transpose(0, 1)
        x = self.pos_encoder(x)
        x = x.transpose(0, 1) # Back to [batch_size, seq_len, d_model]
        
        # 2. Apply causal mask
        causal_mask = self.generate_square_subsequent_mask(seq_len).to(x.device)
        
        # 3. Transformer forward pass
        # TransformerEncoder with batch_first=True expects [batch, seq, feature] and mask of [seq, seq]
        features = self.transformer(x, mask=causal_mask, is_causal=True)
        
        # 4. Heads
        next_event_pred = self.next_event_head(features)
        
        # For classification, we use the features from the LAST sequence step
        # representing the aggregated context of the entire window
        final_state = features[:, -1, :] # [batch_size, d_model]
        cheat_scores = self.classification_head(final_state)
        
        return next_event_pred, cheat_scores
