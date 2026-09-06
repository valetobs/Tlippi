import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export interface Vec2 {
  x: number
  y: number
}

export interface Ball {
  id: number
  pos: Vec2
  vel: Vec2
  radius: number
  trail: Vec2[]
  launched: boolean
  speedBoost: number
  wallFlashUntil: number
}

export interface Paddle {
  x: number
  y: number
  width: number
  height: number
  vx: number
}

export type BrickKind = 'normal' | 'tough' | 'modifier' | 'steel'

export interface Brick {
  id: number
  x: number
  y: number
  width: number
  height: number
  hp: number
  maxHp: number
  kind: BrickKind
  alive: boolean
  row: number
  hitAt: number
}

export interface Particle {
  pos: Vec2
  vel: Vec2
  life: number
  maxLife: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
}

export interface Laser {
  pos: Vec2
  vel: Vec2
}

export type ModifierId =
  | 'wide-paddle'
  | 'narrow-paddle'
  | 'slow-ball'
  | 'fast-ball'
  | 'sticky-paddle'
  | 'fireball'
  | 'magnet'
  | 'laser'
  | 'multiball'
  | 'score-x2'
  | 'reverse'
  | 'shield'

export interface ModifierDef {
  id: ModifierId
  label: string
  icon: IconDefinition
  positive: boolean
  minDuration: number
  maxDuration: number
}

export interface ActiveModifier {
  id: ModifierId
  startedAt: number
  endsAt: number
  duration: number
}

export type GameStatus = 'menu' | 'ready' | 'playing' | 'paused' | 'gameover' | 'levelclear'

export interface HudSnapshot {
  score: number
  lives: number
  level: number
  status: GameStatus
  elapsedMs: number
  brickPct: number
  combo: number
}
