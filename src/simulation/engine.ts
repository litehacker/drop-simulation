import { degToRad, distance3, groundRange, headingOf, velocityFromHeading, wrapPi } from '../coordinates/enu'
import { airtimeSeconds, deterministicLatency, estimatedRssi, packetLossProbability } from '../communications/packetLoss'
import { averageLatency, createLinkRuntime, tickLink, type LinkRuntime } from '../communications/telemetry'
import { guidanceCommand, type GuidanceCommand } from '../control/correction'
import {
  correctComplementary,
  createRawMemory,
  perfectEstimate,
  propagateComplementary,
  rawEstimate,
  type ComplementaryState,
  type Estimate,
  type RawMemory,
} from '../estimation/complementary'
import {
  createKalman,
  kalmanPosition,
  kalmanPredict,
  kalmanUpdateAltitude,
  kalmanUpdatePosition,
  kalmanVelocity,
  type KalmanState,
} from '../estimation/kalman'
import { mulberry32 } from '../math/random'
import { add, length, scale, sub, type Vec3 } from '../math/vec3'
import { sampleAtmosphere } from '../physics/atmosphere'
import { resolveGround, type Landing } from '../physics/ground'
import { rk4Step, type KinematicState } from '../physics/integration'
import { createWindState, stepWind } from '../physics/wind'
import { createSensorClock, effectiveRate, stepSensors, type SensorTruth } from '../sensors/bank'
import { alignGliderAttitude, derivativeOf, evaluateForces, idleCommand } from './forces'
import { cloneScenario, validateScenario, type Scenario } from './scenario'

export interface Sample {
  t: number
  truePosition: Vec3
  trueVelocity: Vec3
  estimatedPosition: Vec3
  estimatedVelocity: Vec3
  measuredPosition: Vec3 | null
  wind: Vec3
  airRelative: Vec3
  groundVelocity: Vec3
  gravity: Vec3
  drag: Vec3
  lift: Vec3
  correction: Vec3
  parentPosition: Vec3
  distance: number
  modeledLoss: number
  modeledLatency: number
  estimatedRssi: number
  released: boolean
  landed: boolean
}

export interface RateSummary {
  physicsHz: number
  imuHz: number
  gnssHz: number
  barometerHz: number
  magnetometerHz: number
  airspeedHz: number
  altimeterHz: number
  telemetryHz: number
  uiFps: number
}

export interface SimulationMetrics {
  landed: boolean
  landingPosition: Vec3 | null
  landingTime: number | null
  impactSpeed: number | null
  horizontalMiss: number | null
  rmsTrajectoryError: number | null
  maxDeviation: number | null
  rmsPositionError: number
  rmsVelocityError: number
  rmsAltitudeError: number
  rmsHeadingError: number
  controlEffort: number
  correctionCount: number
  packetsSent: number
  packetsLost: number
  packetsDelivered: number
  packetLossRatio: number
  averageLatency: number
  computeSeconds: number
}

export interface SimulationResult {
  scenarioName: string
  seed: number
  samples: Sample[]
  prediction: { t: number; position: Vec3 }[]
  landing: Landing | null
  metrics: SimulationMetrics
  rates: RateSummary
  warnings: string[]
  airDensity: number
  densitySource: string
  problems: string[]
}

interface EstimatorRuntime {
  raw: RawMemory
  complementary: ComplementaryState
  kalman: KalmanState
}

function parentAt(scenario: Scenario, time: number): KinematicState {
  const velocity = velocityFromHeading(
    scenario.parent.headingDeg,
    scenario.parent.horizontalSpeed,
    scenario.parent.verticalSpeed,
  )
  return {
    position: add(scenario.parent.position, scale(velocity, time)),
    velocity,
    attitude: {
      yaw: degToRad(scenario.parent.headingDeg),
      pitch: degToRad(scenario.parent.pitchDeg),
      roll: degToRad(scenario.parent.rollDeg),
    },
    rates: { ...scenario.object.initialRates },
  }
}

