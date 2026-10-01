import { describe, expect, it } from 'vitest'
import type { SiteOrigin } from './geodesy'
import { frameForPatch, googleHybridUrl, uvInFrame, webMercatorTile } from './mapDrape'

const origin: SiteOrigin = { latitudeDeg: 0, longitudeDeg: 0, groundElevationM: 0, label: 'Origin' }

describe('map drape', () => {
  it('puts lon 0 lat 0 at the corner of tile 1,1 at zoom 1', () => {
    const tile = webMercatorTile(0, 0, 1)
    expect(tile.x).toBeCloseTo(1)
    expect(tile.y).toBeCloseTo(1)
  })

  it('maps the site center inside the tile frame', () => {
    const frame = frameForPatch(origin, 2000)
    const uv = uvInFrame(0, 0, frame)
    expect(uv.u).toBeGreaterThan(0)
    expect(uv.u).toBeLessThan(1)
    expect(uv.v).toBeGreaterThan(0)
    expect(uv.v).toBeLessThan(1)
    expect(frame.x1 - frame.x0).toBeLessThanOrEqual(4)
  })

  it('builds a Google hybrid image URL without storing the key in the path twice', () => {
    const url = googleHybridUrl(45, 2, 14, 'test-key')
    expect(url).toContain('maptype=hybrid')
    expect(url).toContain('key=test-key')
    expect(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?')).toBe(true)
  })
})
