import type { Vec3 } from '../math/vec3'
import { length, scale } from '../math/vec3'

/**
 * Quadratic aerodynamic drag.
 * Magnitude is 0.5 * rho * Cd * A * |v_rel|^2.
 * Direction opposes the wind-relative velocity.
 * Returns the zero vector when the object is moving with the air.
 */
export function dragForce(
  airDensity: number,
  dragCoefficient: number,
  referenceArea: number,
  relativeVelocity: Vec3,
): Vec3 {
  const speed = length(relativeVelocity)
  if (speed < 1e-9 || referenceArea <= 0 || dragCoefficient === 0 || airDensity <= 0) {
    return { x: 0, y: 0, z: 0 }
  }
  const magnitude = 0.5 * airDensity * dragCoefficient * referenceArea * speed * speed
  return scale(relativeVelocity, -magnitude / speed)
}

/** v_object − v_wind. Aerodynamic forces depend on this, not on ground speed. */
export function relativeAirVelocity(objectVelocity: Vec3, windVelocity: Vec3): Vec3 {
  return {
    x: objectVelocity.x - windVelocity.x,
    y: objectVelocity.y - windVelocity.y,
    z: objectVelocity.z - windVelocity.z,
  }
}
