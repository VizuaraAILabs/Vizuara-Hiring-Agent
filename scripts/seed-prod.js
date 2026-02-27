const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function seed() {
  const [existing] = await sql`SELECT id FROM companies WHERE email = 'demo@acme.com'`;
  if (existing) {
    console.log('Demo company already exists, skipping seed.');
    await sql.end();
    return;
  }

  const companyId = uuidv4();
  const passwordHash = bcrypt.hashSync('password123', 10);
  await sql`INSERT INTO companies (id, name, email, password_hash) VALUES (${companyId}, 'Acme Engineering', 'demo@acme.com', ${passwordHash})`;

  await sql`INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir)
    VALUES ('c0000001-0001-4000-a000-000000000006', ${companyId}, 'Design a Retrieval Strategy for RAG',
    'Build the retrieval component for a RAG system. See BRIEF.md for full instructions.',
    60, 'challenges/rag-retrieval')
    ON CONFLICT (id) DO NOTHING`;

  console.log('Demo data seeded!');
  console.log('  Email: demo@acme.com');
  console.log('  Password: password123');
  await sql.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
