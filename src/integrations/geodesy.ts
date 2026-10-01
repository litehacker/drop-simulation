import type { Vec3 } from '../math/vec3'

/** Metres per degree of latitude. Longitude uses this times cos(latitude). */
export const METERS_PER_DEGREE_LAT = 111_320

export interface SiteOrigin {
  latitudeDeg: number
  longitudeDeg: number
  /** Elevation of the local z = 0 plane, metres above mean sea level. */
  groundElevationM: number
  label: string
}

export interface Geodetic {
  latitudeDeg: number
  longitudeDeg: number
  altitudeMsl: number
}

/**
 * Flat-earth ENU offset from a release site.
 * Accurate for flights of a few kilometres. It is not a geodetic library.
 */
export function enuToGeodetic(origin: SiteOrigin, east: number, north: number, up: number): Geodetic {
  const latitudeDeg = origin.latitudeDeg + north / METERS_PER_DEGREE_LAT
  const cosLat = Math.cos((origin.latitudeDeg * Math.PI) / 180)
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 1e-6)
  const longitudeDeg = origin.longitudeDeg + east / metersPerDegreeLon
  return {
    latitudeDeg,
    longitudeDeg,
    altitudeMsl: origin.groundElevationM + up,
  }
}

export function geodeticOf(origin: SiteOrigin, position: Vec3): Geodetic {
  return enuToGeodetic(origin, position.x, position.y, position.z)
}

/** Meteorological "from" direction to the direction the air moves toward. */
export function windTowardFromMeteorological(fromDeg: number): number {
  return (fromDeg + 180) % 360
}
