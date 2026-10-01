import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { enuToThree } from '../coordinates/enu'
import { ELEVATION_ATTRIBUTION, fetchTerrain, type TerrainPatch } from '../integrations/elevation'
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

function buildGeometry(patch: TerrainPatch): { surface: THREE.BufferGeometry; relief: THREE.BufferGeometry } {
  const { columns, rows, widthM, heights } = patch
  const positions = new Float32Array(columns * rows * 3)
  const colors = new Float32Array(columns * rows * 3)
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
  const geometry = useMemo(() => (terrain ? buildGeometry(terrain) : null), [terrain])

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

  useEffect(() => () => {
    geometry?.surface.dispose()
    geometry?.relief.dispose()
  }, [geometry])

  if (!geometry) return null
  return (
    <group>
      <mesh geometry={geometry.surface}>
        <meshStandardMaterial vertexColors roughness={0.86} metalness={0} />
      </mesh>
      <lineSegments geometry={geometry.relief}>
        <lineBasicMaterial color="#e7f2df" transparent opacity={0.28} />
      </lineSegments>
    </group>
  )
}
