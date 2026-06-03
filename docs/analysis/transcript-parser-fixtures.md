# Transcript Parser Fixtures

The transcript parser should be tested against real interaction shapes from the `interactions` table. This is especially important for Claude Code TUI sessions because terminal glyphs, ANSI sequences, prompt markers, and mojibake can differ from what we expect by inspection.

## Source Table

Raw terminal and interview transcript records are stored in `interactions`:

- `session_id`
- `sequence_num`
- `timestamp`
- `direction`
- `content`
- `content_type`
- `metadata`

The analysis engine reads these rows ordered by `sequence_num` before calling `TranscriptParser`.

## Export Local Fixtures

First list recent sessions that have interaction rows:

```bash
node scripts/list-interaction-sessions.js --limit 20
```

To include sessions with no interactions:

```bash
node scripts/list-interaction-sessions.js --limit 20 --all
```

To filter by challenge:

```bash
node scripts/list-interaction-sessions.js --challenge-id <challenge-id>
```

Then use one of the printed `session_id` values with the export script:

```bash
node scripts/export-interaction-fixture.js --session-id <session-id> --limit 200
```

By default this writes:

```text
services/analysis-engine/tests/fixtures/interactions/<session-id>.json
```

That directory is gitignored on purpose. Real transcripts can contain candidate/company data, prompts, source code, logs, emails, or secrets. Keep raw exports local unless they have been reviewed and anonymized.

The script redacts obvious emails, auth headers, token-looking values, and secret-like key/value pairs by default. For local debugging only, you can disable redaction:

```bash
node scripts/export-interaction-fixture.js --session-id <session-id> --limit 200 --raw
```

## Recommended Fixture Set

Collect a few representative local fixtures:

- A normal shell session.
- A Claude Code TUI session with box drawing, prompt markers, spinners, and token counters.
- A noisy or long-output session.
- A session with interview question/response records if analysis uses that path.

Prefer `100` to `200` interactions per fixture. Use a larger limit only when reproducing a truncation or reconstruction bug.

## Test Strategy

Parser tests should load a fixture JSON file and run:

```python
transcript = TranscriptParser().parse(interactions)
```

Good assertions are behavior-focused:

- Important candidate commands/prompts are present.
- Meaningful AI responses are present.
- Obvious TUI chrome is absent.
- The transcript is not empty.
- Real Unicode glyphs and mojibake variants are handled deliberately.

If a fixture needs to be committed, create a sanitized copy under a non-gitignored test path and replace all identifying content with safe sample text while preserving the same terminal encoding shape.
