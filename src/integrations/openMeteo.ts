import type { AtmosphereInput } from '../physics/atmosphere'
import type { WindInput } from '../physics/wind'
import { windTowardFromMeteorological } from './geodesy'

export interface WeatherProvenance {
  provider: string
  url: string
  retrievedAt: string
  validTime: string
  attribution: string
  note: string
}

export interface WeatherPatch {
  wind: Pick<WindInput, 'speed' | 'directionDeg' | 'verticalSpeed' | 'model' | 'referenceAltitudeM' | 'shearExponent'>
  atmosphere: Pick<AtmosphereInput, 'temperatureC' | 'pressurePa' | 'humidityPercent' | 'rainMillimetersPerHour'>
  elevationM: number | null
  provenance: WeatherProvenance
}

const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'surface_pressure',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_speed_80m',
  'wind_direction_80m',
  'wind_speed_120m',
  'wind_direction_120m',
  'wind_speed_180m',
  'wind_direction_180m',
].join(',')

export function openMeteoForecastUrl(latitudeDeg: number, longitudeDeg: number): string {
  const params = new URLSearchParams({
    latitude: String(latitudeDeg),
    longitude: String(longitudeDeg),
    current: CURRENT,
    wind_speed_unit: 'ms',
    timezone: 'UTC',
  })
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

function numberAt(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function shearExponent(speed10: number, speed180: number): number {
  if (speed10 < 0.2 || speed180 < 0.2) return 0
  const alpha = Math.log(speed180 / speed10) / Math.log(180 / 10)
  return Math.min(0.6, Math.max(-0.2, alpha))
}

/** Parse an Open-Meteo forecast body. Does not call the network. */
export function parseOpenMeteo(payload: unknown, url: string, retrievedAt: string): WeatherPatch {
  if (!payload || typeof payload !== 'object') throw new Error('Open-Meteo returned an empty document.')
  const body = payload as Record<string, unknown>
  const current = body.current
  if (!current || typeof current !== 'object') throw new Error('Open-Meteo response has no current conditions.')
  const now = current as Record<string, unknown>
  const speed10 = numberAt(now, 'wind_speed_10m')
  const from10 = numberAt(now, 'wind_direction_10m')
  const speed180 = numberAt(now, 'wind_speed_180m')
  const temperature = numberAt(now, 'temperature_2m')
  const humidity = numberAt(now, 'relative_humidity_2m')
  const pressureHpa = numberAt(now, 'surface_pressure')
  const precipitation = numberAt(now, 'precipitation')
  if (speed10 === null || from10 === null || temperature === null || humidity === null || pressureHpa === null) {
    throw new Error('Open-Meteo response is missing wind, temperature, humidity, or pressure.')
  }
  const elevation = typeof body.elevation === 'number' ? body.elevation : null
  const validTime = typeof now.time === 'string' ? now.time : ''
  return {
    wind: {
      speed: speed10,
      directionDeg: windTowardFromMeteorological(from10),
      verticalSpeed: 0,
      model: speed180 !== null && speed180 !== speed10 ? 'altitude' : 'constant',
      referenceAltitudeM: 10,
      shearExponent: speed180 === null ? 0 : shearExponent(speed10, speed180),
    },
    atmosphere: {
      temperatureC: temperature,
      pressurePa: pressureHpa * 100,
      humidityPercent: humidity,
      rainMillimetersPerHour: precipitation ?? 0,
    },
    elevationM: elevation,
    provenance: {
      provider: 'Open-Meteo',
      url,
      retrievedAt,
      validTime,
      attribution: 'Weather data by Open-Meteo.com, CC BY 4.0. Non-commercial free tier.',
      note: 'Wind direction from the API is where the wind comes from. DropSim stores the direction it blows toward. Speeds at 10 m and 180 m set the power-law shear. Vertical wind is not in this response.',
    },
  }
}

export async function fetchOpenMeteo(latitudeDeg: number, longitudeDeg: number): Promise<WeatherPatch> {
  const url = openMeteoForecastUrl(latitudeDeg, longitudeDeg)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}.`)
  const payload: unknown = await response.json()
  return parseOpenMeteo(payload, url, new Date().toISOString())
}
