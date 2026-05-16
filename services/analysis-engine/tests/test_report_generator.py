from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.services.report_generator import (
    _sequence_num_for_interaction_index,
    _source_for_interaction_index,
)


class ReportGeneratorTests(unittest.TestCase):
    def test_resolves_model_index_through_parsed_turn_mapping(self) -> None:
        parsed_turns = [
            {
                "transcript_index": 1,
                "sequence_num": 3,
                "_source_sequence_nums": [3, 4],
            },
            {
                "transcript_index": 2,
                "sequence_num": 8,
                "_source_sequence_nums": [8],
            },
        ]

        self.assertEqual(
            _sequence_num_for_interaction_index(1, parsed_turns),
            3,
        )
        self.assertEqual(
            _sequence_num_for_interaction_index(2, parsed_turns),
            8,
        )

    def test_falls_back_to_index_only_without_parsed_turns(self) -> None:
        self.assertEqual(_sequence_num_for_interaction_index(5, None), 5)
        self.assertIsNone(_sequence_num_for_interaction_index(5, []))

    def test_invalid_index_returns_none(self) -> None:
        self.assertIsNone(_sequence_num_for_interaction_index("not-a-number", []))

    def test_prefers_raw_interaction_id_when_available(self) -> None:
        parsed_turns = [
            {
                "transcript_index": 1,
                "sequence_num": 3,
                "_source_interaction_ids": [42],
                "_source_sequence_nums": [3],
            },
        ]

        self.assertEqual(
            _source_for_interaction_index(1, parsed_turns),
            ("id", 42),
        )


if __name__ == "__main__":
    unittest.main()
