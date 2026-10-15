#!/usr/bin/env python3
"""
MarginScalper RL Brain - Model Training Script

This script trains a simple neural network on trading data collected
by the Elixir system and exports it to ONNX format for Ortex inference.

Usage:
    python train_brain.py --data training_data/ --output priv/models/margin_scalper_brain.onnx

Requirements:
    pip install torch pandas numpy onnx onnxruntime
"""

import argparse
import json
import os
from pathlib import Path
from typing import List, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset


# ==============================================================================
# Model Architecture
# ==============================================================================

class TradingBrain(nn.Module):
    """
    Simple feedforward network for trading decisions.
    
    Input: 6 features (momentum, gravity, kinetic_energy, dist_to_peak, dist_to_injection, pnl)
    Output: 3 probabilities (hold, long, short)
    """
    
    def __init__(self, input_size: int = 6, hidden_size: int = 32, output_size: int = 3):
        super().__init__()
        
        self.network = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_size, output_size),
            nn.Softmax(dim=-1)
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


# ==============================================================================
# Data Loading
# ==============================================================================

def load_training_data(data_dir: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Load training data from JSONL files."""
    
    data_path = Path(data_dir)
    samples = []
    
    # Load all JSONL files
    for jsonl_file in data_path.glob("samples_*.jsonl"):
        with open(jsonl_file, 'r') as f:
            for line in f:
                if line.strip():
                    samples.append(json.loads(line))
    
    if not samples:
        raise ValueError(f"No training data found in {data_dir}")
    
    print(f"Loaded {len(samples)} training samples")
    
    # Extract features and labels
    features = []
    actions = []
    rewards = []
    
    action_map = {"hold": 0, "long": 1, "short": 2}
    
    for sample in samples:
        f = sample["features"]
        features.append([
            f.get("momentum", 0.0),
            f.get("gravity", 0.0001),
            f.get("kinetic_energy", 0.0),
            f.get("dist_to_peak_pct", 0.0),
            f.get("dist_to_injection_pct", 0.0),
            f.get("unrealized_pnl_pct", 0.0)
        ])
        
        action = sample.get("action", "hold")
        if isinstance(action, str):
            actions.append(action_map.get(action, 0))
        else:
            actions.append(action)
        
        rewards.append(sample.get("reward", 0.0))
    
    return (
        np.array(features, dtype=np.float32),
        np.array(actions, dtype=np.int64),
        np.array(rewards, dtype=np.float32)
    )


def normalize_features(features: np.ndarray) -> np.ndarray:
    """Normalize features to [-1, 1] range."""
    
    # Normalization bounds (must match Elixir Brain config)
    bounds = {
        0: (-1.0, 1.0),      # momentum
        1: (0.0, 0.01),      # gravity
        2: (0.0, 1000.0),    # kinetic_energy
        3: (-0.10, 0.10),    # dist_to_peak_pct
        4: (-0.10, 0.10),    # dist_to_injection_pct
        5: (-1.0, 1.0),      # unrealized_pnl_pct
    }
    
    normalized = features.copy()
    for i, (min_val, max_val) in bounds.items():
        # Clip and normalize to [-1, 1]
        clipped = np.clip(normalized[:, i], min_val, max_val)
        range_val = max_val - min_val
        if range_val > 0:
            normalized[:, i] = 2.0 * (clipped - min_val) / range_val - 1.0
        else:
            normalized[:, i] = 0.0
    
    return normalized


# ==============================================================================
# Training
# ==============================================================================

def train_model(
    features: np.ndarray,
    actions: np.ndarray,
    rewards: np.ndarray,
    epochs: int = 100,
    batch_size: int = 32,
    learning_rate: float = 0.001
) -> TradingBrain:
    """Train the trading brain model."""
    
    # Normalize features
    features = normalize_features(features)
    
    # Create weighted labels based on rewards
    # Higher reward → more weight to that action
    sample_weights = np.abs(rewards) + 0.1  # Minimum weight of 0.1
    
    # Convert to tensors
    X = torch.FloatTensor(features)
    y = torch.LongTensor(actions)
    weights = torch.FloatTensor(sample_weights)
    
    # Create dataset and loader
    dataset = TensorDataset(X, y, weights)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    # Initialize model
    model = TradingBrain()
    criterion = nn.CrossEntropyLoss(reduction='none')
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)
    
    # Training loop
    print("Training...")
    for epoch in range(epochs):
        total_loss = 0.0
        num_batches = 0
        
        for batch_X, batch_y, batch_w in loader:
            optimizer.zero_grad()
            
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            weighted_loss = (loss * batch_w).mean()
            
            weighted_loss.backward()
            optimizer.step()
            
            total_loss += weighted_loss.item()
            num_batches += 1
        
        if (epoch + 1) % 10 == 0:
            avg_loss = total_loss / num_batches
            print(f"Epoch {epoch + 1}/{epochs}, Loss: {avg_loss:.4f}")
    
    return model


# ==============================================================================
# Export to ONNX
# ==============================================================================

def export_to_onnx(model: TradingBrain, output_path: str):
    """Export trained model to ONNX format."""
    
    model.eval()
    
    # Create dummy input with correct shape
    dummy_input = torch.randn(1, 6)
    
    # Export
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['features'],
        output_names=['action_probabilities'],
        dynamic_axes={
            'features': {0: 'batch_size'},
            'action_probabilities': {0: 'batch_size'}
        },
        opset_version=14
    )
    
    print(f"Model exported to {output_path}")
    
    # Verify export
    import onnx
    model_onnx = onnx.load(output_path)
    onnx.checker.check_model(model_onnx)
    print("ONNX model verification: PASSED")


# ==============================================================================
# Main
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description='Train MarginScalper RL Brain')
    parser.add_argument('--data', type=str, default='priv/training_data',
                        help='Path to training data directory')
    parser.add_argument('--output', type=str, default='priv/models/margin_scalper_brain.onnx',
                        help='Output path for ONNX model')
    parser.add_argument('--epochs', type=int, default=100,
                        help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=32,
                        help='Training batch size')
    parser.add_argument('--lr', type=float, default=0.001,
                        help='Learning rate')
    
    args = parser.parse_args()
    
    # Load data
    print(f"Loading data from {args.data}...")
    features, actions, rewards = load_training_data(args.data)
    
    # Train model
    model = train_model(
        features, actions, rewards,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr
    )
    
    # Export to ONNX
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    export_to_onnx(model, args.output)
    
    print("\n✅ Training complete!")
    print(f"   Model saved to: {args.output}")
    print(f"   Samples trained on: {len(features)}")
    print("\nNext steps:")
    print("1. Copy the ONNX file to your Elixir app's priv/models/ directory")
    print("2. Restart the app or run: TradeEngine.AI.Brain.reload_model()")


if __name__ == '__main__':
    main()