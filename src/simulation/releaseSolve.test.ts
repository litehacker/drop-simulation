import { describe, expect, it } from 'vitest'
import { applyDropBody } from './dropBodies'
import { suggestDropLocation, suggestRelease } from './releaseSolve'
import { runSimulation } from './engine'
import { cloneScenario, createDefaultScenario } from './scenario'

describe('release advice', () => {
  it('finds a passive release speed near the vacuum answer', () => {
    const scenario = createDefaultScenario()
    scenario.object.cd = 0
    scenario.object.buoyancy = false
    scenario.control.enabled = false
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 100 }
    scenario.parent.verticalSpeed = 0
    scenario.control.target = { x: 0, y: 80, z: 0 }
    scenario.control.targetRadius = 15
    scenario.simulation.duration = 20
    const advice = suggestRelease(scenario)
    const flightTime = Math.sqrt((2 * 100) / scenario.atmosphere.gravity)
    const expectedSpeed = 80 / flightTime
    const headingError = Math.min(Math.abs(advice.headingDeg), Math.abs(360 - advice.headingDeg))
    expect(advice.reachable).toBe(true)
    expect(advice.horizontalSpeed).toBeGreaterThan(expectedSpeed - 6)
    expect(advice.horizontalSpeed).toBeLessThan(expectedSpeed + 6)
    expect(headingError).toBeLessThan(25)
  })

  it('lets an efficient glider travel farther than a sphere', () => {
    const sphere = createDefaultScenario()
    applyDropBody(sphere, 'sphere')
    sphere.wind.speed = 0
    sphere.wind.turbulenceStd = 0
    sphere.wind.gustsEnabled = false
    sphere.parent.position = { x: 0, y: 0, z: 200 }
    sphere.parent.horizontalSpeed = 15
    sphere.parent.headingDeg = 0
    sphere.parent.verticalSpeed = 0
    sphere.simulation.physicsDt = 0.02
    sphere.simulation.duration = 60
    const glider = cloneScenario(sphere)
    applyDropBody(glider, 'efficient-glider')
    const ballistic = runSimulation(sphere, true)
    expect(ballistic.landing).not.toBeNull()
    glider.simulation.duration = 40
    const lifting = runSimulation(glider, true)
    const farther = lifting.samples[lifting.samples.length - 1]
    expect(farther.truePosition.y).toBeGreaterThan(ballistic.landing!.position.y + 40)
  })

  it('lands a passive glider near altitude times lift-to-drag', () => {
    const scenario = createDefaultScenario()
    applyDropBody(scenario, 'small-glider')
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 80 }
    scenario.parent.horizontalSpeed = 16
    scenario.parent.headingDeg = 0
    scenario.parent.verticalSpeed = 0
    scenario.simulation.physicsDt = 0.05
    scenario.simulation.duration = 250
    scenario.simulation.outputDt = 1
    const result = runSimulation(scenario, true)
    expect(result.landing).not.toBeNull()
    expect(result.landing!.position.y).toBeGreaterThan(80 * 8 * 0.55)
    expect(result.landing!.position.y).toBeLessThan(80 * 8 * 1.45)
    expect(Math.abs(result.landing!.position.x)).toBeLessThan(40)
  })

  it('suggests a release speed that reaches a glide-range target', () => {
    const scenario = createDefaultScenario()
    applyDropBody(scenario, 'small-glider')
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 80 }
    scenario.control.target = { x: 0, y: 640, z: 0 }
    scenario.control.targetRadius = 160
    scenario.simulation.duration = 40
    const advice = suggestRelease(scenario)
    expect(advice.reachable).toBe(true)
    expect(advice.note).toContain('m/s')
  }, 20000)

  it('places a vacuum release on the approach so the sphere hits the destination', () => {
    const scenario = createDefaultScenario()
    scenario.object.cd = 0
    scenario.object.buoyancy = false
    scenario.control.enabled = false
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 100 }
    scenario.parent.horizontalSpeed = 20
    scenario.parent.headingDeg = 0
    scenario.parent.verticalSpeed = 0
    scenario.control.target = { x: 0, y: 80, z: 0 }
    scenario.control.targetRadius = 12
    scenario.simulation.physicsDt = 0.02
    const advice = suggestDropLocation(scenario)
    const flightTime = Math.sqrt((2 * 100) / scenario.atmosphere.gravity)
    const expectedNorth = 80 - 20 * flightTime
    expect(advice.reachable).toBe(true)
    expect(advice.releaseNorth).toBeGreaterThan(expectedNorth - 8)
    expect(advice.releaseNorth).toBeLessThan(expectedNorth + 8)
    expect(Math.abs(advice.releaseEast ?? 99)).toBeLessThan(8)
    expect(advice.horizontalSpeed).toBe(20)
    expect(advice.headingDeg).toBeLessThan(15)
    expect(advice.predictedMiss).toBeLessThan(2)
  })

  it('moves the drop upwind when the wind blows toward the east', () => {
    const scenario = createDefaultScenario()
    applyDropBody(scenario, 'sphere')
    scenario.wind.speed = 8
    scenario.wind.directionDeg = 90
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 120 }
    scenario.parent.horizontalSpeed = 25
    scenario.parent.headingDeg = 0
    scenario.parent.verticalSpeed = 0
    scenario.control.target = { x: 0, y: 40, z: 0 }
    scenario.control.targetRadius = 15
    scenario.simulation.physicsDt = 0.02
    const advice = suggestDropLocation(scenario)
    expect(advice.reachable).toBe(true)
    expect(advice.releaseEast ?? 0).toBeLessThan(-5)
    expect(advice.predictedMiss).toBeLessThan(2)
  })

  it('releases a glider about one glide before the destination', () => {
    const scenario = createDefaultScenario()
    applyDropBody(scenario, 'small-glider')
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.parent.position = { x: 0, y: 0, z: 50 }
    scenario.parent.horizontalSpeed = 16
    scenario.parent.headingDeg = 0
    scenario.parent.verticalSpeed = 0
    scenario.control.target = { x: 0, y: 0, z: 0 }
    scenario.control.targetRadius = 80
    scenario.simulation.physicsDt = 0.05
    const advice = suggestDropLocation(scenario)
    expect(advice.reachable).toBe(true)
    expect(advice.releaseNorth ?? 0).toBeLessThan(-50 * 8 * 0.45)
    expect(advice.releaseNorth ?? 0).toBeGreaterThan(-50 * 8 * 1.5)
    expect(advice.predictedMiss).toBeLessThan(2)
    expect(advice.note).toContain('center')
  })
})