function releaseState(scenario: Scenario, parent: KinematicState): KinematicState {
  return {
    position: add(parent.position, scenario.parent.releaseOffset),
    velocity: scenario.parent.inheritVelocity ? { ...parent.velocity } : { ...scenario.parent.releaseVelocity },
    attitude: { ...parent.attitude },
    rates: { ...scenario.object.initialRates },
  }
}

function createEstimator(scenario: Scenario, state: KinematicState): EstimatorRuntime {
  return {
    raw: createRawMemory(state),
    complementary: {
      position: { ...state.position },
      velocity: { ...state.velocity },
      attitude: { ...state.attitude },
    },
    kalman: createKalman(
      state.position,
      state.velocity,
      scenario.estimator.initialPositionStd,
      scenario.estimator.initialVelocityStd,
    ),
  }
}

function estimateOf(scenario: Scenario, runtime: EstimatorRuntime, truth: KinematicState): Estimate {
  if (scenario.estimator.kind === 'perfect') return perfectEstimate(truth)
  if (scenario.estimator.kind === 'raw') {
    return {
      position: runtime.raw.position ?? { x: 0, y: 0, z: 0 },
      velocity: runtime.raw.velocity ?? { x: 0, y: 0, z: 0 },
      attitude: runtime.raw.attitude,
      kind: 'raw',
    }
  }
  if (scenario.estimator.kind === 'complementary') {
    return {
      position: runtime.complementary.position,
      velocity: runtime.complementary.velocity,
      attitude: runtime.complementary.attitude,
      kind: 'complementary',
    }
  }
  return {
    position: kalmanPosition(runtime.kalman),
    velocity: kalmanVelocity(runtime.kalman),
    attitude: { ...truth.attitude },
    kind: 'kalman',
  }
}

function headingDelta(estimated: Vec3, truth: Vec3): number {
  if (Math.hypot(estimated.x, estimated.y) < 0.5 || Math.hypot(truth.x, truth.y) < 0.5) return 0
  return wrapPi(headingOf(estimated) - headingOf(truth))
}

function emptyMetrics(computeSeconds: number): SimulationMetrics {
  return {
    landed: false,
    landingPosition: null,
    landingTime: null,
    impactSpeed: null,
    horizontalMiss: null,
    rmsTrajectoryError: null,
    maxDeviation: null,
    rmsPositionError: 0,
    rmsVelocityError: 0,
    rmsAltitudeError: 0,
    rmsHeadingError: 0,
    controlEffort: 0,
    correctionCount: 0,
    packetsSent: 0,
    packetsLost: 0,
    packetsDelivered: 0,
    packetLossRatio: 0,
    averageLatency: 0,
    computeSeconds,
  }
}

function linkTotals(up: LinkRuntime<Estimate>, down: LinkRuntime<GuidanceCommand>): Pick<
  SimulationMetrics,
  'packetsSent' | 'packetsLost' | 'packetsDelivered' | 'packetLossRatio' | 'averageLatency'
> {
  const packetsSent = up.sent + down.sent
  const packetsLost = up.lost + down.lost
  const packetsDelivered = up.delivered + down.delivered
  const latencySum = up.latencySum + down.latencySum
  return {
    packetsSent,
    packetsLost,
    packetsDelivered,
    packetLossRatio: packetsSent === 0 ? 0 : packetsLost / packetsSent,
    averageLatency: packetsDelivered === 0 ? 0 : latencySum / packetsDelivered,
  }
}

