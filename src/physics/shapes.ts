import type { Vec3 } from '../math/vec3'

export type ShapeKind = 'sphere' | 'ellipsoid' | 'cylinder' | 'box' | 'custom'

export interface ShapeInput {
  shape: ShapeKind
  mass: number
  /** Sphere diameter, or the primary diameter of a cylinder. Meters. */
  diameter: number
  /** Ellipsoid radii, or box/cylinder length. Meters. */
  length: number
  width: number
  height: number
  /** Used when shape is custom. */
  customVolume: number
  /** Null uses the geometric reference area. */
  referenceAreaOverride: number | null
  wingArea: number | null
}

export interface Geometry {
  volume: number
  referenceArea: number
  wingArea: number
  /** Density derived from mass / volume. Not an independent input. */
  density: number
  /** Principal moments about the body origin, kg·m². Sphere uses 2/5 mr². */
  inertia: Vec3
  characteristicLength: number
}

export function geometryOf(input: ShapeInput): Geometry {
  const mass = Math.max(input.mass, 1e-6)
  let volume = 0
  let area = 0
  let inertia: Vec3 = { x: 1, y: 1, z: 1 }
  let characteristicLength = Math.max(input.diameter, 1e-4)

  switch (input.shape) {
    case 'sphere': {
      const radius = Math.max(input.diameter, 1e-4) / 2
      volume = (4 / 3) * Math.PI * radius ** 3
      area = Math.PI * radius * radius
      const moment = 0.4 * mass * radius * radius
      inertia = { x: moment, y: moment, z: moment }
      characteristicLength = input.diameter
      break
    }
    case 'ellipsoid': {
      const a = Math.max(input.length, 1e-4) / 2
      const b = Math.max(input.width, 1e-4) / 2
      const c = Math.max(input.height, 1e-4) / 2
      volume = (4 / 3) * Math.PI * a * b * c
      area = Math.PI * a * b
      inertia = {
        x: 0.2 * mass * (b * b + c * c),
        y: 0.2 * mass * (a * a + c * c),
        z: 0.2 * mass * (a * a + b * b),
      }
      characteristicLength = 2 * c
      break
    }
    case 'cylinder': {
      const radius = Math.max(input.diameter, 1e-4) / 2
      const length = Math.max(input.length, 1e-4)
      volume = Math.PI * radius * radius * length
      area = Math.PI * radius * radius
      const axial = 0.5 * mass * radius * radius
      const transverse = 0.25 * mass * radius * radius + (mass * length * length) / 12
      inertia = { x: transverse, y: transverse, z: axial }
      characteristicLength = length
      break
    }
    case 'box': {
      const length = Math.max(input.length, 1e-4)
      const width = Math.max(input.width, 1e-4)
      const height = Math.max(input.height, 1e-4)
      volume = length * width * height
      area = width * height
      inertia = {
        x: (mass * (width * width + height * height)) / 12,
        y: (mass * (length * length + height * height)) / 12,
        z: (mass * (length * length + width * width)) / 12,
      }
      characteristicLength = length
      break
    }
    case 'custom': {
      volume = Math.max(input.customVolume, 1e-8)
      area = Math.max(input.referenceAreaOverride ?? 0.01, 1e-8)
      const radius = Math.cbrt((3 * volume) / (4 * Math.PI))
      const moment = 0.4 * mass * radius * radius
      inertia = { x: moment, y: moment, z: moment }
      characteristicLength = 2 * radius
      break
    }
  }

  const referenceArea =
    input.referenceAreaOverride === null ? area : Math.max(input.referenceAreaOverride, 1e-8)
  const wingArea = input.wingArea === null ? referenceArea : Math.max(input.wingArea, 1e-8)

  return {
    volume,
    referenceArea,
    wingArea,
    density: mass / volume,
    inertia,
    characteristicLength,
  }
}
