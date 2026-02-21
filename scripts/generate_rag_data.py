#!/usr/bin/env python3
"""
Generate synthetic RAG retrieval challenge data using Gemini API.

Creates:
  - challenges/rag-retrieval/data/chunks.jsonl (200 documentation chunks)
  - challenges/rag-retrieval/data/queries.jsonl (30 test queries with graded relevance)

Usage:
  python scripts/generate_rag_data.py

Requires GEMINI_API_KEY or GOOGLE_API_KEY in .env.local
"""

import json
import os
import re
import sys
import time
from pathlib import Path

# Resolve paths
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "challenges" / "rag-retrieval" / "data"

# Load API key from .env.local
def load_api_key():
    env_file = ROOT_DIR / ".env.local"
    if not env_file.exists():
        print("Error: .env.local not found. Set GEMINI_API_KEY.")
        sys.exit(1)
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line.startswith("GEMINI_API_KEY=") or line.startswith("GOOGLE_API_KEY="):
            return line.split("=", 1)[1]
    print("Error: No GEMINI_API_KEY or GOOGLE_API_KEY found in .env.local")
    sys.exit(1)


API_KEY = load_api_key()

try:
    from google import genai
    client = genai.Client(api_key=API_KEY)
except ImportError:
    print("Error: google-genai package not installed. Run: pip install google-genai")
    sys.exit(1)


def call_gemini(prompt: str, max_retries: int = 3) -> str:
    """Call Gemini API with retry logic."""
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )
            return response.text
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Retrying in {wait}s... ({e})")
                time.sleep(wait)
            else:
                raise


def extract_json(text: str) -> str:
    """Extract JSON array from a response that may include markdown fences."""
    # Try to find JSON inside code fences
    match = re.search(r"```(?:json)?\s*\n([\s\S]*?)\n```", text)
    if match:
        return match.group(1).strip()
    # Try raw parse - find first [ and last ]
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        return text[start:end + 1]
    return text.strip()


# ---------------------------------------------------------------------------
# Chunk generation
# ---------------------------------------------------------------------------

CHUNK_BATCHES = [
    {
        "doc_type": "api_reference",
        "count": 50,
        "section_prefix": "api",
        "description": "API reference documentation for NexusDB endpoints",
        "topics": [
            "authentication (API keys, OAuth tokens, scopes)",
            "database operations (create, read, update, delete documents)",
            "query language (NexusQL syntax, filters, aggregations, joins)",
            "indexing (creating indexes, index types, compound indexes, full-text search indexes)",
            "replication (sync replication, async replication, configuring replicas, failover)",
            "transactions (ACID guarantees, isolation levels, distributed transactions)",
            "rate limiting (quotas, burst limits, rate limit headers, retry-after)",
            "webhooks (event subscriptions, payload format, delivery guarantees)",
            "admin API (cluster management, user management, backup/restore)",
            "streaming API (change streams, real-time subscriptions, cursor-based pagination)",
        ],
    },
    {
        "doc_type": "tutorial",
        "count": 40,
        "section_prefix": "tutorials",
        "description": "Step-by-step tutorials for NexusDB",
        "topics": [
            "getting started (install, connect, first document, first query)",
            "building a REST API with NexusDB (CRUD endpoints, error handling)",
            "setting up replication for high availability",
            "implementing full-text search with custom analyzers",
            "migrating from MongoDB to NexusDB",
            "using NexusDB with Python (nexusdb-py driver, async operations)",
            "performance tuning (query plans, explain output, slow query log)",
            "setting up automated backups and disaster recovery",
        ],
    },
    {
        "doc_type": "conceptual_guide",
        "count": 40,
        "section_prefix": "concepts",
        "description": "Conceptual/architectural guides for NexusDB",
        "topics": [
            "data modeling (document vs relational, embedding vs referencing, schema design patterns)",
            "distributed architecture (sharding, consistent hashing, partition strategies)",
            "consistency models (strong vs eventual, read-your-writes, causal consistency)",
            "storage engine internals (LSM trees, write-ahead log, compaction strategies)",
            "security model (authentication, authorization, encryption at rest, TLS)",
            "comparison with other databases (vs PostgreSQL, vs MongoDB, vs DynamoDB)",
            "CAP theorem trade-offs in NexusDB",
            "event sourcing and CQRS patterns with NexusDB",
        ],
    },
    {
        "doc_type": "changelog",
        "count": 30,
        "section_prefix": "changelog",
        "description": "Changelog and migration guides for NexusDB versions",
        "topics": [
            "v3.0 release (new query engine, breaking API changes, migration guide)",
            "v2.8 release (streaming API, performance improvements)",
            "v2.5 release (full-text search, new index types)",
            "v2.0 release (distributed transactions, sharding support)",
            "security patches and CVE fixes",
            "deprecation notices (old auth API, legacy query syntax)",
        ],
    },
    {
        "doc_type": "faq",
        "count": 40,
        "section_prefix": "faq",
        "description": "FAQ and troubleshooting for NexusDB",
        "topics": [
            "connection issues (timeouts, connection pooling, DNS resolution)",
            "performance problems (slow queries, high memory usage, disk I/O)",
            "replication lag and split-brain scenarios",
            "data migration and import/export",
            "error messages and their meanings",
            "billing and pricing questions",
            "compatibility (supported platforms, driver versions, client libraries)",
            "common mistakes and anti-patterns",
        ],
    },
]


