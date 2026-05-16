from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.services.transcript_parser import TranscriptParser


class TranscriptParserTuiTests(unittest.TestCase):
    def test_parse_with_turns_maps_transcript_index_to_raw_sequence(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "id": 10,
                "direction": "output",
                "content_type": "terminal",
                "content": "",
                "sequence_num": 1,
            },
            {
                "id": 11,
                "direction": "input",
                "content_type": "prompt",
                "content": "npm test",
                "sequence_num": 3,
            },
        ]

        parsed = parser.parse_with_turns(interactions)
        first_turn = parsed.turns[0]

        self.assertIn("(#1)", parsed.transcript)
        self.assertEqual(first_turn["transcript_index"], 1)
        self.assertEqual(first_turn["sequence_num"], 3)
        self.assertEqual(first_turn["_source_sequence_nums"], [3])

    def test_tui_extraction_preserves_short_candidate_commands(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "direction": "input",
                "content_type": "prompt",
                "content": command,
                "sequence_num": idx,
                "timestamp": f"t{idx}",
            }
            for idx, command in enumerate(
                ["ls", "pwd", "npm test", "git diff", "pytest", "make build", "tsc --noEmit"],
                start=1,
            )
        ]

        turns = parser._extract_tui_conversation(interactions)
        contents = [turn["content"] for turn in turns if turn["direction"] == "input"]

        self.assertEqual(
            contents,
            ["ls", "pwd", "npm test", "git diff", "pytest", "make build", "tsc --noEmit"],
        )

    def test_tui_extraction_preserves_short_prompt_marker_commands(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "direction": "output",
                "content_type": "response",
                "content": "\u276f ls",
                "sequence_num": 1,
                "timestamp": "t1",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "\u276f git diff",
                "sequence_num": 2,
                "timestamp": "t2",
            },
        ]

        turns = parser._extract_tui_conversation(interactions)
        contents = [turn["content"] for turn in turns if turn["direction"] == "input"]

        self.assertEqual(contents, ["ls", "git diff"])

    def test_tui_response_turn_keeps_actual_source_sequence(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "direction": "output",
                "content_type": "response",
                "content": "\u276f npm test",
                "sequence_num": 10,
                "timestamp": "t1",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "The command failed with an assertion." * 40,
                "sequence_num": 25,
                "timestamp": "t2",
            },
        ]

        turns = parser._extract_tui_conversation(interactions)
        response_turn = next(turn for turn in turns if turn["direction"] == "output")

        self.assertEqual(response_turn["_source_sequence_nums"], [25])

    def test_parse_with_turns_excludes_unnumbered_interview_dialogue_from_mapping(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "id": 11,
                "direction": "input",
                "content_type": "prompt",
                "content": "npm test",
                "sequence_num": 1,
            },
            {
                "id": 12,
                "direction": "input",
                "content_type": "interview_response",
                "content": "I checked the failing assertion.",
                "sequence_num": 2,
            },
        ]

        parsed = parser.parse_with_turns(interactions)

        self.assertEqual(len(parsed.turns), 1)
        self.assertEqual(parsed.turns[0]["transcript_index"], 1)

    def test_tui_extraction_still_drops_short_noise(self) -> None:
        parser = TranscriptParser()
        interactions = [
            {
                "direction": "input",
                "content_type": "prompt",
                "content": content,
                "sequence_num": idx,
                "timestamp": f"t{idx}",
            }
            for idx, content in enumerate(["x", "q", "??", "--"], start=1)
        ]

        turns = parser._extract_tui_conversation(interactions)

        self.assertEqual(turns, [])


if __name__ == "__main__":
    unittest.main()
