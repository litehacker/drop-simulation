/** East-North-Up vector in meters or meters per second. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

export function vec(x: number, y: number, z = 0): Vec3 {
  return { x, y, z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z)
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a)
  if (len < 1e-12) return { x: 0, y: 0, z: 0 }
  return scale(a, 1 / len)
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(sub(b, a), t))
}

export function horizontal(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: 0 }
}

export function clampVec(a: Vec3, maxLen: number): Vec3 {
  const len = length(a)
  if (len <= maxLen || len < 1e-12) return a
  return scale(a, maxLen / len)
}

export function nearlyEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol
}
