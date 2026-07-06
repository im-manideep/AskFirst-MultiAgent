export interface ProposedAction {
  type: string
  params: Record<string, unknown>
  rationale?: string
}

export interface InterruptPayload {
  ticket_id: string
  proposed_action: ProposedAction
  draft_reply: string
  revisions: number
}

export interface Ticket {
  ticket_id: string
  customer_message: string
  status: 'running' | 'pending_approval' | 'resolved' | 'escalated' | 'failed'
  interrupt_payload: InterruptPayload | null
  created_at: string
  updated_at: string
}

export type StreamEvent =
  | { event: 'node'; ticket_id: string; node: string; update: Record<string, any> }
  | { event: 'paused'; ticket_id: string; interrupt: InterruptPayload }
  | { event: 'done'; ticket_id: string; final_status: string; draft_reply: string }
  | { event: 'error'; ticket_id: string; detail: string }

export interface AuditEntry {
  agent: string
  summary: string
  detail: Record<string, any>
  at: string
}

export interface TicketAudit {
  ticket: Ticket
  audit: AuditEntry[]
  actions: { action_type: string; params: Record<string, any>; result: Record<string, any>; at: string }[]
  state: Record<string, any>
}

async function streamNDJSON(url: string, body: unknown, onEvent: (ev: StreamEvent) => void) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text()
    throw new Error(`${res.status}: ${detail}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) onEvent(JSON.parse(line) as StreamEvent)
    }
  }
}

export function submitTicket(message: string, onEvent: (ev: StreamEvent) => void) {
  return streamNDJSON('/api/tickets', { customer_message: message }, onEvent)
}

export function decideTicket(
  ticketId: string,
  decision: 'approved' | 'rejected',
  reason: string | null,
  onEvent: (ev: StreamEvent) => void,
) {
  return streamNDJSON(`/api/approvals/${ticketId}`, { decision, reason, approver: 'inbox' }, onEvent)
}

export async function getApprovals(): Promise<Ticket[]> {
  const res = await fetch('/api/approvals')
  return res.json()
}

export async function getTickets(): Promise<Ticket[]> {
  const res = await fetch('/api/tickets')
  return res.json()
}

export async function getAudit(ticketId: string): Promise<TicketAudit> {
  const res = await fetch(`/api/audit/${ticketId}`)
  if (!res.ok) throw new Error(`ticket ${ticketId} not found`)
  return res.json()
}
