# @relayon/sdk

TypeScript SDK for [Relayon.io](https://relayon.io) — background jobs and task scheduling.

Zero dependencies. Works with Node.js 18+, Bun, and Deno.

## Install

```bash
npm install @relayon/sdk
```

## Quick Start

```typescript
import { Relayon } from '@relayon/sdk'

const relayon = new Relayon({
  apiKey: 'rl_live_a1b2c3d4e5f6...',
  // baseUrl defaults to https://api.relayon.io
})

// Create a job
const job = await relayon.createJob({
  endpoint: 'https://myapp.com/api/send-email',
  payload: { userId: 123, template: 'welcome' },
})

console.log(job.id)     // "550e8400-..."
console.log(job.status) // "pending"
```

## Usage

### Create Jobs

```typescript
// Immediate execution
await relayon.createJob({
  endpoint: 'https://myapp.com/webhook',
  payload: { action: 'sync' },
})

// Delayed execution
await relayon.createJob({
  endpoint: 'https://myapp.com/webhook',
  delay: '30m',  // "30s", "5m", "2h", "1d"
})

// Scheduled execution
await relayon.createJob({
  endpoint: 'https://myapp.com/webhook',
  run_at: '2026-04-15T09:00:00Z',
})

// Recurring (cron)
await relayon.createJob({
  endpoint: 'https://myapp.com/cleanup',
  cron: '0 2 * * *', // 2 AM daily
})

// High priority
await relayon.createJob({
  endpoint: 'https://myapp.com/payment',
  priority: 1, // 1=critical, 2=high, 3=normal, 4=low
})

// With custom retry rules
await relayon.createJob({
  endpoint: 'https://myapp.com/webhook',
  retry: {
    '5xx': { max_retries: 10, initial_delay_ms: 5000 },
    '429': { max_retries: 20, respect_retry_after: true },
  },
})

// Multi-step workflow
await relayon.createJob({
  endpoint: 'https://myapp.com/step1',
  steps: [
    { name: 'validate', endpoint: 'https://myapp.com/step1' },
    { name: 'process', endpoint: 'https://myapp.com/step2' },
    { name: 'notify', endpoint: 'https://myapp.com/step3' },
  ],
})

// Requires human approval before execution
await relayon.createJob({
  endpoint: 'https://myapp.com/deploy',
  requires_approval: true,
})

// Depends on another job completing first
await relayon.createJob({
  endpoint: 'https://myapp.com/step2',
  depends_on: parentJob.id,
})

// Signed webhooks
await relayon.createJob({
  endpoint: 'https://myapp.com/webhook',
  webhook_secret: process.env.WEBHOOK_SECRET,
})
```

### Manage Jobs

```typescript
// Get job details
const job = await relayon.getJob('job-uuid')

// List jobs
const { data, pagination } = await relayon.listJobs({
  status: 'pending',
  limit: 50,
  offset: 0,
})

// Cancel
await relayon.cancelJob('job-uuid')

// Pause / Resume
await relayon.pauseJob('job-uuid')
await relayon.resumeJob('job-uuid')

// Approve
await relayon.approveJob('job-uuid')
```

### Dead Letter Queue

```typescript
// List failed jobs
const dlq = await relayon.listDLQ({ limit: 20 })

// Replay a failed job
const result = await relayon.replayDLQ('dlq-entry-uuid')
console.log(result.replayed_job_id) // new job created
```

### Health Check

```typescript
const health = await relayon.health()
// { status: 'ok', version: '1.0.0', database: 'connected' }
```

### Webhook Signature Verification

Verify incoming webhook requests in your server:

```typescript
import { verifyWebhookSignature } from '@relayon/sdk'

app.post('/webhook', (req, res) => {
  const isValid = verifyWebhookSignature(
    req.rawBody,                           // raw request body string
    req.headers['x-relayon-signature'],    // signature header
    process.env.WEBHOOK_SECRET,            // your secret
  )

  if (!isValid) {
    return res.status(401).send('Invalid signature')
  }

  // Process the webhook
  const jobId = req.headers['x-relayon-job-id']
  const attempt = req.headers['x-relayon-attempt']
  const idempotencyKey = req.headers['x-relayon-idempotency-key']
})
```

## Error Handling

```typescript
import { Relayon, RelayonError } from '@relayon/sdk'

try {
  await relayon.createJob({ endpoint: 'invalid' })
} catch (err) {
  if (err instanceof RelayonError) {
    console.log(err.statusCode) // 400
    console.log(err.code)       // "VALIDATION_ERROR"
    console.log(err.message)    // "Field 'endpoint' must be a valid URL..."
  }
}
```

The SDK auto-retries on 429 (rate limited) responses, respecting the `Retry-After` header.

## Configuration

```typescript
const relayon = new Relayon({
  apiKey: 'rl_live_...',              // required
  baseUrl: 'https://api.relayon.io',  // default
  timeout: 30000,                     // request timeout in ms
  maxRetries: 3,                      // max retries on 429
})
```
