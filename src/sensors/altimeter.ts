import type { Rng } from '../math/random'
import { readScalar, type ScalarSensorConfig } from './sampling'

/** Direct altitude report, separate from the barometer so the two can be compared. */
export function readAltimeter(
  altitudeM: number,
  config: ScalarSensorConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): number | null {
  return readScalar(altitudeM, config, rng, noiseScale, dropoutScale)
}
