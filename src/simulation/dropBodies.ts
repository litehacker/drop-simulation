import type { Scenario } from './scenario'

export interface DropBody {
  id: string
  name: string
  summary: string
  apply: (scenario: Scenario) => void
}

function disableSteering(scenario: Scenario) {
  scenario.control.enabled = false
  scenario.control.actuator = 'none'
}

export const dropBodies: DropBody[] = [
  {
    id: 'sphere',
    name: 'Sphere',
    summary: 'Drag only. It falls steeply. Release speed is the main way to move the impact.',
    apply: (scenario) => {
      scenario.object.aeroMode = 'ballistic'
      scenario.object.shape = 'sphere'
      scenario.object.mass = 1.2
      scenario.object.diameter = 0.22
      scenario.object.cd = 0.47
      scenario.object.cl = 0
      scenario.object.useLiftToDrag = false
      scenario.object.referenceAreaOverride = null
      scenario.object.wingArea = null
      disableSteering(scenario)
    },
  },
  {
    id: 'compact-glider',
    name: 'Compact glider',
    summary: 'Small wing and a modest lift-to-drag ratio. It glides a little farther than the sphere.',
    apply: (scenario) => {
      scenario.object.aeroMode = 'glider'
      scenario.object.shape = 'box'
      scenario.object.mass = 0.8
      scenario.object.cd = 0.12
      scenario.object.useLiftToDrag = true
      scenario.object.liftToDrag = 4
      scenario.object.cl = 0.48
      scenario.object.wingArea = 0.2
      scenario.object.referenceAreaOverride = 0.2
      scenario.object.length = 0.5
      scenario.object.width = 0.8
      scenario.object.height = 0.08
      disableSteering(scenario)
    },
  },
  {
    id: 'small-glider',
    name: 'Small glider',
    summary: 'More wing and a higher lift-to-drag ratio. The same release height carries it farther.',
    apply: (scenario) => {
      scenario.object.aeroMode = 'glider'
      scenario.object.shape = 'box'
      scenario.object.mass = 1.2
      scenario.object.cd = 0.08
      scenario.object.useLiftToDrag = true
      scenario.object.liftToDrag = 8
      scenario.object.cl = 0.64
      scenario.object.wingArea = 0.45
      scenario.object.referenceAreaOverride = 0.45
      scenario.object.length = 0.8
      scenario.object.width = 1.4
      scenario.object.height = 0.1
      disableSteering(scenario)
    },
  },
  {
    id: 'efficient-glider',
    name: 'Efficient glider',
    summary: 'Highest lift-to-drag of these assumptions. It loses altitude slowly, so a slower release can still reach a distant area.',
    apply: (scenario) => {
      scenario.object.aeroMode = 'glider'
      scenario.object.shape = 'box'
      scenario.object.mass = 1.0
      scenario.object.cd = 0.05
      scenario.object.useLiftToDrag = true
      scenario.object.liftToDrag = 14
      scenario.object.cl = 0.7
      scenario.object.wingArea = 0.6
      scenario.object.referenceAreaOverride = 0.6
      scenario.object.length = 0.9
      scenario.object.width = 1.8
      scenario.object.height = 0.08
      disableSteering(scenario)
    },
  },
]

export function applyDropBody(scenario: Scenario, id: string): void {
  dropBodies.find((body) => body.id === id)?.apply(scenario)
}
