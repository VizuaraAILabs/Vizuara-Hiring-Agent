from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.services.transcript_quality import TranscriptQualityGate


class TranscriptQualityGateTests(unittest.TestCase):
    def test_insufficient_dimensions_include_rich_schema_fields(self) -> None:
        result = TranscriptQualityGate().assess([], "")

        self.assertIsNotNone(result)
        dimensions = result["dimensions"]
        self.assertTrue(dimensions)

        for detail in dimensions.values():
            self.assertEqual(detail["score"], 0.0)
            self.assertEqual(detail["evidence"], [])
            self.assertEqual(detail["observed_points"], [])
            self.assertIsInstance(detail["expected_standard"], str)
            self.assertTrue(detail["expected_standard"])

        problem_detail = dimensions["problem_decomposition"]
        creativity_detail = dimensions["creativity"]
        self.assertIsNot(problem_detail["evidence"], creativity_detail["evidence"])
        self.assertIsNot(
            problem_detail["observed_points"],
            creativity_detail["observed_points"],
        )


if __name__ == "__main__":
    unittest.main()