export function runSimulation(scenario: Scenario, nested = false): SimulationResult {
  const started = now()
  const problems = validateScenario(scenario)
  const warnings = collectWarnings(scenario)
  const rates = summarizeRates(scenario)
  if (problems.length > 0) {
    return {
      scenarioName: scenario.name,
      seed: scenario.seed,
      samples: [],
      prediction: [],
      landing: null,
      metrics: emptyMetrics(secondsSince(started)),
      rates,
      warnings,
      airDensity: 0,
      densitySource: 'not-run',
      problems,
    }
  }

  const dt = scenario.simulation.physicsDt
  const maxSteps = Math.min(1_000_000, Math.ceil(scenario.simulation.duration / dt) + 2)
  if (scenario.simulation.duration / dt > 1_000_000) {
    warnings.push('The run was capped at 1,000,000 physics steps.')
  }

  const windRng = mulberry32(scenario.seed)
  const sensorRng = mulberry32(scenario.seed + 101)
  const uplinkRng = mulberry32(scenario.seed + 202)
  const downlinkRng = mulberry32(scenario.seed + 303)

  let body = releaseState(scenario, parentAt(scenario, 0))
  let windState = createWindState(scenario.wind)
  let sensorClock = createSensorClock()
  let estimator = createEstimator(scenario, body)
  let uplink = createLinkRuntime<Estimate>()
  let downlink = createLinkRuntime<GuidanceCommand>()
  let command = idleCommand()
  let pendingCommand: GuidanceCommand | null = null
  let nextCommandAt = scenario.parent.releaseTime
  let landing: Landing | null = null
  let settled = false
  let releasedLatch = false
  let controlEffort = 0
  let correctionCount = 0
  let posSq = 0
  let velSq = 0
  let altSq = 0
  let headingSq = 0
  let integratedTime = 0
  const samples: Sample[] = []
  let nextOutput = 0
  let density = 0
  let densitySource = 'ideal-gas'
  let heldSpecificForce: Vec3 | null = null

  for (let step = 0; step < maxSteps && !settled; step += 1) {
    const time = step * dt
    if (time > scenario.simulation.duration + 1e-9) break
    const parent = parentAt(scenario, time)
    const released = time + 1e-12 >= scenario.parent.releaseTime

    if (released && !releasedLatch) {
      body = releaseState(scenario, parent)
      estimator = createEstimator(scenario, body)
      releasedLatch = true
    } else if (!released) {
      body = releaseState(scenario, parent)
    }

    const atmosphere = sampleAtmosphere(scenario.atmosphere, body.position.z)
    density = atmosphere.density
    densitySource = atmosphere.densitySource
    const windStep = stepWind(scenario.wind, body.position.z, windState, dt, windRng)
    windState = windStep.state
    const preview = evaluateForces(body, scenario, windStep.sample.velocity, atmosphere, command)

    const truth: SensorTruth = {
      position: body.position,
      velocity: body.velocity,
      specificForce: preview.specificForce,
      angularRate: body.rates,
      headingRad: headingOf(body.velocity),
      relativeSpeed: length(preview.airRelative),
      altitude: body.position.z,
      surfacePressurePa: scenario.atmosphere.pressurePa,
      temperatureK: atmosphere.temperatureK,
      gravity: atmosphere.gravity,
      noiseScale: atmosphere.sensorNoiseMultiplier,
      dropoutScale: atmosphere.sensorDropoutMultiplier,
    }
    const sensed = stepSensors(sensorClock, time, dt, truth, scenario.sensors, sensorRng)
    sensorClock = sensed.clock
    if (released && sensed.measurements.imuFresh && sensed.measurements.imu) {
      heldSpecificForce = sensed.measurements.imu.specificForce
    }
    if (released) estimator = correctEstimator(scenario, estimator, sensed.measurements)
    const estimate = estimateOf(scenario, estimator, body)

    const separation = distance3(parent.position, body.position)
    const upTick = tickLink(uplink, time, dt, separation, scenario.communication.profile, uplinkRng, estimate)
    uplink = upTick.link

    if (scenario.control.enabled && released && time + 1e-12 >= nextCommandAt && pendingCommand === null) {
      const known = uplink.latest ?? estimate
      pendingCommand = guidanceCommand(known.position, known.velocity, {
        enabled: true,
        law: scenario.control.law,
        kp: scenario.control.kp,
        maxAcceleration: scenario.control.maxAcceleration,
        maxBankRad: degToRad(scenario.control.maxBankDeg),
        desiredGroundSpeed: scenario.control.desiredGroundSpeed,
        target: scenario.control.target,
        abortPoint: scenario.control.abortPoint,
        actuator: scenario.control.actuator,
      })
      nextCommandAt += Math.max(scenario.control.intervalS, dt)
    }
    const downTick = tickLink(
      downlink,
      time,
      dt,
      separation,
      scenario.communication.profile,
      downlinkRng,
      scenario.control.enabled ? pendingCommand : null,
    )
    downlink = downTick.link
    if (downTick.accepted) pendingCommand = null
    if (downTick.arrived) {
      command = downTick.arrived
      if (command.active) correctionCount += 1
    }

    const errorPos = sub(estimate.position, body.position)
    posSq += length(errorPos) ** 2 * dt
    velSq += length(sub(estimate.velocity, body.velocity)) ** 2 * dt
    altSq += (estimate.position.z - body.position.z) ** 2 * dt
    headingSq += headingDelta(estimate.velocity, body.velocity) ** 2 * dt
    integratedTime += dt

    if (time + 1e-12 >= nextOutput || settled || step === maxSteps - 1) {
      const report = evaluateForces(body, scenario, windStep.sample.velocity, atmosphere, command)
      samples.push({
        t: settled && landing ? landing.time : time,
        truePosition: { ...body.position },
        trueVelocity: { ...body.velocity },
        estimatedPosition: { ...estimate.position },
        estimatedVelocity: { ...estimate.velocity },
        measuredPosition: sensed.measurements.gnss ? { ...sensed.measurements.gnss.position } : null,
        wind: report.wind,
        airRelative: report.airRelative,
        groundVelocity: { x: body.velocity.x, y: body.velocity.y, z: 0 },
        gravity: report.gravity,
        drag: report.drag,
        lift: report.lift,
        correction: report.correction,
        parentPosition: { ...parent.position },
        distance: separation,
        modeledLoss: packetLossProbability(separation, scenario.communication.profile.loss),
        modeledLatency: deterministicLatency(separation, scenario.communication.profile),
        estimatedRssi: estimatedRssi(separation, scenario.communication.profile),
        released,
        landed: settled,
      })
      nextOutput += Math.max(scenario.simulation.outputDt, dt)
    }

    if (released && !settled) {
      const frozenWind = windStep.sample.velocity
      const applied = command
      const next = rk4Step(body, dt, (state) => {
        const report = evaluateForces(state, scenario, frozenWind, atmosphere, applied)
        return derivativeOf(state, scenario, report, applied)
      })
      next.attitude = alignGliderAttitude(next, scenario)
      const contact = resolveGround(body, next, time, dt, 0, scenario.simulation.groundRestitution)
      if (contact.landing) landing = contact.landing
      body = contact.state
      settled = contact.settled
      controlEffort += length(applied.active ? applied.acceleration : { x: 0, y: 0, z: 0 }) * dt
      estimator = propagateEstimator(scenario, estimator, dt, atmosphere.gravity, heldSpecificForce)
    }
  }

  if (landing && samples.length > 0) {
    const last = samples[samples.length - 1]
    samples.push({
      ...last,
      t: landing.time,
      truePosition: { ...landing.position },
      trueVelocity: { x: 0, y: 0, z: 0 },
      groundVelocity: { x: 0, y: 0, z: 0 },
      landed: true,
    })
  }

  const prediction = nested ? [] : predictTrajectory(scenario)
  const deviation = deviationFromPrediction(samples, prediction)
  const elapsed = secondsSince(started)
  const totals = linkTotals(uplink, downlink)
  const landingPosition = landing?.position ?? null
  return {
    scenarioName: scenario.name,
    seed: scenario.seed,
    samples,
    prediction,
    landing,
    metrics: {
      landed: landing !== null,
      landingPosition,
      landingTime: landing?.time ?? null,
      impactSpeed: landing?.speed ?? null,
      horizontalMiss: landingPosition ? groundRange(landingPosition, scenario.control.target) : null,
      rmsTrajectoryError: deviation.rms,
      maxDeviation: deviation.max,
      rmsPositionError: Math.sqrt(posSq / Math.max(integratedTime, dt)),
      rmsVelocityError: Math.sqrt(velSq / Math.max(integratedTime, dt)),
      rmsAltitudeError: Math.sqrt(altSq / Math.max(integratedTime, dt)),
      rmsHeadingError: Math.sqrt(headingSq / Math.max(integratedTime, dt)),
      controlEffort,
      correctionCount,
      ...totals,
      computeSeconds: elapsed,
    },
    rates,
    warnings,
    airDensity: density,
    densitySource,
    problems,
  }
}

