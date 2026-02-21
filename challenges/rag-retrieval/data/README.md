# Data Format

## chunks.jsonl

200 documentation chunks from the NexusDB platform docs. One JSON object per line.

| Field | Type | Description |
|-------|------|-------------|
| `chunk_id` | string | Unique identifier (e.g., `chunk_001`) |
| `text` | string | The chunk content (50-500 tokens) |
| `title` | string | Document/section title |
| `section` | string | Hierarchical section path (e.g., `auth/api-keys`) |
| `doc_type` | string | One of: `api_reference`, `tutorial`, `conceptual_guide`, `changelog`, `faq` |
| `token_count` | integer | Approximate token count |

### Doc type distribution
- `api_reference`: ~50 chunks (endpoint docs, parameter tables, response schemas)
- `tutorial`: ~40 chunks (step-by-step guides, code examples)
- `conceptual_guide`: ~40 chunks (architecture explanations, design decisions)
- `changelog`: ~30 chunks (version notes, migration guides)
- `faq`: ~40 chunks (common questions and troubleshooting)

### Intentional properties
- Some chunks have high lexical overlap but cover different topics
- Some chunks are semantically relevant to queries but use different vocabulary
- Some chunks are near-duplicates reflecting version changes
- Chunk lengths vary significantly (50-500 tokens)

## queries.jsonl

30 test queries with human-graded relevance judgments. One JSON object per line.

| Field | Type | Description |
|-------|------|-------------|
| `query_id` | string | Unique identifier (e.g., `q_01`) |
| `text` | string | The query text |
| `query_type` | string | One of: `keyword`, `natural_language`, `conceptual` |
| `relevant_chunks` | array | List of `{chunk_id, relevance}` objects |

### Query type distribution
- `keyword`: 10 queries (terse, keyword-style, e.g., "NexusDB authentication endpoint")
- `natural_language`: 10 queries (full questions, e.g., "how do I handle rate limiting?")
- `conceptual`: 10 queries (abstract, e.g., "difference between sync and async replication")

### Relevance levels
- `high`: Chunk directly answers or addresses the query
- `medium`: Chunk is partially relevant or provides useful context
- `low`: Chunk is tangentially related

Each query has 2-5 relevant chunks at varying levels. Some queries have no `high` relevance chunk.