def generate_chunks():
    """Generate all 200 documentation chunks."""
    all_chunks = []
    chunk_counter = 1

    for batch in CHUNK_BATCHES:
        doc_type = batch["doc_type"]
        count = batch["count"]
        topics_str = "\n".join(f"  - {t}" for t in batch["topics"])

        print(f"Generating {count} {doc_type} chunks...")

        prompt = f"""Generate exactly {count} documentation chunks for a fictional distributed database called NexusDB.

Doc type: {batch["description"]}

Topics to cover (distribute chunks across these):
{topics_str}

IMPORTANT REQUIREMENTS:
1. Each chunk should be a realistic documentation excerpt (50-500 tokens)
2. Include some chunks that have HIGH LEXICAL OVERLAP with each other but cover DIFFERENT topics
   - Example: Two chunks both mention "replication" heavily, but one is about data replication and the other is about replicating index structures
3. Include some chunks where the VOCABULARY is very different from related queries
   - Example: A chunk about "rate limiting" that uses terms like "throttling", "quota management", "request ceiling" instead of "rate limit"
4. Include 2-3 near-duplicate chunks that reflect slight version changes (e.g., same API endpoint documented for v2 and v3 with minor differences)
5. Vary chunk lengths: some very short (50 tokens), some medium (150-250 tokens), some long (400-500 tokens)
6. Make chunks feel like real documentation — include code examples, parameter tables, notes/warnings where appropriate

Return a JSON array where each element has:
- "text": the chunk content (string)
- "title": document/section title (string)
- "section": hierarchical section path using "{batch["section_prefix"]}/" prefix (e.g., "{batch["section_prefix"]}/auth/api-keys")

Return ONLY the JSON array, no other text. Do NOT include chunk_id, doc_type, or token_count — I'll add those.
"""
        raw = call_gemini(prompt)
        json_str = extract_json(raw)

        try:
            chunks = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"  Warning: Failed to parse JSON for {doc_type}: {e}")
            print(f"  Raw response (first 500 chars): {raw[:500]}")
            print("  Retrying with simpler prompt...")
            # Retry with a simpler prompt
            raw = call_gemini(f"Generate {count} JSON objects for NexusDB {doc_type} docs. "
                              f"Each has 'text' (50-500 tokens of realistic docs), 'title', 'section' (path starting with '{batch['section_prefix']}/). "
                              f"Topics: {', '.join(batch['topics'][:4])}. "
                              f"Return ONLY a JSON array, no markdown.")
            json_str = extract_json(raw)
            chunks = json.loads(json_str)

        # Ensure we have the right count — trim or note shortage
        if len(chunks) > count:
            chunks = chunks[:count]
        elif len(chunks) < count:
            print(f"  Warning: Got {len(chunks)}/{count} chunks for {doc_type}")

        for chunk in chunks:
            chunk_id = f"chunk_{chunk_counter:03d}"
            text = chunk.get("text", "")
            token_count = len(text.split())  # rough approximation
            all_chunks.append({
                "chunk_id": chunk_id,
                "text": text,
                "title": chunk.get("title", f"NexusDB {doc_type}"),
                "section": chunk.get("section", f"{batch['section_prefix']}/general"),
                "doc_type": doc_type,
                "token_count": token_count,
            })
            chunk_counter += 1

        # Rate limit courtesy
        time.sleep(1)

    return all_chunks


# ---------------------------------------------------------------------------
# Query generation
# ---------------------------------------------------------------------------

