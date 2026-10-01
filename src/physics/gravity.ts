import type { Vec3 } from '../math/vec3'
import { scale } from '../math/vec3'

/** Weight in the ENU frame. Positive gravity accelerates the object downward. */
export function gravityForce(massKg: number, gravity: number): Vec3 {
  return { x: 0, y: 0, z: -massKg * gravity }
}

export function gravityAcceleration(gravity: number): Vec3 {
  return scale({ x: 0, y: 0, z: -1 }, gravity)
}
