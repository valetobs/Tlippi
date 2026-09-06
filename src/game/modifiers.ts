import {
  faArrowsLeftRight,
  faBolt,
  faCircleNodes,
  faCompress,
  faCrosshairs,
  faFire,
  faHandBackFist,
  faHourglassHalf,
  faMagnet,
  faShieldHalved,
  faShuffle,
  faStar,
} from '@fortawesome/free-solid-svg-icons'
import type { ModifierDef, ModifierId } from './types'

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  'wide-paddle': {
    id: 'wide-paddle',
    label: 'Wide Paddle',
    icon: faArrowsLeftRight,
    positive: true,
    minDuration: 8,
    maxDuration: 16,
  },
  'narrow-paddle': {
    id: 'narrow-paddle',
    label: 'Narrow Paddle',
    icon: faCompress,
    positive: false,
    minDuration: 6,
    maxDuration: 11,
  },
  'slow-ball': {
    id: 'slow-ball',
    label: 'Slow-Mo',
    icon: faHourglassHalf,
    positive: true,
    minDuration: 7,
    maxDuration: 14,
  },
  'fast-ball': {
    id: 'fast-ball',
    label: 'Overdrive',
    icon: faBolt,
    positive: false,
    minDuration: 6,
    maxDuration: 10,
  },
  'sticky-paddle': {
    id: 'sticky-paddle',
    label: 'Catch',
    icon: faHandBackFist,
    positive: true,
    minDuration: 9,
    maxDuration: 16,
  },
  fireball: {
    id: 'fireball',
    label: 'Fireball',
    icon: faFire,
    positive: true,
    minDuration: 6,
    maxDuration: 11,
  },
  magnet: {
    id: 'magnet',
    label: 'Magnet',
    icon: faMagnet,
    positive: true,
    minDuration: 8,
    maxDuration: 15,
  },
  laser: {
    id: 'laser',
    label: 'Laser',
    icon: faCrosshairs,
    positive: true,
    minDuration: 8,
    maxDuration: 14,
  },
  multiball: {
    id: 'multiball',
    label: 'Multiball',
    icon: faCircleNodes,
    positive: true,
    minDuration: 10,
    maxDuration: 18,
  },
  'score-x2': {
    id: 'score-x2',
    label: 'Score x2',
    icon: faStar,
    positive: true,
    minDuration: 9,
    maxDuration: 17,
  },
  reverse: {
    id: 'reverse',
    label: 'Reversed',
    icon: faShuffle,
    positive: false,
    minDuration: 5,
    maxDuration: 9,
  },
  shield: {
    id: 'shield',
    label: 'Shield',
    icon: faShieldHalved,
    positive: true,
    minDuration: 8,
    maxDuration: 14,
  },
}

export const MODIFIER_LIST = Object.values(MODIFIERS)

export function rollModifier(): ModifierDef {
  const pool = MODIFIER_LIST
  return pool[Math.floor(Math.random() * pool.length)]
}

export function rollDuration(def: ModifierDef): number {
  return def.minDuration + Math.random() * (def.maxDuration - def.minDuration)
}
