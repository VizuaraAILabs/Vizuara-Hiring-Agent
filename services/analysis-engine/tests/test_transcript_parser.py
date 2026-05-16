from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.services.transcript_parser import TranscriptParser


class TranscriptParserTuiTests(unittest.TestCase):
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
