import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPause, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import type { HudSnapshot, ModifierDef } from '../../game/types'

interface OverlayProps {
  hud: HudSnapshot
  onAction: () => void
  onRestart: () => void
}

export function StatusOverlay({ hud, onAction, onRestart }: OverlayProps) {
  if (hud.status === 'paused') {
    return (
      <div className="overlay">
        <div className="overlay__card">
          <h2 className="overlay__title overlay__title--sm">PAUSED</h2>
          <button className="overlay__button" onClick={onAction} onPointerDown={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faPause} /> Resume
          </button>
        </div>
      </div>
    )
  }

  if (hud.status === 'gameover') {
    return (
      <div className="overlay">
        <div className="overlay__card">
          <h2 className="overlay__title overlay__title--sm">GAME OVER</h2>
          <p className="overlay__subtitle">Final score {hud.score.toLocaleString()}</p>
          <button className="overlay__button" onClick={onRestart} onPointerDown={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faRotateRight} /> Play Again
          </button>
        </div>
      </div>
    )
  }

  if (hud.status === 'levelclear') {
    return (
      <div className="overlay overlay--transparent overlay--top">
        <div className="overlay__prompt--big">Level {hud.level} Clear!</div>
      </div>
    )
  }

  return null
}

interface ToastProps {
  toast: { def: ModifierDef; key: number } | null
}

export function ModifierToast({ toast }: ToastProps) {
  if (!toast) return null
  return (
    <div key={toast.key} className={`toast ${toast.def.positive ? 'is-positive' : 'is-negative'}`}>
      <FontAwesomeIcon icon={toast.def.icon} />
      <span>{toast.def.label}</span>
    </div>
  )
}
