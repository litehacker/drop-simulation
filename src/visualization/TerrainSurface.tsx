import { useEffect, useMemo, useState } from 'react'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import * as THREE from 'three'

setWorkerUrl(maplibreWorkerUrl)
import { enuToThree } from '../coordinates/enu'
import { enuToGeodetic } from '../integrations/geodesy'
import { ELEVATION_ATTRIBUTION, fetchTerrain, type TerrainPatch } from '../integrations/elevation'
import {
  GOOGLE_MAP_CREDIT,
  PUBLIC_MAP_CREDIT,
  googleHybridUrl,
  googleImageFrame,
  googleZoomForPatch,
  PUBLIC_MAP_STYLE,
  publicMapFrame,
  uvInFrame,
  type MercatorFrame,
} from '../integrations/mapDrape'
import { useSimStore } from '../store/useSimStore'

function shade(height: number, low: number, high: number): [number, number, number] {
  const span = high - low
  const t = span < 1 ? 0.45 : Math.min(1, Math.max(0, (height - low) / span))
  const stops: [number, number, number][] = [
    [0.2, 0.4, 0.32],
    [0.48, 0.66, 0.34],
    [0.74, 0.62, 0.36],
    [0.9, 0.82, 0.64],
  ]
  const scaled = t * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const a = stops[index]
  const b = stops[index + 1]
  return [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix]
}

function buildGeometry(
  patch: TerrainPatch,
  uvAt?: (east: number, north: number) => { u: number; v: number },
): { surface: THREE.BufferGeometry; relief: THREE.BufferGeometry } {
  const { columns, rows, widthM, heights } = patch
  const positions = new Float32Array(columns * rows * 3)
  const colors = new Float32Array(columns * rows * 3)
  const uvs = new Float32Array(columns * rows * 2)
  let low = Infinity
  let high = -Infinity
  for (const height of heights) {
    low = Math.min(low, height)
    high = Math.max(high, height)
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column
      const east = (column / (columns - 1) - 0.5) * widthM
      const north = (row / (rows - 1) - 0.5) * widthM
      const height = heights[index]
      const [x, y, z] = enuToThree({ x: east, y: north, z: height })
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
      const [r, g, b] = shade(height, low, high)
      colors[index * 3] = r
      colors[index * 3 + 1] = g
      colors[index * 3 + 2] = b
      const uv = uvAt ? uvAt(east, north) : { u: column / (columns - 1), v: row / (rows - 1) }
      uvs[index * 2] = uv.u
      uvs[index * 2 + 1] = uv.v
    }
  }
  const indices: number[] = []
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const relief: number[] = []
  const at = (row: number, column: number) => {
    const index = row * columns + column
    return [positions[index * 3], positions[index * 3 + 1] + 0.4, positions[index * 3 + 2]]
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      relief.push(...at(row, column), ...at(row, column + 1))
    }
  }
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      relief.push(...at(row, column), ...at(row + 1, column))
    }
  }
  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(relief, 3))
  return { surface: geometry, relief: lines }
}

