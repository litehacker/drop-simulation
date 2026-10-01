import { headingOf, wrapPi } from '../coordinates/enu'
import { clampVec, horizontal, length, scale, sub, type Vec3 } from '../math/vec3'

export type GuidanceLaw = 'heading' | 'velocity' | 'trajectory' | 'abort'
export type ActuatorKind = 'none' | 'acceleration' | 'bank'

export interface GuidanceCommand {
  law: GuidanceLaw
  /** Inertial acceleration the actuator will try to apply, ENU m/s². */
  acceleration: Vec3
  /** Commanded bank, radians. Used when the actuator is a lifting body. */
  bankRad: number
  /** Navigation heading the guidance law is steering toward. */
  headingRad: number
  active: boolean
}

export interface GuidanceInput {
  enabled: boolean
  law: GuidanceLaw
  /** Position gain, 1/s, applied to the velocity error of a pursuit law. */
  kp: number
  maxAcceleration: number
  maxBankRad: number
  /** Ground speed the velocity law tries to hold. */
  desiredGroundSpeed: number
  target: Vec3
  abortPoint: Vec3
  actuator: ActuatorKind
}

const IDLE: GuidanceCommand = {
  law: 'trajectory',
  acceleration: { x: 0, y: 0, z: 0 },
  bankRad: 0,
  headingRad: 0,
  active: false,
}

/**
 * Supervisory landing guidance.
 * It steers toward a ground region or an abort point. It does not model a weapon seeker.
 * With actuator "none", the command is still returned so it can be logged, and the caller applies nothing.
 */
export function guidanceCommand(
  position: Vec3,
  velocity: Vec3,
  input: GuidanceInput,
): GuidanceCommand {
  if (!input.enabled) return { ...IDLE, law: input.law, active: false }
  const point = input.law === 'abort' ? input.abortPoint : input.target
  const toPoint = horizontal(sub(point, position))
  const distance = length(toPoint)
  const currentHeading = headingOf(velocity)
  const desiredHeading = distance < 0.5 ? currentHeading : Math.atan2(toPoint.x, toPoint.y)
  const headingError = wrapPi(desiredHeading - currentHeading)
  const groundSpeed = Math.hypot(velocity.x, velocity.y)
  const right = { x: Math.cos(currentHeading), y: -Math.sin(currentHeading), z: 0 }
  const forward = { x: Math.sin(currentHeading), y: Math.cos(currentHeading), z: 0 }

  let acceleration = { x: 0, y: 0, z: 0 }
  if (input.law === 'velocity') {
    const speedError = input.desiredGroundSpeed - groundSpeed
    acceleration = clampVec(scale(forward, input.kp * speedError), input.maxAcceleration)
  } else if (input.law === 'heading') {
    acceleration = clampVec(scale(right, input.kp * headingError * Math.max(groundSpeed, 1)), input.maxAcceleration)
  } else {
    const desiredSpeed = input.law === 'trajectory' ? Math.max(groundSpeed, 1) : Math.max(groundSpeed, input.desiredGroundSpeed)
    const desired =
      distance < 0.5
        ? { x: 0, y: 0, z: 0 }
        : scale(toPoint, desiredSpeed / distance)
    const current = horizontal(velocity)
    acceleration = clampVec(
      scale(sub(desired, current), input.kp),
      input.maxAcceleration,
    )
  }

  const bankRad = Math.max(-input.maxBankRad, Math.min(input.maxBankRad, headingError * 0.8))
  return {
    law: input.law,
    acceleration: input.actuator === 'acceleration' ? acceleration : { x: 0, y: 0, z: 0 },
    bankRad: input.actuator === 'bank' ? bankRad : 0,
    headingRad: desiredHeading,
    active: true,
  }
}
