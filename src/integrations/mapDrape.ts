import { enuToGeodetic, type SiteOrigin } from './geodesy'

export type SurfaceStyle = 'relief' | 'public' | 'google'

export const PUBLIC_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
export const PUBLIC_MAP_CREDIT = 'Map: OpenFreeMap © OpenMapTiles © OpenStreetMap.'
export const GOOGLE_MAP_CREDIT = 'Google satellite is on the terrain. Imagery © Google. The key stays in this session and is not saved.'

export interface MercatorFrame {
  zoom: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export function webMercatorTile(longitudeDeg: number, latitudeDeg: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom
  const x = ((longitudeDeg + 180) / 360) * scale
  const lat = Math.min(85.05112878, Math.max(-85.05112878, latitudeDeg))
  const rad = (lat * Math.PI) / 180
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * scale
  return { x, y }
}

/** Smallest tile block that covers the patch, at the closest zoom that stays within a few tiles. */
export function frameForPatch(origin: SiteOrigin, widthM: number): MercatorFrame {
  const half = widthM / 2
  const southwest = enuToGeodetic(origin, -half, -half, 0)
  const northeast = enuToGeodetic(origin, half, half, 0)
  let chosen = 2
  for (let zoom = 17; zoom >= 2; zoom -= 1) {
    const west = webMercatorTile(southwest.longitudeDeg, southwest.latitudeDeg, zoom)
    const east = webMercatorTile(northeast.longitudeDeg, northeast.latitudeDeg, zoom)
    const tilesX = Math.ceil(east.x) - Math.floor(west.x)
    const tilesY = Math.ceil(west.y) - Math.floor(east.y)
    if (tilesX <= 4 && tilesY <= 4 && tilesX >= 1 && tilesY >= 1) {
      chosen = zoom
      break
    }
  }
  const west = webMercatorTile(southwest.longitudeDeg, southwest.latitudeDeg, chosen)
  const east = webMercatorTile(northeast.longitudeDeg, northeast.latitudeDeg, chosen)
  return {
    zoom: chosen,
    x0: Math.floor(Math.min(west.x, east.x)),
    x1: Math.ceil(Math.max(west.x, east.x)),
    y0: Math.floor(Math.min(west.y, east.y)),
    y1: Math.ceil(Math.max(west.y, east.y)),
  }
}

export function uvInFrame(longitudeDeg: number, latitudeDeg: number, frame: MercatorFrame): { u: number; v: number } {
  const tile = webMercatorTile(longitudeDeg, latitudeDeg, frame.zoom)
  const u = (tile.x - frame.x0) / (frame.x1 - frame.x0)
  const v = 1 - (tile.y - frame.y0) / (frame.y1 - frame.y0)
  return { u, v }
}

export function googleSessionUrl(apiKey: string): string {
  return `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`
}

export function googleTileUrl(zoom: number, x: number, y: number, session: string, apiKey: string): string {
  const params = new URLSearchParams({ session, key: apiKey })
  return `https://tile.googleapis.com/v1/2dtiles/${zoom}/${x}/${y}?${params.toString()}`
}

export function messageFromGoogleError(status: number, payload: unknown): string {
  const message =
    payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined
  if (status === 400 && /api key not valid/i.test(message ?? '')) {
    return 'Google rejected this key. Paste the whole key, with the Map Tiles API enabled.'
  }
  if (status === 403) {
    return 'Google refused this key. Enable the Map Tiles API, and allow this site under the key’s HTTP referrer restriction.'
  }
  return message ? `Google imagery did not load. ${message}` : `Google imagery did not load (${status}).`
}

/** Geographic coverage of a square map image. `cssPixels` is the map's CSS size, not the drawing-buffer size. */
export function imageFrame(latitudeDeg: number, longitudeDeg: number, zoom: number, cssPixels: number): MercatorFrame {
  const center = webMercatorTile(longitudeDeg, latitudeDeg, zoom)
  const half = cssPixels / 256 / 2
  return {
    zoom,
    x0: center.x - half,
    y0: center.y - half,
    x1: center.x + half,
    y1: center.y + half,
  }
}

export function googleImageFrame(latitudeDeg: number, longitudeDeg: number, zoom: number): MercatorFrame {
  return imageFrame(latitudeDeg, longitudeDeg, zoom, 640)
}

export function zoomCovering(origin: SiteOrigin, widthM: number, cssPixels: number): number {
  const half = widthM / 2
  const southwest = enuToGeodetic(origin, -half, -half, 0)
  const northeast = enuToGeodetic(origin, half, half, 0)
  const limit = (cssPixels / 256) * 0.82
  for (let zoom = 18; zoom >= 2; zoom -= 1) {
    const west = webMercatorTile(southwest.longitudeDeg, southwest.latitudeDeg, zoom)
    const east = webMercatorTile(northeast.longitudeDeg, northeast.latitudeDeg, zoom)
    const span = Math.max(Math.abs(east.x - west.x), Math.abs(east.y - west.y))
    if (span <= limit) return zoom
  }
  return 2
}

export function googleZoomForPatch(origin: SiteOrigin, widthM: number): number {
  return zoomCovering(origin, widthM, 640)
}

export function publicMapFrame(origin: SiteOrigin, widthM: number): MercatorFrame {
  return imageFrame(origin.latitudeDeg, origin.longitudeDeg, zoomCovering(origin, widthM, 1024), 1024)
}
