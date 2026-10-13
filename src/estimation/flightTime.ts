/**
 * Mother-drone endurance estimate from mass, motor thrust tables, and pack energy.
 *
 * Method (energy balance at an operating thrust point):
 *   AUW = Σ component masses
 *   thrust per motor = (AUW × g × thrustShare) / motorCount
 *   P_prop = (AUW_g × thrustShare) / η_g/W   then ÷ ESC efficiency
 *   P_avg = P_prop × flightStyle + avionics
 *   E_usable = Ah × V_nom × usableFraction
 *   t = E_usable / P_avg
 *
 * η_g/W must come from the motor+prop thrust table near the operating thrust,
 * not from peak thrust. Numbers are labeled estimate / user assumption — DropSim
 * does not invent manufacturer ratings.
 */

export type FlightStyleId = 'hover' | 'cruise' | 'cinematic' | 'aggressive'

export interface MassLineItem {
  id: string
  label: string
  /** Mass of one unit, kg. */
  weightKg: number
  /** How many of this item are installed. */
  quantity: number
  /** When false, excluded from AUW (useful for what-if mass cuts). */
  included: boolean
}

export interface MotorSpec {
  /** Identical cruise motors on the mother drone (typically 2–3). */
  count: number
  /** Mass of one motor, kg. */
  weightKg: number
  /** Peak static thrust of one motor+prop, grams-force. */
  maxThrustG: number
  /**
   * Thrust efficiency at the operating point, grams-force per watt.
   * Read from the datasheet row nearest hover/cruise thrust per motor.
   */
  efficiencyGPerW: number
}

export interface BatterySpec {
  /** Nameplate capacity, milliamp-hours. */
  capacityMah: number
  /** Series cell count (LiPo/Li-ion). */
  cellCount: number
  /** Nominal volts per cell (3.7 LiPo, ~3.6 Li-ion). */
  voltsPerCell: number
  /** Pack mass, kg. */
  weightKg: number
  /** Fraction of nameplate energy you actually fly (typically ~0.8). */
  usableFraction: number
}

export interface FlightTimeInput {
  items: MassLineItem[]
  motors: MotorSpec
  battery: BatterySpec
  /**
   * Fraction of weight that propulsion must produce at the estimate point.
   * 1.0 ≈ multirotor hover. Cruise on a lifting wing is often 0.15–0.40.
   */
  thrustShare: number
  /** Multiplier on propulsive power for maneuvering / wind (1 = steady). */
  flightStyle: FlightStyleId
  /** Non-propulsive draw (FC, radio, companion, lights), watts. */
  avionicsW: number
  /** ESC + wiring efficiency from battery bus to motor electrical input (0–1). */
  escEfficiency: number
}

export interface FlightTimeWhatIf {
  /** Extra (or negative) pack capacity, mAh. */
  capacityMahDelta: number
  /** Extra (or negative) pack mass, kg. */
  batteryWeightKgDelta: number
  /** Mass removed from AUW after line items, kg (positive = lighter). */
  massReductionKg: number
  /** Optional alternate cell count; null keeps baseline. */
  cellCountOverride: number | null
}

export interface FlightTimeResult {
  allUpWeightKg: number
  batteryEnergyWh: number
  usableEnergyWh: number
  thrustPerMotorG: number
  totalMaxThrustG: number
  thrustToWeight: number
  hoverThrottleEstimate: number | null
  propulsivePowerW: number
  averagePowerW: number
  averageCurrentA: number
  flightTimeMin: number
  warnings: string[]
  /** Labels for every derived number. */
  labels: Record<string, 'calculated' | 'estimate' | 'user-assumption'>
}

export interface FlightTimeComparison {
  baseline: FlightTimeResult | null
  modified: FlightTimeResult | null
  deltaFlightTimeMin: number | null
  missing: string[]
}

export const flightStyleMultipliers: Record<FlightStyleId, number> = {
  hover: 1.0,
  cruise: 1.15,
  cinematic: 1.3,
  aggressive: 1.8,
}

export const flightStyleOptions: { id: FlightStyleId; label: string; note: string }[] = [
  { id: 'hover', label: 'Steady hover', note: '1.0× propulsive power' },
  { id: 'cruise', label: 'Level cruise', note: '1.15× — mild corrections' },
  { id: 'cinematic', label: 'Cinematic', note: '1.3× — smooth repositioning' },
  { id: 'aggressive', label: 'Aggressive', note: '1.8× — climbs and punch-outs' },
]

