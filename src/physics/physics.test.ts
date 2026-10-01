import { describe, expect, it } from 'vitest'
import { enuToThree, threeToEnu, velocityFromHeading, wrapPi } from '../coordinates/enu'
import { packetLossProbability } from '../communications/packetLoss'
import { createLinkRuntime, tickLink } from '../communications/telemetry'
import { profileById } from '../communications/profiles'
import { kalmanPredict, kalmanUpdatePosition, createKalman, kalmanPosition } from '../estimation/kalman'
import { mulberry32 } from '../math/random'
import { analyticalProjectile, runSimulation } from '../simulation/engine'
import { createDefaultScenario } from '../simulation/scenario'
import { perturbScenario, runMonteCarlo, defaultMonteCarloRequest } from '../simulation/monteCarlo'
import { importComponentJson } from '../catalog/importer'
import { applyComponent } from '../simulation/applyComponent'
import { starterCatalog } from '../catalog/catalog'
import { dragForce, relativeAirVelocity } from '../physics/drag'
import { gravityForce } from '../physics/gravity'
import { moistAirDensity } from '../physics/atmosphere'
import { resolveGround } from '../physics/ground'
import { rk4Step, type KinematicState } from '../physics/integration'
import { meanWind } from '../physics/wind'
import { createSensorClock, stepSensors } from '../sensors/bank'
import { quantize } from '../sensors/sampling'
import type { SensorSuite } from '../sensors/bank'
import { vec } from '../math/vec3'

function still(position = vec(0, 0, 100)): KinematicState {
  return {
    position,
    velocity: vec(0, 0, 0),
    attitude: { yaw: 0, pitch: 0, roll: 0 },
    rates: { yaw: 0, pitch: 0, roll: 0 },
  }
}

