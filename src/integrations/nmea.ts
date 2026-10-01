import { headingOf, horizontalSpeed } from '../coordinates/enu'
import type { Sample } from '../simulation/engine'
import type { SiteOrigin } from './geodesy'
import { geodeticOf } from './geodesy'

export function nmeaChecksum(body: string): string {
  let checksum = 0
  for (let index = 0; index < body.length; index += 1) checksum ^= body.charCodeAt(index)
  return checksum.toString(16).toUpperCase().padStart(2, '0')
}

export function nmeaSentence(body: string): string {
  return `$${body}*${nmeaChecksum(body)}\r\n`
}

function latField(degrees: number): { value: string; hemisphere: string } {
  const hemisphere = degrees >= 0 ? 'N' : 'S'
  const absolute = Math.abs(degrees)
  const whole = Math.floor(absolute)
  const minutes = (absolute - whole) * 60
  return { value: `${String(whole).padStart(2, '0')}${minutes.toFixed(4).padStart(7, '0')}`, hemisphere }
}

function lonField(degrees: number): { value: string; hemisphere: string } {
  const hemisphere = degrees >= 0 ? 'E' : 'W'
  const absolute = Math.abs(degrees)
  const whole = Math.floor(absolute)
  const minutes = (absolute - whole) * 60
  return { value: `${String(whole).padStart(3, '0')}${minutes.toFixed(4).padStart(7, '0')}`, hemisphere }
}

function utcParts(epochMs: number): { time: string; date: string } {
  const date = new Date(epochMs)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return {
    time: `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}.00`,
    date: `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCFullYear() % 100)}`,
  }
}

/** GGA, RMC, and VTG for one estimated fix. Talker ID is GP. */
export function nmeaFix(origin: SiteOrigin, sample: Sample, epochMs: number): string {
  const geo = geodeticOf(origin, sample.estimatedPosition)
  const lat = latField(geo.latitudeDeg)
  const lon = lonField(geo.longitudeDeg)
  const clock = utcParts(epochMs)
  const ground = horizontalSpeed(sample.estimatedVelocity)
  const course = ((headingOf(sample.estimatedVelocity) * 180) / Math.PI + 360) % 360
  const knots = ground * 1.943844
  const gga = nmeaSentence(
    `GPGGA,${clock.time},${lat.value},${lat.hemisphere},${lon.value},${lon.hemisphere},1,08,1.0,${geo.altitudeMsl.toFixed(1)},M,0.0,M,,`,
  )
  const rmc = nmeaSentence(
    `GPRMC,${clock.time},A,${lat.value},${lat.hemisphere},${lon.value},${lon.hemisphere},${knots.toFixed(2)},${course.toFixed(1)},${clock.date},,,A`,
  )
  const vtg = nmeaSentence(`GPVTG,${course.toFixed(1)},T,,M,${knots.toFixed(2)},N,${(ground * 3.6).toFixed(2)},K,A`)
  return `${gga}${rmc}${vtg}`
}

export function nmeaLog(origin: SiteOrigin, samples: Sample[], startEpochMs: number): string {
  return samples.map((sample) => nmeaFix(origin, sample, startEpochMs + sample.t * 1000)).join('')
}
