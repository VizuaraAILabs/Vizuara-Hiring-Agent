# Build a CLI from Spec

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to plan your implementation approach, work through parsing logic, handle tricky edge cases, and refine your solution iteratively. This challenge is specifically designed to test how well you collaborate with AI on a moderately complex, spec-driven build — not just your ability to write code.

## Your Task

Build a command-line tool called `md2html` that converts Markdown files to HTML.

**Read `SPEC.md` in full before writing any code.** It defines exactly what the tool must support, including required Markdown elements, CLI flags, edge cases, and expected output format.

**You may use any programming language available in the terminal.**

## Verifying Your Implementation

The `tests/fixtures/` directory contains a reference input file and the exact HTML output your tool should produce:

```bash
# Run your tool against the fixture
md2html tests/fixtures/basic.md > /tmp/output.html

# Compare against the expected output (should produce no diff)
diff /tmp/output.html tests/fixtures/basic.expected.html
```

A clean `diff` (no output) means your implementation matches the spec for the tested cases. You should also test the CLI flags and edge cases described in `SPEC.md` manually.

## Deliverables

1. A working `md2html` executable or script that satisfies all requirements in `SPEC.md`
2. `diff /tmp/output.html tests/fixtures/basic.expected.html` produces no output
3. `APPROACH.md` — a short write-up covering:
   - Which language you chose and why
   - How you structured the parsing logic
   - Which requirements were trickiest and how you resolved them

## What's Being Evaluated

- How you translate a written specification into a working implementation
- How you break down the problem incrementally (not all at once)
- How you use the AI to handle tricky parsing cases and verify correctness
- Whether you test your work thoroughly — the fixture is a baseline, not a ceiling
