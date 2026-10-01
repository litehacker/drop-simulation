import type { Vec3 } from '../math/vec3'
import { length, vec } from '../math/vec3'

/**
 * DropSim physics frame is local ENU:
 *   X = East  (m)
 *   Y = North (m)
 *   Z = Up    (m)
 *
 * Headings are navigation bearings, not right-handed yaw about Up:
 *   0 rad = North
 *   positive toward East (clockwise when viewed from above)
 *
 * Three.js uses Y-up. The only physics↔render mapping is `enuToThree`:
 *   three.x = East
 *   three.y = Up
 *   three.z = North
 * Applying it to a direction vector rotates that vector into the render frame.
 * Do not feed raw Three.js coordinates back into the integrator.
 */

export interface Attitude {
  /** Bearing, radians. 0 = north, positive toward east. */
  yaw: number
  /** Nose up, radians. */
  pitch: number
  /** Right wing down, radians. */
  roll: number
}

export const LEVEL: Attitude = { yaw: 0, pitch: 0, roll: 0 }

export function enuToThree(p: Vec3): [number, number, number] {
  return [p.x, p.z, p.y]
}

export function threeToEnu(x: number, y: number, z: number): Vec3 {
  return { x, y: z, z: y }
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Wrap to (-pi, pi]. */
export function wrapPi(angle: number): number {
  const two = Math.PI * 2
  const wrapped = (((angle + Math.PI) % two) + two) % two
  return wrapped - Math.PI
}

/**
 * Horizontal velocity from a navigation heading.
 * headingDeg: 0 north, 90 east. verticalSpeed is Up, m/s.
 */
export function velocityFromHeading(
  headingDeg: number,
  horizontalSpeed: number,
  verticalSpeed: number,
): Vec3 {
  const heading = degToRad(headingDeg)
  return {
    x: horizontalSpeed * Math.sin(heading),
    y: horizontalSpeed * Math.cos(heading),
    z: verticalSpeed,
  }
}

/** Navigation heading of a ground-velocity vector, radians. */
export function headingOf(velocity: Vec3): number {
  return Math.atan2(velocity.x, velocity.y)
}

export function flightPathAngle(velocity: Vec3): number {
  const horizontalSpeed = Math.hypot(velocity.x, velocity.y)
  return Math.atan2(velocity.z, horizontalSpeed)
}

export function horizontalSpeed(velocity: Vec3): number {
  return Math.hypot(velocity.x, velocity.y)
}

export function groundRange(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function distance3(a: Vec3, b: Vec3): number {
  return length({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
}

/** Unit vector in the horizontal plane pointing along a navigation bearing. */
export function headingUnit(headingRad: number): Vec3 {
  return vec(Math.sin(headingRad), Math.cos(headingRad), 0)
}
