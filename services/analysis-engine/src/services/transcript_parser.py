from __future__ import annotations

import re


class TranscriptParser:
    """Parses raw interaction records from the database into a clean transcript string.

    Handles two modes of terminal capture:
    1. **Simple sessions** — interactions arrive as clean prompt/response pairs.
    2. **Claude Code TUI sessions** — raw PTY bytes with ANSI escape codes, cursor
       movements, spinner animations, and character-by-character keystroke echoing.
       The parser reconstructs meaningful conversation turns from this noisy data.
    """

    # ── ANSI / terminal cleaning regexes ──────────────────────────────

    _ANSI_RE = re.compile(
        r"\x1B"
        r"(?:"
        r"\[[0-?]*[ -/]*[@-~]"   # CSI sequences
        r"|\][^\x07]*\x07"       # OSC sequences
        r"|\[[\d;]*[a-zA-Z]"     # shorthand CSI
        r"|[()][AB012]"          # charset selection
        r"|[78DEHM=>Nc]"         # single-char escapes
        r")"
    )
    _CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
    _SPECIAL_KEY_RE = re.compile(r"\[([A-D]|[0-9;]+~|[FHOP])")

    # ── TUI noise patterns to strip from extracted text ───────────────

    _TUI_STRIP_PATTERNS = [
        re.compile(r"[─━╭╮╰╯│┃═]{4,}"),                           # box borders
        re.compile(r"⏸\s*plan\s*mode\s*on\b[^❯]*"),               # plan mode on ...
        re.compile(r"⏵⏵\s*accept\s*edits?\s*on\b[^❯]*"),          # accept edits on ...
        re.compile(r"shift\+tab\s*to\s*cycle[^❯]*"),               # shift+tab hint
        re.compile(r"esc\s*to\s*interrupt[^❯]*"),                   # esc hint
        re.compile(r"ctrl\+[a-z]\s*to\s*\w+[^❯]*", re.I),         # ctrl shortcuts
        re.compile(r"Press\s+up\s+to\s+edit\s+queued[^❯]*"),       # queued msg hint
        re.compile(r"Tab\s*to\s*amend[^❯]*"),                      # tab hint
        re.compile(r"Esc\s*to\s*cancel[^❯]*"),                     # esc cancel
        re.compile(r"Entertoconfirm[^❯]*"),                        # enter confirm
        re.compile(r"Type\s*(?:here\s*to\s*tell|something)[^❯]*"), # placeholder
        re.compile(r"[✻✶✳✢✽·⏺]\s*\w+…\s*(?:\([^)]*\))?"),        # spinner status
        re.compile(r"\(thinking\)"),                                 # thinking tag
        re.compile(r"\(ctrl\+o\s*to\s*expand\)"),                   # expand hint
        re.compile(r"Reading\s+\d+\s+file[^❯]*"),                  # reading files
        re.compile(r"Searching\s*for\s*\d+\s*pattern[^❯]*"),       # searching
        re.compile(r"Pasting\s+text…"),                             # paste indicator
        re.compile(r"⎿\s*Tip:.*"),                                  # tips
        re.compile(r"⎿\s*/plan\s+to\s+preview.*"),                 # plan preview
        re.compile(r"⎿\s*rag_pipeline\.py.*"),                      # file paths
        re.compile(r"⎿\s*data/.*"),                                 # data paths
        re.compile(r"⎿\s*Added\s*\d+\s*lines.*"),                  # diff stats
        re.compile(r"↓\s*[\d.]+k?\s*tokens?"),                     # token counts
        re.compile(r"↑\s*[\d.]+k?\s*tokens?"),                     # token counts
        re.compile(r"thought\s+for\s+\d+s"),                        # thinking time
        re.compile(r"\d+[ms]\s*\d*s?\s*·"),                        # timing
        re.compile(r"·\s*↓"),                                       # separator
        re.compile(r"·\s*↑"),                                       # separator
        re.compile(r"~/.claude/plans/\S+"),                         # plan file paths
        re.compile(r"/private/var/folders/\S+"),                     # temp paths
    ]

    # Patterns that indicate a turn is ONLY TUI chrome with no real content
    _TUI_ONLY_RE = re.compile(
        r"^[\s─━╭╮╰╯│┃═⏸⏵✻✶✳✢✽·⏺❯\d.,;:!?()\[\]]*$"
    )

    # Welcome/splash screen
    _WELCOME_SCREEN_RE = re.compile(r"╭───\s*Claude\s*Code\s*v")

    # Maximum transcript length
    _MAX_TRANSCRIPT_LENGTH = 80_000

    _LABELS = {
        "prompt": "[CANDIDATE PROMPT]",
        "command": "[CANDIDATE COMMAND]",
        "response": "[AI RESPONSE]",
        "terminal": "[TERMINAL OUTPUT]",
    }

    # ── Text cleaning ─────────────────────────────────────────────────

    def _strip_ansi(self, text: str) -> str:
        """Remove all ANSI escape sequences and control characters."""
        text = self._ANSI_RE.sub("", text)
        text = self._SPECIAL_KEY_RE.sub("", text)
        text = self._CONTROL_RE.sub("", text)
        return text

    def _clean_tui_text(self, text: str) -> str:
        """Aggressively clean TUI artifacts from extracted text."""
        # Remove all TUI noise patterns
        for pattern in self._TUI_STRIP_PATTERNS:
            text = pattern.sub(" ", text)

        # Remove orphaned spinner characters
        text = re.sub(r"(?<!\w)[✻✶✳✢✽·⏺](?!\w)", " ", text)

        # Remove single-character fragments (from keystroke echo)
        # These appear as isolated chars surrounded by whitespace
        text = re.sub(r"(?<=\s)[a-zA-Z](?=\s)", " ", text)

        # Remove ❯ markers
        text = re.sub(r"❯", " ", text)

        # Collapse whitespace
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n", "\n", text)
        text = text.strip()

        return text

    def _is_meaningful_text(self, text: str) -> bool:
        """Check if text contains meaningful content after cleaning."""
        # Remove all whitespace and punctuation for length check
        alpha = re.sub(r"[^a-zA-Z0-9]", "", text)
        return len(alpha) > 10

    # ── TUI detection ─────────────────────────────────────────────────

    def _is_tui_session(self, interactions: list[dict]) -> bool:
        """Detect if this is a Claude Code TUI session."""
        tui_markers = 0
        sample_size = min(50, len(interactions))
        for interaction in interactions[:sample_size]:
            content = interaction.get("content", "")
            if interaction.get("content_type") == "response":
                if "\x1b[?2026" in content or "❯" in content or "╭───" in content:
                    tui_markers += 1
        return tui_markers > 3

    # ── TUI conversation reconstruction ───────────────────────────────

    def _extract_tui_conversation(self, interactions: list[dict]) -> list[dict]:
        """Extract a structured conversation from Claude Code TUI raw output.

        Strategy:
        1. **Primary**: Find ❯-marked prompts in output records (complete prompts).
        2. **Supplement**: Use input/prompt records only if no ❯ version exists nearby.
        3. **Responses**: Extract meaningful AI content from large output blocks.
        """
        sorted_ints = sorted(interactions, key=lambda x: x.get("sequence_num", 0))

        # ── Step 1: Extract prompts from ❯ markers (authoritative) ───
        prompt_marker_hits: list[tuple[int, str, str]] = []  # (seq, text, ts)

        for interaction in sorted_ints:
            if interaction.get("content_type") != "response":
                continue
            content = interaction.get("content", "")
            seq = interaction.get("sequence_num", 0)
            ts = interaction.get("timestamp", "")
            cleaned = self._strip_ansi(content)

            for match in re.finditer(r"❯\s+(.+?)(?=\s*❯|\s*$)", cleaned, re.DOTALL):
                prompt_text = self._clean_tui_text(match.group(1).strip())
                # Require substantial content (filters keystroke echo noise)
                if len(prompt_text) > 30 and self._is_meaningful_text(prompt_text):
                    prompt_marker_hits.append((seq, prompt_text, ts))

        # ── Step 2: Collect input/prompt records (supplementary) ──────
        input_prompts: list[tuple[int, str, str]] = []
        for interaction in sorted_ints:
            if interaction.get("direction") != "input" or interaction.get("content_type") != "prompt":
                continue
            raw = self._strip_ansi(interaction.get("content", ""))
            raw = re.sub(r"\s+", " ", raw).strip()
            # Only keep substantial input records
            if len(raw) > 40:
                input_prompts.append((
                    interaction.get("sequence_num", 0),
                    raw,
                    interaction.get("timestamp", ""),
                ))

        # ── Step 3: Merge, deduplicate, pick best version ─────────────
        # Combine both sources, group overlapping prompts, keep longest.

        all_raw = prompt_marker_hits + input_prompts
        all_raw.sort(key=lambda x: x[0])

        # Group prompts that overlap (within 100 seq numbers, share content)
        merged: list[tuple[int, str, str]] = []
        used: set[int] = set()

        for i, (seq_a, text_a, ts_a) in enumerate(all_raw):
            if i in used:
                continue
            group = [(seq_a, text_a, ts_a)]
            norm_a = re.sub(r"\s+", "", text_a.lower())

            for j in range(i + 1, len(all_raw)):
                if j in used:
                    continue
                seq_b, text_b, ts_b = all_raw[j]
                if seq_b - seq_a > 100:
                    break
                norm_b = re.sub(r"\s+", "", text_b.lower())
                # Check if one is a substring of the other (fuzzy match)
                short, long = (norm_a, norm_b) if len(norm_a) < len(norm_b) else (norm_b, norm_a)
                if short[:25] in long or long[:25] in short:
                    group.append((seq_b, text_b, ts_b))
                    used.add(j)

            # Pick the longest, cleanest version
            best = max(group, key=lambda x: len(x[1]))
            merged.append(best)

        # ── Step 4: Final cleaning — keep only real prompts ───────────
        clean_prompts: list[tuple[int, str, str]] = []
        seen_norms: set[str] = set()

        for seq, text, ts in merged:
            text = self._clean_tui_text(text)

            # Must be substantial (filters fragments and noise)
            alpha_only = re.sub(r"[^a-zA-Z]", "", text)
            if len(alpha_only) < 20:
                continue

            # Skip known TUI/system interactions
            text_flat = text.replace(" ", "").lower()
            if any(p in text_flat for p in [
                "itrustthisfolder", "createautillogging",
                "pressuptoeditqueued", "forshortcuts",
                "brewedfor", "cookedfor", "crunchedfor", "sautéedfor",
            ]):
                continue

            # Skip if it's a Claude response echo (starts with ⏺ or similar)
            if text.lstrip().startswith("⏺") or text_flat.startswith("wait⏺"):
                continue

            # Dedup: skip if we've seen a very similar prompt
            norm = re.sub(r"\s+", "", text.lower())[:100]
            is_dup = False
            for seen in seen_norms:
                if norm[:40] in seen or seen[:40] in norm:
                    is_dup = True
                    break
            if is_dup:
                continue
            seen_norms.add(norm)

            clean_prompts.append((seq, text, ts))

        # ── Step 5: Extract AI responses from large output blocks ─────
        # Real AI responses are in large output records between prompts.
        # Skip: welcome screens, spinner-only blocks, screen refreshes.

        ai_blocks: list[tuple[int, str, str]] = []

        for interaction in sorted_ints:
            if interaction.get("content_type") != "response":
                continue
            content = interaction.get("content", "")
            if len(content) < 800:
                continue

            seq = interaction.get("sequence_num", 0)
            ts = interaction.get("timestamp", "")
            cleaned = self._strip_ansi(content)

            # Skip welcome/splash screens
            if self._WELCOME_SCREEN_RE.search(cleaned):
                continue

            # Clean aggressively
            cleaned = self._clean_tui_text(cleaned)

            # Skip if too short or all noise
            if not self._is_meaningful_text(cleaned) or len(cleaned) < 40:
                continue

            # Skip if it's mostly a prompt we already have
            is_echo = False
            for _, ptext, _ in clean_prompts:
                if len(ptext) > 30 and ptext[:40] in cleaned[:200]:
                    is_echo = True
                    break
            if is_echo:
                continue

            ai_blocks.append((seq, cleaned, ts))

        # ── Step 6: Build conversation turns ──────────────────────────
        turns: list[dict] = []
        ai_idx = 0

        for p_idx, (p_seq, p_text, p_ts) in enumerate(clean_prompts):
            turns.append({
                "content_type": "prompt",
                "direction": "input",
                "content": p_text,
                "timestamp": p_ts,
                "sequence_num": p_seq,
            })

            # Find AI response blocks between this prompt and the next
            next_seq = clean_prompts[p_idx + 1][0] if p_idx + 1 < len(clean_prompts) else float("inf")
            parts = []

            while ai_idx < len(ai_blocks):
                a_seq, a_text, a_ts = ai_blocks[ai_idx]
                if a_seq <= p_seq:
                    ai_idx += 1
                    continue
                if a_seq >= next_seq:
                    break
                parts.append(a_text)
                ai_idx += 1

            if parts:
                combined = "\n\n".join(parts)
                if len(combined) > 3000:
                    combined = (
                        combined[:2500]
                        + "\n\n... [response truncated] ...\n\n"
                        + combined[-500:]
                    )
                turns.append({
                    "content_type": "response",
                    "direction": "output",
                    "content": combined,
                    "timestamp": p_ts,
                    "sequence_num": p_seq + 1,
                })

        return turns

    # ── Standard (non-TUI) processing ─────────────────────────────────

    def _clean_text(self, text: str) -> str:
        """Remove ANSI escapes, control characters, and terminal artifacts."""
        text = self._strip_ansi(text)
        text = re.sub(r"\n{4,}", "\n\n\n", text)
        return text

    def _collapse_consecutive(self, interactions: list[dict]) -> list[dict]:
        """Collapse consecutive records that share the same direction and content_type."""
        if not interactions:
            return []

        collapsed: list[dict] = []
        current = dict(interactions[0])
        current["content"] = self._clean_text(current.get("content", ""))

        for interaction in interactions[1:]:
            cleaned_content = self._clean_text(interaction.get("content", ""))
            if (
                interaction.get("direction") == current.get("direction")
                and interaction.get("content_type") == current.get("content_type")
            ):
                sep = "" if current.get("direction") == "input" else "\n"
                current["content"] += sep + cleaned_content
            else:
                collapsed.append(current)
                current = dict(interaction)
                current["content"] = cleaned_content

        collapsed.append(current)

        for segment in collapsed:
            if segment.get("direction") == "input":
                content = segment["content"]
                while "\b" in content or "\x7f" in content:
                    content = re.sub(r".\b", "", content)
                    content = re.sub(r".\x7f", "", content)
                content = re.sub(r"\s+", " ", content).strip()
                segment["content"] = content

        return collapsed

    def _truncate_ai_responses(self, segments: list[dict]) -> list[dict]:
        """If total transcript is too long, summarize AI responses."""
        total_length = sum(len(s.get("content", "")) for s in segments)
        if total_length <= self._MAX_TRANSCRIPT_LENGTH:
            return segments

        candidate_length = sum(
            len(s.get("content", ""))
            for s in segments
            if s.get("content_type") in ("prompt", "command")
        )
        non_candidate = [
            s for s in segments
            if s.get("content_type") in ("response", "terminal")
        ]
        if not non_candidate:
            return segments

        remaining = self._MAX_TRANSCRIPT_LENGTH - candidate_length
        budget = max(500, remaining // len(non_candidate))

        truncated: list[dict] = []
        for segment in segments:
            if segment.get("content_type") in ("response", "terminal"):
                content = segment.get("content", "")
                if len(content) > budget:
                    head = int(budget * 0.7)
                    tail = int(budget * 0.3)
                    segment = dict(segment)
                    segment["content"] = (
                        content[:head]
                        + "\n\n... [TRUNCATED FOR BREVITY] ...\n\n"
                        + content[-tail:]
                    )
            truncated.append(segment)

        return truncated

    def _format_segment(self, segment: dict, index: int) -> str:
        """Format a single interaction segment into a transcript block."""
        content_type = segment.get("content_type", "terminal")
        label = self._LABELS.get(content_type, "[UNKNOWN]")
        timestamp = segment.get("timestamp", "")
        content = segment.get("content", "").strip()

        if not content:
            return ""

        header = f"--- {label} (#{index})"
        if timestamp:
            header += f" [{timestamp}]"
        header += " ---"

        return f"{header}\n{content}\n"

    # ── Main entry point ──────────────────────────────────────────────

    def parse(self, interactions: list[dict]) -> str:
        """Parse raw interaction records into a clean, formatted transcript string."""
        if not interactions:
            return "[EMPTY TRANSCRIPT — no interactions recorded]"

        sorted_interactions = sorted(
            interactions, key=lambda x: x.get("sequence_num", 0)
        )

        if self._is_tui_session(sorted_interactions):
            segments = self._extract_tui_conversation(sorted_interactions)
        else:
            segments = self._collapse_consecutive(sorted_interactions)

        segments = [s for s in segments if s.get("content", "").strip()]
        segments = self._truncate_ai_responses(segments)

        parts: list[str] = [
            "=" * 60,
            "CANDIDATE SESSION TRANSCRIPT",
            "=" * 60,
            "",
        ]

        for i, segment in enumerate(segments, start=1):
            formatted = self._format_segment(segment, i)
            if formatted:
                parts.append(formatted)

        parts.append("=" * 60)
        parts.append("END OF TRANSCRIPT")
        parts.append("=" * 60)

        return "\n".join(parts)
