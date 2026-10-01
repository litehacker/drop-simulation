import { mavlink20, MAVLink20Processor } from 'mavlink-browser'
import { flightPathAngle, headingOf, horizontalSpeed } from '../coordinates/enu'
import { length } from '../math/vec3'
import type { Sample } from '../simulation/engine'
import type { SiteOrigin } from './geodesy'
import { geodeticOf } from './geodesy'

type Packed = { length: number; [index: number]: number }

function bytesOf(packed: Packed): Uint8Array {
  return Uint8Array.from({ length: packed.length }, (_, index) => packed[index] ?? 0)
}

function prefixTimestamp(microseconds: number, frame: Uint8Array): Uint8Array {
  const record = new Uint8Array(8 + frame.length)
  new DataView(record.buffer).setBigUint64(0, BigInt(Math.round(microseconds)), true)
  record.set(frame, 8)
  return record
}

function headingDeg(sample: Sample): number {
  return ((headingOf(sample.trueVelocity) * 180) / Math.PI + 360) % 360
}

/**
 * QGroundControl .tlog: 8-byte microsecond timestamp, then a MAVLink v2 frame.
 * The autopilot field is MAV_AUTOPILOT_INVALID. This is a log from DropSim, not a flight controller.
 */
export function mavlinkTlog(origin: SiteOrigin, samples: Sample[], startEpochMs: number): Uint8Array {
  const processor = new MAVLink20Processor(null, 1, 1)
  const records: Uint8Array[] = []
  const push = (microseconds: number, packed: Packed) => {
    records.push(prefixTimestamp(microseconds, bytesOf(packed)))
  }
  samples.forEach((sample, index) => {
    const geo = geodeticOf(origin, sample.truePosition)
    const estimated = geodeticOf(origin, sample.estimatedPosition)
    const microseconds = (startEpochMs + sample.t * 1000) * 1000
    const bootMs = Math.round(sample.t * 1000)
    if (index % 20 === 0) {
      push(
        microseconds,
        new mavlink20.messages.heartbeat(
          mavlink20.MAV_TYPE_GENERIC,
          mavlink20.MAV_AUTOPILOT_INVALID,
          0,
          0,
          mavlink20.MAV_STATE_ACTIVE,
          3,
        ).pack(processor),
      )
    }
    const ground = horizontalSpeed(sample.trueVelocity)
    push(
      microseconds,
      new mavlink20.messages.gps_raw_int(
        [Math.round(sample.t * 1e6) >>> 0, 0],
        3,
        Math.round(estimated.latitudeDeg * 1e7),
        Math.round(estimated.longitudeDeg * 1e7),
        Math.round(estimated.altitudeMsl * 1000),
        0xffff,
        0xffff,
        Math.round(horizontalSpeed(sample.estimatedVelocity) * 100),
        Math.round((((headingOf(sample.estimatedVelocity) * 180) / Math.PI + 360) % 360) * 100),
        0,
        Math.round(estimated.altitudeMsl * 1000),
        0,
        0,
        0,
        0,
        0,
      ).pack(processor),
    )
    push(
      microseconds,
      new mavlink20.messages.global_position_int(
        bootMs,
        Math.round(geo.latitudeDeg * 1e7),
        Math.round(geo.longitudeDeg * 1e7),
        Math.round(geo.altitudeMsl * 1000),
        Math.round(sample.truePosition.z * 1000),
        Math.round(sample.trueVelocity.y * 100),
        Math.round(sample.trueVelocity.x * 100),
        Math.round(-sample.trueVelocity.z * 100),
        Math.round(headingDeg(sample) * 100),
      ).pack(processor),
    )
    push(
      microseconds,
      new mavlink20.messages.attitude(
        bootMs,
        0,
        flightPathAngle(sample.trueVelocity),
        headingOf(sample.trueVelocity),
        0,
        0,
        0,
      ).pack(processor),
    )
    push(
      microseconds,
      new mavlink20.messages.vfr_hud(
        length(sample.airRelative),
        ground,
        Math.round(headingDeg(sample)),
        0,
        geo.altitudeMsl,
        sample.trueVelocity.z,
      ).pack(processor),
    )
    const windSpeed = Math.hypot(sample.wind.x, sample.wind.y)
    const fromDeg = (Math.atan2(sample.wind.x, sample.wind.y) * 180) / Math.PI
    push(
      microseconds,
      new mavlink20.messages.wind((fromDeg + 180 + 360) % 360, windSpeed, sample.wind.z).pack(processor),
    )
  })
  const total = records.reduce((sum, record) => sum + record.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const record of records) {
    out.set(record, offset)
    offset += record.length
  }
  return out
}

export function parseFirstGps(tlog: Uint8Array): { lat: number; lon: number } | null {
  const processor = new MAVLink20Processor(null, 1, 1)
  let found: { lat: number; lon: number } | null = null
  processor.on('GPS_RAW_INT', (message) => {
    if (typeof message.lat === 'number' && typeof message.lon === 'number') {
      found = { lat: message.lat / 1e7, lon: message.lon / 1e7 }
    }
  })
  const frame = tlog.subarray(8)
  processor.parseBuffer(frame)
  return found
}
