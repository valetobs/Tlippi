import {
  ARENA_WIDTH,
  BRICK_COLS,
  BRICK_HEIGHT,
  BRICK_PADDING,
  BRICK_ROWS,
  BRICK_SIDE_OFFSET,
  BRICK_TOP_OFFSET,
  MODIFIER_BRICK_CHANCE,
} from './constants'
import type { Brick, BrickKind } from './types'

let brickIdCounter = 0

export function buildLevel(levelNumber: number): Brick[] {
  const rows = Math.min(BRICK_ROWS + Math.floor(levelNumber / 2), 9)
  const cols = BRICK_COLS
  const usableWidth = ARENA_WIDTH - BRICK_SIDE_OFFSET * 2
  const brickWidth = (usableWidth - BRICK_PADDING * (cols - 1)) / cols

  const bricks: Brick[] = []
  let guaranteedModifierPlaced = false

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Sprinkle in gaps for visual variety on later levels, never on the first two rows.
      if (levelNumber > 1 && row > 1 && Math.random() < 0.06) continue

      const isLast = row === rows - 1 && col === cols - 1
      let kind: BrickKind = 'normal'
      let hp = 1

      const toughChance = 0.08 + levelNumber * 0.015
      const steelChance = Math.max(0, levelNumber - 3) * 0.01

      const roll = Math.random()
      if (roll < steelChance) {
        kind = 'steel'
        hp = 1
      } else if (roll < steelChance + toughChance) {
        kind = 'tough'
        hp = 2
      }

      if (Math.random() < MODIFIER_BRICK_CHANCE) {
        kind = 'modifier'
        hp = 1
        guaranteedModifierPlaced = true
      } else if (isLast && !guaranteedModifierPlaced) {
        kind = 'modifier'
        hp = 1
        guaranteedModifierPlaced = true
      }

      bricks.push({
        id: brickIdCounter++,
        x: BRICK_SIDE_OFFSET + col * (brickWidth + BRICK_PADDING),
        y: BRICK_TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_PADDING),
        width: brickWidth,
        height: BRICK_HEIGHT,
        hp,
        maxHp: hp,
        kind,
        alive: true,
        row,
        hitAt: 0,
      })
    }
  }

  if (bricks.length === 0) {
    return buildLevel(levelNumber)
  }

  return bricks
}
