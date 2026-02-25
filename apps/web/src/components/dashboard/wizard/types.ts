export type RoleType = 'full-stack' | 'backend' | 'frontend' | 'data-ml' | 'devops';

export type SeniorityLevel = 'junior' | 'mid' | 'senior' | 'staff';

export type FocusArea =
  | 'debugging'
  | 'system-design'
  | 'api-design'
  | 'testing'
  | 'refactoring'
  | 'performance'
  | 'security'
  | 'data-modeling';

export interface WizardInputs {
  role: RoleType;
  techStack: string[];
  seniority: SeniorityLevel;
  focusAreas: FocusArea[];
  context: string;
}

export interface GeneratedChallenge {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  duration_minutes: number;
  tags: string[];
  why_iterative: string;
}

export interface GenerateResponse {
  challenges: GeneratedChallenge[];
  model: string;
  generated_at: string;
}
