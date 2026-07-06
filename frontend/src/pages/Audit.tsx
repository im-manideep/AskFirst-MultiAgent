import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
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

  return (
    <div>
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="font-display text-5xl sm:text-6xl">
          Every step, <em className="not-italic text-muted-foreground">on the record.</em>
        </h1>
        <p className="text-muted-foreground text-sm mt-4 mb-10">
          Pick a ticket to see the full trail: agent decisions, policy passages, human calls.
        </p>

        {loaded && tickets.length === 0 && (
          <div className="liquid-glass rounded-2xl p-8">
            <p className="text-muted-foreground text-sm">
              No tickets yet — submit one from the{' '}
              <Link to="/" className="text-foreground underline underline-offset-4">
                intake page
              </Link>
              .
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {tickets.map((t) => (
            <Link
              key={t.ticket_id}
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
          ))}
        </div>
      </main>
    </div>
  )
}
