import type { Attitude } from '../coordinates/enu'
import type { Rng } from '../math/random'
import { chance, gaussian } from '../math/random'
import type { Vec3 } from '../math/vec3'
import { quantize } from './sampling'

export interface ImuConfig {
  enabled: boolean
  updateRateHz: number
  latencyS: number
  accelNoise: number
  accelBias: Vec3
  gyroNoise: number
  gyroBias: Attitude
  dropoutProbability: number
  quantization: number
  /** Angular-rate limit in rad/s. Beyond it the sample drops out. */
  range: number
}

export interface ImuSample {
  /** Specific force, ENU m/s². Excludes gravity. */
  specificForce: Vec3
  angularRate: Attitude
}

/**
 * MVP IMU is expressed in the ENU frame.
 * A body-frame strapdown IMU would replace this function; the estimator interface stays the same.
 */
export function readImu(
  specificForce: Vec3,
  angularRate: Attitude,
  config: ImuConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): ImuSample | null {
  if (!config.enabled) return null
  const rate = Math.hypot(angularRate.yaw, angularRate.pitch, angularRate.roll)
  if (Number.isFinite(config.range) && rate > config.range) return null
  if (chance(rng, Math.min(1, config.dropoutProbability * dropoutScale))) return null
  const accelNoise = config.accelNoise * noiseScale
  const gyroNoise = config.gyroNoise * noiseScale
  const q = config.quantization
  return {
    specificForce: {
      x: quantize(specificForce.x + config.accelBias.x + gaussian(rng) * accelNoise, q),
      y: quantize(specificForce.y + config.accelBias.y + gaussian(rng) * accelNoise, q),
      z: quantize(specificForce.z + config.accelBias.z + gaussian(rng) * accelNoise, q),
    },
    angularRate: {
      yaw: quantize(angularRate.yaw + config.gyroBias.yaw + gaussian(rng) * gyroNoise, q),
      pitch: quantize(angularRate.pitch + config.gyroBias.pitch + gaussian(rng) * gyroNoise, q),
      roll: quantize(angularRate.roll + config.gyroBias.roll + gaussian(rng) * gyroNoise, q),
    },
  }
}
