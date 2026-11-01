"""
FloodGuard – Alerts Routes
===========================
Returns historical alert records stored in MySQL database.
"""

from fastapi import APIRouter
from backend.database import get_recent_predictions

router = APIRouter()


@router.get("/alerts", tags=["Alerts"], summary="Get alert history from MySQL database")
async def get_alerts():
    """
    Returns alert history loaded from the MySQL database.
    Preserves response format with 'alerts' array and 'message'.
    """
    try:
        alerts = get_recent_predictions(limit=50)
        return {
            "alerts": alerts,
            "count": len(alerts),
            "message": "Alert history loaded from MySQL database.",
        }
    except Exception as exc:
        return {
            "alerts": [],
            "count": 0,
            "message": f"Error retrieving alert history: {exc}",
        }
