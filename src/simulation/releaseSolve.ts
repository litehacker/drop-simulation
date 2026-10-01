import { cloneScenario, type Scenario } from './scenario'
import { runSimulation } from './engine'

export interface ReleaseAdvice {
  reachable: boolean
  horizontalSpeed: number
  headingDeg: number
  predictedMiss: number
  note: string
  /** Set when the suggestion is allowed to change mass. */
  mass?: number
  /** Set when the suggestion moves the release point. Heading then points at the destination. */
  releaseEast?: number
  releaseNorth?: number
  releaseAltitude?: number
}

export function orderedLimits(min: number, max: number): { min: number; max: number } {
  const low = Number.isFinite(min) ? min : 0
  const high = Number.isFinite(max) ? max : low
  return low <= high ? { min: low, max: high } : { min: high, max: low }
}

export function clampToLimits(value: number, min: number, max: number): number {
  const range = orderedLimits(min, max)
  return Math.min(range.max, Math.max(range.min, value))
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
  const speedRange = orderedLimits(scenario.suggestion.speedMin, scenario.suggestion.speedMax)
  const speeds = speedChoices(scenario)
  const offsets = [-40, -20, 0, 20, 40]
  for (const speed of speeds) {
    for (const offset of offsets) {
      const heading = (bearingDeg + offset + 360) % 360
      const score = scoreRelease(scenario, speed, heading)
      if (score.miss < best.miss) best = { speed, heading, ...score }
    }
  }
  for (const speed of [best.speed - 3, best.speed - 1, best.speed + 1, best.speed + 3]) {
    if (speed < Math.max(1, speedRange.min) || speed > speedRange.max) continue
    const score = scoreRelease(scenario, speed, best.heading)
    if (score.miss < best.miss) best = { speed, heading: best.heading, ...score }
  }

  const reachable = best.landed && best.miss <= scenario.control.targetRadius
  const reach = release.z * ratio
  const note = `${adviceNote(scenario, best, targetRange, ratio, reach, reachable)}${limitsClause(scenario, best.speed, scenario.object.mass)}`
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
  for (let step = 0; step < 8; step += 1) {
    heading = bearingToward(east, north, target.x, target.y, heading)
    const score = scoreRelease(scenario, speed, heading, { x: east, y: north, z: altitude })
    const improved = score.miss < best.miss - 0.25
    if (score.miss < best.miss) best = { east, north, heading, speed, miss: score.miss, landed: score.landed }
    if (!score.landed || score.miss <= 1) break
    if (!improved) break
    east -= score.landingEast - target.x
    north -= score.landingNorth - target.y
  }
  return best.landed && best.miss > 1 ? polishDropPoint(scenario, best) : best
}

function polishDropPoint(scenario: Scenario, start: DropPoint): DropPoint {
  const target = scenario.control.target
  const altitude = scenario.parent.position.z
  let best = start
  for (const step of [6, 2, 0.6]) {
    let moved = false
    for (const eastShift of [-step, 0, step]) {
      for (const northShift of [-step, 0, step]) {
        if (eastShift === 0 && northShift === 0) continue
        const east = best.east + eastShift
        const north = best.north + northShift
        const heading = bearingToward(east, north, target.x, target.y, best.heading)
        const score = scoreRelease(scenario, best.speed, heading, { x: east, y: north, z: altitude })
        if (score.miss < best.miss) {
          best = { east, north, heading, speed: best.speed, miss: score.miss, landed: score.landed }
          moved = true
        }
      }
    }
    if (best.miss <= 1) break
    if (!moved) break
  }
  return best
}

function speedChoices(scenario: Scenario): number[] {
  const range = orderedLimits(scenario.suggestion.speedMin, scenario.suggestion.speedMax)
  const current = clampToLimits(Math.max(1, scenario.parent.horizontalSpeed), range.min, Math.max(range.max, range.min))
  const extras = glideRatio(scenario) > 0 ? [8, 14, 22, 32] : [10, 18, 28, 40, 55]
  const unique = [...new Set([current, ...extras].map((speed) => Math.round(speed * 10) / 10))]
    .filter((speed) => speed >= range.min - 1e-6 && speed <= range.max + 1e-6 && speed >= 1)
  if (unique.length === 0) unique.push(Math.max(1, current))
  unique.sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)
  return unique
}

