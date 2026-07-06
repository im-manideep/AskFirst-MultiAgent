import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import Nav from '../components/Nav'
import { decideTicket, getApprovals, type StreamEvent, type Ticket } from '../lib/api'

interface CardActivity {
  lines: string[]
  finished?: string
  busy: boolean
}

export default function Approvals() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [activity, setActivity] = useState<Record<string, CardActivity>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function refresh() {
    setTickets(await getApprovals())
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
  }, [])

  function pushLine(ticketId: string, line: string) {
    setActivity((prev) => {
      const cur = prev[ticketId] ?? { lines: [], busy: true }
      return { ...prev, [ticketId]: { ...cur, lines: [...cur.lines, line] } }
    })
  }

  async function decide(ticketId: string, decision: 'approved' | 'rejected', why: string | null) {
    setActivity((prev) => ({ ...prev, [ticketId]: { lines: [], busy: true } }))
    const onEvent = (ev: StreamEvent) => {
      if (ev.event === 'node') {
        if (ev.node === 'approval') pushLine(ticketId, `human ${ev.update.approval?.decision}`)
        else if (ev.node === 'resolver')
          pushLine(ticketId, `resolver revised → ${ev.update.proposed_action?.type} (${ev.update.risk})`)
        else if (ev.node === 'execute') pushLine(ticketId, 'action executed (mock)')
        else if (ev.node === 'escalate') pushLine(ticketId, 'escalated to a human agent')
      } else if (ev.event === 'paused') {
        pushLine(ticketId, 'paused again — new proposal waiting')
      } else if (ev.event === 'done') {
        setActivity((prev) => ({
          ...prev,
          [ticketId]: { ...(prev[ticketId] ?? { lines: [] }), busy: false, finished: ev.final_status },
        }))
      } else if (ev.event === 'error') {
        pushLine(ticketId, `error: ${ev.detail}`)
      }
    }
    try {
      await decideTicket(ticketId, decision, why, onEvent)
    } catch (e) {
      pushLine(ticketId, `error: ${String(e)}`)
    } finally {
      setActivity((prev) => ({
        ...prev,
        [ticketId]: { ...(prev[ticketId] ?? { lines: [] }), busy: false },
      }))
      refresh()
    }
  }

  return (
    <div>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="font-display text-5xl sm:text-6xl">
          Approval <em className="not-italic text-muted-foreground">inbox.</em>
        </h1>
        <p className="text-muted-foreground text-sm mt-4 mb-10">
          These tickets are paused mid-run. Nothing executes until you decide.
        </p>

        {loaded && tickets.length === 0 && (
          <div className="liquid-glass rounded-2xl p-8">
            <p className="text-muted-foreground text-sm">
              Nothing is waiting for you. Submit a risky ticket from the{' '}
              <Link to="/" className="text-foreground underline underline-offset-4">
                intake page
              </Link>{' '}
              and watch it pause.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {tickets.map((t) => {
            const p = t.interrupt_payload
            const act = activity[t.ticket_id]
            return (
              <div key={t.ticket_id} className="liquid-glass rounded-2xl p-6">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground">{t.ticket_id}</span> ·{' '}
                    {new Date(t.created_at).toLocaleString()}
                    {p?.revisions ? ` · revision ${p.revisions}` : ''}
                  </p>
                  <Link
                    to={`/audit/${t.ticket_id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    full audit →
                  </Link>
                </div>

                <p className="font-display text-2xl mt-3">“{t.customer_message}”</p>

                {p && (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                        Proposed action
                      </p>
                      <p className="text-sm text-foreground">
                        {p.proposed_action.type}
                        {p.proposed_action.params?.amount != null &&
                          ` — $${String(p.proposed_action.params.amount)}`}
                      </p>
                      {p.proposed_action.rationale && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {p.proposed_action.rationale}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                        Draft reply
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {p.draft_reply}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-6 flex-wrap">
                  <button
                    disabled={act?.busy}
                    onClick={() => decide(t.ticket_id, 'approved', null)}
                    className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground inline-flex items-center gap-2 hover:scale-[1.03] transition-transform cursor-pointer disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    disabled={act?.busy}
                    onClick={() => {
                      setRejecting(t.ticket_id)
                      setReason('')
                    }}
                    className="liquid-glass rounded-full px-6 py-2.5 text-sm text-muted-foreground inline-flex items-center gap-2 hover:scale-[1.03] hover:text-foreground transition-transform cursor-pointer disabled:opacity-40"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                  {act?.busy && <span className="text-xs text-muted-foreground animate-pulse-soft">resuming…</span>}
                </div>

                {act && (act.lines.length > 0 || act.finished) && (
                  <div className="mt-4 border-t border-border pt-4">
                    {act.lines.map((line, i) => (
                      <p key={i} className="text-xs text-muted-foreground leading-6">
                        {line}
                      </p>
                    ))}
                    {act.finished && (
                      <p className="text-sm text-foreground mt-1">
                        {act.finished === 'resolved' ? 'Resolved.' : 'Escalated to a human agent.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Reject-with-reason modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60">
          <div className="liquid-glass rounded-2xl p-6 w-full max-w-lg bg-background/80">
            <p className="font-display text-2xl">Reject this proposal</p>
            <p className="text-sm text-muted-foreground mt-2">
              Your reason goes back to the resolver, which revises its plan (bounded), then
              asks again — or escalates.
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this wrong? e.g. amount doesn't match billing records"
              className="mt-4 w-full rounded-xl bg-secondary/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setRejecting(null)}
                className="rounded-full px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim()}
                onClick={() => {
                  const id = rejecting
                  setRejecting(null)
                  decide(id, 'rejected', reason.trim())
                }}
                className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform cursor-pointer disabled:opacity-40"
              >
                Reject &amp; send back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
