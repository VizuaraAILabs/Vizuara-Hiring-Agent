# Markdown-to-HTML CLI Tool — Specification

## Overview

Build a command-line tool called `md2html` that converts Markdown files to HTML. The tool should be usable, well-structured, and handle edge cases gracefully.

You may use **any programming language** available in the terminal. Choose whatever you're most productive with.

## Usage

```bash
# Convert a single file (output to stdout)
md2html input.md

# Convert a file and write to output file
md2html input.md -o output.html

# Convert with a full HTML document wrapper
md2html input.md --full-page

# Read from stdin
cat README.md | md2html -

# Show help
md2html --help
```

## Required Markdown Features

Your converter must support these Markdown elements:

### 1. Headings
```markdown
# Heading 1      →  <h1>Heading 1</h1>
## Heading 2     →  <h2>Heading 2</h2>
### Heading 3    →  <h3>Heading 3</h3>
#### Heading 4   →  <h4>Heading 4</h4>
```

### 2. Paragraphs
Plain text separated by blank lines should be wrapped in `<p>` tags.

```markdown
First paragraph.

Second paragraph.
```
→
```html
<p>First paragraph.</p>
<p>Second paragraph.</p>
```

### 3. Inline Formatting
```markdown
**bold text**        →  <strong>bold text</strong>
*italic text*        →  <em>italic text</em>
`inline code`        →  <code>inline code</code>
[link text](url)     →  <a href="url">link text</a>
```

### 4. Unordered Lists
```markdown
- Item one
- Item two
- Item three
```
→
```html
<ul>
<li>Item one</li>
<li>Item two</li>
<li>Item three</li>
</ul>
```

### 5. Ordered Lists
```markdown
1. First
2. Second
3. Third
```
→
```html
<ol>
<li>First</li>
<li>Second</li>
<li>Third</li>
</ol>
```

### 6. Code Blocks
````markdown
```javascript
const x = 42;
```
````
→
```html
<pre><code class="language-javascript">const x = 42;
</code></pre>
```

### 7. Blockquotes
```markdown
> This is a quote
> across multiple lines
```
→
```html
<blockquote>
<p>This is a quote across multiple lines</p>
</blockquote>
```

### 8. Horizontal Rules
```markdown
---
```
→
```html
<hr>
```

## CLI Options

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Write output to a file instead of stdout |
| `--full-page` | Wrap output in a complete HTML document (`<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`) |
| `--title <title>` | Set the page title (only with `--full-page`, defaults to filename) |
| `-h, --help` | Show usage information |
| `-v, --version` | Show version number |

## Edge Cases to Handle

1. **Empty input** — Should produce empty output (not crash)
2. **No trailing newline** — Should work correctly
3. **Mixed inline formatting** — e.g., `**bold and *italic* together**`
4. **Special HTML characters** — `<`, `>`, `&` in text should be escaped to `&lt;`, `&gt;`, `&amp;`
5. **Code blocks preserve content** — No Markdown processing inside code blocks
6. **Multiple blank lines** — Should be treated the same as a single blank line
7. **File not found** — Show a helpful error message and exit with code 1

## Full Page Mode Example

When `--full-page` is used, the output should be wrapped:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Document</title>
</head>
<body>
<!-- converted content here -->
</body>
</html>
```

## Evaluation Criteria

You will be evaluated on:

1. **Working software** — Does the tool produce correct output?
2. **Code structure** — Is the code well-organized and readable?
3. **Error handling** — Does it handle edge cases and bad input gracefully?
4. **Testing** — Did you verify your work? (Manual testing is fine, automated tests are a bonus)
5. **Process** — How did you approach the problem? Did you plan before coding?

## Example Test File

Here's a sample Markdown file you can use for testing:

```markdown
# Welcome

This is a **test document** with *various* elements.

## Features

- Bold and italic: **strong** and *emphasized*
- Code: `console.log("hello")`
- Link: [Example](https://example.com)

## Code Example

\```python
def hello():
    print("Hello, world!")
\```

> This is a blockquote that should
> be rendered properly.

---

That's all, folks!
```

## Hints

- Start with the simplest features (headings, paragraphs) and build up
- Process the file line-by-line, keeping track of state (are you in a code block? a list?)
- Don't try to build a full Markdown parser — focus on the features listed above
- Test incrementally as you go
