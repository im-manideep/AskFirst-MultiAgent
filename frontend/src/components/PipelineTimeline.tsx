import { motion } from 'framer-motion'
import { Check, Pause, ChevronRight, Minus, CircleAlert } from 'lucide-react'

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

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <Check className="h-4 w-4" />
  if (status === 'paused') return <Pause className="h-4 w-4" />
  if (status === 'skipped') return <Minus className="h-4 w-4" />
  if (status === 'failed') return <CircleAlert className="h-4 w-4" />
  return <span className="block h-1.5 w-1.5 rounded-full bg-current" />
}

export default function PipelineTimeline({ stages }: { stages: StageState[] }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
      {stages.map((stage, i) => {
        const lit = stage.status !== 'idle'
        const paused = stage.status === 'paused'
        return (
          <div key={stage.key} className="flex items-center sm:flex-1">
            <motion.div
              initial={false}
              animate={{
                opacity: lit ? 1 : 0.35,
                scale: stage.status === 'active' || paused ? 1.03 : 1,
              }}
              transition={{ duration: 0.3 }}
              className={`liquid-glass rounded-2xl px-4 py-3 w-full ${
                stage.status === 'active' ? 'animate-pulse-soft' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={paused ? 'text-foreground' : lit ? 'text-foreground' : 'text-muted-foreground'}>
                  <StageIcon status={stage.status} />
                </span>
                <span className="text-sm text-foreground">{stage.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground min-h-4">
                {paused ? 'waiting for human approval' : stage.note ?? ''}
              </p>
            </motion.div>
            {i < stages.length - 1 && (
              <ChevronRight className="mx-1 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            )}
          </div>
        )
      })}
    </div>
  )
}