export function createDefaultMassItems(): MassLineItem[] {
  return [
    { id: 'frame', label: 'Frame / airframe', weightKg: 0, quantity: 1, included: true },
    { id: 'avionics', label: 'Flight controller + wiring', weightKg: 0, quantity: 1, included: true },
    { id: 'radio', label: 'Radio / telemetry', weightKg: 0, quantity: 1, included: true },
    { id: 'payload', label: 'Drop payload (pre-release)', weightKg: 0, quantity: 1, included: true },
    { id: 'misc', label: 'Other (props, ESCs, fasteners)', weightKg: 0, quantity: 1, included: true },
  ]
}

export function createDefaultFlightTimeInput(): FlightTimeInput {
  return {
    items: createDefaultMassItems(),
    motors: {
      count: 3,
      weightKg: 0,
      maxThrustG: 0,
      efficiencyGPerW: 0,
    },
    battery: {
      capacityMah: 0,
      cellCount: 6,
      voltsPerCell: 3.7,
      weightKg: 0,
      usableFraction: 0.8,
    },
    thrustShare: 1,
    flightStyle: 'cruise',
    avionicsW: 0,
    escEfficiency: 0.95,
  }
}

export function createDefaultWhatIf(): FlightTimeWhatIf {
  return {
    capacityMahDelta: 0,
    batteryWeightKgDelta: 0,
    massReductionKg: 0,
    cellCountOverride: null,
  }
}

export function nominalPackVoltage(battery: Pick<BatterySpec, 'cellCount' | 'voltsPerCell'>): number {
  return battery.cellCount * battery.voltsPerCell
}

export function lineItemMassKg(item: MassLineItem): number {
  if (!item.included) return 0
  return Math.max(0, item.weightKg) * Math.max(0, item.quantity)
}

export function propulsionMassKg(motors: MotorSpec): number {
  return Math.max(0, motors.weightKg) * Math.max(0, motors.count)
}

export function allUpWeightKg(input: FlightTimeInput, extras: { batteryWeightKg?: number; massReductionKg?: number } = {}): number {
  const items = input.items.reduce((sum, item) => sum + lineItemMassKg(item), 0)
  const motors = propulsionMassKg(input.motors)
  const battery = extras.batteryWeightKg ?? Math.max(0, input.battery.weightKg)
  const reduction = Math.max(0, extras.massReductionKg ?? 0)
  return Math.max(0, items + motors + battery - reduction)
}

function collectMissing(input: FlightTimeInput): string[] {
  const missing: string[] = []
  if (!(input.motors.count >= 2)) missing.push('Motor count (use 2–3 cruise motors, or more if that is the build)')
  if (!(input.motors.weightKg > 0)) missing.push('Motor mass')
  if (!(input.motors.maxThrustG > 0)) missing.push('Motor max thrust (g)')
  if (!(input.motors.efficiencyGPerW > 0)) missing.push('Motor efficiency at the operating thrust (g/W)')
  if (!(input.battery.capacityMah > 0)) missing.push('Battery capacity (mAh)')
  if (!(input.battery.cellCount > 0)) missing.push('Battery cell count')
  if (!(input.battery.voltsPerCell > 0)) missing.push('Volts per cell')
  if (!(input.battery.weightKg > 0)) missing.push('Battery mass')
  if (!(input.battery.usableFraction > 0 && input.battery.usableFraction <= 1)) missing.push('Usable capacity fraction (0–1)')
  if (!(input.thrustShare > 0)) missing.push('Thrust share of weight')
  if (!(input.escEfficiency > 0 && input.escEfficiency <= 1)) missing.push('ESC efficiency (0–1)')
  const auw = allUpWeightKg(input)
  if (!(auw > 0)) missing.push('All-up weight (add component masses)')
  return missing
}