function altitudeMeasurement(
  measurements: ReturnType<typeof stepSensors>['measurements'],
): number | null {
  if (measurements.altimeterFresh && measurements.altimeter !== null) return measurements.altimeter
  if (measurements.barometerFresh && measurements.barometer) return measurements.barometer.altitudeM
  return null
}

function correctEstimator(
  scenario: Scenario,
  runtime: EstimatorRuntime,
  measurements: ReturnType<typeof stepSensors>['measurements'],
): EstimatorRuntime {
  if (scenario.estimator.kind === 'perfect') return runtime
  const altitude = altitudeMeasurement(measurements)
  if (scenario.estimator.kind === 'raw') {
    const raw = rawEstimate(
      runtime.raw,
      measurements.gnssFresh ? measurements.gnss : null,
      altitude,
      measurements.headingFresh ? measurements.heading : null,
    )
    return { ...runtime, raw: raw.memory }
  }
  if (scenario.estimator.kind === 'complementary') {
    return {
      ...runtime,
      complementary: correctComplementary(
        runtime.complementary,
        measurements.gnssFresh ? measurements.gnss : null,
        altitude,
        measurements.headingFresh ? measurements.heading : null,
        scenario.estimator.complementaryAlpha,
        scenario.estimator.complementaryBeta,
        scenario.estimator.altitudeGain,
      ),
    }
  }
  if (measurements.gnssFresh && measurements.gnss) {
    const horizontal = Math.max(scenario.sensors.gnss.horizontalNoise, 0.05) ** 2
    const vertical = Math.max(scenario.sensors.gnss.verticalNoise, 0.05) ** 2
    kalmanUpdatePosition(runtime.kalman, measurements.gnss.position, {
      x: horizontal,
      y: horizontal,
      z: vertical,
    })
  } else if (altitude !== null) {
    const noise = measurements.altimeterFresh ? scenario.sensors.altimeter.noiseStd : scenario.sensors.barometer.noiseStd
    kalmanUpdateAltitude(runtime.kalman, altitude, Math.max(noise, 0.2) ** 2)
  }
  return runtime
}

