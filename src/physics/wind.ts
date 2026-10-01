import type { Rng } from '../math/random'
import { gaussian } from '../math/random'
import type { Vec3 } from '../math/vec3'
import { add, vec } from '../math/vec3'
import { degToRad } from '../coordinates/enu'

export type WindModel = 'constant' | 'altitude'

export interface WindInput {
  speed: number
  /** Bearing the wind blows toward. 0 = north, 90 = east. */
  directionDeg: number
  verticalSpeed: number
  model: WindModel
  referenceAltitudeM: number
  /** Power-law exponent. 0 reproduces a constant wind. */
  shearExponent: number
  turbulenceStd: number
  turbulenceTimeConstant: number
  gustsEnabled: boolean
  gustAmplitude: number
  gustDuration: number
  gustMeanInterval: number
}

export interface WindState {
  turbulence: Vec3
  gust: Vec3
  gustRemaining: number
  nextGustIn: number
}

export interface WindSample {
  /** Air velocity relative to the ground, ENU m/s. */
  velocity: Vec3
  mean: Vec3
  turbulence: Vec3
  gust: Vec3
}

export function createWindState(input: WindInput): WindState {
  return {
    turbulence: vec(0, 0, 0),
    gust: vec(0, 0, 0),
    gustRemaining: 0,
    nextGustIn: Math.max(0.5, input.gustMeanInterval),
  }
}

/** Steady wind before turbulence. Altitude model is a power law on horizontal speed. */
export function meanWind(input: WindInput, altitudeM: number): Vec3 {
  let speed = input.speed
  if (input.model === 'altitude') {
    const reference = Math.max(0.5, input.referenceAltitudeM)
    const altitude = Math.max(0.1, altitudeM)
    speed = input.speed * Math.pow(altitude / reference, input.shearExponent)
  }
  const direction = degToRad(input.directionDeg)
  return {
    x: speed * Math.sin(direction),
    y: speed * Math.cos(direction),
    z: input.verticalSpeed,
  }
}

/**
 * Advance a turbulence/gust state by dt.
 * Turbulence is an Ornstein–Uhlenbeck process (a shaped-noise assumption,
 * not a certified Dryden spectrum). Gusts are occasional added vectors.
 */
export function stepWind(
  input: WindInput,
  altitudeM: number,
  state: WindState,
  dt: number,
  rng: Rng,
): { sample: WindSample; state: WindState } {
  const tau = Math.max(0.05, input.turbulenceTimeConstant)
  const decay = Math.exp(-dt / tau)
  const sigma = Math.max(0, input.turbulenceStd)
  const noiseScale = sigma * Math.sqrt(Math.max(0, 1 - decay * decay))
  const turbulence = {
    x: state.turbulence.x * decay + gaussian(rng) * noiseScale,
    y: state.turbulence.y * decay + gaussian(rng) * noiseScale,
    z: state.turbulence.z * decay + gaussian(rng) * noiseScale * 0.3,
  }

  let gust = state.gust
  let gustRemaining = state.gustRemaining - dt
  let nextGustIn = state.nextGustIn - dt
  if (!input.gustsEnabled) {
    gust = vec(0, 0, 0)
    gustRemaining = 0
    nextGustIn = input.gustMeanInterval
  } else if (gustRemaining <= 0) {
    gust = vec(0, 0, 0)
    if (nextGustIn <= 0) {
      const angle = rng() * Math.PI * 2
      const amplitude = input.gustAmplitude
      gust = vec(Math.cos(angle) * amplitude, Math.sin(angle) * amplitude, 0)
      gustRemaining = input.gustDuration
      nextGustIn = Math.max(0.2, input.gustMeanInterval * (0.5 + rng()))
    }
  }

  const mean = meanWind(input, altitudeM)
  const velocity = add(mean, add(turbulence, gustRemaining > 0 || !input.gustsEnabled ? gust : vec(0, 0, 0)))
  return {
    sample: { velocity, mean, turbulence, gust },
    state: { turbulence, gust, gustRemaining: Math.max(0, gustRemaining), nextGustIn },
  }
}