export function TerrainSurface({ widthM }: { widthM: number }) {
  const latitude = useSimStore((state) => state.scenario.origin.latitudeDeg)
  const longitude = useSimStore((state) => state.scenario.origin.longitudeDeg)
  const terrain = useSimStore((state) => state.terrain)
  const setTerrain = useSimStore((state) => state.setTerrain)
  const surfaceStyle = useSimStore((state) => state.surfaceStyle)
  const googleMapsKey = useSimStore((state) => state.googleMapsKey)
  const setMapCaption = useSimStore((state) => state.setMapCaption)
  const [mapTexture, setMapTexture] = useState<THREE.Texture | null>(null)
  const width = Math.max(1800, Math.min(8000, Math.round(widthM / 400) * 400))
  const origin = useMemo(
    () => ({ latitudeDeg: latitude, longitudeDeg: longitude, groundElevationM: 0, label: '' }),
    [latitude, longitude],
  )
  const frame = useMemo(() => {
    if (surfaceStyle === 'relief' || !Number.isFinite(latitude)) return null
    if (surfaceStyle === 'google' && googleMapsKey.trim()) return googleImageFrame(latitude, longitude, googleZoomForPatch(origin, width))
    return publicMapFrame(origin, width)
  }, [surfaceStyle, googleMapsKey, latitude, longitude, origin, width])
  const geometry = useMemo(() => {
    if (!terrain) return null
    const uvAt = frame
      ? (east: number, north: number) => {
          const geo = enuToGeodetic(origin, east, north, 0)
          return uvInFrame(geo.longitudeDeg, geo.latitudeDeg, frame)
        }
      : undefined
    return buildGeometry(terrain, uvAt)
  }, [terrain, frame, origin])

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setTerrain(null, 'Terrain needs a latitude and longitude.')
      return
    }
    const width = Math.max(1800, Math.min(8000, Math.round(widthM / 400) * 400))
    let cancel = false
    setTerrain(null, 'Loading terrain for this site…')
    const groundElevationM = useSimStore.getState().scenario.origin.groundElevationM
    fetchTerrain({ latitudeDeg: latitude, longitudeDeg: longitude, groundElevationM, label: '' }, width)
      .then((patch) => {
        if (cancel) return
        const low = Math.min(...patch.heights)
        const high = Math.max(...patch.heights)
        const site = useSimStore.getState().scenario.origin.label || 'Site'
        setTerrain(
          patch,
          `${site} terrain, ${low.toFixed(0)} to ${high.toFixed(0)} m relative to the drop surface. ${ELEVATION_ATTRIBUTION} The flight still lands on the flat local ground.`,
        )
      })
      .catch((error: unknown) => {
        if (cancel) return
        setTerrain(null, error instanceof Error ? error.message : 'Terrain could not be loaded.')
      })
    return () => {
      cancel = true
    }
  }, [latitude, longitude, widthM, setTerrain])

  useEffect(() => {
    if (!frame || surfaceStyle === 'relief') {
      setMapTexture(null)
      setMapCaption('')
      return
    }
    let cancel = false
    const google = surfaceStyle === 'google' && googleMapsKey.trim().length > 0
    setMapCaption(google ? 'Loading Google map…' : 'Loading map…')
    const load = google ? loadGoogle(latitude, longitude, frame, googleMapsKey.trim()) : loadOpenFreeMap(origin, frame)
    load
      .then((texture) => {
        if (cancel) {
          texture.dispose()
          return
        }
        setMapTexture((previous) => {
          previous?.dispose()
          return texture
        })
        const needsKey = surfaceStyle === 'google' && googleMapsKey.trim().length === 0
        setMapCaption(needsKey ? `Paste a Google Maps key to drape Google hybrid imagery. ${PUBLIC_MAP_CREDIT}` : google ? GOOGLE_MAP_CREDIT : PUBLIC_MAP_CREDIT)
      })
      .catch((error: unknown) => {
        if (cancel) return
        setMapTexture(null)
        setMapCaption(error instanceof Error ? error.message : 'The map image could not be loaded.')
      })
    return () => {
      cancel = true
    }
  }, [frame, surfaceStyle, googleMapsKey, latitude, longitude, origin, setMapCaption])

  useEffect(() => () => {
    geometry?.surface.dispose()
    geometry?.relief.dispose()
  }, [geometry])

  useEffect(() => () => mapTexture?.dispose(), [mapTexture])

  if (!geometry) return null
  return (
    <group>
      <mesh geometry={geometry.surface}>
        <meshStandardMaterial map={mapTexture ?? undefined} vertexColors={!mapTexture} roughness={0.9} metalness={0} />
      </mesh>
      {!mapTexture && (
        <lineSegments geometry={geometry.relief}>
          <lineBasicMaterial color="#e7f2df" transparent opacity={0.28} />
        </lineSegments>
      )}
    </group>
  )
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('A map image failed to load. Check the key and that the Maps Static API is enabled.'))
    image.src = url
  })
}

async function loadOpenFreeMap(origin: { latitudeDeg: number; longitudeDeg: number; groundElevationM: number; label: string }, frame: MercatorFrame): Promise<THREE.Texture> {
  const maplibre = await import('maplibre-gl')
  const container = document.createElement('div')
  container.style.width = '1024px'
  container.style.height = '1024px'
  container.style.position = 'fixed'
  container.style.left = '-4000px'
  container.style.top = '0'
  document.body.appendChild(container)
  const map = new maplibre.Map({
    container,
    style: PUBLIC_MAP_STYLE,
    center: [origin.longitudeDeg, origin.latitudeDeg],
    zoom: frame.zoom,
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  try {
    await new Promise<void>((resolve, reject) => {
      let detail = ''
      const timer = window.setTimeout(() => reject(new Error(detail || 'The public map took too long to load.')), 20000)
      map.on('error', (event) => {
        const problem = event.error
        detail = problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'map error'
      })
      map.on('load', () => {
        map.jumpTo({ center: [origin.longitudeDeg, origin.latitudeDeg], zoom: frame.zoom })
        map.once('idle', () => {
          window.clearTimeout(timer)
          resolve()
        })
      })
    })
    const source = map.getCanvas()
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The map canvas is not available.')
    context.drawImage(source, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    return texture
  } finally {
    map.remove()
    container.remove()
  }
}

async function loadGoogle(latitude: number, longitude: number, frame: MercatorFrame, apiKey: string): Promise<THREE.Texture> {
  const image = await loadImage(googleHybridUrl(latitude, longitude, frame.zoom, apiKey))
  const texture = new THREE.Texture(image)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
