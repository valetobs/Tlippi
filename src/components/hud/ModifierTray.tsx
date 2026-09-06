import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { getModifierDef } from '../../game/engine'
import type { ActiveModifier } from '../../game/types'

interface Props {
  modifiers: ActiveModifier[]
}

export function ModifierTray({ modifiers }: Props) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (modifiers.length === 0) return
    const id = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(id)
  }, [modifiers.length])

  if (modifiers.length === 0) return null

  return (
    <div className="modifier-tray">
      {modifiers.map((mod) => {
        const def = getModifierDef(mod.id)
        const remaining = Math.max(0, mod.endsAt - now)
        const remainingSec = Math.ceil(remaining / 1000)
        const pct = Math.max(0, Math.min(1, remaining / (mod.duration * 1000)))
        return (
          <div
            key={mod.id}
            className={`modifier-chip ${def.positive ? 'is-positive' : 'is-negative'}`}
            title={`${def.label} — ${remainingSec}s`}
          >
            <div className="modifier-chip__ring" style={{ '--pct': pct } as CSSProperties} />
            <FontAwesomeIcon icon={def.icon} className="modifier-chip__icon" />
            <span className="modifier-chip__timer">{remainingSec}</span>
          </div>
        )
      })}
    </div>
  )
}
