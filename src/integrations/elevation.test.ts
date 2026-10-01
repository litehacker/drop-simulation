import { describe, expect, it } from 'vitest'
import { heightAt, parseElevations, relativeTerrain, terrainLocations, terrainSampleCount } from './elevation'
import type { SiteOrigin } from './geodesy'

const origin: SiteOrigin = { latitudeDeg: 45, longitudeDeg: 0, groundElevationM: 30, label: 'Site' }

describe('terrain elevation', () => {
  it('uses an odd sample count so the site origin is a grid point', () => {
    expect(terrainSampleCount(2000) % 2).toBe(1)
    expect(terrainSampleCount(90)).toBeGreaterThanOrEqual(9)
  })

  it('places the center sample on the site', () => {
    const samples = 5
    const points = terrainLocations(origin, 1000, samples)
    const center = points[Math.floor(samples / 2) * samples + Math.floor(samples / 2)]
    expect(center.east).toBeCloseTo(0)
    expect(center.north).toBeCloseTo(0)
    expect(center.latitudeDeg).toBeCloseTo(45)
    expect(center.longitudeDeg).toBeCloseTo(0)
  })

  it('stores heights relative to the site and reads them back', () => {
    const elevations = [10, 12, 11, 20, 30, 22, 18, 19, 21]
    const parsed = parseElevations({ elevation: elevations }, 9)
    const patch = relativeTerrain(parsed, 3, 180)
    expect(patch.originElevationM).toBe(30)
    expect(patch.heights[4]).toBe(0)
    expect(heightAt(patch, 0, 0)).toBeCloseTo(0)
    expect(heightAt(patch, -90, -90)).toBeCloseTo(10 - 30)
    expect(heightAt(patch, 0, 90)).toBeCloseTo(19 - 30)
    expect(heightAt(patch, 90, 0)).toBeCloseTo(22 - 30)
  })
})
