import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import Nav from '../components/Nav'
import PipelineTimeline, { resumeStages, type StageState } from '../components/PipelineTimeline'
import { Appear, GlassButton, Reveal } from '../components/motion-bits'
import { decideTicket, getApprovals, type StreamEvent, type Ticket } from '../lib/api'

interface CardActivity {
  stages: StageState[]
  finished?: string
  busy: boolean
  error?: string
}

function setStage(stages: StageState[], key: string, patch: Partial<StageState>): StageState[] {
  return stages.map((s) => (s.key === key ? { ...s, ...patch } : s))
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

  function patchActivity(ticketId: string, fn: (a: CardActivity) => CardActivity) {
    setActivity((prev) => ({
      ...prev,
      [ticketId]: fn(prev[ticketId] ?? { stages: resumeStages(), busy: true }),
    }))
  }

  async function decide(ticketId: string, decision: 'approved' | 'rejected', why: string | null) {
    setActivity((prev) => ({ ...prev, [ticketId]: { stages: resumeStages(), busy: true } }))
    let pausedAgain = false

    const onEvent = (ev: StreamEvent) => {
      if (ev.event === 'node') {
        patchActivity(ticketId, (a) => {
          let stages = a.stages
          if (ev.node === 'approval') {
            const approved = ev.update.approval?.decision === 'approved'
            stages = setStage(stages, 'approval', {
              status: 'done',
              note: approved ? 'human approved' : 'rejected — sending back',
            })
            stages = approved
              ? setStage(stages, 'execute', { status: 'active' })
              : setStage(stages, 'resolver', { status: 'active', note: 'revising with your reason' })
          } else if (ev.node === 'resolver') {
            stages = setStage(stages, 'resolver', {
              status: 'done',
              note: `${ev.update.proposed_action?.type ?? '?'} · ${ev.update.risk}${
                ev.update.revisions ? ` · rev ${ev.update.revisions}` : ''
              }`,
            })
            if (ev.update.risk === 'safe') {
              stages = setStage(stages, 'approval', { status: 'skipped', note: 'revised to a safe action' })
              stages = setStage(stages, 'execute', { status: 'active' })
            }
          } else if (ev.node === 'execute') {
            stages = setStage(stages, 'execute', { status: 'done', note: 'mock action executed' })
          } else if (ev.node === 'escalate') {
            stages = setStage(stages, 'execute', { status: 'skipped', note: 'escalated to a human' })
          }
          return { ...a, stages }
        })
      } else if (ev.event === 'paused') {
        pausedAgain = true
        patchActivity(ticketId, (a) => ({
          ...a,
          stages: setStage(a.stages, 'approval', { status: 'paused' }),
        }))
      } else if (ev.event === 'done') {
        patchActivity(ticketId, (a) => ({ ...a, finished: ev.final_status }))
      } else if (ev.event === 'error') {
        patchActivity(ticketId, (a) => ({ ...a, error: ev.detail }))
      }
    }

    try {
      await decideTicket(ticketId, decision, why, onEvent)
    } catch (e) {
      patchActivity(ticketId, (a) => ({ ...a, error: String(e) }))
    } finally {
      patchActivity(ticketId, (a) => ({ ...a, busy: false }))
      if (pausedAgain) refresh() // pull the revised proposal into the card
    }
  }

  function dismiss(ticketId: string) {
    setActivity((prev) => {
      const next = { ...prev }
      delete next[ticketId]
      return next
    })
    refresh()
  }

  return (
    <div>
      <Nav />
      <main className="relative max-w-5xl mx-auto px-6 py-16">
        <Reveal>
          <h1 className="font-display text-5xl sm:text-6xl">
            Approval <em className="not-italic text-muted-foreground">inbox.</em>
          </h1>
          <p className="text-muted-foreground text-sm mt-4 mb-10">
            These tickets are paused mid-run. Nothing executes until you decide.
          </p>
        </Reveal>

        {loaded && tickets.length === 0 && (
          <Appear className="liquid-glass rounded-2xl p-8">
            <p className="text-muted-foreground text-sm">
              Nothing is waiting for you. Submit a risky ticket from the{' '}
              <Link to="/" className="text-foreground underline underline-offset-4">
                intake page
              </Link>{' '}
              and watch it pause.
            </p>
          </Appear>
        )}

        <div className="flex flex-col gap-6">
          {tickets.map((t, i) => {
            const p = t.interrupt_payload
            const act = activity[t.ticket_id]
            const decided = act?.finished || act?.error
            return (
              <Reveal key={t.ticket_id} delay={Math.min(i * 0.06, 0.3)}>
                <div className="liquid-glass rounded-2xl p-6">
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

                  {!decided && (
                    <div className="flex items-center gap-3 mt-6 flex-wrap">
                      <GlassButton
                        ripple="green"
                        disabled={act?.busy}
                        onClick={() => decide(t.ticket_id, 'approved', null)}
                        className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground inline-flex items-center gap-2 cursor-pointer disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" /> Approve
                      </GlassButton>
                      <GlassButton
                        disabled={act?.busy}
                        onClick={() => {
                          setRejecting(t.ticket_id)
                          setReason('')
                        }}
                        className="liquid-glass rounded-full px-6 py-2.5 text-sm text-muted-foreground inline-flex items-center gap-2 hover:text-foreground cursor-pointer disabled:opacity-40"
                      >
                        <X className="h-4 w-4" /> Reject
                      </GlassButton>
                      {act?.busy && (
                        <span className="text-xs text-muted-foreground animate-pulse-soft">resuming…</span>
                      )}
                    </div>
                  )}

                  {act && (
                    <Appear className="mt-6 border-t border-border pt-5">
                      <PipelineTimeline stages={act.stages} />
                      {act.finished && (
                        <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
                          <p className="text-sm text-foreground">
                            {act.finished === 'resolved' ? 'Resolved.' : 'Escalated to a human agent.'}
                          </p>
                          <GlassButton
                            onClick={() => dismiss(t.ticket_id)}
                            className="liquid-glass rounded-full px-5 py-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            Dismiss
                          </GlassButton>
                        </div>
                      )}
                      {act.error && (
                        <p className="text-sm text-muted-foreground mt-4">error: {act.error}</p>
                      )}
                    </Appear>
                  )}
                </div>
              </Reveal>
            )
          })}
        </div>
      </main>

      {/* Reject-with-reason modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60">
          <Appear className="liquid-glass rounded-2xl p-6 w-full max-w-lg bg-background/80">
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
              <GlassButton
                ripple="amber"
                disabled={!reason.trim()}
                onClick={() => {
                  const id = rejecting
                  setRejecting(null)
                  decide(id, 'rejected', reason.trim())
                }}
                className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground cursor-pointer disabled:opacity-40"
              >
                Reject &amp; send back
              </GlassButton>
            </div>
          </Appear>
        </div>
      )}
    </div>
  )
}
