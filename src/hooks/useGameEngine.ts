import { useCallback, useEffect, useRef, useState } from 'react'
import { GameEngine } from '../game/engine'
import { ARENA_WIDTH } from '../game/constants'
import type { ActiveModifier, HudSnapshot, ModifierDef } from '../game/types'

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  lives: 3,
  level: 1,
  status: 'menu',
  elapsedMs: 0,
  brickPct: 0,
  combo: 0,
}

export function useGameEngine() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD)
  const [modifiers, setModifiers] = useState<ActiveModifier[]>([])
  const [toast, setToast] = useState<{ def: ModifierDef; key: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new GameEngine(canvas, {
      onHud: setHud,
      onModifiers: setModifiers,
      onModifierTriggered: (def) => {
        setToast({ def, key: Date.now() + Math.random() })
      },
    })
    engineRef.current = engine
    engine.start()

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const handlePointerMove = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / ARENA_WIDTH
    const x = (clientX - rect.left) / (scale || 1)
    engineRef.current?.setPointerX(x)
  }, [])

  const handlePointerLeave = useCallback(() => {
    // keep last position; do nothing so the paddle doesn't jump
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') engineRef.current?.setKey('left', true)
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') engineRef.current?.setKey('right', true)
      if (e.key === ' ') {
        e.preventDefault()
        engineRef.current?.handleAction()
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') engineRef.current?.togglePause()
      if (e.key === 'F9') {
        e.preventDefault()
        engineRef.current?.toggleDebugPhysics()
      }
      if (e.key === 'F10') {
        e.preventDefault()
        engineRef.current?.toggleDebugLog()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') engineRef.current?.setKey('left', false)
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') engineRef.current?.setKey('right', false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const handleAction = useCallback(() => engineRef.current?.handleAction(), [])
  const handleTogglePause = useCallback(() => engineRef.current?.togglePause(), [])
  const handleRestart = useCallback(() => engineRef.current?.restart(), [])

  return {
    canvasRef,
    hud,
    modifiers,
    toast,
    handlePointerMove,
    handlePointerLeave,
    handleAction,
    handleTogglePause,
    handleRestart,
  }
}
