import type { Attitude } from '../coordinates/enu'
import { LEVEL } from '../coordinates/enu'
import type { CommProfile } from '../communications/packetLoss'
import { profileById } from '../communications/profiles'
import type { ActuatorKind, GuidanceLaw } from '../control/correction'
import type { EstimatorKind } from '../estimation/complementary'
import type { Vec3 } from '../math/vec3'
import { vec } from '../math/vec3'
import type { AtmosphereInput } from '../physics/atmosphere'
import type { ShapeKind } from '../physics/shapes'
import type { WindInput } from '../physics/wind'
import type { GnssConfig } from '../sensors/gnss'
import type { ImuConfig } from '../sensors/imu'
import type { ScalarSensorConfig } from '../sensors/sampling'
import type { SensorSuite } from '../sensors/bank'

export const SCENARIO_VERSION = 1 as const

export type AeroMode = 'ballistic' | 'glider' | 'custom'

export interface ObjectConfig {
  aeroMode: AeroMode
  shape: ShapeKind
  mass: number
  diameter: number
  length: number
  width: number
  height: number
  customVolume: number
  cd: number
  cl: number
  cm: number
  useLiftToDrag: boolean
  liftToDrag: number
  referenceAreaOverride: number | null
  wingArea: number | null
  aspectRatio: number
  centerOfMass: Vec3
  centerOfPressure: Vec3
  buoyancy: boolean
  inertiaOverride: Vec3 | null
  angularDamping: number
  bankTimeConstant: number
  initialRates: Attitude
}

export interface Scenario {
  version: typeof SCENARIO_VERSION
  name: string
  seed: number
  simulation: {
    duration: number
    physicsDt: number
    outputDt: number
    uiFps: number
    groundRestitution: number
  }
  parent: {
    position: Vec3
    headingDeg: number
    pitchDeg: number
    rollDeg: number
    horizontalSpeed: number
    verticalSpeed: number
    releaseTime: number
    inheritVelocity: boolean
    releaseVelocity: Vec3
    releaseOffset: Vec3
  }
  object: ObjectConfig
  atmosphere: AtmosphereInput
  wind: WindInput
  sensors: SensorSuite
  estimator: {
    kind: EstimatorKind
    complementaryAlpha: number
    complementaryBeta: number
    altitudeGain: number
    processNoiseAccel: number
    initialPositionStd: number
    initialVelocityStd: number
  }
  communication: {
    profileId: string
    profile: CommProfile
  }
  control: {
    enabled: boolean
    law: GuidanceLaw
    intervalS: number
    kp: number
    maxAcceleration: number
    maxBankDeg: number
    desiredGroundSpeed: number
    actuator: ActuatorKind
    target: Vec3
    targetRadius: number
    abortPoint: Vec3
  }
  /** Parameter ids the panel should keep read-only. Values already stored are what the engine uses. */
  locks: string[]
}

function scalarSensor(partial: Partial<ScalarSensorConfig>): ScalarSensorConfig {
  return {
    enabled: true,
    updateRateHz: 20,
    latencyS: 0.02,
    bias: 0,
    noiseStd: 0.5,
    dropoutProbability: 0,
    quantization: 0,
    accuracy: 0.5,
    range: 1e8,
    ...partial,
  }
}

