import { cloneScenario, type Scenario } from './scenario'
import { runSimulation } from './engine'

export interface ReleaseAdvice {
  reachable: boolean
  horizontalSpeed: number
  headingDeg: number
  predictedMiss: number
  note: string
  /** Set when the suggestion moves the release point. Heading then points at the destination. */
  releaseEast?: number
  releaseNorth?: number
  releaseAltitude?: number
}

interface TrialScore {
  miss: number
  downrange: number
  landed: boolean
  landingEast: number
  landingNorth: number
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

function scoreRelease(
  scenario: Scenario,
  speed: number,
  headingDeg: number,
  release?: { x: number; y: number; z: number },
): TrialScore {
  const trial = cloneScenario(scenario)
  if (release) trial.parent.position = { ...release }
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
    return { miss: Number.POSITIVE_INFINITY, downrange: 0, landed: false, landingEast: 0, landingNorth: 0 }
  }
  const origin = release ?? scenario.parent.position
  const downrange = Math.hypot(landing.x - origin.x, landing.y - origin.y)
  return {
    miss: result.metrics.horizontalMiss,
    downrange,
    landed: true,
    landingEast: landing.x,
    landingNorth: landing.y,
  }
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

function bearingToward(east: number, north: number, targetEast: number, targetNorth: number, fallback: number): number {
  const eastOffset = targetEast - east
  const northOffset = targetNorth - north
  if (Math.hypot(eastOffset, northOffset) < 0.5) return fallback
  return ((Math.atan2(eastOffset, northOffset) * 180) / Math.PI + 360) % 360
}

function approachDistance(scenario: Scenario, speed: number): number {
  const ratio = glideRatio(scenario)
  const altitude = Math.max(scenario.parent.position.z, 0)
  if (ratio > 0.2) return Math.max(20, altitude * ratio)
  const gravity = Math.max(scenario.atmosphere.gravity, 0.1)
  return Math.max(10, speed * Math.sqrt((2 * altitude) / gravity))
}

function objectClause(scenario: Scenario): string {
  const mass = scenario.object.mass.toFixed(1)
  const cd = scenario.object.cd.toFixed(2)
  if (scenario.object.aeroMode === 'glider') {
    const wing = scenario.object.wingArea
    const wingText = wing && wing > 0 ? ` and wing area ${wing.toFixed(2)} m²` : ''
    return `This glider is ${mass} kg, with drag coefficient ${cd}, lift-to-drag ${glideRatio(scenario).toFixed(1)}${wingText}.`
  }
  const shape = scenario.object.shape === 'sphere' ? 'sphere' : 'object'
  return `This ${shape} is ${mass} kg, with drag coefficient ${cd}.`
}

interface DropPoint {
  east: number
  north: number
  heading: number
  speed: number
  miss: number
  landed: boolean
}

function refineDropPoint(scenario: Scenario, speed: number): DropPoint {
  const target = scenario.control.target
  const altitude = scenario.parent.position.z
  const inbound = (scenario.parent.headingDeg * Math.PI) / 180
  const distance = approachDistance(scenario, speed)
  let east = target.x - Math.sin(inbound) * distance
  let north = target.y - Math.cos(inbound) * distance
  let heading = bearingToward(east, north, target.x, target.y, scenario.parent.headingDeg)
  let best: DropPoint = { east, north, heading, speed, miss: Number.POSITIVE_INFINITY, landed: false }
  for (let step = 0; step < 4; step += 1) {
    heading = bearingToward(east, north, target.x, target.y, heading)
    const score = scoreRelease(scenario, speed, heading, { x: east, y: north, z: altitude })
    if (score.miss < best.miss) best = { east, north, heading, speed, miss: score.miss, landed: score.landed }
    if (!score.landed || score.miss <= scenario.control.targetRadius) break
    east -= score.landingEast - target.x
    north -= score.landingNorth - target.y
  }
  return best
}

function speedChoices(scenario: Scenario): number[] {
  const current = Math.max(1, scenario.parent.horizontalSpeed)
  const extras = glideRatio(scenario) > 0 ? [8, 14, 22, 32] : [10, 18, 28, 40, 55]
  const unique = [...new Set([current, ...extras].map((speed) => Math.round(speed * 10) / 10))]
  unique.sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)
  return unique
}

/**
 * The plane flies toward the destination. Search where to release, and the
 * speed that lets this object land in the area. Heading at release points at
 * the destination. Wind and the object are the scenario's current values.
 */
export function suggestDropLocation(scenario: Scenario): ReleaseAdvice {
  const altitude = scenario.parent.position.z
  const headingNow = scenario.parent.headingDeg
  if (altitude < 1 && scenario.parent.verticalSpeed >= 0) {
    return {
      reachable: false,
      horizontalSpeed: scenario.parent.horizontalSpeed,
      headingDeg: headingNow,
      predictedMiss: Number.POSITIVE_INFINITY,
      note: 'The carrier is already on the ground, so there is no place along the approach left to release.',
    }
  }

  let best = refineDropPoint(scenario, speedChoices(scenario)[0])
  if (!(best.landed && best.miss <= scenario.control.targetRadius)) {
    for (const speed of speedChoices(scenario).slice(1)) {
      const point = refineDropPoint(scenario, speed)
      const betterReach = point.landed && point.miss <= scenario.control.targetRadius && !(best.landed && best.miss <= scenario.control.targetRadius)
      const closer = point.miss < best.miss
      if (betterReach || closer) best = point
      if (best.landed && best.miss <= scenario.control.targetRadius) break
    }
  }

  const east = Math.round(best.east * 10) / 10
  const north = Math.round(best.north * 10) / 10
  const speed = Math.round(best.speed * 10) / 10
  const heading = Math.round(bearingToward(east, north, scenario.control.target.x, scenario.control.target.y, best.heading) * 10) / 10
  const confirmed = scoreRelease(scenario, speed, heading, { x: east, y: north, z: altitude })
  const miss = confirmed.landed ? confirmed.miss : best.miss
  const landed = confirmed.landed
  const reachable = landed && miss <= scenario.control.targetRadius
  const place = `Drop at east ${east.toFixed(1)} m, north ${north.toFixed(1)} m, altitude ${altitude.toFixed(0)} m.`
  const flight = ` Head toward the destination at ${speed.toFixed(0)} m/s on heading ${heading.toFixed(1)}°.`
  const object = ` ${objectClause(scenario)}`
  const outcome = !landed
    ? ' That release did not reach the ground in the search.'
    : reachable
      ? ` The impact is predicted ${miss.toFixed(0)} m from the ring center, inside the ${scenario.control.targetRadius.toFixed(0)} m area.`
      : ` The closest approach still misses by ${miss.toFixed(0)} m. Altitude, wind, or the object's lift-to-drag may not leave a release point that lands inside the area.`
  return {
    reachable,
    horizontalSpeed: speed,
    headingDeg: heading,
    predictedMiss: miss,
    releaseEast: east,
    releaseNorth: north,
    releaseAltitude: altitude,
    note: `${place}${flight}${object}${outcome} The same seed repeats this search. Applying it turns steering off.`,
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
