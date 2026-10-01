import type { MonteCarloResult } from '../simulation/monteCarlo'
import type { Vec3 } from '../math/vec3'

export function landingsInside(result: MonteCarloResult, target: Vec3, radius: number): number {
  return result.landings.filter((point) => Math.hypot(point.east - target.x, point.north - target.y) <= radius).length
}

/** Where the average impact sits relative to the landing-area center. */
export function meanOffsetSentence(result: MonteCarloResult, target: Vec3): string {
  if (result.meanEast === null || result.meanNorth === null) return 'No trials reached the ground.'
  const east = result.meanEast - target.x
  const north = result.meanNorth - target.y
  const parts: string[] = []
  if (Math.abs(east) >= 1) parts.push(`${Math.abs(east).toFixed(0)} m ${east > 0 ? 'east' : 'west'}`)
  if (Math.abs(north) >= 1) parts.push(`${Math.abs(north).toFixed(0)} m ${north > 0 ? 'north' : 'south'}`)
  if (parts.length === 0) return 'The average landing is at the center of the ring.'
  return `The average landing is ${parts.join(' and ')} of the ring center.`
}