def generate_queries(chunks: list[dict]):
    """Generate 30 test queries with graded relevance."""
    # Build a summary of available chunks for the prompt
    chunk_summaries = []
    for c in chunks:
        chunk_summaries.append(
            f'{c["chunk_id"]}: [{c["doc_type"]}] {c["title"]} — {c["text"][:120]}...'
        )
    chunk_list_str = "\n".join(chunk_summaries)

    all_queries = []

    for query_type, count, description, examples in [
        ("keyword", 10, "terse keyword-style queries a developer would type into a search bar",
         ["NexusDB authentication API endpoint", "replication configuration parameters",
          "NexusQL aggregation syntax", "rate limit headers", "backup restore CLI"]),
        ("natural_language", 10, "natural language questions a developer would ask",
         ["How do I handle rate limiting when my app gets popular?",
          "What's the best way to set up automated backups?",
          "Why are my queries running slowly after adding a new index?",
          "How do I migrate my data from MongoDB to NexusDB?",
          "What happens to write operations during a failover?"]),
        ("conceptual", 10, "conceptual/comparison queries requiring deeper understanding",
         ["difference between sync and async replication in NexusDB",
          "when to use embedding vs referencing in document schema design",
          "how does NexusDB handle the CAP theorem trade-offs",
          "pros and cons of LSM tree storage engine",
          "NexusDB consistency guarantees compared to PostgreSQL"]),
    ]:
        print(f"Generating {count} {query_type} queries...")

        prompt = f"""You are generating test queries for a RAG retrieval evaluation benchmark.

Here are the available documentation chunks (chunk_id: [type] title — first 120 chars):
{chunk_list_str}

Generate exactly {count} {description}.

Examples of this style:
{chr(10).join(f"  - {ex}" for ex in examples)}

For EACH query, identify 2-5 relevant chunks from the list above and assign relevance grades:
- "high": chunk directly answers or addresses the query
- "medium": chunk is partially relevant or provides useful context
- "low": chunk is tangentially related

IMPORTANT:
1. Make 1-2 queries where NO chunk has "high" relevance (only medium/low) — to test partial match handling
2. Include some queries where the most relevant chunk uses very different vocabulary than the query
3. Make sure relevance assignments are realistic — don't mark chunks as relevant just because they share a keyword
4. Each query should have at least 2 relevant chunks

Return a JSON array where each element has:
- "text": the query text (string)
- "relevant_chunks": array of {{"chunk_id": "chunk_XXX", "relevance": "high"|"medium"|"low"}}

Return ONLY the JSON array, no other text. Do NOT include query_id or query_type — I'll add those.
"""
        raw = call_gemini(prompt)
        json_str = extract_json(raw)

        try:
            queries = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"  Warning: Failed to parse JSON for {query_type}: {e}")
            print(f"  Retrying...")
            raw = call_gemini(prompt)
            json_str = extract_json(raw)
            queries = json.loads(json_str)

        if len(queries) > count:
            queries = queries[:count]
        elif len(queries) < count:
            print(f"  Warning: Got {len(queries)}/{count} queries for {query_type}")

        for i, q in enumerate(queries):
            query_id = f"q_{len(all_queries) + 1:02d}"
            # Validate chunk references
            valid_chunk_ids = {c["chunk_id"] for c in chunks}
            relevant = []
            for rc in q.get("relevant_chunks", []):
                if rc.get("chunk_id") in valid_chunk_ids and rc.get("relevance") in ("high", "medium", "low"):
                    relevant.append({"chunk_id": rc["chunk_id"], "relevance": rc["relevance"]})

            if len(relevant) < 2:
                print(f"  Warning: Query '{q.get('text', '')[:50]}' has only {len(relevant)} valid relevant chunks")

            all_queries.append({
                "query_id": query_id,
                "text": q.get("text", ""),
                "query_type": query_type,
                "relevant_chunks": relevant,
            })

        time.sleep(1)

    return all_queries


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Generating RAG Retrieval Challenge Data")
    print("=" * 60)
    print()

    # Step 1: Generate chunks
    chunks = generate_chunks()
    print(f"\nGenerated {len(chunks)} chunks total")

    chunks_path = DATA_DIR / "chunks.jsonl"
    with open(chunks_path, "w") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk) + "\n")
    print(f"Wrote {chunks_path}")

    # Step 2: Generate queries
    print()
    queries = generate_queries(chunks)
    print(f"\nGenerated {len(queries)} queries total")

    queries_path = DATA_DIR / "queries.jsonl"
    with open(queries_path, "w") as f:
        for query in queries:
            f.write(json.dumps(query) + "\n")
    print(f"Wrote {queries_path}")

    # Step 3: Print summary
    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Chunks: {len(chunks)}")
    for dt in ["api_reference", "tutorial", "conceptual_guide", "changelog", "faq"]:
        n = sum(1 for c in chunks if c["doc_type"] == dt)
        print(f"  {dt}: {n}")
    print(f"Queries: {len(queries)}")
    for qt in ["keyword", "natural_language", "conceptual"]:
        n = sum(1 for q in queries if q["query_type"] == qt)
        print(f"  {qt}: {n}")

    # Validate relevance references
    chunk_ids = {c["chunk_id"] for c in chunks}
    bad_refs = 0
    for q in queries:
        for rc in q["relevant_chunks"]:
            if rc["chunk_id"] not in chunk_ids:
                bad_refs += 1
    if bad_refs:
        print(f"\nWarning: {bad_refs} relevance references point to non-existent chunks")
    else:
        print("\nAll relevance references valid.")

    print("\nDone!")


if __name__ == "__main__":
    main()
