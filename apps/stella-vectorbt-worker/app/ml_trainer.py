"""
ML Trainer — Train classifiers to predict trade outcomes (win/loss).

Reads CSV feature data exported from the Elixir backtest engine and trains
per-asset parameter weights using scikit-learn classifiers.

Usage:
    python -m app.ml_trainer
    python -m app.ml_trainer --features /path/to/features.csv
"""

from __future__ import annotations

import argparse
import os
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_SCRIPT_DIR = Path(__file__).resolve().parent
_DEFAULT_FEATURES_PATH = (
    _SCRIPT_DIR / "../../stella_platform_umbrella/apps/trade_engine/priv/ml/features_all.csv"
).resolve()
_DEFAULT_MODEL_DIR = (
    _SCRIPT_DIR / "../../stella_platform_umbrella/apps/trade_engine/priv/models"
).resolve()

# ---------------------------------------------------------------------------
# Feature engineering helpers
# ---------------------------------------------------------------------------

CATEGORICAL_MAPS = {
    "direction": {"long": 1, "short": 0},
    "energy_state": {"high": 2, "medium": 1, "low": 0},
    "regime": {
        "trending_up": 2,
        "trending_down": 1,
        "ranging": -1,
        "volatile": 0,
        "unknown": 0,
    },
}

# Columns that come from the Elixir CSV export
RAW_FEATURE_COLS = [
    "confidence",
    "momentum",
    "gravity",
    "atr_pct",
    "momentum_acceleration",
    "trajectory_angle",
    "kinetic_energy",
    "entry_price",
    "stop_loss",
    "impulse_target",
    "position_value",
]

# Columns after categorical encoding
ENCODED_CATEGORICAL_COLS = ["direction", "energy_state", "regime"]

# Derived features we compute
DERIVED_COLS = [
    "sl_distance_pct",
    "tp_distance_pct",
    "rr_ratio",
    "momentum_atr_ratio",
    "mom_gravity_ratio",
]


def encode_categoricals(df: pd.DataFrame) -> pd.DataFrame:
    """Map categorical string columns to numeric values."""
    df = df.copy()
    for col, mapping in CATEGORICAL_MAPS.items():
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower().map(mapping)
            # Anything unmapped becomes 0
            df[col] = df[col].fillna(0).astype(int)
    return df