function massChoices(scenario: Scenario): number[] {
  const current = scenario.object.mass
  if (!scenario.suggestion.varyMass) return [current]
  const range = orderedLimits(scenario.suggestion.massMin, scenario.suggestion.massMax)
  const low = Math.max(range.min, 0.05)
  const high = Math.max(range.max, low)
  const grid = [low, low + (high - low) / 2, high]
  const unique = [...new Set([clampToLimits(current, low, high), ...grid].map((mass) => Math.round(mass * 100) / 100))]
    .filter((mass) => mass >= low - 1e-6 && mass <= high + 1e-6)
  unique.sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)
  return unique
}

function withMass(scenario: Scenario, mass: number): Scenario {
  if (mass === scenario.object.mass) return scenario
  const copy = cloneScenario(scenario)
  copy.object.mass = mass
  return copy
}

function limitsClause(scenario: Scenario, speed: number, mass: number): string {
  const speedRange = orderedLimits(scenario.suggestion.speedMin, scenario.suggestion.speedMax)
  const speedText = ` Speed stays between ${speedRange.min.toFixed(0)} and ${speedRange.max.toFixed(0)} m/s (this suggestion uses ${speed.toFixed(0)}).`
  if (!scenario.suggestion.varyMass) return `${speedText} Mass stays ${scenario.object.mass.toFixed(2)} kg.`
  const massRange = orderedLimits(scenario.suggestion.massMin, scenario.suggestion.massMax)
  return `${speedText} Mass stays between ${massRange.min.toFixed(2)} and ${massRange.max.toFixed(2)} kg (this suggestion uses ${mass.toFixed(2)}).`
}

/**
 * The plane flies toward the destination. Search where to release so the
 * impact estimate is on the center of the landing area, not merely inside it.
 * Heading at release points at the destination. Wind and the object are the
 * scenario's current values.
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

  let best: DropPoint = {
    east: scenario.parent.position.x,
    north: scenario.parent.position.y,
    heading: headingNow,
    speed: clampToLimits(scenario.parent.horizontalSpeed, scenario.suggestion.speedMin, scenario.suggestion.speedMax),
    miss: Number.POSITIVE_INFINITY,
    landed: false,
  }
  let mass = scenario.object.mass
  const consider = (trial: Scenario, point: DropPoint, trialMass: number) => {
    void trial
    if (point.miss < best.miss) {
      best = point
      mass = trialMass
    }
  }
  for (const trialMass of massChoices(scenario)) {
    const trial = withMass(scenario, trialMass)
    let point = refineDropPoint(trial, speedChoices(trial)[0])
    consider(trial, point, trialMass)
    if (!(point.landed && point.miss <= 1)) {
      for (const speed of speedChoices(trial).slice(1)) {
        point = refineDropPoint(trial, speed)
        consider(trial, point, trialMass)
        if (best.landed && best.miss <= 1) break
      }
    }
    if (best.landed && best.miss <= 1) break
  }

  const east = Math.round(best.east * 10) / 10
  const north = Math.round(best.north * 10) / 10
  const speedRange = orderedLimits(scenario.suggestion.speedMin, scenario.suggestion.speedMax)
  const speed = clampToLimits(Math.round(best.speed * 10) / 10, speedRange.min, speedRange.max)
  const heading = Math.round(bearingToward(east, north, scenario.control.target.x, scenario.control.target.y, best.heading) * 10) / 10
  const trial = withMass(scenario, mass)
  const confirmed = scoreRelease(trial, speed, heading, { x: east, y: north, z: altitude })
  const miss = confirmed.landed ? confirmed.miss : best.miss
  const landed = confirmed.landed
  const reachable = landed && miss <= scenario.control.targetRadius
  const place = `Drop at east ${east.toFixed(1)} m, north ${north.toFixed(1)} m, altitude ${altitude.toFixed(0)} m.`
  const flight = ` Head toward the destination at ${speed.toFixed(0)} m/s on heading ${heading.toFixed(1)}°.`
  const object = ` ${objectClause(trial)}`
  const ring = scenario.control.targetRadius.toFixed(0)
  const outcome = !landed
    ? ' That release did not reach the ground in the search.'
    : miss <= 2
      ? ` The estimate hits the center of the landing area (${miss.toFixed(1)} m from it), inside the ${ring} m ring.`
      : ` The closest estimate is ${miss.toFixed(1)} m from the center${reachable ? `, still inside the ${ring} m ring` : `, outside the ${ring} m ring`}.`
  return {
    reachable,
    horizontalSpeed: speed,
    headingDeg: heading,
    predictedMiss: miss,
    releaseEast: east,
    releaseNorth: north,
    releaseAltitude: altitude,
    mass: scenario.suggestion.varyMass ? mass : undefined,
    note: `${place}${flight}${object}${outcome}${limitsClause(scenario, speed, mass)} The same seed repeats this search. Applying it turns steering off.`,
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
