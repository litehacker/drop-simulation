import { describe, expect, it } from 'vitest'
import type { SiteOrigin } from './geodesy'
import { frameForPatch, googleTileUrl, messageFromGoogleError, uvInFrame, webMercatorTile } from './mapDrape'

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

  it('explains a rejected Google key without echoing the key', () => {
    const url = googleTileUrl(12, 10, 20, 'session-token', 'secret-key')
    expect(url).toContain('/2dtiles/12/10/20')
    expect(url).toContain('session=session-token')
    const message = messageFromGoogleError(403, { error: { message: 'forbidden' } })
    expect(message).toContain('Map Tiles API')
    expect(message).not.toContain('secret-key')
  })
})
