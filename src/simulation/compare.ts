import { profileById } from '../communications/profiles'
import type { SimulationResult } from './engine'
import { runSimulation } from './engine'
import { cloneScenario, type Scenario } from './scenario'

export interface ComparisonRow {
  id: string
  name: string
  detail: string
  result: SimulationResult
}

function withNoise(scenario: Scenario, factor: number): Scenario {
  const next = cloneScenario(scenario)
  next.sensors.gnss.horizontalNoise *= factor
  next.sensors.gnss.verticalNoise *= factor
  next.sensors.gnss.velocityNoise *= factor
  next.sensors.imu.accelNoise *= factor
  next.sensors.imu.gyroNoise *= factor
  next.sensors.barometer.noiseStd *= factor
  next.sensors.magnetometer.noiseStd *= factor
  next.sensors.airspeed.noiseStd *= factor
  next.sensors.altimeter.noiseStd *= factor
  return next
}

export function comparisonScenarios(base: Scenario): { id: string; name: string; detail: string; scenario: Scenario }[] {
  const none = cloneScenario(base)
  none.name = 'No correction'
  none.control.enabled = false

  const perfect = cloneScenario(base)
  perfect.name = 'Perfect telemetry'
  perfect.estimator.kind = 'perfect'
  perfect.communication.profileId = 'ideal'
  perfect.communication.profile = structuredClone(profileById('ideal'))
  perfect.sensors.gnss.latencyS = 0
  perfect.sensors.gnss.horizontalNoise = 0
  perfect.sensors.gnss.verticalNoise = 0
  perfect.sensors.gnss.velocityNoise = 0
  perfect.sensors.gnss.dropoutProbability = 0
  perfect.sensors.imu.accelNoise = 0
  perfect.sensors.imu.gyroNoise = 0
  perfect.sensors.imu.latencyS = 0

  const realistic = cloneScenario(base)
  realistic.name = 'Realistic telemetry'

  const noisy = withNoise(base, 3)
  noisy.name = 'Noisy sensors'

  const improved = withNoise(base, 0.25)
  improved.name = 'Improved sensors'

  const slow = cloneScenario(base)
  slow.name = 'Slow updates'
  slow.sensors.gnss.updateRateHz = 1
  slow.sensors.imu.updateRateHz = 10
  slow.sensors.barometer.updateRateHz = 2
  slow.sensors.airspeed.updateRateHz = 2
  slow.communication.profile.intervalS = 0.5

  const fast = cloneScenario(base)
  fast.name = 'Fast updates'
  fast.sensors.gnss.updateRateHz = 20
  fast.sensors.imu.updateRateHz = Math.min(200, 1 / base.simulation.physicsDt)
  fast.sensors.barometer.updateRateHz = 50
  fast.communication.profile.intervalS = 0.02

  const poor = cloneScenario(base)
  poor.name = 'Poor telemetry profile'
  poor.communication.profileId = 'example-poor'
  poor.communication.profile = structuredClone(profileById('example-poor'))

  const good = cloneScenario(base)
  good.name = 'Good telemetry profile'
  good.communication.profileId = 'example-good'
  good.communication.profile = structuredClone(profileById('example-good'))

  return [
    { id: 'none', name: 'No correction', detail: 'Same vehicle and atmosphere. Controller off.', scenario: none },
    {
      id: 'perfect',
      name: 'Perfect telemetry',
      detail: 'Perfect state, zero link loss, zero latency. A baseline, not a radio.',
      scenario: perfect,
    },
    { id: 'realistic', name: 'Current settings', detail: 'The scenario as configured.', scenario: realistic },
    { id: 'noisy', name: 'Noisy sensors', detail: 'Sensor noise set to 3× the current values.', scenario: noisy },
    { id: 'improved', name: 'Improved sensors', detail: 'Sensor noise set to 0.25× the current values.', scenario: improved },
    { id: 'slow', name: 'Slow updates', detail: 'GNSS 1 Hz, IMU 10 Hz, telemetry every 0.5 s.', scenario: slow },
    { id: 'fast', name: 'Fast updates', detail: 'Higher GNSS, IMU, and telemetry rates.', scenario: fast },
    { id: 'poor-link', name: 'Poor telemetry profile', detail: 'Example poor link. User-defined, not a measured radio.', scenario: poor },
    { id: 'good-link', name: 'Good telemetry profile', detail: 'Example good link. User-defined, not a measured radio.', scenario: good },
  ]
}

export function runComparison(base: Scenario): ComparisonRow[] {
  return comparisonScenarios(base).map((item) => ({
    id: item.id,
    name: item.name,
    detail: item.detail,
    result: runSimulation(item.scenario),
  }))
}