def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create derived numeric features from the raw columns."""
    df = df.copy()

    entry = df["entry_price"].replace(0, np.nan)
    sl = df["stop_loss"]
    tp = df["impulse_target"]
    mom = df["momentum"].abs()
    atr = df["atr_pct"].clip(lower=0.0001)
    grav = df["gravity"].abs().clip(lower=0.00001)

    df["sl_distance_pct"] = (entry - sl).abs() / entry
    df["tp_distance_pct"] = (tp - entry).abs() / entry
    sl_dist = df["sl_distance_pct"].replace(0, np.nan)
    df["rr_ratio"] = df["tp_distance_pct"] / sl_dist
    df["momentum_atr_ratio"] = mom / atr
    df["mom_gravity_ratio"] = mom / grav

    # Cap extreme values to avoid inf
    for col in DERIVED_COLS:
        df[col] = df[col].replace([np.inf, -np.inf], np.nan)

    return df


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_features(path: str | Path) -> pd.DataFrame:
    """Load the CSV feature file and return a clean DataFrame."""
    path = Path(path)
    if not path.exists():
        print(f"ERROR: Feature file not found at {path}")
        sys.exit(1)

    df = pd.read_csv(path)
    print(f"Loaded {len(df)} rows from {path}")
    print(f"Columns: {list(df.columns)}")

    if "win" not in df.columns:
        print("ERROR: CSV must contain a 'win' column (1=win, 0=loss)")
        sys.exit(1)

    return df


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def prepare_dataset(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, list[str], StandardScaler]:
    """
    Full preprocessing pipeline.

    Returns (X_scaled, y, feature_names, scaler).
    """
    df = encode_categoricals(df)
    df = add_derived_features(df)

    feature_cols = RAW_FEATURE_COLS + ENCODED_CATEGORICAL_COLS + DERIVED_COLS
    # Only keep columns that actually exist
    feature_cols = [c for c in feature_cols if c in df.columns]

    # Fill missing values with column medians (fall back to 0)
    for col in feature_cols:
        median_val = df[col].median()
        df[col] = df[col].fillna(median_val if pd.notna(median_val) else 0)

    X = df[feature_cols].values.astype(np.float64)
    y = df["win"].values.astype(int)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    return X_scaled, y, feature_cols, scaler


# ---------------------------------------------------------------------------
# Model training & evaluation
# ---------------------------------------------------------------------------


def build_models() -> dict:
    """Return a dict of model_name -> (unfitted) estimator."""
    models = {
        "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
        "RandomForest": RandomForestClassifier(
            n_estimators=200, max_depth=8, min_samples_leaf=5, random_state=42, n_jobs=-1
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=200, max_depth=5, learning_rate=0.1, random_state=42
        ),
    }

    # Prefer XGBoost if installed
    try:
        from xgboost import XGBClassifier

        models["GradientBoosting"] = XGBClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
            use_label_encoder=False,
            eval_metric="logloss",
            verbosity=0,
        )
        print("Using XGBoost for GradientBoosting.\n")
    except ImportError:
        print("XGBoost not installed — using sklearn GradientBoosting.\n")

    return models


def evaluate_model(model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
    """Return a dict of evaluation metrics."""
    y_pred = model.predict(X_test)
    y_prob = None
    if hasattr(model, "predict_proba"):
        y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "auc_roc": roc_auc_score(y_test, y_prob) if y_prob is not None else float("nan"),
    }
    return metrics


def print_comparison_table(results: dict[str, dict]) -> None:
    """Pretty-print a model comparison table."""
    header = f"{'Model':<25} {'Accuracy':>8} {'Precision':>9} {'Recall':>8} {'F1':>8} {'AUC-ROC':>8}"
    print("\n" + "=" * len(header))
    print("MODEL COMPARISON")
    print("=" * len(header))
    print(header)
    print("-" * len(header))
    for name, m in results.items():
        print(
            f"{name:<25} {m['accuracy']:>8.4f} {m['precision']:>9.4f} "
            f"{m['recall']:>8.4f} {m['f1']:>8.4f} {m['auc_roc']:>8.4f}"
        )
    print("=" * len(header))


def print_feature_importance(model, feature_names: list[str], top_n: int = 15) -> None:
    """Print feature importances from a tree-based model."""
    if not hasattr(model, "feature_importances_"):
        return

    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1][:top_n]

    print(f"\nTop {min(top_n, len(indices))} Feature Importances (RandomForest):")
    print("-" * 45)
    for rank, idx in enumerate(indices, 1):
        print(f"  {rank:>2}. {feature_names[idx]:<25} {importances[idx]:.4f}")


# ---------------------------------------------------------------------------
# Per-asset analysis
# ---------------------------------------------------------------------------


def per_asset_analysis(
    df: pd.DataFrame, best_model, scaler: StandardScaler, feature_cols: list[str]
) -> None:
    """Show win rate and model accuracy grouped by symbol."""
    if "symbol" not in df.columns:
        print("\nNo 'symbol' column — skipping per-asset analysis.")
        return

    df_work = encode_categoricals(df.copy())
    df_work = add_derived_features(df_work)
    cols = [c for c in feature_cols if c in df_work.columns]

    for col in cols:
        median_val = df_work[col].median()
        df_work[col] = df_work[col].fillna(median_val if pd.notna(median_val) else 0)

    X_all = scaler.transform(df_work[cols].values.astype(np.float64))
    y_all = df_work["win"].values.astype(int)
    preds = best_model.predict(X_all)

    df_work["_pred"] = preds
    df_work["_correct"] = (preds == y_all).astype(int)

    symbols = df_work["symbol"].unique()
    print(f"\n{'='*65}")
    print("PER-ASSET ANALYSIS")
    print(f"{'='*65}")
    print(f"{'Symbol':<15} {'Count':>6} {'Win Rate':>9} {'Model Acc':>10}")
    print("-" * 65)

    for sym in sorted(symbols):
        mask = df_work["symbol"] == sym
        subset = df_work[mask]
        count = len(subset)
        win_rate = subset["win"].mean()
        model_acc = subset["_correct"].mean()
        print(f"{sym:<15} {count:>6} {win_rate:>9.2%} {model_acc:>10.2%}")

    # Per-asset feature importance (train a small RF per symbol if enough data)
    print(f"\n{'='*65}")
    print("PER-ASSET TOP FEATURES (RandomForest importance)")
    print(f"{'='*65}")

    for sym in sorted(symbols):
        mask = df_work["symbol"] == sym
        subset = df_work[mask]
        if len(subset) < 30:
            print(f"\n{sym}: too few samples ({len(subset)}) — skipped")
            continue

        X_sym = scaler.transform(subset[cols].values.astype(np.float64))
        y_sym = subset["win"].values.astype(int)

        # Skip if only one class
        if len(np.unique(y_sym)) < 2:
            print(f"\n{sym}: only one class present — skipped")
            continue

        rf = RandomForestClassifier(
            n_estimators=100, max_depth=6, min_samples_leaf=3, random_state=42, n_jobs=-1
        )
        rf.fit(X_sym, y_sym)
        imps = rf.feature_importances_
        top_idx = np.argsort(imps)[::-1][:5]
        top_feats = ", ".join(f"{cols[i]}({imps[i]:.3f})" for i in top_idx)
        print(f"\n{sym}: {top_feats}")


# ---------------------------------------------------------------------------
# Save artifacts
# ---------------------------------------------------------------------------


def save_model(
    model,
    scaler: StandardScaler,
    feature_names: list[str],
    model_name: str,
    output_dir: Path,
) -> None:
    """Pickle the best model, scaler, and feature names."""
    output_dir.mkdir(parents=True, exist_ok=True)

    artifact = {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_names,
        "model_name": model_name,
    }

    out_path = output_dir / "trade_classifier.pkl"
    with open(out_path, "wb") as f:
        pickle.dump(artifact, f, protocol=pickle.HIGHEST_PROTOCOL)

    print(f"\nSaved best model ({model_name}) to {out_path}")
    print(f"  Artifact keys: {list(artifact.keys())}")
    print(f"  Features ({len(feature_names)}): {feature_names}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(features_path: str | None = None) -> None:
    path = Path(features_path) if features_path else _DEFAULT_FEATURES_PATH
    print(f"{'='*65}")
    print("STELLA ML TRAINER — Trade Outcome Classifier v1")
    print(f"{'='*65}")
    print(f"Features file: {path}\n")

    # 1. Load
    df = load_features(path)
    print(f"Target distribution: {df['win'].value_counts().to_dict()}")
    win_rate = df["win"].mean()
    print(f"Overall win rate: {win_rate:.2%} ({len(df)} trades)\n")

    # 2. Prepare
    X, y, feature_cols, scaler = prepare_dataset(df)
    print(f"Feature matrix: {X.shape[0]} samples x {X.shape[1]} features")

    if X.shape[0] < 20:
        print("ERROR: Not enough data to train (need at least 20 rows).")
        sys.exit(1)

    # 3. Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    print(f"Train: {len(X_train)} | Test: {len(X_test)}")

    # 4. Train & evaluate
    models = build_models()
    results: dict[str, dict] = {}
    fitted_models: dict[str, object] = {}

    for name, model in models.items():
        print(f"Training {name}...", end=" ", flush=True)
        model.fit(X_train, y_train)
        metrics = evaluate_model(model, X_test, y_test)
        results[name] = metrics
        fitted_models[name] = model
        print(f"F1={metrics['f1']:.4f}")

    # 5. Comparison table
    print_comparison_table(results)

    # 6. Feature importance (RandomForest)
    if "RandomForest" in fitted_models:
        print_feature_importance(fitted_models["RandomForest"], feature_cols)

    # 7. Pick best model by F1
    best_name = max(results, key=lambda k: results[k]["f1"])
    best_model = fitted_models[best_name]
    print(f"\nBest model: {best_name} (F1={results[best_name]['f1']:.4f})")

    # 8. Save
    save_model(best_model, scaler, feature_cols, best_name, _DEFAULT_MODEL_DIR)

    # 9. Per-asset analysis
    per_asset_analysis(df, best_model, scaler, feature_cols)

    print(f"\n{'='*65}")
    print("Done.")
    print(f"{'='*65}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train trade outcome classifier")
    parser.add_argument(
        "--features",
        type=str,
        default=None,
        help=f"Path to features CSV (default: {_DEFAULT_FEATURES_PATH})",
    )
    args = parser.parse_args()
    main(features_path=args.features)
