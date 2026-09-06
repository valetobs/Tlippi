import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useRef, useState } from 'react'
import type { HudSnapshot } from '../../game/types'

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  hud: HudSnapshot
}

export function TopLeftHud({ hud }: Props) {
  return (
    <div className="hud-corner hud-corner--top-left">
      <div className="lives">
        {Array.from({ length: hud.lives }).map((_, i) => (
          <FontAwesomeIcon icon={faHeart} key={i} className="lives__heart" />
        ))}
      </div>
      <div className="level-tag">LVL {hud.level}</div>
    </div>
  )
}

export function TopCenterHud({ hud }: Props) {
  return (
    <div className="hud-corner hud-corner--top-center">
      <div className="brick-progress">
        <div className="brick-progress__fill" style={{ width: `${Math.round(hud.brickPct * 100)}%` }} />
      </div>
    </div>
  )
}

export function TopRightHud({ hud }: Props) {
  const prevScore = useRef(hud.score)
  const [bumped, setBumped] = useState(false)

  useEffect(() => {
    if (hud.score === prevScore.current) return
    prevScore.current = hud.score
    setBumped(true)
    const t = setTimeout(() => setBumped(false), 240)
    return () => clearTimeout(t)
  }, [hud.score])

  return (
    <div className="hud-corner hud-corner--top-right">
      <div className="score">
        <span className="score__label">SCORE</span>
        <span className={`score__value${bumped ? ' is-bumped' : ''}`}>{hud.score.toString().padStart(6, '0')}</span>
      </div>
      <div className="timer">{formatTime(hud.elapsedMs)}</div>
    </div>
  )
}

export function ComboCorner({ hud }: Props) {
  if (hud.combo < 2) return null
  return (
    <div className="hud-corner hud-corner--bottom-right">
      <div className="combo-value" key={hud.combo}>
        ×{hud.combo}
      </div>
      <div className="combo-label">COMBO</div>
    </div>
  )
}