function propagateEstimator(
  scenario: Scenario,
  runtime: EstimatorRuntime,
  dt: number,
  gravity: number,
  specificForce: Vec3 | null,
): EstimatorRuntime {
  if (scenario.estimator.kind === 'kalman') {
    kalmanPredict(runtime.kalman, dt, gravity, scenario.estimator.processNoiseAccel)
    return runtime
  }
  if (scenario.estimator.kind === 'complementary') {
    return {
      ...runtime,
      complementary: propagateComplementary(runtime.complementary, dt, specificForce, gravity),
    }
  }
  return runtime
}

function predictTrajectory(scenario: Scenario): { t: number; position: Vec3 }[] {
  const calm = cloneScenario(scenario)
  calm.wind = { ...calm.wind, turbulenceStd: 0, gustsEnabled: false }
  calm.control = { ...calm.control, enabled: false }
  calm.atmosphere = { ...calm.atmosphere, rainMillimetersPerHour: 0 }
  const predicted = runSimulation(calm, true)
  return predicted.samples.map((sample) => ({ t: sample.t, position: sample.truePosition }))
}

function deviationFromPrediction(
  samples: Sample[],
  prediction: { t: number; position: Vec3 }[],
): { rms: number | null; max: number | null } {
  if (prediction.length === 0 || samples.length === 0) return { rms: null, max: null }
  let sum = 0
  let count = 0
  let max = 0
  for (const sample of samples) {
    const predicted = predictionAt(prediction, sample.t)
    if (!predicted) continue
    const error = length(sub(sample.truePosition, predicted))
    sum += error * error
    count += 1
    if (error > max) max = error
  }
  if (count === 0) return { rms: null, max: null }
  return { rms: Math.sqrt(sum / count), max }
}

