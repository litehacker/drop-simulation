import type { Attitude } from '../coordinates/enu'
import { flightPathAngle, headingOf } from '../coordinates/enu'
import type { GuidanceCommand } from '../control/correction'
import { add, length, scale, type Vec3 } from '../math/vec3'
import { buoyancyForce, liftDirection, liftForce, pitchAcceleration } from '../physics/aero'
import type { AtmosphereSample } from '../physics/atmosphere'
import { dragForce, relativeAirVelocity } from '../physics/drag'
import { gravityAcceleration, gravityForce } from '../physics/gravity'
import type { KinematicDerivative, KinematicState } from '../physics/integration'
import { geometryOf } from '../physics/shapes'
import type { Scenario } from './scenario'

export interface ForceReport {
  gravity: Vec3
  drag: Vec3
  lift: Vec3
  buoyancy: Vec3
  correction: Vec3
  acceleration: Vec3
  specificForce: Vec3
  wind: Vec3
  airRelative: Vec3
  dragCoefficient: number
  liftCoefficient: number
  airDensity: number
  referenceArea: number
  pitchAcceleration: number
}

export function aerodynamicCoefficients(scenario: Scenario): { cd: number; cl: number; cm: number } {
  const cd = Math.max(0, scenario.object.cd)
  if (scenario.object.aeroMode === 'ballistic') return { cd, cl: 0, cm: 0 }
  const cl = scenario.object.useLiftToDrag ? cd * scenario.object.liftToDrag : scenario.object.cl
  const cm = scenario.object.aeroMode === 'custom' ? scenario.object.cm : 0
  return { cd, cl, cm }
}

export function evaluateForces(
  state: KinematicState,
  scenario: Scenario,
  wind: Vec3,
  atmosphere: AtmosphereSample,
  command: GuidanceCommand,
): ForceReport {
  const geometry = geometryOf({
    shape: scenario.object.shape,
    mass: scenario.object.mass,
    diameter: scenario.object.diameter,
    length: scenario.object.length,
    width: scenario.object.width,
    height: scenario.object.height,
    customVolume: scenario.object.customVolume,
    referenceAreaOverride: scenario.object.referenceAreaOverride,
    wingArea: scenario.object.wingArea,
  })
  const coefficients = aerodynamicCoefficients(scenario)
  const cd = coefficients.cd * atmosphere.dragMultiplier
  const cl = coefficients.cl
  const airRelative = relativeAirVelocity(state.velocity, wind)
  const drag = dragForce(atmosphere.density, cd, geometry.referenceArea, airRelative)
  const bank = scenario.control.actuator === 'bank' ? state.attitude.roll : 0
  const lift =
    scenario.object.aeroMode === 'glider'
      ? trimmedGliderLift(
          airRelative,
          bank,
          atmosphere.density,
          cl,
          Math.max(coefficients.cd, 1e-6),
          geometry.wingArea,
          scenario.object.mass,
          atmosphere.gravity,
        )
      : cl === 0
        ? { x: 0, y: 0, z: 0 }
        : liftForce(atmosphere.density, cl, geometry.wingArea, airRelative, bank)
  const buoyancy = scenario.object.buoyancy
    ? buoyancyForce(atmosphere.density, geometry.volume, atmosphere.gravity)
    : { x: 0, y: 0, z: 0 }
  const correction =
    command.active && scenario.control.actuator === 'acceleration'
      ? scale(command.acceleration, scenario.object.mass)
      : { x: 0, y: 0, z: 0 }
  const gravity = gravityForce(scenario.object.mass, atmosphere.gravity)
  const total = add(add(add(add(gravity, drag), lift), buoyancy), correction)
  const acceleration = scale(total, 1 / scenario.object.mass)
  const specific = add(acceleration, scale(gravityAcceleration(atmosphere.gravity), -1))
  const inertia = scenario.object.inertiaOverride ?? geometry.inertia
  const pitch = pitchAcceleration({
    relativeVelocity: airRelative,
    aeroForce: add(drag, lift),
    centerOfMass: scenario.object.centerOfMass,
    centerOfPressure: scenario.object.centerOfPressure,
    pitchInertia: inertia.y,
    airDensity: atmosphere.density,
    momentCoefficient: coefficients.cm,
    area: geometry.referenceArea,
    chord: geometry.characteristicLength,
  })
  return {
    gravity,
    drag,
    lift,
    buoyancy,
    correction,
    acceleration,
    specificForce: specific,
    wind,
    airRelative,
    dragCoefficient: cd,
    liftCoefficient: cl,
    airDensity: atmosphere.density,
    referenceArea: geometry.referenceArea,
    pitchAcceleration: pitch,
  }
}


/** Passive trim. The wing seeks a descent of atan(1 / lift-to-drag) and cannot hold level flight. */
function trimmedGliderLift(
  airRelative: Vec3,
  bank: number,
  airDensity: number,
  liftCoefficient: number,
  dragCoefficient: number,
  wingArea: number,
  mass: number,
  gravity: number,
): Vec3 {
  const direction = liftDirection(airRelative, bank)
  const speed = length(airRelative)
  if (speed < 0.2 || wingArea <= 0 || liftCoefficient <= 0 || airDensity <= 0) return { x: 0, y: 0, z: 0 }
  const horizontal = Math.hypot(airRelative.x, airRelative.y)
  const theta = Math.atan2(airRelative.z, Math.max(horizontal, 1e-3))
  const ratio = liftCoefficient / dragCoefficient
  const thetaEq = -Math.atan(1 / Math.max(ratio, 0.2))
  const tau = 0.7
  const desired = mass * gravity * Math.cos(theta) + (mass * speed * (thetaEq - theta)) / tau
  const available = 0.5 * airDensity * liftCoefficient * wingArea * speed * speed
  return scale(direction, Math.min(Math.max(0, desired), available))
}

export function derivativeOf(
  state: KinematicState,
  scenario: Scenario,
  report: ForceReport,
  command: GuidanceCommand,
): KinematicDerivative {
  const damping = scenario.object.angularDamping
  const aligning = scenario.object.aeroMode === 'glider' || scenario.control.actuator === 'bank'
  const tau = Math.max(0.05, scenario.object.bankTimeConstant)
  const rollRate = aligning ? (command.bankRad - state.attitude.roll) / tau : state.rates.roll
  return {
    velocity: state.velocity,
    acceleration: report.acceleration,
    rates: {
      yaw: aligning ? 0 : state.rates.yaw,
      pitch: aligning ? 0 : state.rates.pitch,
      roll: rollRate,
    },
    rateDot: {
      yaw: aligning ? 0 : -damping * state.rates.yaw,
      pitch: report.pitchAcceleration - damping * state.rates.pitch,
      roll: aligning ? 0 : -damping * state.rates.roll,
    },
  }
}

export function alignGliderAttitude(state: KinematicState, scenario: Scenario): Attitude {
  if (scenario.object.aeroMode !== 'glider' && scenario.control.actuator !== 'bank') return state.attitude
  return {
    yaw: headingOf(state.velocity),
    pitch: flightPathAngle(state.velocity),
    roll: state.attitude.roll,
  }
}

export function idleCommand(): GuidanceCommand {
  return {
    law: 'trajectory',
    acceleration: { x: 0, y: 0, z: 0 },
    bankRad: 0,
    headingRad: 0,
    active: false,
  }
}

export function horizontalAirspeed(report: ForceReport): number {
  return length(report.airRelative)
}
