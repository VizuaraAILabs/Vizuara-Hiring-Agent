export interface Company {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  firebase_uid: string | null;
  created_at: string;
}

export interface Challenge {
  id: string;
  company_id: string;
  title: string;
  description: string;
  time_limit_min: number;
  is_active: number;
  starter_files_dir: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  challenge_id: string;
  candidate_name: string;
  candidate_email: string;
  token: string;
  status: 'pending' | 'active' | 'completed' | 'analyzed';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface Interaction {
  id: number;
  session_id: string;
  sequence_num: number;
  timestamp: string;
  direction: 'input' | 'output';
  content: string;
  content_type: 'terminal' | 'prompt' | 'response' | 'command';
  metadata: string;
}

export interface DimensionDetail {
  score: number;
  narrative: string;
  evidence: string[];
}

export interface KeyMoment {
  timestamp: string;
  type: 'strength' | 'weakness' | 'pivot' | 'insight';
  title: string;
  description: string;
  interaction_index?: number;
}

export interface TimelineEntry {
  start_time: number;
  end_time: number;
  activity: string;
  category: 'planning' | 'coding' | 'debugging' | 'prompting' | 'reviewing';
}

export interface PromptComplexityEntry {
  sequence: number;
  complexity: number;
  label: string;
}

export interface AnalysisResult {
  id: string;
  session_id: string;
  overall_score: number;
  problem_decomposition: number;
  first_principles: number;
  creativity: number;
  iteration_quality: number;
  debugging_approach: number;
  architecture_thinking: number;
  communication_clarity: number;
  efficiency: number;
  dimension_details: Record<string, DimensionDetail>;
  key_moments: KeyMoment[];
  timeline_data: TimelineEntry[];
  prompt_complexity: PromptComplexityEntry[];
  category_breakdown: Record<string, number>;
  summary_narrative: string;
  strengths: string[];
  areas_for_growth: string[];
  hiring_recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
  raw_claude_response: string | null;
  model_used: string | null;
  created_at: string;
}

export interface InteractionAnnotation {
  id: number;
  analysis_id: string;
  interaction_id: number;
  annotation_type: 'strength' | 'weakness' | 'pivot' | 'insight';
  label: string;
  description: string;
  dimension: string | null;
}

export interface SessionWithChallenge extends Session {
  challenge_title: string;
  challenge_description: string;
  time_limit_min: number;
}

// Cost tracking types

export interface UsageEvent {
  id: number;
  session_id: string | null;
  company_id: string | null;
  provider: 'anthropic' | 'gemini' | 'docker' | 'vps';
  event_type: 'api_call' | 'container_run' | 'fixed_monthly';
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  duration_seconds: number | null;
  cost_usd: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CostSettings {
  company_id: string;
  vps_monthly_cost_usd: number;
  anthropic_input_rate: number;
  anthropic_output_rate: number;
  gemini_input_rate: number;
  gemini_output_rate: number;
  updated_at: string;
}

export interface DailyCostSummary {
  date: string;
  anthropic: number;
  gemini: number;
  docker: number;
  vps: number;
  total: number;
}

export interface ProviderBreakdown {
  provider: string;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  event_count: number;
}

export interface SessionCostSummary {
  session_id: string;
  candidate_name: string;
  candidate_email: string;
  challenge_title: string;
  anthropic_cost: number;
  gemini_cost: number;
  docker_cost: number;
  total_cost: number;
  created_at: string;
}
