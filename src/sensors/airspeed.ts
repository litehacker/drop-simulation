import type { Rng } from '../math/random'
import { readScalar, type ScalarSensorConfig } from './sampling'

/** Scalar air-relative speed. This is not a 3-axis air-data boom. */
export function readAirspeed(
  relativeSpeed: number,
  config: ScalarSensorConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): number | null {
  return readScalar(relativeSpeed, config, rng, noiseScale, dropoutScale)
}
