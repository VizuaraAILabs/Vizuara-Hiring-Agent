from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.main import app


class HealthEndpointTests(unittest.TestCase):
    def test_health_is_liveness_only(self) -> None:
        response = TestClient(app).get("/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "alive")
        self.assertEqual(payload["service"], "analysis-engine")
        self.assertIn("timestamp", payload)
        self.assertNotIn("gemini_key_set", payload)
        self.assertNotIn("checks", payload)

    def test_ready_returns_200_when_dependencies_are_ready(self) -> None:
        readiness = {
            "status": "ready",
            "checks": {
                "database": {"status": "ready"},
                "workers": {"status": "ready", "expected": 2, "running": 2},
                "gemini": {"status": "configured"},
                "queue": {"status": "ready", "queued": 0, "running": 0},
            },
        }

        with patch("src.main.get_analysis_readiness", AsyncMock(return_value=readiness)):
            response = TestClient(app).get("/ready")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["service"], "analysis-engine")
        self.assertEqual(payload["checks"]["database"]["status"], "ready")
        self.assertIn("timestamp", payload)

    def test_ready_returns_503_when_a_dependency_is_not_ready(self) -> None:
        readiness = {
            "status": "not_ready",
            "checks": {
                "database": {"status": "not_ready", "error": "TimeoutError"},
                "workers": {"status": "ready", "expected": 2, "running": 2},
                "gemini": {"status": "configured"},
                "queue": {"status": "not_ready", "error": "TimeoutError"},
            },
        }

        with patch("src.main.get_analysis_readiness", AsyncMock(return_value=readiness)):
            response = TestClient(app).get("/ready")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "not_ready")
        self.assertEqual(
            payload["checks"]["database"],
            {"status": "not_ready", "error": "TimeoutError"},
        )


if __name__ == "__main__":
    unittest.main()
