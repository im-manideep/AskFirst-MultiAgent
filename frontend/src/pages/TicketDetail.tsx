import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import Nav from '../components/Nav'
import { Reveal } from '../components/motion-bits'
import { getAudit, type TicketAudit } from '../lib/api'

function Section({
  title,
  delay = 0,
  children,
}: {
  title: string
  delay?: number
  children: React.ReactNode
}) {
  return (
    <Reveal delay={delay} className="liquid-glass rounded-2xl p-6">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-4">{title}</p>
      {children}
    </Reveal>
  )
}

export default function TicketDetail() {
  const { ticketId } = useParams()
  const [data, setData] = useState<TicketAudit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (ticketId) getAudit(ticketId).then(setData).catch((e) => setError(String(e)))
  }, [ticketId])

  return (
    <div>
      <Nav />
      <main className="relative max-w-5xl mx-auto px-6 py-16">
        <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← all tickets
        </Link>

        {error && <p className="text-sm text-muted-foreground mt-8">{error}</p>}

        {data && (
          <>
            <Reveal>
              <h1 className="font-display text-4xl sm:text-5xl mt-4">“{data.ticket.customer_message}”</h1>
              <p className="text-sm text-muted-foreground mt-3 mb-10">
                {data.ticket.ticket_id} · {data.ticket.status} · {data.state.category} ·{' '}
                {data.state.urgency} urgency · risk {data.state.risk}
                {data.state.revisions ? ` · ${data.state.revisions} revision(s)` : ''}
              </p>
            </Reveal>

            <div className="flex flex-col gap-6">
              <Section title="Audit trail">
                <ol className="flex flex-col gap-4">
                  {data.audit.map((entry, i) => (
                    <motion.li
                      key={i}
                      className="flex gap-4"
                      initial={reduced ? undefined : { opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: Math.min(i * 0.07, 0.6), ease: 'easeOut' }}
                    >
                      <span className="text-xs text-muted-foreground w-40 shrink-0">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                      <div>
                        <p className="text-sm text-foreground">
                          {entry.agent} <span className="text-muted-foreground">— {entry.summary}</span>
                        </p>
                        {entry.detail?.reason && (
                          <p className="text-xs text-muted-foreground mt-1">reason: {entry.detail.reason}</p>
                        )}
                        {entry.detail?.rationale && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {entry.detail.rationale}
                          </p>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </ol>
              </Section>

              {data.state.proposed_action && (
                <Section title="Final proposed action & reply" delay={0.08}>
                  <p className="text-sm text-foreground">
                    {data.state.proposed_action.type}
                    {data.state.proposed_action.params?.amount != null &&
                      ` — $${String(data.state.proposed_action.params.amount)}`}
                  </p>
                  {data.state.proposed_action.rationale && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {data.state.proposed_action.rationale}
                    </p>
                  )}
                  {data.state.draft_reply && (
                    <p className="text-sm text-muted-foreground mt-4 leading-relaxed whitespace-pre-wrap border-t border-border pt-4">
                      {data.state.draft_reply}
                    </p>
                  )}
                  {data.state.approval && (
                    <p className="text-xs text-muted-foreground mt-4">
                      human decision: {data.state.approval.decision}
                      {data.state.approval.reason && ` — "${data.state.approval.reason}"`} ·{' '}
                      {data.state.approval.approver} · {new Date(data.state.approval.at).toLocaleString()}
                    </p>
                  )}
                </Section>
              )}

              {data.state.kb_passages?.length > 0 && (
                <Section title="Policy passages used" delay={0.12}>
                  <ol className="flex flex-col gap-4">
                    {data.state.kb_passages.map((p: any, i: number) => (
                      <li key={i}>
                        <p className="text-xs text-foreground">
                          {p.source} — page {p.page} <span className="text-muted-foreground">(score {p.score})</span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.text}</p>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {data.actions.length > 0 && (
                <Section title="Executed actions (mock)" delay={0.16}>
                  <ol className="flex flex-col gap-3">
                    {data.actions.map((a, i) => (
                      <li key={i} className="text-sm">
                        <span className="text-foreground">{a.action_type}</span>{' '}
                        <span className="text-muted-foreground">
                          · ref {a.result?.reference} · {new Date(a.at).toLocaleString()}
                          {a.params?.amount != null && ` · $${String(a.params.amount)}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
