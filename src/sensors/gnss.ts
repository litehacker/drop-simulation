import type { Rng } from '../math/random'
import { chance, gaussian } from '../math/random'
import type { Vec3 } from '../math/vec3'
import { quantize, type ScalarSensorConfig } from './sampling'

export interface GnssConfig extends ScalarSensorConfig {
  horizontalNoise: number
  verticalNoise: number
  velocityNoise: number
}

export interface GnssFix {
  position: Vec3
  velocity: Vec3
}

/** Position and velocity fix. `range` is the max distance from the origin before dropout. */
export function readGnss(
  position: Vec3,
  velocity: Vec3,
  config: GnssConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): GnssFix | null {
  if (!config.enabled) return null
  const distance = Math.hypot(position.x, position.y, position.z)
  if (Number.isFinite(config.range) && distance > config.range) return null
  const dropout = Math.min(1, Math.max(0, config.dropoutProbability * dropoutScale))
  if (chance(rng, dropout)) return null
  const horizontal = config.horizontalNoise * noiseScale
  const vertical = config.verticalNoise * noiseScale
  const speedNoise = config.velocityNoise * noiseScale
  return {
    position: {
      x: quantize(position.x + config.bias + gaussian(rng) * horizontal, config.quantization),
      y: quantize(position.y + config.bias + gaussian(rng) * horizontal, config.quantization),
      z: quantize(position.z + config.bias + gaussian(rng) * vertical, config.quantization),
    },
    velocity: {
      x: quantize(velocity.x + gaussian(rng) * speedNoise, config.quantization),
      y: quantize(velocity.y + gaussian(rng) * speedNoise, config.quantization),
      z: quantize(velocity.z + gaussian(rng) * speedNoise, config.quantization),
    },
  }
}
