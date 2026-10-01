import type { Attitude } from '../coordinates/enu'
import type { GnssFix } from './gnss'
import { readGnss, type GnssConfig } from './gnss'
import type { ImuSample } from './imu'
import { readImu, type ImuConfig } from './imu'
import type { BarometerReading } from './barometer'
import { readBarometer } from './barometer'
import { readMagnetometer } from './magnetometer'
import { readAirspeed } from './airspeed'
import { readAltimeter } from './altimeter'
import type { Rng } from '../math/random'
import type { Vec3 } from '../math/vec3'
import { length } from '../math/vec3'
import {
  advanceSchedule,
  createDelayQueue,
  enqueue,
  releaseDue,
  type DelayQueue,
  type ScalarSensorConfig,
} from './sampling'

export interface SensorSuite {
  gnss: GnssConfig
  imu: ImuConfig
  barometer: ScalarSensorConfig
  magnetometer: ScalarSensorConfig
  airspeed: ScalarSensorConfig
  altimeter: ScalarSensorConfig
  magneticDeclinationDeg: number
}

export interface SensorTruth {
  position: Vec3
  velocity: Vec3
  specificForce: Vec3
  angularRate: Attitude
  headingRad: number
  relativeSpeed: number
  altitude: number
  surfacePressurePa: number
  temperatureK: number
  gravity: number
  noiseScale: number
  dropoutScale: number
}

export interface AvailableMeasurements {
  gnss: GnssFix | null
  gnssFresh: boolean
  imu: ImuSample | null
  imuFresh: boolean
  barometer: BarometerReading | null
  barometerFresh: boolean
  heading: number | null
  headingFresh: boolean
  airspeed: number | null
  airspeedFresh: boolean
  altimeter: number | null
  altimeterFresh: boolean
}

interface SensorClock {
  gnss: number
  imu: number
  barometer: number
  magnetometer: number
  airspeed: number
  altimeter: number
  gnssQueue: DelayQueue<GnssFix>
  imuQueue: DelayQueue<ImuSample>
  baroQueue: DelayQueue<BarometerReading>
  magQueue: DelayQueue<number>
  airQueue: DelayQueue<number>
  altQueue: DelayQueue<number>
}

export function createSensorClock(): SensorClock {
  return {
    gnss: 0,
    imu: 0,
    barometer: 0,
    magnetometer: 0,
    airspeed: 0,
    altimeter: 0,
    gnssQueue: createDelayQueue(),
    imuQueue: createDelayQueue(),
    baroQueue: createDelayQueue(),
    magQueue: createDelayQueue(),
    airQueue: createDelayQueue(),
    altQueue: createDelayQueue(),
  }
}

function take(
  time: number,
  _dt: number,
  next: number,
  rate: number,
  enabled: boolean,
): { due: boolean; next: number } {
  if (!enabled || rate <= 0) return { due: false, next }
  if (time + 1e-9 < next) return { due: false, next }
  return { due: true, next: advanceSchedule(next, rate, time) }
}

/** Sample the true state, delay each channel, and release measurements that have arrived. */
export function stepSensors(
  clock: SensorClock,
  time: number,
  dt: number,
  truth: SensorTruth,
  suite: SensorSuite,
  rng: Rng,
): { clock: SensorClock; measurements: AvailableMeasurements } {
  const noise = truth.noiseScale
  const dropout = truth.dropoutScale

  const gnssSlot = take(time, dt, clock.gnss, suite.gnss.updateRateHz, suite.gnss.enabled)
  if (gnssSlot.due) {
    const fix = readGnss(truth.position, truth.velocity, suite.gnss, rng, noise, dropout)
    if (fix) enqueue(clock.gnssQueue, time, suite.gnss.latencyS, fix)
  }
  const imuSlot = take(time, dt, clock.imu, suite.imu.updateRateHz, suite.imu.enabled)
  if (imuSlot.due) {
    const sample = readImu(truth.specificForce, truth.angularRate, suite.imu, rng, noise, dropout)
    if (sample) enqueue(clock.imuQueue, time, suite.imu.latencyS, sample)
  }
  const baroSlot = take(time, dt, clock.barometer, suite.barometer.updateRateHz, suite.barometer.enabled)
  if (baroSlot.due) {
    const sample = readBarometer(
      truth.altitude,
      truth.surfacePressurePa,
      truth.temperatureK,
      truth.gravity,
      suite.barometer,
      rng,
      noise,
      dropout,
    )
    if (sample) enqueue(clock.baroQueue, time, suite.barometer.latencyS, sample)
  }
  const magSlot = take(time, dt, clock.magnetometer, suite.magnetometer.updateRateHz, suite.magnetometer.enabled)
  if (magSlot.due) {
    const sample = readMagnetometer(
      truth.headingRad,
      (suite.magneticDeclinationDeg * Math.PI) / 180,
      suite.magnetometer,
      rng,
      noise,
      dropout,
    )
    if (sample !== null) enqueue(clock.magQueue, time, suite.magnetometer.latencyS, sample)
  }
  const airSlot = take(time, dt, clock.airspeed, suite.airspeed.updateRateHz, suite.airspeed.enabled)
  if (airSlot.due) {
    const sample = readAirspeed(truth.relativeSpeed, suite.airspeed, rng, noise, dropout)
    if (sample !== null) enqueue(clock.airQueue, time, suite.airspeed.latencyS, sample)
  }
  const altSlot = take(time, dt, clock.altimeter, suite.altimeter.updateRateHz, suite.altimeter.enabled)
  if (altSlot.due) {
    const sample = readAltimeter(truth.altitude, suite.altimeter, rng, noise, dropout)
    if (sample !== null) enqueue(clock.altQueue, time, suite.altimeter.latencyS, sample)
  }

  const gnss = releaseDue(clock.gnssQueue, time)
  const imu = releaseDue(clock.imuQueue, time)
  const barometer = releaseDue(clock.baroQueue, time)
  const heading = releaseDue(clock.magQueue, time)
  const airspeed = releaseDue(clock.airQueue, time)
  const altimeter = releaseDue(clock.altQueue, time)

  return {
    clock: {
      ...clock,
      gnss: gnssSlot.next,
      imu: imuSlot.next,
      barometer: baroSlot.next,
      magnetometer: magSlot.next,
      airspeed: airSlot.next,
      altimeter: altSlot.next,
    },
    measurements: {
      gnss: gnss ?? clock.gnssQueue.latest,
      gnssFresh: gnss !== null,
      imu: imu ?? clock.imuQueue.latest,
      imuFresh: imu !== null,
      barometer: barometer ?? clock.baroQueue.latest,
      barometerFresh: barometer !== null,
      heading: heading ?? clock.magQueue.latest,
      headingFresh: heading !== null,
      airspeed: airspeed ?? clock.airQueue.latest,
      airspeedFresh: airspeed !== null,
      altimeter: altimeter ?? clock.altQueue.latest,
      altimeterFresh: altimeter !== null,
    },
  }
}

export function effectiveRate(configuredHz: number, physicsDt: number): number {
  if (configuredHz <= 0) return 0
  return Math.min(configuredHz, 1 / physicsDt)
}

export function relativeSpeed(objectVelocity: Vec3, wind: Vec3): number {
  return length({
    x: objectVelocity.x - wind.x,
    y: objectVelocity.y - wind.y,
    z: objectVelocity.z - wind.z,
  })
}
