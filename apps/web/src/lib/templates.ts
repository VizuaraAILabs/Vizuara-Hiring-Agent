export interface TemplateConfig {
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  duration_minutes: number;
  tags: string[];
}

export const TEMPLATES: TemplateConfig[] = [
  {
    slug: 'cli-from-spec',
    title: 'Build a CLI from Spec',
    description:
      'Build a md2html Markdown-to-HTML CLI tool from a detailed specification. Covers parsing, edge cases, and CLI flag design.',
    difficulty: 'intermediate',
    duration_minutes: 60,
    tags: ['CLI', 'Parsing', 'Any Language'],
  },
  {
    slug: 'data-detective',
    title: 'Data Detective: Find the Anomalies',
    description:
      'Investigate a transaction dataset to uncover anomalies and suspicious patterns. Produce a findings report.',
    difficulty: 'intermediate',
    duration_minutes: 45,
    tags: ['Python', 'Pandas', 'Data Analysis'],
  },
  {
    slug: 'extend-the-api',
    title: 'Extend a REST API',
    description:
      'Add new features to an existing Express.js REST API with JWT auth, tests, and in-memory storage.',
    difficulty: 'intermediate',
    duration_minutes: 60,
    tags: ['Node.js', 'Express', 'REST', 'Testing'],
  },
  {
    slug: 'fix-the-pipeline',
    title: 'Fix the Broken Pipeline',
    description:
      'Debug a Node.js data processing pipeline with 5 intentional bugs. All tests must pass.',
    difficulty: 'beginner',
    duration_minutes: 45,
    tags: ['Node.js', 'Debugging', 'Testing'],
  },
  {
    slug: 'rag-retrieval',
    title: 'Design a Retrieval Strategy for RAG',
    description:
      'Build the retrieval component for a RAG system using BM25 and evaluate against graded relevance judgments.',
    difficulty: 'advanced',
    duration_minutes: 60,
    tags: ['Python', 'NLP', 'Information Retrieval'],
  },
  {
    slug: 'refactor-the-monolith',
    title: 'Refactor the Monolith',
    description:
      'Refactor a 500+ line Python monolith into clean, modular code while keeping all tests passing.',
    difficulty: 'intermediate',
    duration_minutes: 60,
    tags: ['Python', 'Refactoring', 'Testing'],
  },
];
