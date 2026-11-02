import { describe, expect, it } from 'vitest'
import {
  calculateAircraftPerformance,
  createDefaultUavInputs,
  integrateTakeoff,
  interpolateCurrentAtPower,
  wingAreaM2,
  type UavInputs,
} from './uavPerformance'

function withInput(patch: (input: UavInputs) => void): UavInputs {
  const input = createDefaultUavInputs()
  patch(input)
  return input
}

describe('fixed-wing performance', () => {
  it('keeps wing area fixed and raises loading, stall, drag, power, and consumption when MTOW rises', () => {
    const light = calculateAircraftPerformance(createDefaultUavInputs())
    const heavy = calculateAircraftPerformance(withInput((input) => { input.mtowKg = 5 }))
    expect(heavy.geometry.wingAreaM2.value).toBeCloseTo(0.5)
    expect(light.geometry.wingAreaM2.value).toBeCloseTo(0.5)
    expect(heavy.geometry.wingLoadingKgM2.value ?? 0).toBeGreaterThan(light.geometry.wingLoadingKgM2.value ?? 0)
    expect(heavy.stallSpeedKmh.value ?? 0).toBeGreaterThan(light.stallSpeedKmh.value ?? 0)
    expect(heavy.cruise.liftCoefficient.value ?? 0).toBeGreaterThan(light.cruise.liftCoefficient.value ?? 0)
    expect(heavy.cruise.inducedDragCoefficient.value ?? 0).toBeGreaterThan(light.cruise.inducedDragCoefficient.value ?? 0)
    expect(heavy.cruise.electricalPowerW.value ?? 0).toBeGreaterThan(light.cruise.electricalPowerW.value ?? 0)
    expect(heavy.climb.electricalPowerW.value ?? 0).toBeGreaterThan(light.climb.electricalPowerW.value ?? 0)
    expect(heavy.cruise.currentA.value ?? 0).toBeGreaterThan(light.cruise.currentA.value ?? 0)
    const lightCruise = light.phases.find((phase) => phase.id === 'cruise')
    const heavyCruise = heavy.phases.find((phase) => phase.id === 'cruise')
    expect(heavyCruise?.ampHours.value ?? 0).toBeGreaterThan(lightCruise?.ampHours.value ?? 0)
    expect(heavy.battery.maxCruiseMin.value ?? 0).toBeLessThan(light.battery.maxCruiseMin.value ?? 0)
    const cruisePoints = light.timeProfile.filter((point) => point.phase === 'Cruise' && point.currentA !== null)
    expect(cruisePoints.length).toBeGreaterThanOrEqual(2)
    expect(cruisePoints[cruisePoints.length - 1]?.tMin).toBeGreaterThan(cruisePoints[0]?.tMin ?? 0)
  })

  it('grows area and aspect ratio and lowers stall when the wingspan grows at the same chord', () => {
    const base = calculateAircraftPerformance(createDefaultUavInputs())
    const wider = calculateAircraftPerformance(withInput((input) => { input.wingspanM = 2.5 }))
    expect(wider.geometry.wingAreaM2.value ?? 0).toBeGreaterThan(base.geometry.wingAreaM2.value ?? 0)
    expect(wider.geometry.aspectRatio.value ?? 0).toBeGreaterThan(base.geometry.aspectRatio.value ?? 0)
    expect(wider.geometry.wingLoadingKgM2.value ?? 0).toBeLessThan(base.geometry.wingLoadingKgM2.value ?? 0)
    expect(wider.stallSpeedKmh.value ?? 0).toBeLessThan(base.stallSpeedKmh.value ?? 0)
    expect(wider.cruise.inducedDragCoefficient.value ?? 0).toBeLessThan(base.cruise.inducedDragCoefficient.value ?? 0)
    expect(wider.cruise.electricalPowerW.value).not.toBe(base.cruise.electricalPowerW.value)
  })

  it('rebuilds dynamic pressure, lift, parasite drag, and current when cruise speed changes', () => {
    const slow = calculateAircraftPerformance(withInput((input) => { input.cruiseSpeedKmh = 70 }))
    const fast = calculateAircraftPerformance(withInput((input) => { input.cruiseSpeedKmh = 90 }))
    expect(fast.cruise.dynamicPressurePa.value ?? 0).toBeGreaterThan(slow.cruise.dynamicPressurePa.value ?? 0)
    expect(fast.cruise.liftCoefficient.value ?? 0).toBeLessThan(slow.cruise.liftCoefficient.value ?? 0)
    const parasite = (point: typeof fast) => (point.cruise.dynamicPressurePa.value ?? 0) * (point.geometry.wingAreaM2.value ?? 0) * 0.035
    expect(parasite(fast)).toBeGreaterThan(parasite(slow))
    expect(fast.cruise.inducedDragCoefficient.value ?? 0).toBeLessThan(slow.cruise.inducedDragCoefficient.value ?? 0)
    expect(fast.cruise.aeroPowerW.value).not.toBeCloseTo(slow.cruise.aeroPowerW.value ?? 0)
    expect(fast.cruise.currentA.value).not.toBeCloseTo(slow.cruise.currentA.value ?? 0)
    expect(fast.phases.find((phase) => phase.id === 'cruise')?.ampHours.value).not.toBeCloseTo(
      slow.phases.find((phase) => phase.id === 'cruise')?.ampHours.value ?? 0,
    )
  })

  it('leaves the aerodynamic result alone when only battery capacity changes', () => {
    const small = calculateAircraftPerformance(createDefaultUavInputs())
    const large = calculateAircraftPerformance(withInput((input) => { input.capacityAh = 10 }))
    expect(large.cruise.electricalPowerW.value).toBeCloseTo(small.cruise.electricalPowerW.value ?? 0)
    expect(large.stallSpeedKmh.value).toBeCloseTo(small.stallSpeedKmh.value ?? 0)
    expect(large.battery.usableEnergyWh.value ?? 0).toBeGreaterThan(small.battery.usableEnergyWh.value ?? 0)
    expect(large.battery.reserveAh.value ?? 0).toBeGreaterThan(small.battery.reserveAh.value ?? 0)
    expect(large.battery.maxCruiseMin.value ?? 0).toBeGreaterThan(small.battery.maxCruiseMin.value ?? 0)
    expect(large.geometry.weightN.value).toBeCloseTo(small.geometry.weightN.value ?? 0)
  })

  it('raises electrical power, current, and consumption when propeller efficiency falls', () => {
    const better = calculateAircraftPerformance(createDefaultUavInputs())
    const worse = calculateAircraftPerformance(withInput((input) => { input.propellerEfficiency = 0.6 }))
    expect(worse.cruise.electricalPowerW.value ?? 0).toBeGreaterThan(better.cruise.electricalPowerW.value ?? 0)
    expect(worse.cruise.currentA.value ?? 0).toBeGreaterThan(better.cruise.currentA.value ?? 0)
    expect(worse.phases.find((phase) => phase.id === 'cruise')?.ampHours.value ?? 0).toBeGreaterThan(
      better.phases.find((phase) => phase.id === 'cruise')?.ampHours.value ?? 0,
    )
    expect(worse.battery.maxCruiseMin.value ?? 0).toBeLessThan(better.battery.maxCruiseMin.value ?? 0)
  })

  it('keeps motor and ESC limit warnings independent while still returning the estimate', () => {
    const hot = calculateAircraftPerformance(withInput((input) => {
      input.cd0 = 0.5
      input.escCurrentRatingA = 40
    }))
    expect(hot.cruise.currentA.value ?? 0).toBeGreaterThan(50)
    expect(hot.warnings.some((item) => item.code === 'motor-current')).toBe(true)
    expect(hot.warnings.some((item) => item.code === 'esc')).toBe(true)
    expect(hot.cruise.electricalPowerW.value).not.toBeNull()
    const escRaised = calculateAircraftPerformance(withInput((input) => {
      input.cd0 = 0.5
      input.escCurrentRatingA = 200
    }))
    expect(escRaised.warnings.some((item) => item.code === 'motor-current')).toBe(true)
    expect(escRaised.warnings.some((item) => item.code === 'esc')).toBe(false)
  })

  it('uses an entered wing area instead of span times chord', () => {
    const area = wingAreaM2({ wingAreaMode: 'entered', wingAreaM2: 0.8, wingspanM: 2, averageChordM: 0.25 })
    expect(area.value).toBeCloseTo(0.8)
    expect(area.source).toBe('measured')
    const result = calculateAircraftPerformance(withInput((input) => {
      input.wingAreaMode = 'entered'
      input.wingAreaM2 = 0.8
    }))
    expect(result.geometry.wingAreaM2.value).toBeCloseTo(0.8)
    expect(result.geometry.aspectRatio.value).toBeCloseTo(5)
  })

  it('does not extrapolate a motor map or treat throttle as the interpolant', () => {
    const inside = interpolateCurrentAtPower(200, [
      { id: 'a', voltageV: 22, currentA: 10, powerW: 100, rpm: null, thrustN: null, throttlePercent: 20, temperatureC: null },
      { id: 'b', voltageV: 22, currentA: 30, powerW: 300, rpm: null, thrustN: null, throttlePercent: 80, temperatureC: null },
    ])
    expect(inside.value).toBeCloseTo(20)
    expect(inside.source).toBe('interpolated')
    const outside = interpolateCurrentAtPower(500, [
      { id: 'a', voltageV: null, currentA: 10, powerW: 100, rpm: null, thrustN: null, throttlePercent: 100, temperatureC: null },
      { id: 'b', voltageV: null, currentA: 30, powerW: 300, rpm: null, thrustN: null, throttlePercent: 10, temperatureC: null },
    ])
    expect(outside.value).toBeNull()
  })

  it('labels cruise current from the phase source instead of swapping in the aero estimate', () => {
    const measured = calculateAircraftPerformance(withInput((input) => {
      const cruise = input.phases.find((phase) => phase.id === 'cruise')
      if (!cruise) return
      cruise.mode = 'measured'
      cruise.currentA = 18
    }))
    expect(measured.cruiseCurrent.source).toBe('measured')
    expect(measured.cruiseCurrent.value).toBeCloseTo(18)
    expect(measured.cruise.currentA.source).toBe('estimate')
    expect(measured.cruise.currentA.value).not.toBeCloseTo(18)
  })

  it('integrates a ground roll and labels constant static thrust as low confidence', () => {
    const input = withInput((input) => {
      input.staticThrustN = 80
      input.rollingResistance = 0.02
      input.headwindMs = 0
      input.runwaySlopeDeg = 0
    })
    const result = calculateAircraftPerformance(input)
    expect(result.takeoffDistanceM.value).toBeGreaterThan(0)
    expect(result.takeoffDistanceM.note.toLowerCase()).toContain('static')
    expect(result.warnings.some((item) => item.code === 'takeoff')).toBe(true)
    const noThrust = integrateTakeoff(createDefaultUavInputs(), {
      wingArea: 0.5,
      aspectRatio: 8,
      weightN: 4 * 9.80665,
      inputErrors: [],
    }, 12)
    expect(noThrust.distanceM).toBeNull()
  })
})
