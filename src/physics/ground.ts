import { lerp, type Vec3 } from '../math/vec3'
import type { KinematicState } from './integration'

export interface Landing {
  time: number
  position: Vec3
  velocity: Vec3
  speed: number
}

/**
 * Inelastic ground contact on z = groundZ.
 * When a step crosses the plane, impact state is linearly interpolated.
 * Restitution 0 stays on the ground. A small upward bounce is allowed otherwise.
 */
export function resolveGround(
  before: KinematicState,
  after: KinematicState,
  timeBefore: number,
  dt: number,
  groundZ: number,
  restitution: number,
): { state: KinematicState; landing: Landing | null; settled: boolean } {
  if (before.position.z > groundZ && after.position.z <= groundZ && before.velocity.z <= 0) {
    const denom = before.position.z - after.position.z
    const fraction = denom === 0 ? 1 : (before.position.z - groundZ) / denom
    const clamped = Math.min(1, Math.max(0, fraction))
    const position = lerp(before.position, after.position, clamped)
    position.z = groundZ
    const velocity = lerp(before.velocity, after.velocity, clamped)
    const landing: Landing = {
      time: timeBefore + dt * clamped,
      position: { ...position },
      velocity: { ...velocity },
      speed: Math.hypot(velocity.x, velocity.y, velocity.z),
    }
    const bouncedZ = -velocity.z * restitution
    const settled = bouncedZ < 0.4
    return {
      landing,
      settled,
      state: {
        ...after,
        position: { x: position.x, y: position.y, z: groundZ },
        velocity: settled
          ? { x: 0, y: 0, z: 0 }
          : { x: velocity.x * restitution, y: velocity.y * restitution, z: bouncedZ },
        rates: settled ? { yaw: 0, pitch: 0, roll: 0 } : after.rates,
      },
    }
  }

  if (after.position.z < groundZ) {
    return {
      landing: null,
      settled: true,
      state: {
        ...after,
        position: { ...after.position, z: groundZ },
        velocity: { x: 0, y: 0, z: 0 },
      },
    }
  }

  return { state: after, landing: null, settled: false }
}
