// =============================================
// @relayon/sdk — Public Types
// =============================================

export interface RelayonConfig {
  /** API key (format: rl_live_...) */
  apiKey: string;
  /** Base URL of the Relayon API (default: https://api.relayon.io) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retries on 429 rate limit (default: 3) */
  maxRetries?: number;
}

// --- Job Types ---

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'paused';

export interface RetryRule {
  max_retries: number;
  initial_delay_ms: number;
  backoff?: 'exponential' | 'linear' | 'fixed';
  respect_retry_after?: boolean;
}

export interface RetryConfig {
  '429'?: Partial<RetryRule>;
  '5xx'?: Partial<RetryRule>;
  '4xx'?: Partial<RetryRule>;
  timeout?: Partial<RetryRule>;
  connection?: Partial<RetryRule>;
}

export interface StepDefinition {
  name: string;
  endpoint: string;
}

export interface CreateJobOptions {
  /** URL to call (required, must start with http:// or https://) */
  endpoint: string;
  /** HTTP method (default: POST) */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON payload sent to the endpoint */
  payload?: Record<string, unknown>;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** HMAC-SHA256 signing key for webhook signatures */
  webhook_secret?: string;
  /** Delay before execution: "30s", "5m", "2h", "1d" */
  delay?: string;
  /** ISO 8601 timestamp for scheduled execution */
  run_at?: string | Date;
  /** 5-field cron expression for recurring jobs */
  cron?: string;
  /** Per-error-type retry overrides (merged with defaults) */
  retry?: RetryConfig;
  /** Priority: 1=critical, 2=high, 3=normal, 4=low (default: 3) */
  priority?: 1 | 2 | 3 | 4;
  /** UUID of parent job that must complete first */
  depends_on?: string;
  /** Block execution until approved via approveJob() */
  requires_approval?: boolean;
  /** Multi-step job: array of {name, endpoint} */
  steps?: StepDefinition[];
  /** Lock timeout in ms (default: 300000, range: 1000-3600000) */
  lock_timeout_ms?: number;
  /** Per-endpoint throttle: cap concurrency and requests-per-second */
  throttle?: {
    /** Max concurrent in-flight requests to this endpoint (1-1000) */
    max_concurrent?: number;
    /** Max requests per second to this endpoint (0.1-1000) */
    max_per_second?: number;
    /** Override the throttle key (default: endpoint hostname) */
    throttle_key?: string;
  };
}

export interface Job {
  id: string;
  api_key_id: string;
  user_id: string;
  endpoint: string;
  method: string;
  payload: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: JobStatus;
  priority: number;
  run_at: string;
  cron_expression: string | null;
  retry_config: Record<string, unknown>;
  attempt_count: number;
  depends_on: string | null;
  requires_approval: boolean;
  approved_at: string | null;
  approved_by: string | null;
  steps: StepDefinition[] | null;
  current_step: number;
  duration_ms: number | null;
  cost_cents: number | null;
  throttle_config: { max_concurrent: number; max_per_second: number; throttle_key: string } | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  step_name: string | null;
  status: 'success' | 'failed' | 'timeout';
  endpoint: string;
  request_method: string | null;
  request_headers: Record<string, string> | null;
  request_body: string | null;
  payload_sent: Record<string, unknown> | null;
  response_status: number | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number;
  worker_id: string;
  attempted_at: string;
}

export interface ListJobsOptions {
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// --- DLQ Types ---

export interface DLQEntry {
  id: string;
  original_job_id: string;
  api_key_id: string;
  user_id: string;
  endpoint: string;
  payload: Record<string, unknown> | null;
  headers: Record<string, string> | null;
  failure_reason: string;
  final_error: string | null;
  total_attempts: number;
  failed_at: string;
  replayed_at: string | null;
  replayed_job_id: string | null;
}

export interface ListDLQOptions {
  limit?: number;
  offset?: number;
}

export interface ReplayResult {
  replayed_job_id: string;
  dlq_id: string;
  job: {
    id: string;
    endpoint: string;
    status: string;
    created_at: string;
  };
}

// --- Health ---

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  database: string;
}
