#!/usr/bin/env python3
"""
Binance Historical Data Downloader & Training Data Generator

Downloads kline (candlestick) data from Binance and converts it to training format
for the MarginScalper RL Brain.

Usage:
    python download_binance_data.py --symbols BTCUSDT,ETHUSDT --days 30 --output training_data/

Requirements:
    pip install requests pandas numpy

Data Flow:
    Binance API → Klines → Physics Features → Training Samples (JSONL)
"""

import argparse
import json
import math
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import requests

# ==============================================================================
# Binance API
# ==============================================================================

BINANCE_BASE_URL = "https://api.binance.com"
BINANCE_TESTNET_URL = "https://testnet.binance.vision"

def download_klines(
    symbol: str,
    interval: str = "5m",
    start_time: int = None,
    end_time: int = None,
    limit: int = 1000,
    testnet: bool = False
) -> List[List]:
    """
    Download kline data from Binance.
    
    Returns list of:
    [open_time, open, high, low, close, volume, close_time, quote_volume, 
     trades, taker_buy_base, taker_buy_quote, ignore]
    """
    base_url = BINANCE_TESTNET_URL if testnet else BINANCE_BASE_URL
    url = f"{base_url}/api/v3/klines"
    
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit
    }
    
    if start_time:
        params["startTime"] = start_time
    if end_time:
        params["endTime"] = end_time
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    return response.json()


