import { gaussian, mulberry32 } from '../math/random'
import type { SimulationResult } from './engine'
import { runSimulation } from './engine'
import { cloneScenario, type Scenario } from './scenario'

export interface MonteCarloRequest {
  runs: number
  seed: number
  windSpeedSigma: number
  windDirectionSigmaDeg: number
  gustSigma: number
  massFractionSigma: number
  cdFractionSigma: number
  sensorNoiseFractionSigma: number
  latencyFractionSigma: number
  packetLossSigma: number
  releaseAltitudeSigma: number
  releaseSpeedSigma: number
}

export interface LandingPoint {
  run: number
  east: number
  north: number
  radialError: number
  time: number
}

export interface TrajectoryLine {
  run: number
  points: { east: number; north: number; up: number }[]
}

export interface MonteCarloResult {
  runsRequested: number
  runsLanded: number
  landings: LandingPoint[]
  trajectories: TrajectoryLine[]
  meanEast: number | null
  meanNorth: number | null
  stdEast: number | null
  stdNorth: number | null
  radialP50: number | null
  radialP90: number | null
  radialP95: number | null
  computeSeconds: number
}

export function defaultMonteCarloRequest(): MonteCarloRequest {
  return {
    runs: 10,
    seed: 1000,
    windSpeedSigma: 1.5,
    windDirectionSigmaDeg: 8,
    gustSigma: 0.5,
    massFractionSigma: 0.03,
    cdFractionSigma: 0.05,
    sensorNoiseFractionSigma: 0.1,
    latencyFractionSigma: 0.1,
    packetLossSigma: 0.02,
    releaseAltitudeSigma: 2,
    releaseSpeedSigma: 0.4,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function perturbScenario(base: Scenario, request: MonteCarloRequest, index: number): Scenario {
  const scenario = cloneScenario(base)
  const rng = mulberry32((request.seed + index * 9973) >>> 0)
  scenario.seed = (request.seed + index * 9973) >>> 0
  scenario.wind.speed = Math.max(0, base.wind.speed + gaussian(rng) * request.windSpeedSigma)
  scenario.wind.directionDeg = base.wind.directionDeg + gaussian(rng) * request.windDirectionSigmaDeg
  scenario.wind.gustAmplitude = Math.max(0, base.wind.gustAmplitude + gaussian(rng) * request.gustSigma)
  scenario.object.mass = Math.max(0.05, base.object.mass * (1 + gaussian(rng) * request.massFractionSigma))
  scenario.object.cd = Math.max(0, base.object.cd * (1 + gaussian(rng) * request.cdFractionSigma))
  const noise = 1 + gaussian(rng) * request.sensorNoiseFractionSigma
  const noiseScale = Math.max(0, noise)
  scenario.sensors.gnss.horizontalNoise *= noiseScale
  scenario.sensors.gnss.verticalNoise *= noiseScale
  scenario.sensors.imu.accelNoise *= noiseScale
  const latencyScale = Math.max(0, 1 + gaussian(rng) * request.latencyFractionSigma)
  scenario.communication.profile.latencyS = Math.max(0, base.communication.profile.latencyS * latencyScale)
  scenario.sensors.gnss.latencyS = Math.max(0, base.sensors.gnss.latencyS * latencyScale)
  scenario.communication.profile.loss.baseLoss = clamp(
    base.communication.profile.loss.baseLoss + gaussian(rng) * request.packetLossSigma,
    0,
    0.95,
  )
  scenario.parent.position = {
    ...scenario.parent.position,
    z: Math.max(1, base.parent.position.z + gaussian(rng) * request.releaseAltitudeSigma),
  }
  scenario.parent.horizontalSpeed = Math.max(0, base.parent.horizontalSpeed + gaussian(rng) * request.releaseSpeedSigma)
  return scenario
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))
  return sorted[index]
}

export function runMonteCarlo(
  base: Scenario,
  request: MonteCarloRequest,
  onProgress?: (completed: number, total: number) => void,
): MonteCarloResult {
  const started = globalThis.performance?.now?.() ?? Date.now()
  const runs = Math.max(1, Math.min(10_000, Math.round(request.runs)))
  const landings: LandingPoint[] = []
  const trajectories: TrajectoryLine[] = []
  const traceCount = Math.min(40, runs)

  for (let index = 0; index < runs; index += 1) {
    const scenario = perturbScenario(base, request, index)
    const result: SimulationResult = runSimulation(scenario, true)
    if (result.landing && result.metrics.horizontalMiss !== null) {
      landings.push({
        run: index,
        east: result.landing.position.x,
        north: result.landing.position.y,
        radialError: result.metrics.horizontalMiss,
        time: result.landing.time,
      })
    }
    if (index < traceCount) {
      const stride = Math.max(1, Math.floor(result.samples.length / 30))
      trajectories.push({
        run: index,
        points: result.samples.filter((_, sampleIndex) => sampleIndex % stride === 0).map((sample) => ({
          east: sample.truePosition.x,
          north: sample.truePosition.y,
          up: sample.truePosition.z,
        })),
      })
    }
    if (onProgress && (index % 5 === 0 || index === runs - 1)) onProgress(index + 1, runs)
  }

  const meanEast = landings.length ? landings.reduce((sum, point) => sum + point.east, 0) / landings.length : null
  const meanNorth = landings.length ? landings.reduce((sum, point) => sum + point.north, 0) / landings.length : null
  const stdEast =
    meanEast === null
      ? null
      : Math.sqrt(landings.reduce((sum, point) => sum + (point.east - meanEast) ** 2, 0) / landings.length)
  const stdNorth =
    meanNorth === null
      ? null
      : Math.sqrt(landings.reduce((sum, point) => sum + (point.north - meanNorth) ** 2, 0) / landings.length)
  const radial = landings.map((point) => point.radialError).sort((a, b) => a - b)
  return {
    runsRequested: runs,
    runsLanded: landings.length,
    landings,
    trajectories,
    meanEast,
    meanNorth,
    stdEast,
    stdNorth,
    radialP50: radial.length ? percentile(radial, 0.5) : null,
    radialP90: radial.length ? percentile(radial, 0.9) : null,
    radialP95: radial.length ? percentile(radial, 0.95) : null,
    computeSeconds: ((globalThis.performance?.now?.() ?? Date.now()) - started) / 1000,
  }
}
