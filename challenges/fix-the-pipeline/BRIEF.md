# Fix the Broken Pipeline

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to understand unfamiliar code patterns, discuss what failing tests are telling you, reason through root causes, and verify that your fixes are correct. The goal is to see how you collaborate with AI to diagnose and resolve real issues — not just to produce a passing test suite as fast as possible.

## The Situation

You've been handed a Node.js data processing pipeline left by a colleague who departed in a hurry. The pipeline is supposed to:

1. Accept a list of record IDs
2. Split them into fixed-size batches
3. Fetch data for each batch from an external source
4. Automatically retry failed fetches
5. Filter results above a numeric threshold
6. Return a single flat array of all matching records

Unfortunately, the pipeline doesn't behave correctly. **There are exactly 5 bugs spread across the source files.** Your task is to find and fix all of them so that the full test suite passes.

## Getting Started

```bash
npm install
npm test
```

The test output will show you which assertions are failing. Read it carefully — each test failure is a clue.

## Codebase Structure

```
src/
  config.js       — Pipeline configuration constants
  utils.js        — Helper utilities: chunking, retry logic, filtering
  pipeline.js     — Main pipeline orchestration
tests/
  pipeline.test.js  — Test suite (do not modify)
```

## Rules

- **Do not modify `tests/pipeline.test.js`** — fix the implementation only
- All 7 tests must pass
- Each bug is a genuine logic error, not a typo or missing semicolon

## Deliverables

1. `npm test` exits with all 7 tests passing
2. A brief comment added above each line you changed, explaining what was wrong and why your fix is correct

## What's Being Evaluated

- How you read and interpret failing test output
- How you trace execution to identify the root cause (rather than guessing)
- Whether you understand *why* each fix works, not just *what* to change
- How you use the AI assistant to reason through problems — not just to generate code
