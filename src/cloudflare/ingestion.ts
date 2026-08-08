import { createHash, createHmac } from 'node:crypto'

const producerId = 'robotaxi-plate-scraper'

export interface SourceRecordEvent {
  dataset: string
  id: string
  record: Record<string, unknown>
}

export async function sendSourceRecord(event: SourceRecordEvent): Promise<boolean> {
  const baseUrl = process.env.ROBOTAXI_INGEST_URL?.replace(/\/$/, '')
  const secret = process.env.ROBOTAXI_INGEST_SECRET
  const required = ['1', 'true', 'yes'].includes(
    (process.env.ROBOTAXI_INGEST_REQUIRED || '').toLowerCase()
  )
  if (!baseUrl || !secret) {
    if (required) throw new Error('Robotaxi Worker ingestion is required but not configured')
    return false
  }

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
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const canonical = [timestamp, producerId, idempotencyKey, bodyHash].join('\n')
  const signature = createHmac('sha256', secret).update(canonical).digest('hex')

  const response = await fetch(`${baseUrl}/v1/ingest/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-robotaxi-producer': producerId,
      'x-robotaxi-timestamp': timestamp,
      'x-robotaxi-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Robotaxi Worker rejected ingestion (${response.status})`)
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object' || !('accepted' in result) || result.accepted !== true) {
    throw new Error('Robotaxi Worker returned an invalid ingestion receipt')
  }
  return true
}
