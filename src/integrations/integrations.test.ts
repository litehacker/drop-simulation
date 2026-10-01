import { describe, expect, it } from 'vitest'
import { METERS_PER_DEGREE_LAT, enuToGeodetic, windTowardFromMeteorological } from './geodesy'
import { mavlinkTlog, parseFirstGps } from './mavlinkLog'
import { nmeaChecksum, nmeaFix, nmeaLog } from './nmea'
import { gpxTrack } from './gpxKml'
import { parseOpenMeteo } from './openMeteo'
import { mcapBytes } from './mcapLog'
import type { Sample } from '../simulation/engine'
import type { SiteOrigin } from './geodesy'

const origin: SiteOrigin = {
  latitudeDeg: 45,
  longitudeDeg: 10,
  groundElevationM: 100,
  label: 'Test site',
}

function sample(): Sample {
  return {
    t: 0,
    truePosition: { x: 0, y: 0, z: 50 },
    trueVelocity: { x: 0, y: 10, z: -1 },
    estimatedPosition: { x: 1000, y: 0, z: 50 },
    estimatedVelocity: { x: 0, y: 10, z: -1 },
    measuredPosition: null,
    wind: { x: 5, y: 0, z: 0 },
    airRelative: { x: -5, y: 10, z: -1 },
    groundVelocity: { x: 0, y: 10, z: 0 },
    gravity: { x: 0, y: 0, z: -11.8 },
    drag: { x: 0, y: 0, z: 0 },
    lift: { x: 0, y: 0, z: 0 },
    correction: { x: 0, y: 0, z: 0 },
    parentPosition: { x: 0, y: 0, z: 50 },
    distance: 0,
    modeledLoss: 0,
    modeledLatency: 0,
    estimatedRssi: -40,
    released: true,
    landed: false,
  }
}

describe('geodesy', () => {
  it('moves one degree north and one degree east from a 45° site', () => {
    const geo = enuToGeodetic(origin, METERS_PER_DEGREE_LAT * Math.cos((45 * Math.PI) / 180), METERS_PER_DEGREE_LAT, 10)
    expect(geo.latitudeDeg).toBeCloseTo(46, 6)
    expect(geo.longitudeDeg).toBeCloseTo(11, 6)
    expect(geo.altitudeMsl).toBeCloseTo(110, 6)
  })

  it('turns a meteorological wind direction around', () => {
    expect(windTowardFromMeteorological(0)).toBe(180)
    expect(windTowardFromMeteorological(90)).toBe(270)
  })
})

describe('nmea', () => {
  it('checksums the characters between the dollar sign and the star', () => {
    expect(nmeaChecksum('GPGGA,1')).toBe('4B')
  })

  it('writes a GGA sentence whose checksum matches the body', () => {
    const text = nmeaFix(origin, sample(), Date.UTC(2026, 0, 2, 3, 4, 5))
    const gga = text.split('\r\n')[0] ?? ''
    const body = gga.slice(1, gga.indexOf('*'))
    expect(gga.endsWith(`*${nmeaChecksum(body)}`)).toBe(true)
    expect(gga.startsWith('$GPGGA,')).toBe(true)
    expect(nmeaLog(origin, [sample()], Date.UTC(2026, 0, 2, 3, 4, 5))).toContain('$GPRMC,')
  })
})

describe('tracks and weather', () => {
  it('puts the true position in a GPX track point', () => {
    const gpx = gpxTrack('Case', origin, [sample()], Date.UTC(2026, 0, 2))
    expect(gpx).toContain('lat="45.0000000"')
    expect(gpx).toContain('<ele>150.00</ele>')
  })

  it('maps Open-Meteo wind-from into a DropSim toward direction and pascals', () => {
    const patch = parseOpenMeteo(
      {
        elevation: 212.5,
        current: {
          time: '2026-01-02T03:00',
          temperature_2m: 4.5,
          relative_humidity_2m: 80,
          surface_pressure: 1000,
          precipitation: 1.2,
          wind_speed_10m: 6,
          wind_direction_10m: 90,
          wind_speed_180m: 9,
          wind_direction_180m: 90,
        },
      },
      'https://api.open-meteo.com/v1/forecast?example',
      '2026-01-02T03:00:05Z',
    )
    expect(patch.wind.directionDeg).toBe(270)
    expect(patch.wind.speed).toBe(6)
    expect(patch.wind.model).toBe('altitude')
    expect(patch.wind.shearExponent).toBeGreaterThan(0)
    expect(patch.atmosphere.pressurePa).toBe(100_000)
    expect(patch.elevationM).toBe(212.5)
    expect(patch.provenance.attribution).toContain('CC BY 4.0')
  })
})

describe('mavlink', () => {
  it('round-trips the estimated GPS fix through a tlog frame', () => {
    const log = mavlinkTlog(origin, [sample()], Date.UTC(2026, 0, 2))
    expect(log[8]).toBe(0xfd)
    const gps = parseFirstGps(log)
    expect(gps).not.toBeNull()
    expect(gps?.lat).toBeCloseTo(45, 4)
    expect(gps?.lon).toBeGreaterThan(10)
  })
})

describe('mcap', () => {
  it('starts with the MCAP magic bytes', async () => {
    const bytes = await mcapBytes(origin, [sample()], Date.UTC(2026, 0, 2))
    expect(bytes[0]).toBe(0x89)
    expect(new TextDecoder().decode(bytes.subarray(1, 5))).toBe('MCAP')
  })
})
