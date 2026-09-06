import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BALL_BASE_SPEED,
  BALL_MAX_BOUNCE_ANGLE,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  BALL_SPEED_RAMP,
  BALL_TRAIL_LENGTH,
  BALL_WALL_BOOST_CAP,
  BALL_WALL_BOOST_MULT,
  BALL_WALL_FLASH_MS,
  BRICK_RADIUS,
  COMBO_RESET_MS,
  HIT_FLASH_MS,
  LASER_COOLDOWN_MS,
  LASER_SPEED,
  PADDLE_ACCEL,
  PADDLE_BASE_WIDTH,
  PADDLE_FRICTION,
  PADDLE_HEIGHT,
  PADDLE_MAX_SPEED,
  PADDLE_NARROW_WIDTH,
  PADDLE_WIDE_WIDTH,
  PADDLE_Y_OFFSET,
  SHAKE_LIFE_LOST_MS,
  SHAKE_LIFE_LOST_PX,
  STARTING_LIVES,
} from './constants'
import { buildLevel } from './levels'
import { MODIFIERS, rollDuration, rollModifier } from './modifiers'
import type {
  ActiveModifier,
  Ball,
  Brick,
  GameStatus,
  HudSnapshot,
  Laser,
  ModifierDef,
  ModifierId,
  Paddle,
  Particle,
  Vec2,
} from './types'

const MODIFIER_COLOR = '#ff2dc8'
const DEBUG_COLOR = 'rgba(120,255,140,1)'
const MAX_DEBUG_LOG = 8

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function vecLen(x: number, y: number) {
  return Math.sqrt(x * x + y * y)
}
function randRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

interface EngineCallbacks {
  onHud: (snapshot: HudSnapshot) => void
  onModifiers: (mods: ActiveModifier[]) => void
  onModifierTriggered?: (def: ModifierDef) => void
}

let ballIdCounter = 0

export class GameEngine {
  private ctx: CanvasRenderingContext2D
  private callbacks: EngineCallbacks
  private rafId: number | null = null
  private lastTime = 0

  private paddle: Paddle
  private balls: Ball[] = []
  private bricks: Brick[] = []
  private particles: Particle[] = []
  private lasers: Laser[] = []
  private activeModifiers = new Map<ModifierId, ActiveModifier>()

  private score = 0
  private lives = STARTING_LIVES
  private level = 1
  private status: GameStatus = 'menu'
  private startedAt = 0
  private pausedAccum = 0
  private pauseStartedAt = 0
  private levelClearAt: number | null = null

  private comboCount = 0
  private lastComboAt = 0

  private pointerX: number | null = null
  private keys = { left: false, right: false }
  private lastLaserAt = 0
  private multiballActive = false
  private reversed = false

  private shakeMag = 0
  private shakeDuration = 0
  private shakeUntil = 0

  private lastHudPush = 0
  private fps = 0

  private debugPhysics = false
  private debugLog = false
  private debugMessages: { text: string; at: number }[] = []

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.callbacks = callbacks

    const dpr = window.devicePixelRatio || 1
    canvas.width = ARENA_WIDTH * dpr
    canvas.height = ARENA_HEIGHT * dpr
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    ctx.scale(dpr, dpr)

    this.paddle = {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT - PADDLE_Y_OFFSET,
      width: PADDLE_BASE_WIDTH,
      height: PADDLE_HEIGHT,
      vx: 0,
    }

