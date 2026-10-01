import type { Scenario } from './scenario'
import { cloneScenario, createDefaultScenario } from './scenario'
import { profileById } from '../communications/profiles'

export interface Preset {
  id: string
  name: string
  summary: string
  apply: () => Scenario
}

function base(): Scenario {
  return createDefaultScenario()
}

export const presets: Preset[] = [
  {
    id: 'simple-sphere',
    name: 'Simple Sphere',
    summary: 'Smooth-sphere drag, calm air, no steering. Textbook Cd is an assumption, not a measurement of this object.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Simple Sphere'
      scenario.wind.speed = 0
      scenario.wind.turbulenceStd = 0
      scenario.wind.gustsEnabled = false
      scenario.atmosphere.rainMillimetersPerHour = 0
      scenario.control.enabled = false
      scenario.control.actuator = 'none'
      scenario.object.aeroMode = 'ballistic'
      scenario.object.shape = 'sphere'
      scenario.estimator.kind = 'perfect'
      return scenario
    },
  },
  {
    id: 'small-glider',
    name: 'Small Glider',
    summary: 'Passive glider. Lift and drag come from the wing assumptions. No steering corrections.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Small Glider'
      scenario.object.aeroMode = 'glider'
      scenario.object.shape = 'box'
      scenario.object.mass = 1.4
      scenario.object.cd = 0.08
      scenario.object.cl = 0.7
      scenario.object.useLiftToDrag = true
      scenario.object.liftToDrag = 8
      scenario.object.wingArea = 0.45
      scenario.object.length = 0.8
      scenario.object.width = 1.6
      scenario.object.height = 0.12
      scenario.control.actuator = 'none'
      scenario.control.enabled = false
      scenario.wind.speed = 4
      return scenario
    },
  },
  {
    id: 'high-wind',
    name: 'High Wind',
    summary: 'Same sphere with a strong crosswind and turbulence. Wind values are scenario inputs.',
    apply: () => {
      const scenario = base()
      scenario.name = 'High Wind'
      scenario.wind.speed = 16
      scenario.wind.directionDeg = 90
      scenario.wind.turbulenceStd = 1.5
      scenario.wind.gustsEnabled = true
      scenario.wind.gustAmplitude = 5
      return scenario
    },
  },
  {
    id: 'rain',
    name: 'Rain',
    summary: 'Rain reduces visibility and sensor reliability. Drag is unchanged until the rain-drag factor is set.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Rain'
      scenario.atmosphere.rainMillimetersPerHour = 12
      scenario.atmosphere.rainDragPerMmHr = 0
      return scenario
    },
  },
  {
    id: 'poor-gnss',
    name: 'Poor GNSS',
    summary: 'Slow, noisy, occasionally missing position fixes. Noise values are assumptions.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Poor GNSS'
      scenario.estimator.kind = 'kalman'
      scenario.sensors.gnss.updateRateHz = 1
      scenario.sensors.gnss.horizontalNoise = 8
      scenario.sensors.gnss.verticalNoise = 12
      scenario.sensors.gnss.latencyS = 0.25
      scenario.sensors.gnss.dropoutProbability = 0.15
      return scenario
    },
  },
  {
    id: 'good-rtk',
    name: 'Good RTK',
    summary: 'A tight position assumption for comparison. Not a manufacturer RTK specification.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Good RTK'
      scenario.estimator.kind = 'kalman'
      scenario.sensors.gnss.updateRateHz = 10
      scenario.sensors.gnss.horizontalNoise = 0.03
      scenario.sensors.gnss.verticalNoise = 0.05
      scenario.sensors.gnss.velocityNoise = 0.02
      scenario.sensors.gnss.latencyS = 0.02
      scenario.sensors.gnss.dropoutProbability = 0
      scenario.sensors.gnss.accuracy = 0.03
      return scenario
    },
  },
  {
    id: 'poor-telemetry',
    name: 'Poor Telemetry',
    summary: 'Example poor link profile. Range and loss are user-defined, not a guaranteed radio.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Poor Telemetry'
      scenario.communication.profileId = 'example-poor'
      scenario.communication.profile = structuredClone(profileById('example-poor'))
      return scenario
    },
  },
  {
    id: 'good-telemetry',
    name: 'Good Telemetry',
    summary: 'Example good link profile. Range and loss are user-defined, not a guaranteed radio.',
    apply: () => {
      const scenario = base()
      scenario.name = 'Good Telemetry'
      scenario.communication.profileId = 'example-good'
      scenario.communication.profile = structuredClone(profileById('example-good'))
      return scenario
    },
  },
]

export function duplicateScenario(scenario: Scenario, name: string): Scenario {
  const copy = cloneScenario(scenario)
  copy.name = name
  return copy
}
