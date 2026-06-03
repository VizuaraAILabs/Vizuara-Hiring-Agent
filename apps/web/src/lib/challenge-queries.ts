import sql from './db';
import type { Challenge } from '@/types';

export async function getChallengeById(id: string): Promise<Challenge | undefined> {
  const [challenge] = await sql<Challenge[]>`
    SELECT
      id,
      company_id,
      title,
      description,
      time_limit_min,
      is_active,
      starter_files_dir,
      starter_files,
      sessions_limit,
      allowed_emails,
      starts_at,
      ends_at,
      role,
      tech_stack,
      seniority,
      focus_areas,
      context,
      cohort_label,
      invite_email_subject,
      invite_email_body,
      archived_at,
      created_at
    FROM challenges
    WHERE id = ${id}
  `;

  return challenge;
}
