from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.services.transcript_parser import TranscriptParser

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "interactions"


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

    def test_tui_response_is_not_truncated(self) -> None:
        parser = TranscriptParser()
        long_response = "Useful AI response start. " + ("details " * 700) + "Useful AI response end."
        interactions = [
            {
                "direction": "output",
                "content_type": "response",
                "content": "\x1b[?2026h",
                "sequence_num": 0,
                "timestamp": "t0",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "\u276f please explain the caching approach in detail",
                "sequence_num": 1,
                "timestamp": "t1",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "\x1b[?2026h" + long_response,
                "sequence_num": 2,
                "timestamp": "t2",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "\x1b[?2026h",
                "sequence_num": 3,
                "timestamp": "t3",
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": "\x1b[?2026h",
                "sequence_num": 4,
                "timestamp": "t4",
            },
        ]

        parsed = parser.parse_with_turns(interactions)

        self.assertIn("Useful AI response start.", parsed.transcript)
        self.assertIn("Useful AI response end.", parsed.transcript)
        self.assertNotIn("response truncated", parsed.transcript)

    def test_standard_ai_response_is_not_truncated_when_transcript_is_large(self) -> None:
        parser = TranscriptParser()
        long_response = "UNIQUE_START " + ("full response content " * 5000) + "UNIQUE_END"
        interactions = [
            {
                "direction": "input",
                "content_type": "prompt",
                "content": "please explain your implementation",
                "sequence_num": 1,
            },
            {
                "direction": "output",
                "content_type": "response",
                "content": long_response,
                "sequence_num": 2,
            },
        ]

        parsed = parser.parse_with_turns(interactions)

        self.assertIn("UNIQUE_START", parsed.transcript)
        self.assertIn("UNIQUE_END", parsed.transcript)
        self.assertNotIn("TRUNCATED FOR BREVITY", parsed.transcript)

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

    def test_real_claude_tui_fixture_removes_status_chrome(self) -> None:
        parser = TranscriptParser()
        fixture_path = FIXTURE_DIR / "c44952b5-8c8a-4b30-a3da-ea10ec1476f9.json"
        interactions = json.loads(fixture_path.read_text(encoding="utf-8"))

        parsed = parser.parse_with_turns(interactions)
        transcript = parsed.transcript.lower()

        self.assertTrue(parser._is_tui_session(interactions))
        self.assertIn("please read the brief.md file", transcript)
        self.assertIn("create utils folder", transcript)
        self.assertIn("main task: refactor and optimize", transcript)
        self.assertIn("the lrucache class features", transcript)
        self.assertNotIn("bypasspermissionson", transcript)
        self.assertNotIn("bypass permissions on", transcript)
        self.assertNotIn("catapulting", transcript)
        self.assertNotIn("ruminating", transcript)
        self.assertNotIn("ftng24", transcript)
        self.assertNotIn("function fo", transcript)
        self.assertNotIn("auto-update failed", transcript)
        self.assertNotIn("shift+tab", transcript)
        self.assertNotIn("esc to interrupt", transcript)
        self.assertNotIn("claude doctor", transcript)
        self.assertNotIn("\ufffd", parsed.transcript)
        self.assertNotIn("❯", parsed.transcript)
        self.assertNotIn("●", parsed.transcript)


if __name__ == "__main__":
    unittest.main()
