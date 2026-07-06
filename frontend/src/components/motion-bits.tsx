import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { animate, motion, useInView, useReducedMotion } from 'framer-motion'

const spring = { type: 'spring' as const, stiffness: 420, damping: 24 }

/** Fade-rise once when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const inView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? undefined : { opacity: 0, y: 16 }}
      animate={inView || reduced ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Fade-rise immediately on mount (for conditionally rendered cards). */
export function Appear({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Expanding ring color pulsed from the button on click. */
  ripple?: 'green' | 'amber'
  wrapperClassName?: string
}

/** Button with spring hover/tap and an optional click ripple.
 *  The ripple lives outside the glass (liquid-glass clips overflow). */
export function GlassButton({
  ripple,
  wrapperClassName,
  className,
  children,
  onClick,
  disabled,
  ...rest
}: GlassButtonProps) {
  const reduced = useReducedMotion()
  const [ripples, setRipples] = useState<number[]>([])
  return (
    <motion.span
      className={`relative inline-flex ${wrapperClassName ?? ''}`}
      whileHover={reduced || disabled ? undefined : { scale: 1.03 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
      transition={spring}
    >
      <button
        className={className}
        disabled={disabled}
        onClick={(e) => {
          if (ripple && !reduced) {
            const id = Date.now() + Math.random()
            setRipples((r) => [...r, id])
            setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 650)
          }
          onClick?.(e)
        }}
        {...rest}
      >
        {children}
      </button>
      {ripples.map((id) => (
        <motion.span
          key={id}
          className={`pointer-events-none absolute inset-0 rounded-full border-2 ${
            ripple === 'green' ? 'border-emerald-400/70' : 'border-amber-400/70'
          }`}
          initial={{ opacity: 0.7, scale: 0.92 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      ))}
    </motion.span>
  )
}

/** Number that counts up to its value (~600ms); instant under reduced motion. */
export function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      return
    }
    const controls = animate(0, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduced])
  return <span>{display}</span>
}
