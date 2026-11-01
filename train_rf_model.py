"""
Train Random Forest Classifier on Uploaded Prototype Flood Risk Dataset
======================================================================
Features: latitude, longitude, rainfall, temperature, humidity, water_level, elevation
Target: prototype_alert_label (0 = NO FLOOD, 1 = HIGH FLOOD ALERT)
Model Output: model/flood_model_rf.pkl
"""

from pathlib import Path
import json
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)
from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_PATH = PROJECT_ROOT / "dataset" / "flood_model_rf_dataset.csv"
MODEL_DIR = PROJECT_ROOT / "model"
MODEL_PATH = MODEL_DIR / "flood_model_rf.pkl"
METRICS_PATH = MODEL_DIR / "flood_model_rf_metrics.json"

FEATURE_COLUMNS = [
    "latitude",
    "longitude",
    "rainfall",
    "temperature",
    "humidity",
    "water_level",
    "elevation",
]
TARGET_COLUMN = "prototype_alert_label"


def train_model():
    print(f"Loading dataset from: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH)
    print(f"Dataset shape: {df.shape}")

    # Validate required columns
    missing_cols = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns in dataset: {missing_cols}")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    print("\nClass distribution:")
    print(y.value_counts())

    # Stratified Train-Test Split (80% train, 20% test, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\nTraining set size: {len(X_train)}, Test set size: {len(X_test)}")

    # Initialize and train RandomForestClassifier
    rf_clf = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        n_jobs=-1,
    )
    print("\nTraining RandomForestClassifier...")
    rf_clf.fit(X_train, y_train)

    # Predict on test set
    y_pred = rf_clf.predict(X_test)

    # Calculate metrics
    accuracy = float(accuracy_score(y_test, y_pred))
    precision = float(precision_score(y_test, y_pred))
    recall = float(recall_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred))
    cm = confusion_matrix(y_test, y_pred).tolist()

    print("\n" + "=" * 50)
    print("MODEL EVALUATION METRICS (Test Set)")
    print("=" * 50)
    print(f"Accuracy : {accuracy:.4f} ({accuracy * 100:.2f}%)")
    print(f"Precision: {precision:.4f} ({precision * 100:.2f}%)")
    print(f"Recall   : {recall:.4f} ({recall * 100:.2f}%)")
    print(f"F1-score : {f1:.4f} ({f1 * 100:.2f}%)")
    print("\nConfusion Matrix [ [TN, FP], [FN, TP] ]:")
    print(f"  TN: {cm[0][0]}, FP: {cm[0][1]}")
    print(f"  FN: {cm[1][0]}, TP: {cm[1][1]}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["NO FLOOD (0)", "HIGH FLOOD ALERT (1)"]))

    # Save trained model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf_clf, MODEL_PATH)
    print(f"Trained model saved to: {MODEL_PATH}")

    # Save metrics JSON
    metrics_payload = {
        "model_file": str(MODEL_PATH.name),
        "feature_names": FEATURE_COLUMNS,
        "target_column": TARGET_COLUMN,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "confusion_matrix": {
            "true_negative": cm[0][0],
            "false_positive": cm[0][1],
            "false_negative": cm[1][0],
            "true_positive": cm[1][1],
        },
    }
    with open(METRICS_PATH, "w", encoding="utf-8") as mf:
        json.dump(metrics_payload, mf, indent=2)
    print(f"Evaluation metrics saved to: {METRICS_PATH}")


if __name__ == "__main__":
    train_model()
