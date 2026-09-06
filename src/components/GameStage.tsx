import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { ARENA_HEIGHT, ARENA_WIDTH } from '../game/constants'

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>
  onPointerMove: (clientX: number) => void
  onAction: () => void
  children?: ReactNode
}

export function GameStage({ canvasRef, onPointerMove, onAction, children }: Props) {
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerMove(e.clientX)
  }

  return (
    <div
      className="game-stage"
      style={{ aspectRatio: `${ARENA_WIDTH} / ${ARENA_HEIGHT}` }}
      onPointerMove={handlePointerMove}
      onPointerDown={onAction}
    >
      <div className="game-stage__frame">
        <canvas ref={canvasRef} className="game-stage__canvas" />
        {children}
      </div>
    </div>
  )
}