export function estimateFlightTime(
  input: FlightTimeInput,
  extras: { battery?: Partial<BatterySpec>; massReductionKg?: number } = {},
): { result: FlightTimeResult | null; missing: string[] } {
  const battery: BatterySpec = {
    ...input.battery,
    ...extras.battery,
    capacityMah: extras.battery?.capacityMah ?? input.battery.capacityMah,
    cellCount: extras.battery?.cellCount ?? input.battery.cellCount,
    voltsPerCell: extras.battery?.voltsPerCell ?? input.battery.voltsPerCell,
    weightKg: extras.battery?.weightKg ?? input.battery.weightKg,
    usableFraction: extras.battery?.usableFraction ?? input.battery.usableFraction,
  }
  const working: FlightTimeInput = { ...input, battery }
  const missing = collectMissing(working)
  if (extras.massReductionKg !== undefined && extras.massReductionKg < 0) {
    missing.push('Mass reduction must be ≥ 0')
  }
  if (missing.length) return { result: null, missing }

  const auwKg = allUpWeightKg(working, {
    batteryWeightKg: battery.weightKg,
    massReductionKg: extras.massReductionKg,
  })
  const auwG = auwKg * 1000
  const motorCount = working.motors.count
  const thrustShare = working.thrustShare
  const thrustPerMotorG = (auwG * thrustShare) / motorCount
  const totalMaxThrustG = working.motors.maxThrustG * motorCount
  const thrustToWeight = totalMaxThrustG / auwG
  const hoverThrottleEstimate = thrustToWeight > 0 ? Math.sqrt(1 / thrustToWeight) : null

  const warnings: string[] = []
  if (thrustToWeight < 1.5) {
    warnings.push('Thrust-to-weight is under 1.5 — climb and wind margin look thin for a multirotor.')
  }
  if (thrustPerMotorG > working.motors.maxThrustG) {
    warnings.push('Required thrust per motor exceeds max thrust — the pack estimate is not flyable at this weight.')
  }
  if (working.motors.efficiencyGPerW < 3 || working.motors.efficiencyGPerW > 20) {
    warnings.push('Efficiency outside ~3–20 g/W is unusual; confirm the datasheet row at this thrust, not peak.')
  }
  if (motorCount < 2 || motorCount > 3) {
    warnings.push('This form is aimed at 2–3 cruise motors; other counts still use the same energy math.')
  }
  if (thrustShare < 1 && working.flightStyle === 'hover') {
    warnings.push('Thrust share < 1 with “hover” style usually means a wing is carrying lift — check the profile.')
  }

  const rawPropW = (auwG * thrustShare) / working.motors.efficiencyGPerW
  const propulsivePowerW = rawPropW / working.escEfficiency
  const style = flightStyleMultipliers[working.flightStyle]
  const averagePowerW = propulsivePowerW * style + Math.max(0, working.avionicsW)
  const vNom = nominalPackVoltage(battery)
  const batteryEnergyWh = (battery.capacityMah / 1000) * vNom
  const usableEnergyWh = batteryEnergyWh * battery.usableFraction
  const flightTimeMin = averagePowerW > 0 ? (usableEnergyWh / averagePowerW) * 60 : 0
  const averageCurrentA = vNom > 0 ? averagePowerW / vNom : 0

  return {
    result: {
      allUpWeightKg: auwKg,
      batteryEnergyWh,
      usableEnergyWh,
      thrustPerMotorG,
      totalMaxThrustG,
      thrustToWeight,
      hoverThrottleEstimate,
      propulsivePowerW,
      averagePowerW,
      averageCurrentA,
      flightTimeMin,
      warnings,
      labels: {
        allUpWeightKg: 'calculated',
        batteryEnergyWh: 'calculated',
        usableEnergyWh: 'calculated',
        thrustPerMotorG: 'calculated',
        totalMaxThrustG: 'calculated',
        thrustToWeight: 'calculated',
        hoverThrottleEstimate: 'estimate',
        propulsivePowerW: 'estimate',
        averagePowerW: 'estimate',
        averageCurrentA: 'estimate',
        flightTimeMin: 'estimate',
      },
    },
    missing: [],
  }
}

export function applyWhatIf(input: FlightTimeInput, whatIf: FlightTimeWhatIf): FlightTimeComparison {
  const baseline = estimateFlightTime(input)
  const capacityMah = Math.max(0, input.battery.capacityMah + whatIf.capacityMahDelta)
  const batteryWeightKg = Math.max(0, input.battery.weightKg + whatIf.batteryWeightKgDelta)
  const cellCount = whatIf.cellCountOverride ?? input.battery.cellCount
  const modified = estimateFlightTime(input, {
    battery: { capacityMah, weightKg: batteryWeightKg, cellCount },
    massReductionKg: whatIf.massReductionKg,
  })
  const missing = [...new Set([...baseline.missing, ...modified.missing])]
  const delta =
    baseline.result && modified.result
      ? modified.result.flightTimeMin - baseline.result.flightTimeMin
      : null
  return {
    baseline: baseline.result,
    modified: modified.result,
    deltaFlightTimeMin: delta,
    missing,
  }
}

/** Pull catalog weight into a mass line when the catalog entry has a known mass. */
export function weightFromCatalog(weightKg: number | null | undefined): number | null {
  if (weightKg === null || weightKg === undefined) return null
  if (!Number.isFinite(weightKg) || weightKg < 0) return null
  return weightKg
}
