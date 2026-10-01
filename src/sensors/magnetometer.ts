import type { Rng } from '../math/random'
import { readScalar, type ScalarSensorConfig } from './sampling'

/** Heading sensor. Declination is a user input, added before noise. */
export function readMagnetometer(
  trueHeadingRad: number,
  declinationRad: number,
  config: ScalarSensorConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): number | null {
  return readScalar(trueHeadingRad + declinationRad, config, rng, noiseScale, dropoutScale)
}