    this.bricks = buildLevel(this.level)
    this.spawnBall(true)
    this.render()
  }

  // ----- public API -----

  start() {
    if (this.rafId !== null) return
    this.lastTime = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(32, t - this.lastTime)
      this.lastTime = t
      this.update(dt)
      this.render()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  setPointerX(x: number | null) {
    this.pointerX = x
  }

  setKey(key: 'left' | 'right', pressed: boolean) {
    this.keys[key] = pressed
    if (pressed) this.pointerX = null
  }

  beginPlaying() {
    if (this.status === 'menu' || this.status === 'gameover') {
      this.resetRun()
      // the very first ball (and a fresh restart) launches immediately — no second
      // press needed. The ready-then-launch pause still applies after losing a life,
      // once the player already understands the flow.
      const unlaunched = this.balls.find((b) => !b.launched)
      if (unlaunched) {
        this.launchBall(unlaunched)
        this.status = 'playing'
        this.startedAt = performance.now()
      }
      return
    }
    if (this.status === 'ready') {
      this.status = 'playing'
      this.startedAt = performance.now()
    }
  }

  handleAction() {
    if (this.status === 'menu' || this.status === 'gameover') {
      this.beginPlaying()
      return
    }
    if (this.status === 'paused') {
      this.togglePause()
      return
    }
    const unlaunched = this.balls.find((b) => !b.launched)
    if (unlaunched) {
      this.launchBall(unlaunched)
      if (this.status === 'ready') {
        this.status = 'playing'
        this.startedAt = performance.now()
      }
      return
    }
    if (this.activeModifiers.has('laser')) {
      this.fireLaser()
    }
  }

  togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused'
      this.pauseStartedAt = performance.now()
    } else if (this.status === 'paused') {
      this.status = 'playing'
      this.pausedAccum += performance.now() - this.pauseStartedAt
    }
  }

  restart() {
    this.resetRun()
  }

  toggleDebugPhysics() {
    this.debugPhysics = !this.debugPhysics
  }

  toggleDebugLog() {
    this.debugLog = !this.debugLog
    if (this.debugLog) this.pushDebugLog('LOG ATTACHED')
  }

  // ----- setup helpers -----

  private resetRun() {
    this.score = 0
    this.lives = STARTING_LIVES
    this.level = 1
    this.comboCount = 0
    this.activeModifiers.clear()
    this.multiballActive = false
    this.reversed = false
    this.particles = []
    this.lasers = []
    this.bricks = buildLevel(this.level)
    this.paddle.width = PADDLE_BASE_WIDTH
    this.paddle.x = ARENA_WIDTH / 2
    this.balls = []
    this.spawnBall(true)
    this.status = 'ready'
    this.pausedAccum = 0
    this.startedAt = performance.now()
    this.callbacks.onModifiers([])
  }

  private spawnBall(attached: boolean, pos?: { x: number; y: number }, vel?: { x: number; y: number }): Ball {
    const ball: Ball = {
      id: ballIdCounter++,
      pos: pos ? { ...pos } : { x: this.paddle.x, y: this.paddle.y - PADDLE_HEIGHT / 2 - BALL_RADIUS - 1 },
      vel: vel ? { ...vel } : { x: 0, y: 0 },
      radius: BALL_RADIUS,
      trail: [],
      launched: !attached,
      speedBoost: 1,
      wallFlashUntil: 0,
    }
    this.balls.push(ball)
    return ball
  }

  private launchBall(ball: Ball) {
    const angle = randRange(-0.28, 0.28)
    const speed = BALL_BASE_SPEED
    ball.vel = { x: Math.sin(angle) * speed, y: -Math.cos(angle) * speed }
    ball.launched = true
  }

  private nextLevel() {
    this.level += 1
    this.bricks = buildLevel(this.level)
    this.lives = Math.min(this.lives + 1, 5)
    this.particles = []
    this.lasers = []
    this.balls = []
    this.spawnBall(true)
    this.status = 'ready'
    this.levelClearAt = null
  }

  // ----- modifiers -----

  private triggerModifier() {
    const def = rollModifier()
    const duration = rollDuration(def)
    const now = performance.now()
    const existing = this.activeModifiers.get(def.id)
    this.activeModifiers.set(def.id, {
      id: def.id,
      startedAt: now,
      endsAt: now + duration * 1000,
      duration,
    })
    if (!existing) {
      this.onModifierActivated(def.id)
    }
    this.callbacks.onModifierTriggered?.(def)
    this.pushModifiers()
    this.pushDebugLog(`MODIFIER · ${def.label.toUpperCase()} (${duration.toFixed(1)}S)`)
  }

  private onModifierActivated(id: ModifierId) {
    if (id === 'multiball') {
      this.trySplitBalls()
    }
  }

  private onModifierExpired(id: ModifierId) {
    if (id === 'multiball') {
      this.tryMergeBalls()
    }
  }

  private trySplitBalls() {
    const launched = this.balls.filter((b) => b.launched)
    if (launched.length === 0) {
      this.multiballActive = true
      return
    }
    const base = launched[0]
    const speed = vecLen(base.vel.x, base.vel.y)
    const baseAngle = Math.atan2(base.vel.x, -base.vel.y)
    ;[-0.42, 0.42].forEach((offset) => {
      const angle = baseAngle + offset
      this.spawnBall(
        false,
        { x: base.pos.x, y: base.pos.y },
        { x: Math.sin(angle) * speed, y: -Math.cos(angle) * speed },
      )
      const b = this.balls[this.balls.length - 1]
      b.launched = true
    })
    this.multiballActive = true
  }

  private tryMergeBalls() {
    if (!this.multiballActive) return
    this.multiballActive = false
    if (this.balls.length > 1) {
      const survivor = this.balls.reduce((a, b) => (a.pos.y > b.pos.y ? a : b))
      this.balls = [survivor]
    }
  }

  private pushModifiers() {
    this.callbacks.onModifiers(Array.from(this.activeModifiers.values()))
  }

  private fireLaser() {
    const now = performance.now()
    if (now - this.lastLaserAt < LASER_COOLDOWN_MS) return
    this.lastLaserAt = now
    this.lasers.push({ pos: { x: this.paddle.x - this.paddle.width / 2 + 10, y: this.paddle.y - 6 }, vel: { x: 0, y: -LASER_SPEED } })
    this.lasers.push({ pos: { x: this.paddle.x + this.paddle.width / 2 - 10, y: this.paddle.y - 6 }, vel: { x: 0, y: -LASER_SPEED } })
  }

  private spawnParticles(x: number, y: number, color: string, count = 6) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = randRange(1.2, 3.4)
      this.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 1,
        maxLife: randRange(0.3, 0.5),
        color,
        size: randRange(2.6, 4.6),
        rotation: angle,
        rotationSpeed: randRange(-0.15, 0.15),
      })
    }
  }

  private addScore(points: number) {
    const mult = this.activeModifiers.has('score-x2') ? 2 : 1
    this.score += Math.round(points * mult)
  }

  private pushDebugLog(text: string) {
    this.debugMessages.push({ text, at: performance.now() })
    if (this.debugMessages.length > MAX_DEBUG_LOG) this.debugMessages.shift()
  }

  // ----- update loop -----

  private update(dtMs: number) {
    const now = performance.now()

    if (dtMs > 0) {
      const instant = 1000 / dtMs
      this.fps = this.fps === 0 ? instant : this.fps * 0.9 + instant * 0.1
    }

    // expire modifiers
    for (const [id, mod] of this.activeModifiers) {
      if (now >= mod.endsAt) {
        this.activeModifiers.delete(id)
        this.onModifierExpired(id)
        this.pushModifiers()
      }
    }

    this.reversed = this.activeModifiers.has('reverse')
    const targetWidth = this.activeModifiers.has('wide-paddle')
      ? PADDLE_WIDE_WIDTH
      : this.activeModifiers.has('narrow-paddle')
        ? PADDLE_NARROW_WIDTH
        : PADDLE_BASE_WIDTH
    this.paddle.width = lerp(this.paddle.width, targetWidth, 0.15)

    const scale = dtMs / 16.6667

    if (this.status === 'ready') {
      // paddle (and the ball resting on it) stays controllable before launch
      this.updatePaddle(scale)
      this.updateBalls(scale, now)
      this.updateParticles(dtMs)
      this.maybePushHud(now)
      return
    }

    if (this.status !== 'playing') {
      if (this.status === 'levelclear' && this.levelClearAt !== null && now - this.levelClearAt > 1600) {
        this.nextLevel()
      }
      this.updateParticles(dtMs)
      this.maybePushHud(now)
      return
    }

    this.updatePaddle(scale)
    this.updateLasers(scale)
    this.updateBalls(scale, now)
    this.updateParticles(dtMs)
    this.checkLevelClear(now)
    this.maybePushHud(now)
  }

  private updatePaddle(scale: number) {
    const dir = this.reversed ? -1 : 1
    if (this.pointerX !== null) {
      const target = this.reversed ? ARENA_WIDTH - this.pointerX : this.pointerX
      this.paddle.x = lerp(this.paddle.x, target, Math.min(1, 0.32 * scale))
      this.paddle.vx = lerp(this.paddle.vx, 0, 0.4)
    } else {
      if (this.keys.left) this.paddle.vx -= PADDLE_ACCEL * dir * scale
      if (this.keys.right) this.paddle.vx += PADDLE_ACCEL * dir * scale
      if (!this.keys.left && !this.keys.right) this.paddle.vx *= Math.pow(PADDLE_FRICTION, scale)
      this.paddle.vx = clamp(this.paddle.vx, -PADDLE_MAX_SPEED, PADDLE_MAX_SPEED)
      this.paddle.x += this.paddle.vx * scale
    }
    const half = this.paddle.width / 2
    this.paddle.x = clamp(this.paddle.x, half, ARENA_WIDTH - half)
  }

  private updateLasers(scale: number) {
    for (const laser of this.lasers) {
      laser.pos.y += laser.vel.y * scale
    }
    this.lasers = this.lasers.filter((l) => l.pos.y > -10)

    for (const laser of this.lasers) {
      for (const brick of this.bricks) {
        if (!brick.alive) continue
        if (
          laser.pos.x > brick.x &&
          laser.pos.x < brick.x + brick.width &&
          laser.pos.y > brick.y &&
          laser.pos.y < brick.y + brick.height
        ) {
          this.damageBrick(brick)
          laser.pos.y = -999
        }
      }
    }
    this.lasers = this.lasers.filter((l) => l.pos.y > -900)
  }

  private updateBalls(scale: number, now: number) {
    const speedMult = (this.activeModifiers.has('slow-ball') ? 0.6 : 1) * (this.activeModifiers.has('fast-ball') ? 1.45 : 1)
    const sticky = this.activeModifiers.has('sticky-paddle')
    const magnet = this.activeModifiers.has('magnet')
    const fireball = this.activeModifiers.has('fireball')
    const shield = this.activeModifiers.has('shield')

    for (const ball of this.balls) {
      if (!ball.launched) {
        ball.pos.x = this.paddle.x
        ball.pos.y = this.paddle.y - this.paddle.height / 2 - ball.radius - 1
        continue
      }

      if (magnet && ball.pos.y > ARENA_HEIGHT * 0.45 && ball.vel.y > 0) {
        ball.vel.x += clamp((this.paddle.x - ball.pos.x) * 0.0016, -0.12, 0.12) * scale
      }

      const ceiling = Math.min(BALL_MAX_SPEED * ball.speedBoost, BALL_WALL_BOOST_CAP) * speedMult
      const baseSpeed = clamp(vecLen(ball.vel.x, ball.vel.y), 1, ceiling)
      const dirX = ball.vel.x / (baseSpeed || 1)
      const dirY = ball.vel.y / (baseSpeed || 1)
      const targetSpeed = clamp(baseSpeed, BALL_BASE_SPEED * 0.55, ceiling)
      ball.vel.x = dirX * targetSpeed
      ball.vel.y = dirY * targetSpeed

      ball.pos.x += ball.vel.x * scale
      ball.pos.y += ball.vel.y * scale

      ball.trail.push({ x: ball.pos.x, y: ball.pos.y })
      if (ball.trail.length > BALL_TRAIL_LENGTH) ball.trail.shift()

      if (ball.pos.x - ball.radius < 0) {
        ball.pos.x = ball.radius
        ball.vel.x *= -1
        this.onSideWallHit(ball)
      } else if (ball.pos.x + ball.radius > ARENA_WIDTH) {
        ball.pos.x = ARENA_WIDTH - ball.radius
        ball.vel.x *= -1
        this.onSideWallHit(ball)
      }
      if (ball.pos.y - ball.radius < 0) {
        ball.pos.y = ball.radius
        ball.vel.y *= -1
      }

      // paddle collision
      const p = this.paddle
      if (
        ball.vel.y > 0 &&
        ball.pos.y + ball.radius >= p.y - p.height / 2 &&
        ball.pos.y - ball.radius <= p.y + p.height / 2 &&
        ball.pos.x >= p.x - p.width / 2 - ball.radius &&
        ball.pos.x <= p.x + p.width / 2 + ball.radius
      ) {
        const rel = clamp((ball.pos.x - p.x) / (p.width / 2), -1, 1)
        const angle = rel * BALL_MAX_BOUNCE_ANGLE
        const speed = clamp(vecLen(ball.vel.x, ball.vel.y) * BALL_SPEED_RAMP, BALL_BASE_SPEED, ceiling)
        ball.vel.x = Math.sin(angle) * speed + p.vx * 0.15
        ball.vel.y = -Math.cos(angle) * speed
        ball.pos.y = p.y - p.height / 2 - ball.radius - 0.5
        this.resetCombo()
        if (sticky) {
          ball.launched = false
        }
      }

      // bottom / death
      if (ball.pos.y - ball.radius > ARENA_HEIGHT) {
        if (shield) {
          ball.pos.y = ARENA_HEIGHT - ball.radius
          ball.vel.y *= -1
        } else {
          ball.pos.y = -9999
        }
      }

      // brick collisions
      for (const brick of this.bricks) {
        if (!brick.alive) continue
        const closestX = clamp(ball.pos.x, brick.x, brick.x + brick.width)
        const closestY = clamp(ball.pos.y, brick.y, brick.y + brick.height)
        const dx = ball.pos.x - closestX
        const dy = ball.pos.y - closestY
        if (dx * dx + dy * dy < ball.radius * ball.radius) {
          this.damageBrick(brick)
          if (!fireball) {
            if (Math.abs(dx) > Math.abs(dy)) {
              ball.vel.x *= -1
            } else {
              ball.vel.y *= -1
            }
          }
          break
        }
      }
    }

    const before = this.balls.length
    this.balls = this.balls.filter((b) => b.pos.y > -500)
    if (this.balls.length === 0 && before > 0) {
      this.loseLife(now)
    }
  }

  private damageBrick(brick: Brick) {
    brick.hitAt = performance.now()
    const cx = brick.x + brick.width / 2
    const cy = brick.y + brick.height / 2
    if (brick.kind === 'steel') {
      this.spawnParticles(cx, cy, 'rgba(255,255,255,0.35)', 5)
      return
    }
    brick.hp -= 1
    const now = performance.now()
    if (now - this.lastComboAt < COMBO_RESET_MS) {
      this.comboCount += 1
    } else {
      this.comboCount = 1
    }
    this.lastComboAt = now

    if (brick.hp <= 0) {
      brick.alive = false
      const color = brick.kind === 'modifier' ? 'rgba(255,110,225,0.95)' : 'rgba(255,255,255,0.95)'
      this.spawnParticles(cx, cy, color, brick.kind === 'modifier' ? 9 : 11)
      this.addScore(10 + this.comboCount * 3)
      this.pushDebugLog(`BRICK DESTROYED · ${brick.kind.toUpperCase()} #${brick.id}`)
      if (brick.kind === 'modifier') {
        this.triggerModifier()
      }
    } else {
      this.spawnParticles(cx, cy, 'rgba(255,255,255,0.55)', 5)
      this.addScore(4)
    }
  }

  private onSideWallHit(ball: Ball) {
    const currentSpeed = vecLen(ball.vel.x, ball.vel.y) || BALL_BASE_SPEED
    ball.speedBoost = Math.min(ball.speedBoost * BALL_WALL_BOOST_MULT, BALL_WALL_BOOST_CAP / BALL_MAX_SPEED)
    const newCeiling = Math.min(BALL_MAX_SPEED * ball.speedBoost, BALL_WALL_BOOST_CAP)
    const boosted = Math.min(currentSpeed * BALL_WALL_BOOST_MULT, newCeiling)
    const dirX = ball.vel.x / currentSpeed
    const dirY = ball.vel.y / currentSpeed
    ball.vel.x = dirX * boosted
    ball.vel.y = dirY * boosted
    ball.wallFlashUntil = performance.now() + BALL_WALL_FLASH_MS
    this.pushDebugLog(`WALL BOOST · SPEED x${BALL_WALL_BOOST_MULT}`)
  }

  private resetCombo() {
    if (performance.now() - this.lastComboAt > COMBO_RESET_MS) {
      this.comboCount = 0
    }
  }

  private loseLife(now: number) {
    this.lives -= 1
    this.balls = []
    this.triggerShake(SHAKE_LIFE_LOST_PX, SHAKE_LIFE_LOST_MS)
    this.pushDebugLog(`BALL LOST · ${this.lives} LIFE${this.lives === 1 ? '' : 'S'} REMAINING`)
    if (this.lives <= 0) {
      this.status = 'gameover'
      this.pushDebugLog('RUN ENDED · GAME OVER')
      return
    }
    this.spawnBall(true)
    this.status = 'ready'
    this.startedAt = now
    this.comboCount = 0
  }

  private triggerShake(mag: number, ms: number) {
    this.shakeMag = mag
    this.shakeDuration = ms
    this.shakeUntil = performance.now() + ms
  }

  private getShakeOffset(): Vec2 {
    const remaining = this.shakeUntil - performance.now()
    if (remaining <= 0 || this.shakeDuration <= 0) return { x: 0, y: 0 }
    const t = remaining / this.shakeDuration
    const mag = this.shakeMag * t
    return { x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag }
  }

  private checkLevelClear(now: number) {
    const remaining = this.bricks.some((b) => b.alive && b.kind !== 'steel')
    if (!remaining && this.status === 'playing') {
      this.status = 'levelclear'
      this.levelClearAt = now
      this.pushDebugLog(`LEVEL ${this.level} CLEARED`)
    }
  }

  private updateParticles(dtMs: number) {
    const dt = dtMs / 1000
    for (const p of this.particles) {
      p.pos.x += p.vel.x
      p.pos.y += p.vel.y
      p.vel.x *= 0.94
      p.vel.y *= 0.94
      p.rotation += p.rotationSpeed
      p.life -= dt / p.maxLife
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }

  private maybePushHud(now: number) {
    if (now - this.lastHudPush < 80) return
    this.lastHudPush = now
    const total = this.bricks.filter((b) => b.kind !== 'steel').length
    const remaining = this.bricks.filter((b) => b.alive && b.kind !== 'steel').length
    const elapsed = this.status === 'playing' ? now - this.startedAt - this.pausedAccum : 0
    const snapshot: HudSnapshot = {
      score: this.score,
      lives: this.lives,
      level: this.level,
      status: this.status,
      elapsedMs: Math.max(0, elapsed),
      brickPct: total === 0 ? 1 : 1 - remaining / total,
      combo: performance.now() - this.lastComboAt < COMBO_RESET_MS ? this.comboCount : 0,
    }
    this.callbacks.onHud(snapshot)
  }

  // ----- rendering -----

  private render() {
    const ctx = this.ctx
    const shake = this.getShakeOffset()

    ctx.save()
    if (shake.x !== 0 || shake.y !== 0) ctx.translate(shake.x, shake.y)

    ctx.clearRect(-4, -4, ARENA_WIDTH + 8, ARENA_HEIGHT + 8)
    ctx.fillStyle = '#000000'
    ctx.fillRect(-4, -4, ARENA_WIDTH + 8, ARENA_HEIGHT + 8)

    this.drawSurfaceTexture(ctx)
    this.drawBricks(ctx)
    this.drawParticles(ctx)
    this.drawLasers(ctx)
    this.drawBalls(ctx)
    this.drawPaddle(ctx)
    this.drawVignette(ctx)
    if (this.debugPhysics) this.drawDebugPhysics(ctx)

    ctx.restore()

    if (this.debugLog) this.drawDebugLog(ctx)
  }

  private drawSurfaceTexture(ctx: CanvasRenderingContext2D) {
    const spacing = 42
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.035)'
    for (let x = spacing; x < ARENA_WIDTH; x += spacing) {
      for (let y = spacing; y < ARENA_HEIGHT; y += spacing) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawVignette(ctx: CanvasRenderingContext2D) {
    const cx = ARENA_WIDTH / 2
    const cy = ARENA_HEIGHT / 2
    const g = ctx.createRadialGradient(cx, cy, ARENA_HEIGHT * 0.62, cx, cy, ARENA_HEIGHT * 1.15)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
  }

  private drawBricks(ctx: CanvasRenderingContext2D) {
    const r = BRICK_RADIUS
    const now = performance.now()
    for (const brick of this.bricks) {
      if (!brick.alive) continue

      const sinceHit = now - brick.hitAt
      const isHit = brick.hitAt > 0 && sinceHit < HIT_FLASH_MS
      const hitT = isHit ? sinceHit / HIT_FLASH_MS : 1
      const isModifier = brick.kind === 'modifier'
      const squash = isHit && !isModifier ? 1 - (1 - hitT) * 0.05 : 1

      const cx = brick.x + brick.width / 2
      const cy = brick.y + brick.height / 2
      const w = brick.width * squash
      const h = brick.height * squash
      const x = cx - w / 2
      const y = cy - h / 2

      ctx.save()
      if (isModifier) {
        // soft breathing halo, layered behind — the fill itself stays perfectly crisp
        const pulse = 0.5 + 0.5 * Math.sin(now / 900)
        const pad = 3
        ctx.globalAlpha = 0.18 + pulse * 0.14
        ctx.fillStyle = MODIFIER_COLOR
        this.roundRectPath(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, r + pad)
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.fillStyle = MODIFIER_COLOR
        this.roundRectPath(ctx, x, y, w, h, r)
        ctx.fill()
      } else if (brick.kind === 'steel') {
        const grad = ctx.createLinearGradient(x, y, x, y + h)
        grad.addColorStop(0, 'rgba(255,255,255,0.27)')
        grad.addColorStop(1, 'rgba(255,255,255,0.15)')
        ctx.fillStyle = grad
        this.roundRectPath(ctx, x, y, w, h, r)
        ctx.fill()
      } else {
        const damaged = brick.hp < brick.maxHp
        ctx.fillStyle = damaged ? 'rgba(255,255,255,0.45)' : '#ffffff'
        this.roundRectPath(ctx, x, y, w, h, r)
        ctx.fill()
      }

      if (isHit) {
        if (isModifier) {
          // soft radial burst instead of the standard impact ring
          const burstR = 4 + (1 - hitT) * 20
          const burst = ctx.createRadialGradient(cx, cy, 0, cx, cy, burstR)
          burst.addColorStop(0, `rgba(255,255,255,${0.6 * (1 - hitT)})`)
          burst.addColorStop(0.5, `rgba(255,45,200,${0.4 * (1 - hitT)})`)
          burst.addColorStop(1, 'rgba(255,45,200,0)')
          ctx.fillStyle = burst
          ctx.beginPath()
          ctx.arc(cx, cy, burstR, 0, Math.PI * 2)
          ctx.fill()
        } else {
          const spread = (1 - hitT) * 5
          ctx.globalAlpha = (1 - hitT) * 0.65
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          this.roundRectPath(ctx, x - spread, y - spread, w + spread * 2, h + spread * 2, r + spread)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      ctx.restore()
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const life = clamp(p.life, 0, 1)
      const scale = Math.pow(life, 0.6)
      const len = p.size * 2.4 * scale
      const thickness = Math.max(0.9, p.size * 0.55 * scale)
      if (len < 0.5) continue

      ctx.save()
      ctx.globalAlpha = life * 0.92
      ctx.fillStyle = p.color
      ctx.translate(p.pos.x, p.pos.y)
      ctx.rotate(p.rotation)
      this.roundRectPath(ctx, -len / 2, -thickness / 2, len, thickness, thickness / 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  private drawLasers(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    for (const laser of this.lasers) {
      ctx.beginPath()
      ctx.moveTo(laser.pos.x, laser.pos.y)
      ctx.lineTo(laser.pos.x, laser.pos.y + 10)
      ctx.stroke()
    }
  }

  private drawBalls(ctx: CanvasRenderingContext2D) {
    const fireball = this.activeModifiers.has('fireball')
    const now = performance.now()
    for (const ball of this.balls) {
      const flashRemaining = ball.wallFlashUntil - now
      const isFlash = flashRemaining > 0
      const flashT = isFlash ? clamp(flashRemaining / BALL_WALL_FLASH_MS, 0, 1) : 0

      const n = ball.trail.length
      for (let i = 0; i < n; i++) {
        const t = ball.trail[i]
        const p = (i + 1) / n
        ctx.globalAlpha = p * p * 0.26
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(t.x, t.y, ball.radius * (0.45 + p * 0.3), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (isFlash) {
        // big bright burst — unmistakable regardless of the ball's own (already white) color
        const burstR = ball.radius * (2 + (1 - flashT) * 5)
        const burst = ctx.createRadialGradient(ball.pos.x, ball.pos.y, 0, ball.pos.x, ball.pos.y, burstR)
        burst.addColorStop(0, `rgba(255,255,255,${flashT * 0.9})`)
        burst.addColorStop(0.5, `rgba(255,255,255,${flashT * 0.4})`)
        burst.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = burst
        ctx.beginPath()
        ctx.arc(ball.pos.x, ball.pos.y, burstR, 0, Math.PI * 2)
        ctx.fill()
      }

      // soft ambient bloom, contained and separate from the shape — the core stays perfectly crisp
      const glowR = ball.radius * (fireball ? 2.3 : 1.8) * (1 + flashT * 0.5)
      const glow = ctx.createRadialGradient(ball.pos.x, ball.pos.y, ball.radius * 0.4, ball.pos.x, ball.pos.y, glowR)
      glow.addColorStop(0, `rgba(255,255,255,${(fireball ? 0.26 : 0.15) + flashT * 0.5})`)
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(ball.pos.x, ball.pos.y, glowR, 0, Math.PI * 2)
      ctx.fill()

      const coreRadius = ball.radius * (1 + flashT * 0.45)
      ctx.beginPath()
      ctx.arc(ball.pos.x, ball.pos.y, coreRadius, 0, Math.PI * 2)
      ctx.fillStyle = isFlash ? '#ffffff' : fireball ? '#000000' : '#ffffff'
      ctx.fill()
      if (fireball && !isFlash) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(ball.pos.x, ball.pos.y, ball.radius - 1, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (isFlash) {
        const spread = (1 - flashT) * 12
        ctx.globalAlpha = flashT * 0.85
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(ball.pos.x, ball.pos.y, coreRadius + 3 + spread, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    const p = this.paddle
    const r = p.height / 2

    // soft glow shaped to the paddle's own proportions (an ellipse, not a circle or a rect smear)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.scale(p.width * 0.6, p.height * 2.3)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    glow.addColorStop(0, 'rgba(255,255,255,0.15)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    const body = ctx.createLinearGradient(p.x, p.y - p.height / 2, p.x, p.y + p.height / 2)
    body.addColorStop(0, '#ffffff')
    body.addColorStop(1, 'rgba(224,224,228,0.95)')
    ctx.fillStyle = body
    this.roundRectPath(ctx, p.x - p.width / 2, p.y - p.height / 2, p.width, p.height, r)
    ctx.fill()

    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x - p.width / 2 + r * 0.7, p.y - p.height / 2 + 1)
    ctx.lineTo(p.x + p.width / 2 - r * 0.7, p.y - p.height / 2 + 1)
    ctx.stroke()
    ctx.restore()
  }

  private drawDebugPhysics(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.strokeStyle = DEBUG_COLOR
    ctx.fillStyle = DEBUG_COLOR
    ctx.font = '9px monospace'
    ctx.lineWidth = 1

    ctx.globalAlpha = 0.45
    for (const brick of this.bricks) {
      if (!brick.alive) continue
      ctx.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1)
    }
    ctx.globalAlpha = 1

    const p = this.paddle
    ctx.strokeRect(p.x - p.width / 2 + 0.5, p.y - p.height / 2 + 0.5, p.width - 1, p.height - 1)
    ctx.fillText(`PADDLE x=${p.x.toFixed(1)} vx=${p.vx.toFixed(2)} w=${p.width.toFixed(0)}`, p.x - p.width / 2, p.y - p.height / 2 - 4)

    for (const ball of this.balls) {
      ctx.beginPath()
      ctx.arc(ball.pos.x, ball.pos.y, ball.radius + 2, 0, Math.PI * 2)
      ctx.stroke()
      if (ball.launched) {
        const speed = vecLen(ball.vel.x, ball.vel.y)
        ctx.beginPath()
        ctx.moveTo(ball.pos.x, ball.pos.y)
        ctx.lineTo(ball.pos.x + ball.vel.x * 5, ball.pos.y + ball.vel.y * 5)
        ctx.stroke()
        ctx.fillText(`v=${speed.toFixed(1)}`, ball.pos.x + 8, ball.pos.y - 6)
      }
    }

    ctx.font = '10px monospace'
    const aliveBricks = this.bricks.filter((b) => b.alive).length
    ctx.fillText(
      `PHYSICS DEBUG [F9]  FPS ${this.fps.toFixed(0)}  BALLS ${this.balls.length}  BRICKS ${aliveBricks}  STATUS ${this.status.toUpperCase()}`,
      8,
      14,
    )
    ctx.restore()
  }

  private drawDebugLog(ctx: CanvasRenderingContext2D) {
    const now = performance.now()
    ctx.save()
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    const lineHeight = 13
    const baseX = ARENA_WIDTH - 10
    const topY = ARENA_HEIGHT - 16 - MAX_DEBUG_LOG * lineHeight

    ctx.fillStyle = DEBUG_COLOR
    ctx.globalAlpha = 0.9
    ctx.fillText('EVENT LOG [F10]', baseX, topY)

    let y = ARENA_HEIGHT - 16
    for (let i = this.debugMessages.length - 1; i >= 0; i--) {
      const msg = this.debugMessages[i]
      const age = now - msg.at
      ctx.globalAlpha = clamp(1 - age / 7000, 0.18, 0.85)
      ctx.fillText(msg.text, baseX, y)
      y -= lineHeight
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

export function getModifierDef(id: ModifierId) {
  return MODIFIERS[id]
}
