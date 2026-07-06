import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Send } from 'lucide-react'
import Nav from '../components/Nav'
import PipelineTimeline, { STAGE_ORDER, freshStages, type StageState } from '../components/PipelineTimeline'
import { submitTicket, type InterruptPayload, type StreamEvent } from '../lib/api'

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4'

const PRESETS = [
  { label: 'Double-charged — refund $600', message: 'I was double-charged - refund my $600 annual payment', risky: true },
  { label: 'How do I reset my password?', message: 'How do I reset my password?', risky: false },
  { label: 'Cancel my plan', message: 'Please cancel my plan effective immediately', risky: true },
  { label: 'Does Starter include Slack?', message: 'Does the Starter plan include Slack integration?', risky: false },
]

function stageNote(node: string, update: Record<string, any>): string {
  switch (node) {
    case 'triage':
      return `${update.category} · ${update.urgency} · ${update.risk}`
    case 'retrieval':
      return `${(update.kb_passages ?? []).length} policy passages`
    case 'resolver':
      return `${update.proposed_action?.type ?? '?'} · ${update.risk}${update.revisions ? ` · rev ${update.revisions}` : ''}`
    case 'approval':
      return update.approval?.decision ?? ''
    case 'execute':
      return 'mock action executed'
    default:
      return ''
  }
}

export default function Home() {
  const [stages, setStages] = useState<StageState[]>(freshStages())
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState<InterruptPayload | null>(null)
  const [result, setResult] = useState<{ status: string; reply: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const demoRef = useRef<HTMLDivElement>(null)

  function applyEvent(ev: StreamEvent) {
    if (ev.event === 'node') {
      setStages((prev) => {
        const next = prev.map((s) => ({ ...s }))
        const idx = next.findIndex((s) => s.key === ev.node)
        if (idx < 0) return prev
        next[idx].status = 'done'
        next[idx].note = stageNote(ev.node, ev.update)
        if (ev.node === 'resolver' && ev.update.risk === 'safe') {
          next[STAGE_ORDER.indexOf('approval')].status = 'skipped'
          next[STAGE_ORDER.indexOf('approval')].note = 'safe action — no approval needed'
          next[STAGE_ORDER.indexOf('execute')].status = 'active'
        } else if (ev.node === 'approval' && ev.update.approval?.decision === 'rejected') {
          next[STAGE_ORDER.indexOf('resolver')].status = 'active'
          next[STAGE_ORDER.indexOf('resolver')].note = 'revising after rejection'
        } else {
          const follower = STAGE_ORDER[STAGE_ORDER.indexOf(ev.node as (typeof STAGE_ORDER)[number]) + 1]
          if (follower) {
            const fi = next.findIndex((s) => s.key === follower)
            if (fi >= 0 && next[fi].status === 'idle') next[fi].status = 'active'
          }
        }
        return next
      })
    } else if (ev.event === 'paused') {
      setPaused(ev.interrupt)
      setStages((prev) =>
        prev.map((s) => (s.key === 'approval' ? { ...s, status: 'paused' } : s)),
      )
    } else if (ev.event === 'done') {
      setResult({ status: ev.final_status, reply: ev.draft_reply })
      setStages((prev) =>
        prev.map((s) => {
          if (s.key === 'execute' && ev.final_status === 'resolved')
            return { ...s, status: 'done', note: 'mock action executed' }
          if (s.status === 'idle' || s.status === 'active')
            return { ...s, status: 'skipped', note: ev.final_status === 'escalated' ? 'escalated to a human' : s.note }
          return s
        }),
      )
    } else if (ev.event === 'error') {
      setError(ev.detail)
      setStages((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'failed' } : s)))
    }
  }

  async function run(msg: string) {
    if (!msg.trim() || running) return
    setRunning(true)
    setPaused(null)
    setResult(null)
    setError(null)
    setStages(() => {
      const next = freshStages()
      next[0].status = 'active'
      return next
    })
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      await submitTicket(msg, applyEvent)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      {/* Fullscreen video hero */}
      <div className="relative min-h-screen">
        <video
          autoPlay
          loop
          muted
          playsInline
          src={VIDEO_URL}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <Nav />
        <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-32 pb-40 py-[90px]">
          <h1 className="animate-fade-rise font-display font-normal text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] max-w-7xl">
            Support that knows
            <br />
            when to <em className="not-italic text-muted-foreground">ask.</em>
          </h1>
          <p className="animate-fade-rise-delay text-muted-foreground text-base sm:text-lg max-w-2xl mt-8 leading-relaxed">
            AI agents triage, research, and resolve — and pause for a human before any
            risky action.
          </p>
          <button
            onClick={() => demoRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="animate-fade-rise-delay-2 liquid-glass rounded-full px-14 py-5 text-base text-foreground mt-12 hover:scale-[1.03] transition-transform cursor-pointer"
          >
            See it pause
          </button>
        </section>
      </div>

      {/* Live demo */}
      <section ref={demoRef} className="max-w-5xl mx-auto px-6 py-24 scroll-mt-8">
        <h2 className="font-display text-4xl sm:text-5xl mb-2">Submit a ticket</h2>
        <p className="text-muted-foreground text-sm mb-8">
          Safe requests resolve on their own. Risky ones stop and wait for you.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              disabled={running}
              onClick={() => {
                setMessage(p.message)
                run(p.message)
              }}
              className="liquid-glass rounded-full px-5 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform cursor-pointer disabled:opacity-40"
            >
              {p.label}
              {p.risky && <span className="ml-2 text-muted-foreground">will pause</span>}
            </button>
          ))}
        </div>

        <div className="liquid-glass rounded-2xl flex items-center gap-2 p-2 mb-10">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run(message)}
            placeholder="Describe the customer's problem…"
            className="flex-1 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            onClick={() => run(message)}
            disabled={running || !message.trim()}
            className="liquid-glass rounded-xl p-3 text-foreground hover:scale-[1.05] transition-transform cursor-pointer disabled:opacity-40"
            aria-label="Submit ticket"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <PipelineTimeline stages={stages} />

        {paused && (
          <div className="liquid-glass rounded-2xl p-6 mt-8">
            <p className="font-display text-2xl">
              ⏸ Paused — <em className="not-italic text-muted-foreground">a human must approve this.</em>
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Proposed: <span className="text-foreground">{paused.proposed_action.type}</span>
              {paused.proposed_action.params?.amount != null && (
                <span className="text-foreground"> · ${String(paused.proposed_action.params.amount)}</span>
              )}
            </p>
            {paused.proposed_action.rationale && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {paused.proposed_action.rationale}
              </p>
            )}
            <Link
              to="/approvals"
              className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground mt-5 inline-flex items-center gap-2 hover:scale-[1.03] transition-transform"
            >
              Open the approval inbox <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {result && (
          <div className="liquid-glass rounded-2xl p-6 mt-8">
            <p className="font-display text-2xl">
              {result.status === 'resolved' ? 'Resolved' : 'Escalated'}
              {result.status === 'escalated' && (
                <em className="not-italic text-muted-foreground"> — handed to a human agent.</em>
              )}
            </p>
            {result.reply && (
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed whitespace-pre-wrap">
                {result.reply}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="liquid-glass rounded-2xl p-6 mt-8">
            <p className="text-sm text-muted-foreground">Something went wrong: {error}</p>
          </div>
        )}
      </section>
    </div>
  )
}
