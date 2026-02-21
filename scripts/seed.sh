#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Seeding demo data ==="

# Use DATABASE_URL from environment, or default
DATABASE_URL="${DATABASE_URL:-postgresql://hiring:hiring@localhost:5432/hiring_agent}"

echo "Connecting to PostgreSQL..."

# Run schema migration first
echo "Running schema migration..."
psql "$DATABASE_URL" -f "$ROOT_DIR/database/migrations/001_pg_schema.sql"

echo "Inserting seed data..."

# Use Node.js to generate proper bcrypt hash and seed data
node -e "
const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const sql = postgres('$DATABASE_URL', { max: 1 });

async function seed() {
  // Check if company already exists
  const [existingCompany] = await sql\`SELECT id FROM companies WHERE email = 'demo@acme.com'\`;
  let companyId;
  let skipBaseData = false;

  if (existingCompany) {
    companyId = existingCompany.id;
    skipBaseData = true;
    console.log('Demo company already exists. Skipping base data, adding challenge templates...');
  } else {
    companyId = uuidv4();
  }

  if (!skipBaseData) {
    const challengeId = uuidv4();
    const sessionId = uuidv4();
    const analysisId = uuidv4();
    const token = 'demo-' + Math.random().toString(36).substring(2, 15);
    const passwordHash = bcrypt.hashSync('password123', 10);

    // Insert company
    await sql\`INSERT INTO companies (id, name, email, password_hash) VALUES (\${companyId}, 'Acme Engineering', 'demo@acme.com', \${passwordHash})\`;

    // Insert challenge
    await sql\`INSERT INTO challenges (id, company_id, title, description, time_limit_min)
      VALUES (\${challengeId}, \${companyId}, 'Build a REST API with Claude',
      'Build a simple REST API for a todo list application using Node.js and Express.\n\n## Requirements\n- CRUD operations for todos (Create, Read, Update, Delete)\n- Each todo should have: id, title, completed status, created_at\n- Use in-memory storage (no database needed)\n- Add input validation\n- Write at least 2 unit tests\n\n## Evaluation Criteria\n- How you decompose the problem into sub-tasks\n- How effectively you leverage the AI assistant\n- Quality of your prompts and iterations\n- Your debugging approach when things go wrong',
      60)\`;

    // Insert session (analyzed state with demo data)
    const startTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const endTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await sql\`INSERT INTO sessions (id, challenge_id, candidate_name, candidate_email, token, status, started_at, ended_at)
      VALUES (\${sessionId}, \${challengeId}, 'Alex Johnson', 'alex@example.com', \${token}, 'analyzed', \${startTime}, \${endTime})\`;

    // Insert sample interactions
    const interactions = [
      { seq: 1, dir: 'input', content: 'claude \"Help me build a REST API for a todo list app with Node.js and Express\"', type: 'command' },
      { seq: 2, dir: 'output', content: 'I\\'ll help you build a REST API for a todo list app. Let me start by setting up the project structure.\\n\\nFirst, let\\'s initialize the project and install dependencies...', type: 'response' },
      { seq: 3, dir: 'input', content: 'Let\\'s start with the project setup. Can you create a package.json with Express and then set up the basic server structure? I want to organize it with separate route files.', type: 'prompt' },
      { seq: 4, dir: 'output', content: 'Great approach! Let me create a well-organized project structure...\\n\\nI\\'ll create:\\n1. package.json with Express\\n2. server.js - main entry point\\n3. routes/todos.js - todo routes\\n4. middleware/validate.js - input validation', type: 'response' },
      { seq: 5, dir: 'input', content: 'Now let\\'s implement the CRUD operations. Start with the in-memory store and the GET/POST endpoints. I want proper error handling and status codes.', type: 'prompt' },
      { seq: 6, dir: 'output', content: 'Here are the CRUD operations with proper error handling...', type: 'response' },
      { seq: 7, dir: 'input', content: 'npm test', type: 'command' },
      { seq: 8, dir: 'output', content: 'Error: Cannot find module \\'jest\\'\\n\\nnpm ERR! missing script: test', type: 'terminal' },
      { seq: 9, dir: 'input', content: 'We need to add Jest. Can you update package.json with jest as a dev dependency and create a test file for the todo routes? Test the POST and GET endpoints.', type: 'prompt' },
      { seq: 10, dir: 'output', content: 'Let me set up Jest and create comprehensive tests...', type: 'response' },
      { seq: 11, dir: 'input', content: 'The validation middleware should check that title is a non-empty string and completed is a boolean. Can you also add a PATCH endpoint for partial updates?', type: 'prompt' },
      { seq: 12, dir: 'output', content: 'I\\'ll implement the validation middleware and PATCH endpoint...', type: 'response' },
      { seq: 13, dir: 'input', content: 'npm test', type: 'command' },
      { seq: 14, dir: 'output', content: 'PASS  tests/todos.test.js\\n  Todo API\\n    ✓ should create a new todo (23ms)\\n    ✓ should get all todos (5ms)\\n    ✓ should validate input (8ms)\\n\\nTest Suites: 1 passed, 1 total\\nTests:       3 passed, 3 total', type: 'terminal' },
      { seq: 15, dir: 'input', content: 'All tests pass. Let me also add a DELETE endpoint and test for edge cases like deleting a non-existent todo.', type: 'prompt' },
      { seq: 16, dir: 'output', content: 'Here\\'s the DELETE endpoint with proper 404 handling...', type: 'response' },
    ];

    for (const i of interactions) {
      await sql\`INSERT INTO interactions (session_id, sequence_num, direction, content, content_type, metadata)
        VALUES (\${sessionId}, \${i.seq}, \${i.dir}, \${i.content}, \${i.type}, '{}'::jsonb)\`;
    }

    // Insert analysis results
    const dimensionDetails = {
      problem_decomposition: { score: 85, narrative: 'Excellent job breaking the problem into logical steps: project setup, CRUD implementation, validation, testing. Each step built naturally on the previous one.', evidence: ['Organized approach starting with project structure', 'Separated concerns into routes and middleware', 'Incremental feature addition'] },
      first_principles: { score: 78, narrative: 'Good understanding of REST conventions and HTTP status codes. Could have explored alternative patterns more.', evidence: ['Proper use of HTTP methods', 'Understood validation needs', 'Asked for proper error handling'] },
      creativity: { score: 72, narrative: 'Solid but conventional approach. The middleware separation was a nice touch.', evidence: ['Middleware for validation', 'Organized file structure'] },
      iteration_quality: { score: 88, narrative: 'Strong iterative approach. Built up complexity gradually and refined based on test results.', evidence: ['Started simple then added complexity', 'Responded well to test failures', 'Added edge cases after basic tests passed'] },
      debugging_approach: { score: 82, narrative: 'Quickly identified the missing Jest dependency and resolved it effectively. Good error diagnosis.', evidence: ['Recognized missing dependency from error output', 'Added proper error handling preemptively'] },
      architecture_thinking: { score: 75, narrative: 'Good separation of concerns with routes and middleware. Could have considered more architectural patterns.', evidence: ['Separate route files', 'Middleware for cross-cutting concerns', 'Clean project structure'] },
      communication_clarity: { score: 90, narrative: 'Excellent prompt quality. Clear, specific instructions with context about expectations.', evidence: ['Specified requirements clearly', 'Provided context in each prompt', 'Used progressive disclosure'] },
      efficiency: { score: 80, narrative: 'Good time management. Completed all requirements within the time limit with room to spare.', evidence: ['No rabbit holes', 'Efficient progression through requirements', 'Tested incrementally'] },
    };

    const keyMoments = JSON.stringify([
      { timestamp: '3:00', type: 'strength', title: 'Strong problem decomposition', description: 'Immediately broke the problem into logical sub-tasks and communicated a clear plan to the AI.', interaction_index: 3 },
      { timestamp: '8:00', type: 'insight', title: 'Architecture decision', description: 'Proactively asked for separate route files and middleware, showing good system design instincts.', interaction_index: 3 },
      { timestamp: '15:00', type: 'weakness', title: 'Missing dependency oversight', description: 'Attempted to run tests without installing Jest first, though recovered quickly.', interaction_index: 7 },
      { timestamp: '18:00', type: 'pivot', title: 'Quick recovery from test failure', description: 'Immediately identified the issue and asked the AI to set up Jest properly instead of trying to debug manually.', interaction_index: 9 },
      { timestamp: '25:00', type: 'strength', title: 'Iterative refinement', description: 'After basic tests passed, proactively added validation and edge case testing.', interaction_index: 11 },
      { timestamp: '35:00', type: 'strength', title: 'Comprehensive completion', description: 'Added DELETE endpoint and edge case tests, going beyond minimum requirements.', interaction_index: 15 },
    ]);

    const timelineData = JSON.stringify([
      { start_time: 0, end_time: 3, activity: 'Problem analysis', category: 'planning' },
      { start_time: 3, end_time: 8, activity: 'Project setup', category: 'coding' },
      { start_time: 8, end_time: 15, activity: 'CRUD implementation', category: 'coding' },
      { start_time: 15, end_time: 18, activity: 'Debug test setup', category: 'debugging' },
      { start_time: 18, end_time: 25, activity: 'Test writing', category: 'coding' },
      { start_time: 25, end_time: 30, activity: 'Validation middleware', category: 'prompting' },
      { start_time: 30, end_time: 35, activity: 'Edge cases & polish', category: 'reviewing' },
      { start_time: 35, end_time: 40, activity: 'Final testing', category: 'debugging' },
    ]);

    const promptComplexity = JSON.stringify([
      { sequence: 1, complexity: 45, label: 'Initial broad request' },
      { sequence: 2, complexity: 65, label: 'Structured setup request' },
      { sequence: 3, complexity: 70, label: 'Specific CRUD requirements' },
      { sequence: 4, complexity: 75, label: 'Testing setup with context' },
      { sequence: 5, complexity: 80, label: 'Detailed validation rules' },
      { sequence: 6, complexity: 72, label: 'Edge case additions' },
    ]);

    const categoryBreakdown = JSON.stringify({
      planning: 12,
      coding: 40,
      debugging: 18,
      prompting: 15,
      reviewing: 15,
    });

    const strengths = JSON.stringify(['Excellent prompt clarity and specificity', 'Strong iterative development approach', 'Good problem decomposition skills', 'Effective error diagnosis and recovery']);
    const areasForGrowth = JSON.stringify(['Could explore more creative solutions', 'Consider broader architectural patterns', 'More proactive about edge cases from the start']);

    await sql\`INSERT INTO analysis_results (
      id, session_id, overall_score,
      problem_decomposition, first_principles, creativity, iteration_quality,
      debugging_approach, architecture_thinking, communication_clarity, efficiency,
      dimension_details, key_moments, timeline_data, prompt_complexity,
      category_breakdown, summary_narrative, strengths, areas_for_growth,
      hiring_recommendation, model_used
    ) VALUES (
      \${analysisId}, \${sessionId}, 81.25,
      85, 78, 72, 88, 82, 75, 90, 80,
      \${JSON.stringify(dimensionDetails)}::jsonb, \${keyMoments}::jsonb, \${timelineData}::jsonb, \${promptComplexity}::jsonb,
      \${categoryBreakdown}::jsonb,
      'Alex demonstrated strong AI collaboration skills, particularly in communication clarity and iteration quality. They broke down the problem systematically, communicated clear requirements to the AI assistant, and iterated effectively based on feedback. The candidate showed good debugging instincts and maintained focus throughout the session.',
      \${strengths}::jsonb, \${areasForGrowth}::jsonb,
      'yes', 'claude-sonnet-4-5-20250929'
    )\`;
  } // end skipBaseData

  // --- Insert RAG challenge template ---
  const challengeTemplates = [
    {
      id: 'c0000001-0001-4000-a000-000000000006',
      title: 'Design a Retrieval Strategy for RAG',
      description: '## Objective\\nBuild the retrieval component for a RAG system over technical documentation. You\\'re given 200 pre-chunked docs and 30 test queries with human-graded relevance judgments.\\n\\n## Setup\\n\\\`\\\`\\\`bash\\npip install -r requirements.txt\\n\\\`\\\`\\\`\\n\\nRead \\\`BRIEF.md\\\` for full instructions.\\n\\n## What You\\'re Working With\\n- \\\`data/chunks.jsonl\\\` — 200 documentation chunks (API refs, tutorials, guides, changelogs, FAQ)\\n- \\\`data/queries.jsonl\\\` — 30 test queries with graded relevance (high/medium/low)\\n- \\\`requirements.txt\\\` — Allowed packages (numpy, pandas, scikit-learn, nltk, rank_bm25)\\n\\n## Deliverables\\n1. \\\`retriever.py\\\` — CLI: \\\`python retriever.py \"your query here\"\\\`\\n2. \\\`evaluate.py\\\` — Measures retrieval quality against test queries\\n3. \\\`DESIGN.md\\\` — Your approach, trade-offs, results, and future work\\n\\n## Constraints\\n- No external APIs (no OpenAI, Anthropic, Cohere, etc.)\\n- No model downloads (no HuggingFace transformers)\\n- Retrieval < 3s per query\\n- 60 minutes\\n\\n## Important\\nThere is no single correct approach. Your design choices and reasoning matter more than raw metrics.\\n\\n## Evaluation Criteria\\n- Quality of retrieval strategy design decisions\\n- How you handle the keyword-semantic gap\\n- Evaluation methodology and metric choices\\n- Trade-off analysis in DESIGN.md\\n- How you use the AI assistant for implementation vs. design',
      time_limit_min: 60,
      starter_files_dir: 'challenges/rag-retrieval',
    },
  ];

  for (const c of challengeTemplates) {
    await sql\`INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir)
      VALUES (\${c.id}, \${companyId}, \${c.title}, \${c.description}, \${c.time_limit_min}, \${c.starter_files_dir})
      ON CONFLICT (id) DO NOTHING\`;
  }

  console.log('');
  console.log('=== Demo data seeded! ===');
  console.log('');
  console.log('Company login:');
  console.log('  Email: demo@acme.com');
  console.log('  Password: password123');
  console.log('');
  console.log('Challenge templates seeded:');
  for (const c of challengeTemplates) {
    console.log('  - ' + c.title + ' (' + c.time_limit_min + ' min)');
  }
  console.log('');

  await sql.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
" 2>&1
