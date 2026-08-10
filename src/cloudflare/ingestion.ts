import { createHash, createHmac } from 'node:crypto'

const producerId = 'robotaxi-plate-scraper'

function workerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.ROBOTAXI_INGEST_URL?.replace(/\/$/, '')
  const secret = process.env.ROBOTAXI_INGEST_SECRET
  const required = ['1', 'true', 'yes'].includes(
    (process.env.ROBOTAXI_INGEST_REQUIRED || '').toLowerCase()
  )
  if (!baseUrl || !secret) {
    if (required) throw new Error('Robotaxi Worker ingestion is required but not configured')
    return null
  }
  return { baseUrl, secret }
}

export async function signedWorkerRequest(
  path: string,
  options: { method: 'POST' | 'PUT'; body: string | Uint8Array; idempotencyKey: string; contentType: string }
): Promise<Response | null> {
  const configured = workerConfig()
  if (!configured) return null
  const bodyBytes = typeof options.body === 'string' ? Buffer.from(options.body) : Buffer.from(options.body)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex')
  const canonical = [timestamp, producerId, options.idempotencyKey, bodyHash].join('\n')
  const signature = createHmac('sha256', configured.secret).update(canonical).digest('hex')
  return fetch(`${configured.baseUrl}${path}`, {
    method: options.method,
    headers: {
      'content-type': options.contentType,
      'content-length': String(bodyBytes.byteLength),
      'x-content-sha256': bodyHash,
      'idempotency-key': options.idempotencyKey,
      'x-robotaxi-producer': producerId,
      'x-robotaxi-timestamp': timestamp,
      'x-robotaxi-signature': signature,
    },
    body: bodyBytes,
    signal: AbortSignal.timeout(20_000),
  })
}

export function robotaxiWorkerBaseUrl(): string {
  const configured = workerConfig()
  if (!configured) throw new Error('Robotaxi Worker is not configured')
  return configured.baseUrl
}

export interface SourceRecordEvent {
  dataset: string
  id: string
  record: Record<string, unknown>
}

export async function sendSourceRecord(event: SourceRecordEvent): Promise<boolean> {
  const occurredAt = new Date().toISOString()
  const idempotencyKey = `${producerId}:${event.dataset}:${event.id}`.slice(0, 200)
  const body = JSON.stringify({
    schemaVersion: 1,
    type: 'source.record',
    idempotencyKey,
    occurredAt,
    dataset: event.dataset,
    record: { id: event.id, ...event.record },
  })
  const response = await signedWorkerRequest('/v1/ingest/events', {
    method: 'POST', body, idempotencyKey, contentType: 'application/json',
  })
  if (!response) return false
  if (!response.ok) throw new Error(`Robotaxi Worker rejected ingestion (${response.status})`)
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object' || !('accepted' in result) || result.accepted !== true) {
    throw new Error('Robotaxi Worker returned an invalid ingestion receipt')
  }
  return true
}

export async function sourceRecordExists(dataset: string, sourceId: string): Promise<boolean> {
  const body = JSON.stringify({ dataset, sourceId })
  const idempotencyKey = `${producerId}:lookup:${dataset}:${sourceId}`.slice(0, 200)
  const response = await signedWorkerRequest('/v1/ingest/lookup', {
    method: 'POST', body, idempotencyKey, contentType: 'application/json',
  })
  if (!response) return false
  if (!response.ok) throw new Error(`Robotaxi Worker rejected lookup (${response.status})`)
  const result = await response.json() as { exists?: unknown }
  return result.exists === true
}