def download_historical_klines(
    symbol: str,
    interval: str = "5m",
    days: int = 30,
    testnet: bool = False
) -> pd.DataFrame:
    """Download historical klines for specified number of days."""
    
    end_time = int(datetime.now().timestamp() * 1000)
    start_time = int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
    
    all_klines = []
    current_start = start_time
    
    print(f"Downloading {symbol} {interval} data for {days} days...")
    
    while current_start < end_time:
        klines = download_klines(
            symbol=symbol,
            interval=interval,
            start_time=current_start,
            end_time=end_time,
            limit=1000,
            testnet=testnet
        )
        
        if not klines:
            break
        
        all_klines.extend(klines)
        current_start = klines[-1][6] + 1  # close_time + 1ms
        
        print(f"  Downloaded {len(all_klines)} candles...")
        time.sleep(0.1)  # Rate limit
    
    # Convert to DataFrame
    df = pd.DataFrame(all_klines, columns=[
        'open_time', 'open', 'high', 'low', 'close', 'volume',
        'close_time', 'quote_volume', 'trades', 'taker_buy_base',
        'taker_buy_quote', 'ignore'
    ])
    
    # Convert types
    for col in ['open', 'high', 'low', 'close', 'volume', 'quote_volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df['open_time'] = pd.to_datetime(df['open_time'], unit='ms')
    df['close_time'] = pd.to_datetime(df['close_time'], unit='ms')
    
    print(f"  Total: {len(df)} candles")
    return df


# ==============================================================================
# Physics Feature Calculation (matches Elixir MarketProjectile)
# ==============================================================================

def calculate_momentum(prices: np.ndarray, window: int = 14) -> float:
    """Calculate price momentum (velocity)."""
    if len(prices) < 2:
        return 0.0
    
    # Simple momentum: rate of change
    returns = np.diff(prices) / prices[:-1]
    
    if len(returns) >= window:
        momentum = np.mean(returns[-window:])
    else:
        momentum = np.mean(returns)
    
    # Normalize to [-1, 1]
    return np.clip(momentum * 100, -1.0, 1.0)


def calculate_gravity(prices: np.ndarray, window: int = 20) -> float:
    """Calculate gravity (mean reversion strength)."""
    if len(prices) < window:
        return 0.0001
    
    # Volatility component
    returns = np.diff(prices) / prices[:-1]
    volatility = np.std(returns[-window:]) if len(returns) >= window else np.std(returns)
    
    # Mean reversion: distance from moving average
    ma = np.mean(prices[-window:])
    current = prices[-1]
    reversion = abs(current - ma) / ma if ma > 0 else 0
    
    # Gravity combines volatility and reversion tendency
    gravity = volatility * 0.5 + reversion * 0.5
    
    return np.clip(gravity, 0.0, 0.01)


def calculate_kinetic_energy(momentum: float, volume: float, avg_volume: float) -> float:
    """Calculate kinetic energy based on momentum and volume."""
    # Volume ratio
    vol_ratio = volume / avg_volume if avg_volume > 0 else 1.0
    
    # KE = 0.5 * m * v^2 (where m = volume ratio, v = momentum)
    ke = 0.5 * vol_ratio * (momentum ** 2) * 10000  # Scale factor
    
    return min(ke, 1000.0)


def calculate_zone_distances(prices: np.ndarray, current_price: float) -> Tuple[float, float]:
    """Calculate distances to predicted peak and injection zones."""
    if len(prices) < 5:
        return 0.0, 0.0
    
    # Simple peak/trough prediction using recent high/low
    recent_high = np.max(prices[-20:]) if len(prices) >= 20 else np.max(prices)
    recent_low = np.min(prices[-20:]) if len(prices) >= 20 else np.min(prices)
    
    # Distance to peak (as percentage)
    dist_to_peak = (recent_high - current_price) / current_price if current_price > 0 else 0
    
    # Distance to injection (support) zone
    dist_to_injection = (current_price - recent_low) / current_price if current_price > 0 else 0
    
    return np.clip(dist_to_peak, -0.1, 0.1), np.clip(dist_to_injection, -0.1, 0.1)


# ==============================================================================
# Trading Signal Generation (for labeling)
# ==============================================================================

def generate_labels(df: pd.DataFrame, lookahead: int = 12) -> pd.DataFrame:
    """
    Generate training labels based on future price movement.
    
    lookahead: number of candles to look ahead (e.g., 12 * 5min = 1 hour)
    """
    df = df.copy()
    
    # Calculate future returns
    df['future_return'] = df['close'].shift(-lookahead) / df['close'] - 1
    
    # Generate action labels
    # Threshold: 0.3% move is significant for 5min scalping
    threshold = 0.003
    
    def label_action(ret):
        if pd.isna(ret):
            return 0  # hold
        if ret > threshold:
            return 1  # long
        if ret < -threshold:
            return 2  # short
        return 0  # hold
    
    df['action'] = df['future_return'].apply(label_action)
    
    # Calculate reward (actual P&L if we took the action)
    def calculate_reward(row):
        if pd.isna(row['future_return']):
            return 0.0
        
        action = row['action']
        ret = row['future_return']
        
        if action == 1:  # long
            return ret * 10  # Scale reward
        elif action == 2:  # short
            return -ret * 10
        else:
            return 0.0
    
    df['reward'] = df.apply(calculate_reward, axis=1)
    
    return df


# ==============================================================================
# Training Sample Generation
# ==============================================================================

def generate_training_samples(df: pd.DataFrame, symbol: str) -> List[Dict]:
    """Convert DataFrame to training samples in JSONL format."""
    
    samples = []
    prices = df['close'].values
    volumes = df['volume'].values
    avg_volume = np.mean(volumes)
    
    for i in range(20, len(df) - 12):  # Need lookback and lookahead
        row = df.iloc[i]
        price_window = prices[i-14:i+1]
        
        # Calculate physics features
        momentum = calculate_momentum(price_window)
        gravity = calculate_gravity(prices[:i+1])
        kinetic_energy = calculate_kinetic_energy(momentum, volumes[i], avg_volume)
        dist_to_peak, dist_to_injection = calculate_zone_distances(prices[:i+1], prices[i])
        
        # Create sample
        sample = {
            "symbol": symbol,
            "timestamp": int(row['open_time'].timestamp() * 1000),
            "features": {
                "momentum": float(momentum),
                "gravity": float(gravity),
                "kinetic_energy": float(kinetic_energy),
                "dist_to_peak_pct": float(dist_to_peak),
                "dist_to_injection_pct": float(dist_to_injection),
                "unrealized_pnl_pct": 0.0  # No position at decision time
            },
            "action": ["hold", "long", "short"][int(row['action'])],
            "reward": float(np.clip(row['reward'], -1.0, 1.0)),
            "price": float(prices[i]),
            "future_return": float(row['future_return']) if not pd.isna(row['future_return']) else 0.0
        }
        
        samples.append(sample)
    
    return samples


# ==============================================================================
# Main
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description='Download Binance data for RL training')
    parser.add_argument('--symbols', type=str, 
                        default='BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT',
                        help='Comma-separated list of symbols')
    parser.add_argument('--interval', type=str, default='5m',
                        help='Kline interval (1m, 5m, 15m, 1h)')
    parser.add_argument('--days', type=int, default=30,
                        help='Number of days of historical data')
    parser.add_argument('--output', type=str, default='training_data',
                        help='Output directory')
    parser.add_argument('--testnet', action='store_true',
                        help='Use Binance testnet')
    parser.add_argument('--lookahead', type=int, default=12,
                        help='Candles to look ahead for labeling')
    
    args = parser.parse_args()
    
    symbols = [s.strip().upper() for s in args.symbols.split(',')]
    os.makedirs(args.output, exist_ok=True)
    
    all_samples = []
    
    for symbol in symbols:
        try:
            # Download data
            df = download_historical_klines(
                symbol=symbol,
                interval=args.interval,
                days=args.days,
                testnet=args.testnet
            )
            
            # Generate labels
            df = generate_labels(df, lookahead=args.lookahead)
            
            # Generate training samples
            samples = generate_training_samples(df, symbol)
            all_samples.extend(samples)
            
            print(f"  Generated {len(samples)} training samples for {symbol}")
            
            # Save raw data
            csv_path = os.path.join(args.output, f"{symbol}_{args.interval}_{args.days}d.csv")
            df.to_csv(csv_path, index=False)
            print(f"  Saved raw data to {csv_path}")
            
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            continue
    
    # Save training samples
    if all_samples:
        jsonl_path = os.path.join(args.output, f"samples_{datetime.now().strftime('%Y%m%d')}.jsonl")
        with open(jsonl_path, 'w') as f:
            for sample in all_samples:
                f.write(json.dumps(sample) + '\n')
        
        print(f"\n✅ Saved {len(all_samples)} total training samples to {jsonl_path}")
        
        # Print statistics
        actions = [s['action'] for s in all_samples]
        print(f"\nLabel Distribution:")
        print(f"  Hold:  {actions.count('hold')} ({100*actions.count('hold')/len(actions):.1f}%)")
        print(f"  Long:  {actions.count('long')} ({100*actions.count('long')/len(actions):.1f}%)")
        print(f"  Short: {actions.count('short')} ({100*actions.count('short')/len(actions):.1f}%)")
        
        rewards = [s['reward'] for s in all_samples]
        print(f"\nReward Statistics:")
        print(f"  Mean:   {np.mean(rewards):.4f}")
        print(f"  Std:    {np.std(rewards):.4f}")
        print(f"  Min:    {np.min(rewards):.4f}")
        print(f"  Max:    {np.max(rewards):.4f}")


if __name__ == '__main__':
    main()