describe('coordinates', () => {
  it('maps ENU to Three.js Y-up without mixing axes', () => {
    expect(enuToThree({ x: 1, y: 2, z: 3 })).toEqual([1, 3, 2])
    expect(threeToEnu(1, 3, 2)).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('treats heading 0 as north and 90 as east', () => {
    const north = velocityFromHeading(0, 10, 0)
    const east = velocityFromHeading(90, 10, -2)
    expect(north.x).toBeCloseTo(0)
    expect(north.y).toBeCloseTo(10)
    expect(east.x).toBeCloseTo(10)
    expect(east.y).toBeCloseTo(0)
    expect(east.z).toBeCloseTo(-2)
    expect(wrapPi(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1)
  })
})

describe('forces', () => {
  it('applies gravity downward', () => {
    const force = gravityForce(2, 9.81)
    expect(force).toEqual({ x: 0, y: 0, z: -19.62 })
  })

  it('opposes wind-relative velocity with the quadratic drag magnitude', () => {
    const relative = relativeAirVelocity({ x: 10, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })
    expect(relative).toEqual({ x: 7, y: -4, z: 0 })
    const drag = dragForce(1.2, 0.5, 1, { x: 10, y: 0, z: 0 })
    expect(drag.x).toBeCloseTo(-30)
    expect(drag.y).toBeCloseTo(0)
    expect(dragForce(1.2, 0.5, 1, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('points a north wind along +Y and an east wind along +X', () => {
    const north = meanWind(
      {
        speed: 5,
        directionDeg: 0,
        verticalSpeed: 0,
        model: 'constant',
        referenceAltitudeM: 10,
        shearExponent: 0,
        turbulenceStd: 0,
        turbulenceTimeConstant: 1,
        gustsEnabled: false,
        gustAmplitude: 0,
        gustDuration: 0,
        gustMeanInterval: 1,
      },
      100,
    )
    expect(north.y).toBeCloseTo(5)
    expect(north.x).toBeCloseTo(0)
  })

  it('computes dry sea-level density near 1.225 kg/m³', () => {
    const density = moistAirDensity(15, 101325, 0)
    expect(density).toBeGreaterThan(1.22)
    expect(density).toBeLessThan(1.23)
  })
})

describe('integration and landing', () => {
  it('matches analytical projectile motion with gravity only', () => {
    let state = still()
    state.velocity = { x: 12, y: -3, z: 4 }
    const dt = 0.01
    const gravity = 9.80665
    for (let step = 0; step < 200; step += 1) {
      state = rk4Step(state, dt, (current) => ({
        velocity: current.velocity,
        acceleration: { x: 0, y: 0, z: -gravity },
        rates: { yaw: 0, pitch: 0, roll: 0 },
        rateDot: { yaw: 0, pitch: 0, roll: 0 },
      }))
    }
    const expected = analyticalProjectile({
      position: { x: 0, y: 0, z: 100 },
      velocity: { x: 12, y: -3, z: 4 },
      gravity,
      time: 2,
    })
    expect(state.position.x).toBeCloseTo(expected.x, 6)
    expect(state.position.y).toBeCloseTo(expected.y, 6)
    expect(state.position.z).toBeCloseTo(expected.z, 6)
  })

  it('detects a ground crossing and interpolates the impact point', () => {
    const before = still(vec(0, 10, 0.2))
    before.velocity = { x: 0, y: 5, z: -4 }
    const after = still(vec(0, 10.05, -0.2))
    after.velocity = { x: 0, y: 5, z: -4 }
    const contact = resolveGround(before, after, 1, 0.1, 0, 0)
    expect(contact.landing).not.toBeNull()
    expect(contact.settled).toBe(true)
    expect(contact.landing?.position.z).toBeCloseTo(0)
    expect(contact.landing?.position.y).toBeCloseTo(10.025)
    expect(contact.state.velocity).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('reproduces a vacuum landing from the full simulator', () => {
    const scenario = createDefaultScenario()
    scenario.object.cd = 0
    scenario.object.buoyancy = false
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.control.enabled = false
    scenario.estimator.kind = 'perfect'
    scenario.parent.position = { x: 0, y: 0, z: 100 }
    scenario.parent.horizontalSpeed = 15
    scenario.parent.verticalSpeed = 0
    scenario.parent.headingDeg = 90
    scenario.simulation.physicsDt = 0.002
    scenario.simulation.outputDt = 0.1
    scenario.simulation.duration = 12
    const result = runSimulation(scenario, true)
    const flightTime = Math.sqrt((2 * 100) / scenario.atmosphere.gravity)
    expect(result.landing).not.toBeNull()
    expect(result.landing?.time).toBeCloseTo(flightTime, 2)
    expect(result.landing?.position.x).toBeCloseTo(15 * flightTime, 1)
    expect(result.landing?.position.y).toBeCloseTo(0, 1)
    expect(result.metrics.rmsPositionError).toBeLessThan(1e-6)
  })

  it('matches the analytic vertical fall with quadratic drag', () => {
    const scenario = createDefaultScenario()
    scenario.control.enabled = false
    scenario.wind.speed = 0
    scenario.wind.turbulenceStd = 0
    scenario.wind.gustsEnabled = false
    scenario.object.mass = 1
    scenario.object.cd = 0.5
    scenario.object.referenceAreaOverride = 1
    scenario.object.buoyancy = false
    scenario.atmosphere.densityOverride = 1.2
    scenario.parent.position = { x: 0, y: 0, z: 500 }
    scenario.parent.horizontalSpeed = 0
    scenario.parent.verticalSpeed = 0
    scenario.simulation.physicsDt = 0.001
    scenario.simulation.outputDt = 0.05
    scenario.simulation.duration = 2
    const result = runSimulation(scenario, true)
    const sample = result.samples.reduce((best, item) =>
      Math.abs(item.t - 1) < Math.abs(best.t - 1) ? item : best,
    )
    const gravity = scenario.atmosphere.gravity
    const terminal = Math.sqrt((2 * scenario.object.mass * gravity) / (1.2 * 0.5 * 1))
    const speed = terminal * Math.tanh((gravity * sample.t) / terminal)
    const drop = ((terminal * terminal) / gravity) * Math.log(Math.cosh((gravity * sample.t) / terminal))
    expect(sample.trueVelocity.z).toBeCloseTo(-speed, 2)
    expect(sample.truePosition.z).toBeCloseTo(500 - drop, 2)
  })

  it('ignores wind when drag and lift are zero, and drifts when drag is present', () => {
    const calm = createDefaultScenario()
    calm.object.cd = 0
    calm.control.enabled = false
    calm.wind.speed = 12
    calm.wind.directionDeg = 90
    calm.wind.turbulenceStd = 0
    calm.parent.position = { x: 0, y: 0, z: 80 }
    calm.parent.horizontalSpeed = 0
    calm.simulation.duration = 10
    calm.simulation.physicsDt = 0.01
    const withoutDrag = runSimulation(calm, true)

    const draggy = createDefaultScenario()
    draggy.control.enabled = false
    draggy.object.cd = 0.47
    draggy.wind.speed = 12
    draggy.wind.directionDeg = 90
    draggy.wind.turbulenceStd = 0
    draggy.wind.gustsEnabled = false
    draggy.parent.horizontalSpeed = 0
    draggy.parent.position = { x: 0, y: 0, z: 80 }
    draggy.simulation.duration = 20
    draggy.simulation.physicsDt = 0.01
    const withDrag = runSimulation(draggy, true)

    expect(Math.abs(withoutDrag.landing?.position.x ?? 1)).toBeLessThan(1e-3)
    expect(withDrag.landing?.position.x ?? 0).toBeGreaterThan(5)
  })
})

describe('sensors, latency, and packet loss', () => {
  it('quantizes and samples GNSS on its own clock, then holds it through latency', () => {
    expect(quantize(1.26, 0.1)).toBeCloseTo(1.3)
    const scenario = createDefaultScenario()
    const suite: SensorSuite = scenario.sensors
    suite.gnss.updateRateHz = 10
    suite.gnss.latencyS = 0.2
    suite.gnss.horizontalNoise = 0
    suite.gnss.verticalNoise = 0
    suite.gnss.velocityNoise = 0
    suite.gnss.bias = 0
    suite.gnss.dropoutProbability = 0
    suite.gnss.quantization = 0
    suite.imu.enabled = false
    suite.barometer.enabled = false
    suite.magnetometer.enabled = false
    suite.airspeed.enabled = false
    suite.altimeter.enabled = false
    let clock = createSensorClock()
    const rng = mulberry32(4)
    const truth = {
      position: vec(3, 4, 5),
      velocity: vec(0, 0, 0),
      specificForce: vec(0, 0, 0),
      angularRate: { yaw: 0, pitch: 0, roll: 0 },
      headingRad: 0,
      relativeSpeed: 0,
      altitude: 5,
      surfacePressurePa: 101325,
      temperatureK: 288.15,
      gravity: 9.81,
      noiseScale: 1,
      dropoutScale: 1,
    }
    let freshAtStart = false
    let availableLater = false
    for (let step = 0; step <= 25; step += 1) {
      const time = step * 0.01
      const sensed = stepSensors(clock, time, 0.01, truth, suite, rng)
      clock = sensed.clock
      if (time < 0.19 && sensed.measurements.gnssFresh) freshAtStart = true
      if (time >= 0.2 && sensed.measurements.gnss) {
        availableLater = true
        expect(sensed.measurements.gnss.position.x).toBeCloseTo(3)
        expect(sensed.measurements.gnss.position.z).toBeCloseTo(5)
      }
    }
    expect(freshAtStart).toBe(false)
    expect(availableLater).toBe(true)
  })

  it('increases packet loss with distance and can drop a packet', () => {
    const model = { kind: 'distance' as const, baseLoss: 0.05, midpointM: 100, steepness: 0.05, maxLoss: 0.9 }
    const near = packetLossProbability(0, model)
    const far = packetLossProbability(400, model)
    expect(far).toBeGreaterThan(near)
    expect(near).toBeCloseTo(0.05, 2)

    const profile = structuredClone(profileById('example-poor'))
    profile.loss = { kind: 'constant', baseLoss: 1, midpointM: 1, steepness: 0, maxLoss: 1 }
    profile.latencyS = 0
    profile.jitterS = 0
    profile.retryCount = 0
    profile.intervalS = 0.1
    let link = createLinkRuntime<number>()
    const rng = mulberry32(9)
    let lost = false
    for (let step = 0; step < 5; step += 1) {
      const tick = tickLink(link, step * 0.1, 0.1, 10, profile, rng, 1)
      link = tick.link
      if (link.lost > 0) lost = true
    }
    expect(lost).toBe(true)
    expect(link.delivered).toBe(0)
  })

  it('delivers a zero-latency packet in the same step', () => {
    const profile = structuredClone(profileById('ideal'))
    let link = createLinkRuntime<string>()
    const tick = tickLink(link, 0, 0.01, 10, profile, mulberry32(1), 'state')
    expect(tick.accepted).toBe(true)
    expect(tick.arrived).toBe('state')
  })
})

describe('kalman and monte carlo reproducibility', () => {
  it('pulls a position estimate toward a measurement', () => {
    const filter = createKalman({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10, 1)
    kalmanPredict(filter, 0.1, 9.81, 0.1)
    kalmanUpdatePosition(filter, { x: 5, y: -2, z: 20 }, { x: 0.01, y: 0.01, z: 0.01 })
    const position = kalmanPosition(filter)
    expect(position.x).toBeGreaterThan(4)
    expect(position.y).toBeLessThan(-1)
  })

  it('repeats a Monte Carlo landing cloud from the same seed', () => {
    const scenario = createDefaultScenario()
    scenario.simulation.duration = 20
    scenario.simulation.physicsDt = 0.02
    scenario.control.enabled = false
    scenario.wind.turbulenceStd = 0
    const request = { ...defaultMonteCarloRequest(), runs: 3, sensorNoiseFractionSigma: 0, latencyFractionSigma: 0 }
    const first = runMonteCarlo(scenario, request)
    const second = runMonteCarlo(scenario, request)
    expect(first.landings).toEqual(second.landings)
    const perturbed = perturbScenario(scenario, request, 0)
    expect(perturbed.seed).toBe(request.seed)
  })
})

describe('default crosswind study', () => {
  it('lands and changes the miss when correction is removed', () => {
    const guided = createDefaultScenario()
    guided.simulation.physicsDt = 0.02
    guided.wind.turbulenceStd = 0
    const open = createDefaultScenario()
    open.simulation.physicsDt = 0.02
    open.wind.turbulenceStd = 0
    open.control.enabled = false
    const withControl = runSimulation(guided, true)
    const without = runSimulation(open, true)
    expect(withControl.landing).not.toBeNull()
    expect(without.landing).not.toBeNull()
    expect(withControl.metrics.horizontalMiss).not.toBeNull()
    expect(without.metrics.horizontalMiss).not.toBeNull()
    expect(without.metrics.horizontalMiss!).toBeGreaterThan(withControl.metrics.horizontalMiss!)
  })
})

describe('catalog import', () => {
  it('rejects blank specifications instead of inventing them', () => {
    const imported = importComponentJson(
      JSON.stringify([
        {
          manufacturer: 'Example Labs',
          model: 'GNSS-1',
          category: 'gnss',
          accuracy: 0.02,
          updateRateHz: 10,
          confidence: 'user-defined',
          specificationSource: 'Bench note, 2026-02-01',
        },
      ]),
    )
    expect(imported.components).toHaveLength(1)
    expect(imported.components[0].rangeM).toBeNull()
    const applied = applyComponent(createDefaultScenario(), imported.components[0], ['gnss-accuracy', 'radio-range'])
    expect(applied.applied.map((field) => field.field)).toEqual(['gnss-accuracy'])
    expect(applied.skipped[0]).toMatch(/radio-range/)
    expect(applyComponent(createDefaultScenario(), starterCatalog[0], ['mass']).skipped[0]).toMatch(/mass/)
  })
})
