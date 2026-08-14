import { useEffect, useRef } from "preact/hooks"

interface Point {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

/**
 * SplashCursor — a canvas-based pointer particle field inspired by reactbits SplashCursor.
 * Draws a flow of glowing particles that react to pointer movement across a full-screen canvas.
 */
export function SplashCursor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const pointer = { x: 0, y: 0, active: false, tx: 0, ty: 0 }
    const particles: Point[] = []

    const spawn = (x: number, y: number) => {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        r: 0
      })
      if (particles.length > 160) particles.shift()
    }

    const onMove = (e: PointerEvent) => {
      pointer.tx = e.clientX
      pointer.ty = e.clientY
      if (!pointer.active) {
        pointer.active = true
        spawn(pointer.tx, pointer.ty)
      }
    }

    const onDown = (e: PointerEvent) => {
      pointer.active = true
      pointer.tx = e.clientX
      pointer.ty = e.clientY
      spawn(pointer.tx, pointer.ty)
    }

    const onUp = () => {
      pointer.active = false
    }

    const tick = (t: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.4
      pointer.y += (pointer.ty - pointer.y) * 0.4

      if (pointer.active) spawn(pointer.x, pointer.y)

      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        // attract toward pointer
        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const dist = Math.hypot(dx, dy) || 0.001
        p.vx += dx / dist * 0.06
        p.vy += dy / dist * 0.06
        p.vx *= 0.96
        p.vy *= 0.96
        p.x += p.vx
        p.y += p.vy
        p.r = Math.min(3, 0.6 + i * 0.02)

        const life = 1 - i / particles.length
        const hue = 346 + Math.sin(t * 0.001 + i * 0.1) * 30
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${hue}, 95%, 65%, ${(0.6 * life).toFixed(3)})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("pointerup", onUp)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-30"
    />
  )
}