export function createDefaultScenario(): Scenario {
  const gnss: GnssConfig = {
    ...scalarSensor({
      updateRateHz: 10,
      latencyS: 0.05,
      noiseStd: 1.5,
      accuracy: 1.5,
      quantization: 0.01,
    }),
    horizontalNoise: 1.5,
    verticalNoise: 2.5,
    velocityNoise: 0.2,
  }
  const imu: ImuConfig = {
    enabled: true,
    updateRateHz: 100,
    latencyS: 0.005,
    accelNoise: 0.05,
    accelBias: vec(0, 0, 0),
    gyroNoise: 0.002,
    gyroBias: { ...LEVEL },
    dropoutProbability: 0,
    quantization: 0,
    range: 50,
  }
  return {
    version: SCENARIO_VERSION,
    name: 'Crosswind release',
    seed: 1,
    simulation: {
      duration: 45,
      physicsDt: 0.01,
      outputDt: 0.05,
      uiFps: 60,
      groundRestitution: 0,
    },
    parent: {
      position: vec(0, 0, 300),
      headingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      horizontalSpeed: 28,
      verticalSpeed: 0,
      releaseTime: 0,
      inheritVelocity: true,
      releaseVelocity: vec(0, 28, 0),
      releaseOffset: vec(0, 0, 0),
    },
    object: {
      aeroMode: 'ballistic',
      shape: 'sphere',
      mass: 1.2,
      diameter: 0.22,
      length: 0.4,
      width: 0.25,
      height: 0.12,
      customVolume: 0.005,
      cd: 0.47,
      cl: 0.6,
      cm: 0,
      useLiftToDrag: false,
      liftToDrag: 8,
      referenceAreaOverride: null,
      wingArea: 0.35,
      aspectRatio: 6,
      centerOfMass: vec(0, 0, 0),
      centerOfPressure: vec(0, 0, 0),
      buoyancy: false,
      inertiaOverride: null,
      angularDamping: 0.2,
      bankTimeConstant: 0.35,
      initialRates: { ...LEVEL },
    },
    atmosphere: {
      temperatureC: 15,
      pressurePa: 101325,
      humidityPercent: 40,
      densityOverride: null,
      densityModel: 'constant',
      gravity: 9.80665,
      rainMillimetersPerHour: 0,
      rainDragPerMmHr: 0,
      rainNoisePerMmHr: 0.02,
      rainDropoutPerMmHr: 0.01,
      clearAirVisibilityM: 20000,
      rainVisibilityPerMmHr: 0.15,
      isaSeaLevelTemperatureC: 15,
      isaSeaLevelPressurePa: 101325,
    },
    wind: {
      speed: 8,
      directionDeg: 90,
      verticalSpeed: 0,
      model: 'constant',
      referenceAltitudeM: 10,
      shearExponent: 0.15,
      turbulenceStd: 0.4,
      turbulenceTimeConstant: 2,
      gustsEnabled: false,
      gustAmplitude: 3,
      gustDuration: 1.5,
      gustMeanInterval: 8,
    },
    sensors: {
      gnss,
      imu,
      barometer: scalarSensor({ updateRateHz: 20, noiseStd: 8, accuracy: 8, latencyS: 0.02 }),
      magnetometer: scalarSensor({ updateRateHz: 20, noiseStd: 0.02, accuracy: 0.02, bias: 0 }),
      airspeed: scalarSensor({ updateRateHz: 20, noiseStd: 0.4, accuracy: 0.4, range: 80 }),
      altimeter: scalarSensor({ updateRateHz: 10, noiseStd: 1, accuracy: 1, latencyS: 0.03 }),
      magneticDeclinationDeg: 0,
    },
    estimator: {
      kind: 'kalman',
      complementaryAlpha: 0.55,
      complementaryBeta: 1.2,
      altitudeGain: 0.35,
      processNoiseAccel: 1.5,
      initialPositionStd: 5,
      initialVelocityStd: 1,
    },
    communication: {
      profileId: 'example-short-range',
      profile: structuredClone(profileById('example-short-range')),
    },
    control: {
      enabled: true,
      law: 'trajectory',
      intervalS: 0.1,
      kp: 0.8,
      maxAcceleration: 2.5,
      maxBankDeg: 25,
      desiredGroundSpeed: 28,
      actuator: 'acceleration',
      target: vec(0, 180, 0),
      targetRadius: 20,
      abortPoint: vec(0, 0, 0),
    },
    locks: [],
  }
}

export function cloneScenario(scenario: Scenario): Scenario {
  return structuredClone(scenario)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeValue<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base
  if (Array.isArray(base)) return (Array.isArray(patch) ? structuredClone(patch) : base) as T
  if (isRecord(base) && isRecord(patch)) {
    const out: Record<string, unknown> = { ...base }
    for (const key of Object.keys(base)) {
      if (key in patch) out[key] = mergeValue((base as Record<string, unknown>)[key], patch[key])
    }
    return out as T
  }
  return patch as T
}

/** Fill any missing fields from the current defaults so saved scenarios keep loading. */
export function hydrateScenario(value: unknown): Scenario {
  const defaults = createDefaultScenario()
  if (!isRecord(value)) return defaults
  const merged = mergeValue(defaults, value)
  merged.version = SCENARIO_VERSION
  return merged
}

export function validateScenario(scenario: Scenario): string[] {
  const problems: string[] = []
  if (!(scenario.object.mass > 0)) problems.push('Mass must be positive.')
  if (!(scenario.simulation.physicsDt > 0) || scenario.simulation.physicsDt > 0.2) {
    problems.push('Physics timestep must be between 0 and 0.2 seconds.')
  }
  if (!(scenario.simulation.duration > 0)) problems.push('Duration must be positive.')
  if (scenario.object.cd < 0) problems.push('Cd cannot be negative.')
  if (scenario.atmosphere.gravity <= 0) problems.push('Gravity must be positive.')
  if (scenario.parent.position.z < 0) problems.push('Release altitude is below the ground.')
  return problems
}
