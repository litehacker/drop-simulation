import { describe, expect, it } from 'vitest'
import {
  allUpWeightKg,
  applyWhatIf,
  createDefaultFlightTimeInput,
  estimateFlightTime,
  nominalPackVoltage,
} from './flightTime'

function filledInput() {
  const input = createDefaultFlightTimeInput()
  input.items = [
    { id: 'frame', label: 'Frame', weightKg: 1.2, quantity: 1, included: true },
    { id: 'avionics', label: 'Avionics', weightKg: 0.15, quantity: 1, included: true },
    { id: 'payload', label: 'Payload', weightKg: 0.8, quantity: 1, included: true },
    { id: 'misc', label: 'Misc', weightKg: 0.25, quantity: 1, included: true },
  ]
  input.motors = {
    count: 3,
    weightKg: 0.18,
    maxThrustG: 2200,
    efficiencyGPerW: 9,
  }
  input.battery = {
    capacityMah: 10000,
    cellCount: 6,
    voltsPerCell: 3.7,
    weightKg: 1.4,
    usableFraction: 0.8,
  }
  input.thrustShare = 1
  input.flightStyle = 'hover'
  input.avionicsW = 15
  input.escEfficiency = 0.95
  return input
}

describe('mother-drone flight time', () => {
  it('sums AUW from line items, motors, and battery', () => {
    const input = filledInput()
    // 1.2 + 0.15 + 0.8 + 0.25 + 3×0.18 + 1.4 = 4.34
    expect(allUpWeightKg(input)).toBeCloseTo(4.34, 5)
  })

  it('uses pack energy and hover efficiency for endurance', () => {
    const { result, missing } = estimateFlightTime(filledInput())
    expect(missing).toEqual([])
    expect(result).not.toBeNull()
    expect(nominalPackVoltage(filledInput().battery)).toBeCloseTo(22.2, 5)
    // E = 10 Ah × 22.2 V = 222 Wh; usable 177.6 Wh
    expect(result!.batteryEnergyWh).toBeCloseTo(222, 5)
    expect(result!.usableEnergyWh).toBeCloseTo(177.6, 5)
    // AUW 4340 g / 9 g/W / 0.95 esc ≈ 507.6 W propulsive; +15 W avionics
    expect(result!.propulsivePowerW).toBeCloseTo(4340 / 9 / 0.95, 5)
    expect(result!.averagePowerW).toBeCloseTo(result!.propulsivePowerW + 15, 5)
    expect(result!.flightTimeMin).toBeCloseTo((177.6 / result!.averagePowerW) * 60, 5)
    expect(result!.labels.flightTimeMin).toBe('estimate')
  })

  it('refuses to invent a number when required specs are blank', () => {
    const { result, missing } = estimateFlightTime(createDefaultFlightTimeInput())
    expect(result).toBeNull()
    expect(missing.length).toBeGreaterThan(0)
    expect(missing.some((item) => /capacity/i.test(item))).toBe(true)
  })

  it('compares a battery upgrade and a mass cut', () => {
    const comparison = applyWhatIf(filledInput(), {
      capacityMahDelta: 4000,
      batteryWeightKgDelta: 0.35,
      massReductionKg: 0.4,
      cellCountOverride: null,
    })
    expect(comparison.missing).toEqual([])
    expect(comparison.baseline).not.toBeNull()
    expect(comparison.modified).not.toBeNull()
    expect(comparison.modified!.allUpWeightKg).toBeCloseTo(
      allUpWeightKg(filledInput()) + 0.35 - 0.4,
      5,
    )
    expect(comparison.deltaFlightTimeMin).not.toBeNull()
    expect(comparison.deltaFlightTimeMin!).toBeGreaterThan(0)
  })

  it('flags insufficient thrust for the AUW', () => {
    const input = filledInput()
    input.motors.maxThrustG = 200
    const { result } = estimateFlightTime(input)
    expect(result).not.toBeNull()
    expect(result!.warnings.some((item) => /exceeds max thrust/i.test(item))).toBe(true)
  })
})
