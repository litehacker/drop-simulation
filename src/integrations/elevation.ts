import { enuToGeodetic, type SiteOrigin } from './geodesy'

/** Copernicus DEM GLO-90, served by the Open-Meteo elevation API. */
export const ELEVATION_ATTRIBUTION =
  'Terrain heights: Copernicus DEM GLO-90 (90 m) via Open-Meteo.'

export interface TerrainPatch {
  columns: number
  rows: number
  /** East-west and north-south extent, metres. The site origin is the center. */
  widthM: number
  /** Row-major. Row 0 is the south edge, column 0 is the west edge. Metres above the site. */
  heights: number[]
  originElevationM: number
}

export function terrainSampleCount(widthM: number): number {
  const cells = Math.round(Math.max(widthM, 90) / 90)
  const samples = Math.min(11, Math.max(9, cells + 1))
  return samples % 2 === 0 ? samples + 1 : samples
}

export function terrainLocations(origin: SiteOrigin, widthM: number, samples: number) {
  const points: { east: number; north: number; latitudeDeg: number; longitudeDeg: number }[] = []
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      const east = (column / (samples - 1) - 0.5) * widthM
      const north = (row / (samples - 1) - 0.5) * widthM
      const geo = enuToGeodetic(origin, east, north, 0)
      points.push({ east, north, latitudeDeg: geo.latitudeDeg, longitudeDeg: geo.longitudeDeg })
    }
  }
  return points
}

export function elevationRequestUrl(latitudes: number[], longitudes: number[]): string {
  const params = new URLSearchParams({
    latitude: latitudes.join(','),
    longitude: longitudes.join(','),
  })
  return `https://api.open-meteo.com/v1/elevation?${params.toString()}`
}

export function parseElevations(payload: unknown, expected: number): number[] {
  if (!payload || typeof payload !== 'object') throw new Error('Elevation response was empty.')
  const elevation = (payload as { elevation?: unknown }).elevation
  if (!Array.isArray(elevation) || elevation.length !== expected) {
    throw new Error('Elevation response did not match the requested points.')
  }
  return elevation.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Elevation point ${index + 1} was not a number.`)
    }
    return value
  })
}

export function relativeTerrain(elevations: number[], samples: number, widthM: number): TerrainPatch {
  const center = Math.floor(samples / 2) * samples + Math.floor(samples / 2)
  const originElevationM = elevations[center]
  return {
    columns: samples,
    rows: samples,
    widthM,
    heights: elevations.map((value) => value - originElevationM),
    originElevationM,
  }
}

/** Bilinear height above the site. Outside the patch, the edge height is used. */
export function heightAt(patch: TerrainPatch, east: number, north: number): number {
  const { columns, rows, widthM, heights } = patch
  const column = ((east / widthM) + 0.5) * (columns - 1)
  const row = ((north / widthM) + 0.5) * (rows - 1)
  const col0 = Math.min(columns - 1, Math.max(0, Math.floor(column)))
  const row0 = Math.min(rows - 1, Math.max(0, Math.floor(row)))
  const col1 = Math.min(columns - 1, col0 + 1)
  const row1 = Math.min(rows - 1, row0 + 1)
  const tx = col0 === col1 ? 0 : column - col0
  const ty = row0 === row1 ? 0 : row - row0
  const at = (r: number, c: number) => heights[r * columns + c]
  const south = at(row0, col0) * (1 - tx) + at(row0, col1) * tx
  const northEdge = at(row1, col0) * (1 - tx) + at(row1, col1) * tx
  return south * (1 - ty) + northEdge * ty
}

const terrainCache = new Map<string, TerrainPatch>()

async function fetchElevations(latitudes: number[], longitudes: number[]): Promise<number[]> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(elevationRequestUrl(latitudes, longitudes))
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)))
      lastStatus = 429
      continue
    }
    if (!response.ok) throw new Error(`Elevation request failed (${response.status}).`)
    return parseElevations(await response.json(), latitudes.length)
  }
  throw new Error(`Elevation request failed (${lastStatus}).`)
}

/** Sample the ground around the site. Heights are metres above the origin, not above sea level. */
export async function fetchTerrain(origin: SiteOrigin, widthM: number): Promise<TerrainPatch> {
  const key = `${origin.latitudeDeg.toFixed(4)},${origin.longitudeDeg.toFixed(4)},${Math.round(widthM)}`
  const cached = terrainCache.get(key)
  if (cached) return cached
  const samples = terrainSampleCount(widthM)
  const points = terrainLocations(origin, widthM, samples)
  const elevations: number[] = []
  const batch = 80
  for (let start = 0; start < points.length; start += batch) {
    const slice = points.slice(start, start + batch)
    const chunk = await fetchElevations(
      slice.map((point) => point.latitudeDeg),
      slice.map((point) => point.longitudeDeg),
    )
    elevations.push(...chunk)
  }
  const patch = relativeTerrain(elevations, samples, widthM)
  terrainCache.set(key, patch)
  return patch
}
