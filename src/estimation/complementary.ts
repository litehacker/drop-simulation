import type { Attitude } from '../coordinates/enu'
import { add, scale, sub, type Vec3 } from '../math/vec3'
import type { KinematicState } from '../physics/integration'

export type EstimatorKind = 'perfect' | 'raw' | 'complementary' | 'kalman'

export interface Estimate {
  position: Vec3
  velocity: Vec3
  attitude: Attitude
  kind: EstimatorKind
}

export function cloneState(state: KinematicState): KinematicState {
  return {
    position: { ...state.position },
    velocity: { ...state.velocity },
    attitude: { ...state.attitude },
    rates: { ...state.rates },
  }
}

export function perfectEstimate(state: KinematicState): Estimate {
  return {
    position: { ...state.position },
    velocity: { ...state.velocity },
    attitude: { ...state.attitude },
    kind: 'perfect',
  }
}

export interface RawMemory {
  position: Vec3 | null
  velocity: Vec3 | null
  attitude: Attitude
}

export function createRawMemory(initial: KinematicState): RawMemory {
  return {
    position: { ...initial.position },
    velocity: { ...initial.velocity },
    attitude: { ...initial.attitude },
  }
}

/** Holds the latest GNSS/baro/magnetometer reports. No filtering. */
export function rawEstimate(
  memory: RawMemory,
  gnss: { position: Vec3; velocity: Vec3 } | null,
  altitude: number | null,
  heading: number | null,
): { memory: RawMemory; estimate: Estimate } {
  const next: RawMemory = {
    position: memory.position ? { ...memory.position } : null,
    velocity: memory.velocity ? { ...memory.velocity } : null,
    attitude: { ...memory.attitude },
  }
  if (gnss) {
    next.position = { ...gnss.position }
    next.velocity = { ...gnss.velocity }
  }
  if (altitude !== null && next.position) {
    next.position = { ...next.position, z: altitude }
  }
  if (heading !== null) next.attitude.yaw = heading
  return {
    memory: next,
    estimate: {
      position: next.position ?? { x: 0, y: 0, z: 0 },
      velocity: next.velocity ?? { x: 0, y: 0, z: 0 },
      attitude: next.attitude,
      kind: 'raw',
    },
  }
}

export interface ComplementaryState {
  position: Vec3
  velocity: Vec3
  attitude: Attitude
}

/**
 * Integrates specific force between corrections.
 * A new GNSS fix pulls position by `alpha` and velocity by `beta` (1/s) times the position error.
 * Barometric altitude corrects Up only.
 */
export function correctComplementary(
  state: ComplementaryState,
  gnss: { position: Vec3 } | null,
  altitude: number | null,
  heading: number | null,
  alpha: number,
  beta: number,
  altitudeGain: number,
): ComplementaryState {
  const next: ComplementaryState = {
    position: { ...state.position },
    velocity: { ...state.velocity },
    attitude: { ...state.attitude },
  }
  if (gnss) {
    const error = sub(gnss.position, next.position)
    next.position = add(next.position, scale(error, alpha))
    next.velocity = add(next.velocity, scale(error, beta))
  }
  if (altitude !== null) {
    const errorZ = altitude - next.position.z
    next.position = { ...next.position, z: next.position.z + altitudeGain * errorZ }
    next.velocity = { ...next.velocity, z: next.velocity.z + beta * 0.25 * errorZ }
  }
  if (heading !== null) {
    next.attitude = { ...next.attitude, yaw: next.attitude.yaw + alpha * (heading - next.attitude.yaw) }
  }
  return next
}

export function propagateComplementary(
  state: ComplementaryState,
  dt: number,
  specificForce: Vec3 | null,
  gravity: number,
): ComplementaryState {
  const acceleration = {
    x: specificForce?.x ?? 0,
    y: specificForce?.y ?? 0,
    z: (specificForce?.z ?? 0) - gravity,
  }
  const velocity = add(state.velocity, scale(acceleration, dt))
  return {
    position: add(state.position, scale(velocity, dt)),
    velocity,
    attitude: state.attitude,
  }
}

export function stepComplementary(
  state: ComplementaryState,
  dt: number,
  specificForce: Vec3 | null,
  gravity: number,
  gnss: { position: Vec3 } | null,
  altitude: number | null,
  heading: number | null,
  alpha: number,
  beta: number,
  altitudeGain: number,
): ComplementaryState {
  const propagated = propagateComplementary(state, dt, specificForce, gravity)
  return correctComplementary(propagated, gnss, altitude, heading, alpha, beta, altitudeGain)
}
