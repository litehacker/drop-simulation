/**
 * Moist-air density from the ideal-gas law and a virtual-temperature correction.
 * Inputs are scenario assumptions. The formula itself is a standard physical model.
 * It is not a measurement of the local atmosphere.
 */

export const SPECIFIC_GAS_CONSTANT_DRY_AIR = 287.058

export interface AtmosphereSample {
  temperatureK: number
  pressurePa: number
  relativeHumidity: number
  density: number
  /** How the density number was obtained. */
  densitySource: 'ideal-gas' | 'isa-troposphere' | 'user-override'
  gravity: number
  rainMillimetersPerHour: number
  /** Multiplier applied to Cd. 1 means rain does not change drag. */
  dragMultiplier: number
  sensorNoiseMultiplier: number
  sensorDropoutMultiplier: number
  visibilityMeters: number
}

export interface AtmosphereInput {
  temperatureC: number
  pressurePa: number
  humidityPercent: number
  densityOverride: number | null
  densityModel: 'constant' | 'isa'
  gravity: number
  rainMillimetersPerHour: number
  /** Added Cd fraction per mm/h. Default 0: rain does not move the trajectory. */
  rainDragPerMmHr: number
  /** Fractional noise increase per mm/h. User assumption. */
  rainNoisePerMmHr: number
  rainDropoutPerMmHr: number
  clearAirVisibilityM: number
  /** Visibility divisor per mm/h. User assumption, not a meteorological law. */
  rainVisibilityPerMmHr: number
  /** Sea-level reference used by the ISA option. */
  isaSeaLevelTemperatureC: number
  isaSeaLevelPressurePa: number
}

export function moistAirDensity(
  temperatureC: number,
  pressurePa: number,
  humidityPercent: number,
): number {
  const temperatureK = temperatureC + 273.15
  const relativeHumidity = clamp(humidityPercent, 0, 100) / 100
  const saturationHpa = 6.112 * Math.exp((17.67 * temperatureC) / (temperatureC + 243.5))
  const vaporPa = relativeHumidity * saturationHpa * 100
  const vapor = Math.min(vaporPa, pressurePa * 0.99)
  const virtualTemperature = temperatureK / (1 - (vapor / pressurePa) * (1 - 0.622))
  return pressurePa / (SPECIFIC_GAS_CONSTANT_DRY_AIR * virtualTemperature)
}

/** International Standard Atmosphere troposphere, dry air, valid to 11 km. */
export function isaDensity(altitudeM: number, seaLevelTemperatureC: number, seaLevelPressurePa: number): {
  density: number
  temperatureK: number
  pressurePa: number
} {
  const altitude = clamp(altitudeM, 0, 11000)
  const t0 = seaLevelTemperatureC + 273.15
  const lapse = 0.0065
  const temperatureK = t0 - lapse * altitude
  const exponent = 9.80665 / (lapse * SPECIFIC_GAS_CONSTANT_DRY_AIR)
  const pressurePa = seaLevelPressurePa * Math.pow(temperatureK / t0, exponent)
  return {
    temperatureK,
    pressurePa,
    density: pressurePa / (SPECIFIC_GAS_CONSTANT_DRY_AIR * temperatureK),
  }
}

export function sampleAtmosphere(input: AtmosphereInput, altitudeM: number): AtmosphereSample {
  const rain = Math.max(0, input.rainMillimetersPerHour)
  const dragMultiplier = 1 + input.rainDragPerMmHr * rain
  const sensorNoiseMultiplier = 1 + input.rainNoisePerMmHr * rain
  const sensorDropoutMultiplier = 1 + input.rainDropoutPerMmHr * rain
  const visibilityMeters =
    input.clearAirVisibilityM / (1 + input.rainVisibilityPerMmHr * rain)

  if (input.densityOverride !== null && Number.isFinite(input.densityOverride)) {
    return {
      temperatureK: input.temperatureC + 273.15,
      pressurePa: input.pressurePa,
      relativeHumidity: input.humidityPercent,
      density: input.densityOverride,
      densitySource: 'user-override',
      gravity: input.gravity,
      rainMillimetersPerHour: rain,
      dragMultiplier,
      sensorNoiseMultiplier,
      sensorDropoutMultiplier,
      visibilityMeters,
    }
  }

  if (input.densityModel === 'isa') {
    const isa = isaDensity(altitudeM, input.isaSeaLevelTemperatureC, input.isaSeaLevelPressurePa)
    return {
      temperatureK: isa.temperatureK,
      pressurePa: isa.pressurePa,
      relativeHumidity: 0,
      density: isa.density,
      densitySource: 'isa-troposphere',
      gravity: input.gravity,
      rainMillimetersPerHour: rain,
      dragMultiplier,
      sensorNoiseMultiplier,
      sensorDropoutMultiplier,
      visibilityMeters,
    }
  }

  return {
    temperatureK: input.temperatureC + 273.15,
    pressurePa: input.pressurePa,
    relativeHumidity: input.humidityPercent,
    density: moistAirDensity(input.temperatureC, input.pressurePa, input.humidityPercent),
    densitySource: 'ideal-gas',
    gravity: input.gravity,
    rainMillimetersPerHour: rain,
    dragMultiplier,
    sensorNoiseMultiplier,
    sensorDropoutMultiplier,
    visibilityMeters,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
