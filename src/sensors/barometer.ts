import type { Rng } from '../math/random'
import { readScalar, type ScalarSensorConfig } from './sampling'

export interface BarometerReading {
  pressurePa: number
  altitudeM: number
}

/**
 * Isothermal hypsometric pair.
 * With zero sensor error the inverted altitude matches the input altitude.
 * Humidity is not part of this pressure model.
 */
export function pressureFromAltitude(
  altitudeM: number,
  surfacePressurePa: number,
  temperatureK: number,
  gravity: number,
): number {
  const scaleHeight = (287.058 * temperatureK) / gravity
  return surfacePressurePa * Math.exp(-altitudeM / scaleHeight)
}

export function altitudeFromPressure(
  pressurePa: number,
  surfacePressurePa: number,
  temperatureK: number,
  gravity: number,
): number {
  const scaleHeight = (287.058 * temperatureK) / gravity
  const ratio = Math.max(pressurePa, 1) / surfacePressurePa
  return -scaleHeight * Math.log(ratio)
}

export function readBarometer(
  altitudeM: number,
  surfacePressurePa: number,
  temperatureK: number,
  gravity: number,
  config: ScalarSensorConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): BarometerReading | null {
  const truePressure = pressureFromAltitude(altitudeM, surfacePressurePa, temperatureK, gravity)
  const measured = readScalar(truePressure, config, rng, noiseScale, dropoutScale)
  if (measured === null || measured <= 0) return null
  return {
    pressurePa: measured,
    altitudeM: altitudeFromPressure(measured, surfacePressurePa, temperatureK, gravity),
  }
}
