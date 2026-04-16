// =============================================
// @relayon/sdk — Main Client
// Zero dependencies — native fetch only
// =============================================

import {
  RelayonConfig,
  Job,
  CreateJobOptions,
  ListJobsOptions,
  PaginatedResponse,
  DLQEntry,
  ListDLQOptions,
  ReplayResult,
  HealthResponse,
} from './types';
import { RelayonError } from './errors';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;

export class Relayon {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: RelayonConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // --- Jobs ---

  async createJob(options: CreateJobOptions): Promise<Job> {
    const body: Record<string, unknown> = { endpoint: options.endpoint };

    if (options.method) body.method = options.method;
    if (options.payload) body.payload = options.payload;
    if (options.headers) body.headers = options.headers;
    if (options.webhook_secret) body.webhook_secret = options.webhook_secret;
    if (options.delay) body.delay = options.delay;
    if (options.run_at) {
      body.run_at = options.run_at instanceof Date
        ? options.run_at.toISOString()
        : options.run_at;
    }
    if (options.cron) body.cron = options.cron;
    if (options.retry) body.retry = options.retry;
    if (options.priority !== undefined) body.priority = options.priority;
    if (options.depends_on) body.depends_on = options.depends_on;
    if (options.requires_approval !== undefined) body.requires_approval = options.requires_approval;
    if (options.steps) body.steps = options.steps;
    if (options.lock_timeout_ms !== undefined) body.lock_timeout_ms = options.lock_timeout_ms;

    const res = await this.request<{ data: Job }>('POST', '/v1/jobs', body);
    return res.data;
  }

  async getJob(id: string): Promise<Job> {
    const res = await this.request<{ data: Job }>('GET', `/v1/jobs/${id}`);
    return res.data;
  }

  async listJobs(options?: ListJobsOptions): Promise<PaginatedResponse<Job>> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));

    const qs = params.toString();
    return this.request<PaginatedResponse<Job>>('GET', `/v1/jobs${qs ? `?${qs}` : ''}`);
  }

  async cancelJob(id: string): Promise<Job> {
    const res = await this.request<{ data: Job }>('POST', `/v1/jobs/${id}/cancel`);
    return res.data;
  }

  async pauseJob(id: string): Promise<Job> {
    const res = await this.request<{ data: Job }>('POST', `/v1/jobs/${id}/pause`);
    return res.data;
  }

  async resumeJob(id: string): Promise<Job> {
    const res = await this.request<{ data: Job }>('POST', `/v1/jobs/${id}/resume`);
    return res.data;
  }

  async approveJob(id: string): Promise<Job> {
    const res = await this.request<{ data: Job }>('POST', `/v1/jobs/${id}/approve`);
    return res.data;
  }

  // --- DLQ ---

  async listDLQ(options?: ListDLQOptions): Promise<PaginatedResponse<DLQEntry>> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));

    const qs = params.toString();
    return this.request<PaginatedResponse<DLQEntry>>('GET', `/v1/dlq${qs ? `?${qs}` : ''}`);
  }

  async replayDLQ(id: string): Promise<ReplayResult> {
    const res = await this.request<{ data: ReplayResult }>('POST', `/v1/dlq/${id}/replay`);
    return res.data;
  }

  // --- Health ---

  async health(): Promise<HealthResponse> {
    // Health endpoint doesn't require auth
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return await response.json() as HealthResponse;
    } catch (err) {
      clearTimeout(timeoutId);
      throw this.wrapError(err);
    }
  }

  // --- Internal ---

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${this.apiKey}`,
        };

        const hasBody = body !== undefined && body !== null;
        if (hasBody) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: hasBody ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limiting with auto-retry
        if (response.status === 429 && attempt < this.maxRetries) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
          await this.sleep(waitMs);
          continue;
        }

        const data = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          const error = data.error as { code: string; message: string } | undefined;
          throw new RelayonError(
            response.status,
            error?.code || 'UNKNOWN_ERROR',
            error?.message || `HTTP ${response.status}`,
          );
        }

        return data as T;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof RelayonError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry non-429 errors
        if (attempt < this.maxRetries && lastError.name === 'AbortError') {
          continue;
        }
        throw this.wrapError(lastError);
      }
    }

    throw lastError || new Error('Request failed');
  }

  private wrapError(err: unknown): Error {
    if (err instanceof RelayonError) return err;
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === 'AbortError') {
      return new RelayonError(0, 'TIMEOUT', `Request timed out after ${this.timeout}ms`);
    }
    return new RelayonError(0, 'NETWORK_ERROR', error.message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
