import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import { CountUp, Reveal } from '../components/motion-bits'
import { getTickets, type Ticket } from '../lib/api'

const STATUS_LABEL: Record<Ticket['status'], string> = {
  running: 'running',
  pending_approval: 'waiting for approval',
  resolved: 'resolved',
  escalated: 'escalated',
  failed: 'failed',
}

export default function Audit() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getTickets().then((t) => {
      setTickets(t)
      setLoaded(true)
    })
  }, [])

  const resolved = tickets.filter((t) => t.status === 'resolved').length
  const waiting = tickets.filter((t) => t.status === 'pending_approval').length

  return (
    <div>
      <Nav />
      <main className="relative max-w-5xl mx-auto px-6 py-16">
        <Reveal>
          <h1 className="font-display text-5xl sm:text-6xl">
            Every step, <em className="not-italic text-muted-foreground">on the record.</em>
          </h1>
          <p className="text-muted-foreground text-sm mt-4 mb-10">
            {loaded ? (
              <>
                <span className="text-foreground">
                  <CountUp value={tickets.length} />
                </span>{' '}
                tickets ·{' '}
                <span className="text-foreground">
                  <CountUp value={resolved} />
                </span>{' '}
                resolved ·{' '}
                <span className="text-foreground">
                  <CountUp value={waiting} />
                </span>{' '}
                waiting for approval — pick one for the full trail.
              </>
            ) : (
              'Pick a ticket to see the full trail: agent decisions, policy passages, human calls.'
            )}
          </p>
        </Reveal>

        {loaded && tickets.length === 0 && (
          <Reveal className="liquid-glass rounded-2xl p-8">
            <p className="text-muted-foreground text-sm">
              No tickets yet — submit one from the{' '}
              <Link to="/" className="text-foreground underline underline-offset-4">
                intake page
              </Link>
              .
            </p>
          </Reveal>
        )}

        <div className="flex flex-col gap-4">
          {tickets.map((t, i) => (
            <Reveal key={t.ticket_id} delay={Math.min(i * 0.05, 0.3)}>
              <Link
                to={`/audit/${t.ticket_id}`}
                className="liquid-glass rounded-2xl p-5 flex items-center justify-between gap-4 hover:scale-[1.01] transition-transform"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">“{t.customer_message}”</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.ticket_id} · {new Date(t.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {STATUS_LABEL[t.status]}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </main>
    </div>
  )
}