function predictionAt(prediction: { t: number; position: Vec3 }[], time: number): Vec3 | null {
  if (time < prediction[0].t || time > prediction[prediction.length - 1].t) return null
  let low = 0
  let high = prediction.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (prediction[mid].t < time) low = mid
    else high = mid
  }
  const left = prediction[low]
  const right = prediction[high]
  const span = right.t - left.t
  const fraction = span <= 1e-9 ? 0 : (time - left.t) / span
  return add(left.position, scale(sub(right.position, left.position), fraction))
}

function summarizeRates(scenario: Scenario): RateSummary {
  const dt = scenario.simulation.physicsDt
  return {
    physicsHz: 1 / dt,
    imuHz: effectiveRate(scenario.sensors.imu.updateRateHz, dt),
    gnssHz: effectiveRate(scenario.sensors.gnss.updateRateHz, dt),
    barometerHz: effectiveRate(scenario.sensors.barometer.updateRateHz, dt),
    magnetometerHz: effectiveRate(scenario.sensors.magnetometer.updateRateHz, dt),
    airspeedHz: effectiveRate(scenario.sensors.airspeed.updateRateHz, dt),
    altimeterHz: effectiveRate(scenario.sensors.altimeter.updateRateHz, dt),
    telemetryHz: 1 / Math.max(scenario.communication.profile.intervalS, dt),
    uiFps: scenario.simulation.uiFps,
  }
}

function collectWarnings(scenario: Scenario): string[] {
  const warnings: string[] = []
  const physicsHz = 1 / scenario.simulation.physicsDt
  const limited = [
    ['IMU', scenario.sensors.imu.updateRateHz],
    ['GNSS', scenario.sensors.gnss.updateRateHz],
    ['Barometer', scenario.sensors.barometer.updateRateHz],
    ['Airspeed', scenario.sensors.airspeed.updateRateHz],
  ] as const
  for (const [name, rate] of limited) {
    if (rate > physicsHz + 1e-6) {
      warnings.push(
        `${name} is set to ${rate} Hz, but the physics step only supports ${physicsHz.toFixed(1)} Hz. The effective rate is limited to the physics rate.`,
      )
    }
  }
  const profile = scenario.communication.profile
  if (airtimeSeconds(profile) > profile.intervalS) {
    warnings.push('Packet airtime is longer than the transmit interval. The link model is saturated.')
  }
  if (scenario.control.enabled && scenario.control.actuator === 'none') {
    warnings.push('Correction commands are computed and logged, then discarded, because the actuator is set to none.')
  }
  if (scenario.atmosphere.rainMillimetersPerHour > 0 && scenario.atmosphere.rainDragPerMmHr === 0) {
    warnings.push('Rain is affecting visibility and sensor terms only. The drag multiplier is 1 until you set a rain-drag factor.')
  }
  if (scenario.object.aeroMode === 'ballistic' && scenario.control.actuator === 'acceleration') {
    warnings.push(
      'Direct correction acceleration is an actuator assumption. A sphere does not produce that force aerodynamically.',
    )
  }
  if (profile.confidence !== 'measured') {
    warnings.push(
      `Communication profile “${profile.name}” is labeled ${profile.confidence}. Nominal range is not a guaranteed link distance.`,
    )
  }
  return warnings
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function secondsSince(started: number): number {
  return (now() - started) / 1000
}

export function averageLatencyOf(link: LinkRuntime<unknown>): number {
  return averageLatency(link)
}

/** Used by tests that need a repeatable no-aero projectile. */
export function analyticalProjectile(options: {
  position: Vec3
  velocity: Vec3
  gravity: number
  time: number
}): Vec3 {
  return {
    x: options.position.x + options.velocity.x * options.time,
    y: options.position.y + options.velocity.y * options.time,
    z:
      options.position.z +
      options.velocity.z * options.time -
      0.5 * options.gravity * options.time * options.time,
  }
}
