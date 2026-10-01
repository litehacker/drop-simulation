import { cloneScenario, type Scenario } from './scenario'
import { runSimulation } from './engine'

export interface ReleaseAdvice {
  reachable: boolean
  horizontalSpeed: number
  headingDeg: number
  predictedMiss: number
  note: string
}

interface TrialScore {
  miss: number
  downrange: number
  landed: boolean
}

function glideRatio(scenario: Scenario): number {
  if (scenario.object.aeroMode === 'ballistic') return 0
  const cd = Math.max(scenario.object.cd, 1e-6)
  const cl = scenario.object.useLiftToDrag ? cd * scenario.object.liftToDrag : scenario.object.cl
  return cl > 0 ? cl / cd : 0
}

export function passiveFlightDuration(scenario: Scenario): number {
  const ratio = glideRatio(scenario)
  const sink = ratio > 0.2 ? Math.sin(Math.atan(1 / ratio)) : 1
  const estimated = scenario.parent.position.z / Math.max(4 * sink, 0.4) + 30
  return Math.min(900, Math.max(scenario.simulation.duration, estimated))
}

function scoreRelease(scenario: Scenario, speed: number, headingDeg: number): TrialScore {
  const trial = cloneScenario(scenario)
  trial.parent.horizontalSpeed = speed
  trial.parent.headingDeg = headingDeg
  trial.parent.inheritVelocity = true
  trial.control.enabled = false
  trial.control.actuator = 'none'
  trial.simulation = {
    ...trial.simulation,
    duration: passiveFlightDuration(scenario),
    outputDt: 0.5,
  }
  trial.estimator = { ...trial.estimator, kind: 'perfect' }
  const result = runSimulation(trial, true)
  const landing = result.landing?.position
  if (!landing || result.metrics.horizontalMiss === null) {
    return { miss: Number.POSITIVE_INFINITY, downrange: 0, landed: false }
  }
  const release = scenario.parent.position
  const downrange = Math.hypot(landing.x - release.x, landing.y - release.y)
  return { miss: result.metrics.horizontalMiss, downrange, landed: true }
}

/**
 * Search release speed and heading so a passive drop lands near the target.
 * Steering is turned off in the search. The result is a prediction under the
 * current wind. The scenario seed keeps the suggestion repeatable.
 */
export function suggestRelease(scenario: Scenario): ReleaseAdvice {
  const release = scenario.parent.position
  const target = scenario.control.target
  const east = target.x - release.x
  const north = target.y - release.y
  const targetRange = Math.hypot(east, north)
  const bearing = (Math.atan2(east, north) * 180) / Math.PI
  const bearingDeg = (bearing + 360) % 360
  const ratio = glideRatio(scenario)
  if (release.z < 1 && scenario.parent.verticalSpeed >= 0) {
    return {
      reachable: false,
      horizontalSpeed: scenario.parent.horizontalSpeed,
      headingDeg: bearingDeg,
      predictedMiss: Number.POSITIVE_INFINITY,
      note: 'The carrier is already on the ground, so there is no fall left to place the impact with release speed.',
    }
  }

  let best = { speed: 20, heading: bearingDeg, miss: Number.POSITIVE_INFINITY, downrange: 0, landed: false }
  const speeds = ratio > 0 ? [8, 14, 22, 32] : [6, 10, 14, 18, 24, 32, 42, 55]
  const offsets = [-40, -20, 0, 20, 40]
  for (const speed of speeds) {
    for (const offset of offsets) {
      const heading = (bearingDeg + offset + 360) % 360
      const score = scoreRelease(scenario, speed, heading)
      if (score.miss < best.miss) best = { speed, heading, ...score }
    }
  }
  for (const speed of [best.speed - 3, best.speed - 1, best.speed + 1, best.speed + 3]) {
    if (speed < 1) continue
    const score = scoreRelease(scenario, speed, best.heading)
    if (score.miss < best.miss) best = { speed, heading: best.heading, ...score }
  }

  const reachable = best.landed && best.miss <= scenario.control.targetRadius
  const reach = release.z * ratio
  const note = adviceNote(scenario, best, targetRange, ratio, reach, reachable)
  return {
    reachable,
    horizontalSpeed: best.speed,
    headingDeg: best.heading,
    predictedMiss: best.miss,
    note,
  }
}

function adviceNote(
  scenario: Scenario,
  best: { speed: number; heading: number; miss: number; downrange: number; landed: boolean },
  targetRange: number,
  ratio: number,
  reach: number,
  reachable: boolean,
): string {
  const tail = ' This search uses the wind saved in the scenario, so the same seed repeats it. Applying the result turns steering off.'
  if (!best.landed) {
    return `No release in the search reached the ground. A lift-to-drag of ${ratio.toFixed(0)} sinks slowly from ${scenario.parent.position.z.toFixed(0)} m.${tail}`
  }
  if (reachable) {
    return `Release at ${best.speed.toFixed(0)} m/s on heading ${best.heading.toFixed(0)}° is predicted to land ${best.miss.toFixed(0)} m from the ring center, inside the ${scenario.control.targetRadius.toFixed(0)} m area.${tail}`
  }
  if (ratio > 0) {
    const long = best.downrange > targetRange
    const slope = `Height times lift-to-drag is about ${reach.toFixed(0)} m in still air. The target is ${targetRange.toFixed(0)} m from the carrier. The closest passive drop lands ${best.downrange.toFixed(0)} m downrange (${best.miss.toFixed(0)} m off the center) at ${best.speed.toFixed(0)} m/s on heading ${best.heading.toFixed(0)}°.`
    const why = long
      ? ' The glide flies past this area. Lower the lift-to-drag ratio, or use the sphere, to land shorter. Release speed aims a passive glide; it does not steepen the slope.'
      : ' The glide falls short. Raise the lift-to-drag ratio to stretch it. More mass or less wing area shortens the flight when the wing cannot hold that slope, and both let the wind move the impact less.'
    return slope + why + tail
  }
  return `The closest passive drop still misses by ${best.miss.toFixed(0)} m at ${best.speed.toFixed(0)} m/s on heading ${best.heading.toFixed(0)}°. A sphere only falls, so release speed and heading are what move the impact. A glider with lift reaches farther from the same height, and it also spends longer in the wind.${tail}`
}
