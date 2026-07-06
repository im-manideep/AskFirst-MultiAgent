import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Pause, Minus, CircleAlert } from 'lucide-react'

export type StageStatus = 'idle' | 'active' | 'done' | 'paused' | 'skipped' | 'failed'

export interface StageState {
  key: string
  label: string
  status: StageStatus
  note?: string
}

export const STAGE_ORDER = ['triage', 'retrieval', 'resolver', 'approval', 'execute'] as const

export function freshStages(): StageState[] {
  return [
    { key: 'triage', label: 'Triage', status: 'idle' },
    { key: 'retrieval', label: 'Retrieval', status: 'idle' },
    { key: 'resolver', label: 'Resolver', status: 'idle' },
    { key: 'approval', label: 'Approval', status: 'idle' },
    { key: 'execute', label: 'Execute', status: 'idle' },
  ]
}

/** Starting point when resuming a paused ticket from the inbox. */
export function resumeStages(): StageState[] {
  const stages = freshStages()
  for (const s of stages) if (s.key !== 'approval' && s.key !== 'execute') s.status = 'done'
  stages[3].status = 'active'
  return stages
}

type BeamState = 'idle' | 'flowing' | 'filled' | 'stopped' | 'reverse'

/** The beam between two cards: idle track, flowing comet, settled fill,
 *  a breathing endpoint when the run is suspended at the next card,
 *  or a reversed comet when a rejection sends work back. */
function beamState(from: StageState, to: StageState): BeamState {
  if (from.key === 'resolver' && to.key === 'approval' && from.status === 'active' && to.status === 'done')
    return 'reverse'
  if (to.status === 'active') return from.status === 'done' || from.status === 'skipped' ? 'flowing' : 'idle'
  if (to.status === 'paused') return 'stopped'
  if (to.status === 'done') return 'filled'
  if (to.status === 'skipped') return from.status === 'done' ? 'filled' : 'idle'
  return 'idle'
}

function Beam({ state }: { state: BeamState }) {
  const reduced = useReducedMotion()
  const filled = state === 'filled' || state === 'stopped'
  return (
    <div className="relative hidden sm:block h-[2px] w-6 lg:w-10 shrink-0 rounded-full">
      <div className="absolute inset-0 rounded-full bg-white/10" />
      <motion.div
        className="absolute inset-0 rounded-full bg-white/40 origin-left"
        initial={false}
        animate={{ scaleX: filled || (reduced && (state === 'flowing' || state === 'reverse')) ? 1 : 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      {(state === 'flowing' || state === 'reverse') && !reduced && (
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <motion.div
            className="absolute top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/90 to-transparent"
            initial={{ x: state === 'reverse' ? '200%' : '-100%' }}
            animate={{ x: state === 'reverse' ? '-100%' : '200%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      )}
      {state === 'stopped' && (
        <motion.div
          className="absolute -right-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white"
          animate={reduced ? { opacity: 0.9 } : { opacity: [0.35, 1, 0.35], scale: [1, 1.5, 1] }}
          transition={reduced ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <Check className="h-4 w-4" />
  if (status === 'paused') return <Pause className="h-4 w-4" />
  if (status === 'skipped') return <Minus className="h-4 w-4" />
  if (status === 'failed') return <CircleAlert className="h-4 w-4" />
  return <span className="block h-1.5 w-1.5 rounded-full bg-current" />
}

function StageCard({ stage, dimmed }: { stage: StageState; dimmed: boolean }) {
  const reduced = useReducedMotion()
  const paused = stage.status === 'paused'
  const active = stage.status === 'active'
  const lit = stage.status !== 'idle'
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: dimmed ? 0.45 : stage.status === 'idle' ? 0.35 : stage.status === 'skipped' ? 0.55 : 1,
        scale: active || paused ? 1.02 : 1,
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="liquid-glass relative rounded-2xl px-4 py-3 w-full"
    >
      {(active || paused) && !reduced && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-white/10 blur-md"
          animate={{ opacity: paused ? [0.15, 0.5, 0.15] : [0.08, 0.28, 0.08] }}
          transition={{ duration: paused ? 2.8 : 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div className="relative flex items-center gap-2">
        <motion.span
          key={stage.status}
          initial={reduced || stage.status !== 'done' ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          className={lit ? 'text-foreground' : 'text-muted-foreground'}
        >
          <StageIcon status={stage.status} />
        </motion.span>
        <span className="text-sm text-foreground">{stage.label}</span>
      </div>
      <p className="relative mt-1 min-h-4 text-xs text-muted-foreground">
        {paused ? '⏸ waiting for a human' : stage.note ?? ''}
      </p>
    </motion.div>
  )
}

export default function PipelineTimeline({ stages }: { stages: StageState[] }) {
  const anyPaused = stages.some((s) => s.status === 'paused')
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
      {stages.map((stage, i) => (
        <Fragment key={stage.key}>
          <StageCard stage={stage} dimmed={anyPaused && stage.status !== 'paused'} />
          {i < stages.length - 1 && <Beam state={beamState(stage, stages[i + 1])} />}
        </Fragment>
      ))}
    </div>
  )
}
