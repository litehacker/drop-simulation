import type { Vec3 } from '../math/vec3'
import { cross, length, normalize, scale } from '../math/vec3'

/**
 * Lift direction for a banked point-mass vehicle.
 * With zero bank the lift lies in the plane of relative velocity and Up,
 * perpendicular to the relative wind. Positive bank (right wing down)
 * rotates that direction toward a right turn.
 */
export function liftDirection(relativeVelocity: Vec3, bankRad: number): Vec3 {
  const speed = length(relativeVelocity)
  if (speed < 1e-6) return { x: 0, y: 0, z: 1 }
  const vhat = scale(relativeVelocity, 1 / speed)
  const up = { x: 0, y: 0, z: 1 }
  let vertical = cross(cross(vhat, up), vhat)
  if (length(vertical) < 1e-6) vertical = { x: 0, y: 0, z: 1 }
  vertical = normalize(vertical)
  const right = normalize(cross(vhat, vertical))
  return normalize({
    x: vertical.x * Math.cos(bankRad) + right.x * Math.sin(bankRad),
    y: vertical.y * Math.cos(bankRad) + right.y * Math.sin(bankRad),
    z: vertical.z * Math.cos(bankRad) + right.z * Math.sin(bankRad),
  })
}

export function liftForce(
  airDensity: number,
  liftCoefficient: number,
  wingArea: number,
  relativeVelocity: Vec3,
  bankRad: number,
): Vec3 {
  const speed = length(relativeVelocity)
  if (speed < 1e-6 || wingArea <= 0 || liftCoefficient === 0 || airDensity <= 0) {
    return { x: 0, y: 0, z: 0 }
  }
  const magnitude = 0.5 * airDensity * liftCoefficient * wingArea * speed * speed
  return scale(liftDirection(relativeVelocity, bankRad), magnitude)
}

/** Archimedes force, Up. Optional and usually small for a dense object. */
export function buoyancyForce(airDensity: number, volume: number, gravity: number): Vec3 {
  return { x: 0, y: 0, z: airDensity * volume * gravity }
}

/**
 * Reduced-order pitch acceleration (rad/s²).
 * Cm contributes q·S·c·Cm / Iyy.
 * A vertical center-of-pressure offset contributes an additional moment from the
 * horizontal aerodynamic force. This is not a 6-DoF moment solution.
 */
export function pitchAcceleration(options: {
  relativeVelocity: Vec3
  aeroForce: Vec3
  centerOfMass: Vec3
  centerOfPressure: Vec3
  pitchInertia: number
  airDensity: number
  momentCoefficient: number
  area: number
  chord: number
}): number {
  const speed = length(options.relativeVelocity)
  const dynamic = 0.5 * options.airDensity * speed * speed
  const coefficientMoment = dynamic * options.area * options.chord * options.momentCoefficient
  const horizontalSpeed = Math.hypot(options.relativeVelocity.x, options.relativeVelocity.y)
  let tangential = 0
  if (horizontalSpeed > 1e-6) {
    tangential =
      (options.aeroForce.x * options.relativeVelocity.x + options.aeroForce.y * options.relativeVelocity.y) /
      horizontalSpeed
  }
  const armZ = options.centerOfPressure.z - options.centerOfMass.z
  const inertia = Math.max(options.pitchInertia, 1e-8)
  return (coefficientMoment + armZ * tangential) / inertia
}
