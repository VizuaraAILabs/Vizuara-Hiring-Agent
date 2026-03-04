# Design a Retrieval Strategy for RAG

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to design your retrieval strategy, write and debug code, understand tradeoffs between approaches, interpret your evaluation metrics, and draft your DESIGN.md. This challenge rewards thoughtful AI collaboration — use it to think through design decisions, not just to generate boilerplate.

## Scenario

You're building the retrieval component for a Retrieval-Augmented Generation (RAG) system that helps developers navigate the documentation for **NexusDB** — a fictional distributed database platform.

The documentation has already been chunked. You've been given 200 pre-chunked documents and 30 test queries with human-graded relevance judgments. Your job is to build a retrieval system that returns the most relevant chunks for any given query.

## What You're Working With

### `data/chunks.jsonl`
200 documentation chunks from the NexusDB docs. Each entry:
```json
{
  "chunk_id": "chunk_001",
  "text": "...",
  "title": "Authentication API Reference",
  "section": "auth/api-keys",
  "doc_type": "api_reference",
  "token_count": 187
}
```

Doc types: `api_reference`, `tutorial`, `conceptual_guide`, `changelog`, `faq`

### `data/queries.jsonl`
30 test queries with graded relevance. Each entry:
```json
{
  "query_id": "q_01",
  "text": "how do I authenticate API requests?",
  "query_type": "natural_language",
  "relevant_chunks": [
    {"chunk_id": "chunk_012", "relevance": "high"},
    {"chunk_id": "chunk_045", "relevance": "medium"},
    {"chunk_id": "chunk_102", "relevance": "low"}
  ]
}
```

Query types: `keyword`, `natural_language`, `conceptual`

Relevance levels: `high` (directly answers), `medium` (partially relevant), `low` (tangentially related)

## Getting Started

```bash
pip install -r requirements.txt
python retriever.py "how do I authenticate API requests?"
```

## Deliverables

### 1. `retriever.py`
A retrieval system you can run from the command line:
```bash
python retriever.py "how do I set up replication?"
```
Should print the top-k most relevant chunks with scores.

### 2. `evaluate.py`
An evaluation script that measures retrieval quality against the test queries:
```bash
python evaluate.py
```
Should print metrics showing how well your retriever performs.

### 3. `DESIGN.md`
A short document (1-2 pages) explaining:
- **Approach**: What retrieval strategy did you use and why?
- **Trade-offs**: What alternatives did you consider? Why did you pick this one?
- **Results**: What do your evaluation metrics show? Where does the system struggle?
- **Future work**: If you had more time (or access to embedding APIs), what would you do differently?

## Constraints

- **No external APIs** — no OpenAI, Anthropic, Cohere, or any embedding service calls
- **No model downloads** — no HuggingFace transformers, sentence-transformers, etc.
- **Allowed packages**: `numpy`, `pandas`, `scikit-learn`, `nltk`, `rank_bm25` (see `requirements.txt`)
- **Performance**: Retrieval should complete in under 3 seconds per query

## Important

There is no single correct approach. Your design choices and reasoning matter more than raw metrics.

Some things to think about:
- BM25 works great for keyword queries but struggles with natural language
- Graded relevance means a chunk can be "somewhat relevant" — how do you handle that in evaluation?
- The docs include API references, tutorials, and conceptual guides — should you treat them differently?
- Some queries are conceptual ("what's the difference between X and Y?") — how do you retrieve for those?

Good luck.
