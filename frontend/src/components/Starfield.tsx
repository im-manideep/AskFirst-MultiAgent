import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  twinkle: number
}

/** Ambient drifting starfield behind the app pages.
 *  Canvas 2D, ~30fps throttled; prefers-reduced-motion gets one static frame. */
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let stars: Star[] = []
    let raf = 0
    let last = 0

    function seed() {
      const count = Math.min(130, Math.floor((window.innerWidth * window.innerHeight) / 16000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.2 + 0.3,
        speed: Math.random() * 6 + 2, // px per second, drifting up
        phase: Math.random() * Math.PI * 2,
        twinkle: Math.random() * 1.2 + 0.4,
      }))
    }

    function resize() {
      canvas!.width = window.innerWidth * dpr
      canvas!.height = window.innerHeight * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      draw(performance.now(), 0)
    }

    function draw(t: number, dt: number) {
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (const s of stars) {
        s.y -= s.speed * dt
        if (s.y < -4) {
          s.y = window.innerHeight + 4
          s.x = Math.random() * window.innerWidth
        }
        const alpha = 0.14 + 0.3 * Math.abs(Math.sin(t / 1000 * s.twinkle + s.phase))
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
        ctx!.fill()
      }
    }

    function loop(t: number) {
      raf = requestAnimationFrame(loop)
      if (t - last < 33) return // ~30fps cap
      const dt = last ? (t - last) / 1000 : 0
      last = t
      draw(t, dt)
    }

    resize()
    window.addEventListener('resize', resize)
    if (!reduced) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none opacity-60"
    />
  )
}
