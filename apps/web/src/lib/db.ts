import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://hiring:hiring@localhost:5432/hiring_agent';

const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;
