import { McapWriter } from '@mcap/core'
import type { Sample } from '../simulation/engine'
import type { SiteOrigin } from './geodesy'
import { geodeticOf } from './geodesy'

const LOCATION_SCHEMA = JSON.stringify({
  title: 'foxglove.LocationFix',
  type: 'object',
  properties: {
    timestamp: {
      type: 'object',
      properties: {
        sec: { type: 'integer' },
        nsec: { type: 'integer' },
      },
    },
    frame_id: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    altitude: { type: 'number' },
    position_covariance: { type: 'array', items: { type: 'number' }, minItems: 9, maxItems: 9 },
    position_covariance_type: { type: 'integer' },
  },
})

class BufferWritable {
  private readonly chunks: Uint8Array[] = []
  private offset = 0n

  position(): bigint {
    return this.offset
  }

  async write(buffer: Uint8Array): Promise<void> {
    this.chunks.push(buffer.slice())
    this.offset += BigInt(buffer.byteLength)
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(Number(this.offset))
    let cursor = 0
    for (const chunk of this.chunks) {
      out.set(chunk, cursor)
      cursor += chunk.byteLength
    }
    return out
  }
}

function stamp(epochMs: number): { sec: number; nsec: number; ns: bigint } {
  const ms = Math.round(epochMs)
  const sec = Math.floor(ms / 1000)
  const nsec = (ms - sec * 1000) * 1_000_000
  return { sec, nsec, ns: BigInt(ms) * 1_000_000n }
}

/** Foxglove-readable MCAP with a LocationFix channel and a schemaless state channel. */
export async function mcapBytes(origin: SiteOrigin, samples: Sample[], startEpochMs: number): Promise<Uint8Array> {
  const writable = new BufferWritable()
  const writer = new McapWriter({ writable })
  const text = new TextEncoder()
  await writer.start({ profile: '', library: 'dropsim' })
  const schemaId = await writer.registerSchema({
    name: 'foxglove.LocationFix',
    encoding: 'jsonschema',
    data: text.encode(LOCATION_SCHEMA),
  })
  const locationId = await writer.registerChannel({
    topic: '/dropsim/location',
    messageEncoding: 'json',
    schemaId,
    metadata: new Map(),
  })
  const stateId = await writer.registerChannel({
    topic: '/dropsim/state',
    messageEncoding: 'json',
    schemaId: 0,
    metadata: new Map([['description', 'DropSim true and estimated ENU state']]),
  })
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!sample) continue
    const time = stamp(startEpochMs + sample.t * 1000)
    const geo = geodeticOf(origin, sample.truePosition)
    const location = {
      timestamp: { sec: time.sec, nsec: time.nsec },
      frame_id: 'earth',
      latitude: geo.latitudeDeg,
      longitude: geo.longitudeDeg,
      altitude: geo.altitudeMsl,
      position_covariance: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      position_covariance_type: 0,
    }
    await writer.addMessage({
      sequence: index,
      channelId: locationId,
      logTime: time.ns,
      publishTime: time.ns,
      data: text.encode(JSON.stringify(location)),
    })
    await writer.addMessage({
      sequence: index,
      channelId: stateId,
      logTime: time.ns,
      publishTime: time.ns,
      data: text.encode(
        JSON.stringify({
          t: sample.t,
          truePosition: sample.truePosition,
          estimatedPosition: sample.estimatedPosition,
          wind: sample.wind,
        }),
      ),
    })
  }
  await writer.end()
  return writable.bytes()
}
