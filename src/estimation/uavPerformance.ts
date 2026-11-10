/**
 * Fixed-wing UAV performance estimate.
 *
 * One pure function turns the whole configuration into geometry, aero,
 * propulsion, takeoff, battery, and mission results. The UI does not
 * recalculate anything itself.
 *
 * Manufacturer figures stay labeled as published data. CD0, CLmax, Oswald
 * efficiency, and propeller efficiency are assumptions until the user
 * replaces them with analysis or a test. Diameter and pitch never become
 * a thrust number.
 */

export const GRAVITY = 9.80665

export type Provenance = 'manufacturer' | 'measured' | 'interpolated' | 'estimate' | 'unknown'

export interface Sourced<T> {
  value: T | null
  source: Provenance
  note: string
}

export type PhaseMode = 'measured' | 'estimated' | 'aerodynamic' | 'climb' | 'interpolated'

export interface MotorTestPoint {
  id: string
  voltageV: number | null
  currentA: number | null
  powerW: number | null
  rpm: number | null
  thrustN: number | null
  throttlePercent: number | null
  temperatureC: number | null
}

export interface ThrustSpeedPoint {
  id: string
  airspeedMs: number
  thrustN: number
}

export interface MissionPhase {
  id: string
  name: string
  durationMin: number
  mode: PhaseMode
  /** Used when mode is measured or estimated. */
  currentA: number | null
  speedKmh: number | null
}

export interface UavInputs {
  mtowKg: number
  wingspanM: number
  averageChordM: number
  wingAreaMode: 'rectangular' | 'entered'
  wingAreaM2: number
  airDensity: number
  clMax: number
  cd0: number
  oswaldEfficiency: number
  propellerEfficiency: number
  electricalEfficiency: number
  climbRateMps: number
  climbSpeedKmh: number
  cruiseSpeedKmh: number
  takeoffSpeedMultiplier: number
  motorName: string
  motorWeightG: number
  motorKv: number
  maxCurrentA: number
  maxCurrentDurationS: number
  maxPowerW: number
  maxPowerDurationS: number
  propellerName: string
  propDiameterIn: number
  propPitchIn: number
  staticThrustN: number | null
  motorTests: MotorTestPoint[]
  thrustCurve: ThrustSpeedPoint[]
  escName: string
  escCurrentRatingA: number | null
  flightControllerName: string
  batteryName: string
  cellCount: number
  nominalVoltageV: number
  fullVoltageV: number
  capacityAh: number
  usablePercent: number
  reservePercent: number
  internalResistanceOhm: number | null
  lowVoltageV: number
  rollingResistance: number
  runwaySlopeDeg: number
  headwindMs: number
  targetDurationMin: number
  phases: MissionPhase[]
}

export interface WarningItem {
  code:
    | 'input'
    | 'stall'
    | 'near-stall'
    | 'motor-current'
    | 'motor-power'
    | 'motor-duration'
    | 'esc'
    | 'esc-unknown'
    | 'battery'
    | 'reserve'
    | 'voltage'
    | 'climb-power'
    | 'prop-missing'
    | 'takeoff'
    | 'phase-current'
    | 'mission-incomplete'
    | 'duration-target'
  tone: 'yellow' | 'red'
  message: string
}

export interface ResolvedPhase {
  id: string
  name: string
  durationMin: number
  mode: PhaseMode
  currentA: Sourced<number>
  powerW: Sourced<number>
  ampHours: Sourced<number>
  wattHours: Sourced<number>
}

export interface PerformanceResults {
  inputErrors: string[]
  geometry: {
    wingAreaM2: Sourced<number>
    aspectRatio: Sourced<number>
    weightN: Sourced<number>
    wingLoadingNpm2: Sourced<number>
    wingLoadingKgM2: Sourced<number>
  }
  stallSpeedMs: Sourced<number>
  stallSpeedKmh: Sourced<number>
  takeoffSpeedMs: Sourced<number>
  takeoffSpeedKmh: Sourced<number>
  cruise: AeroPoint
  climb: AeroPoint
  cruiseCurrent: Sourced<number>
  staticThrustN: Sourced<number>
  thrustToWeight: Sourced<number>
  takeoffDistanceM: Sourced<number>
  preliminaryTakeoffDistanceM: Sourced<number>
  battery: {
    nominalEnergyWh: Sourced<number>
    usableAh: Sourced<number>
    usableEnergyWh: Sourced<number>
    reserveAh: Sourced<number>
    availableAfterReserveAh: Sourced<number>
    totalAh: Sourced<number>
    totalWh: Sourced<number>
    remainingAh: Sourced<number>
    remainingPercent: Sourced<number>
    loadedVoltageV: Sourced<number>
    maxCruiseMin: Sourced<number>
    additionalCruiseMin: Sourced<number>
    missionFits: boolean | null
    tone: 'green' | 'yellow' | 'red'
    toneLabel: string
  }
  missionDurationMin: number
  phases: ResolvedPhase[]
  warnings: WarningItem[]
  speedSweep: { speedKmh: number; electricalPowerW: number | null }[]
  lowestPowerSpeedKmh: number | null
  maxSpeedWithinPowerKmh: number | null
  weightSweep: WeightPoint[]
  timeProfile: TimePoint[]
  usableRemainingPercent: number | null
  reserveRemainingPercent: number | null
}

export interface AeroPoint {
  speedMs: number | null
  dynamicPressurePa: Sourced<number>
  liftCoefficient: Sourced<number>
  inducedDragCoefficient: Sourced<number>
  dragCoefficient: Sourced<number>
  dragN: Sourced<number>
  aeroPowerW: Sourced<number>
  electricalPowerW: Sourced<number>
  currentA: Sourced<number>
}

export interface WeightPoint {
  mtowKg: number
  stallSpeedKmh: number | null
  cruisePowerW: number | null
  climbCurrentA: number | null
  wingLoadingKgM2: number | null
  enduranceMin: number | null
}

export interface TimePoint {
  tMin: number
  currentA: number | null
  powerW: number | null
  remainingPercent: number | null
  phase: string
}

const AERO_NOTE = 'Engineering estimate. CD0, CLmax, and Oswald efficiency are assumptions until analysis or a flight test replaces them.'
const POWER_NOTE = 'Electrical power is aerodynamic power divided by the assumed propeller and electrical efficiencies.'
const RECT_NOTE = 'Calculated as wingspan × average chord. That is a rectangular-equivalent area.'
const ENTERED_AREA_NOTE = 'Using the wing area you entered as the authoritative value.'

export function kmhToMs(kmh: number): number {
  return kmh / 3.6
}

export function msToKmh(ms: number): number {
  return ms * 3.6
}

export function sourced(value: number | null, source: Provenance, note: string): Sourced<number> {
  if (value === null || !Number.isFinite(value)) {
    return { value: null, source: 'unknown', note }
  }
  return { value, source, note }
}

export function provenanceLabel(source: Provenance): string {
  switch (source) {
    case 'manufacturer':
      return 'Manufacturer specification'
    case 'measured':
      return 'User measurement'
    case 'interpolated':
      return 'Interpolated'
    case 'estimate':
      return 'Engineering estimate'
    default:
      return 'Unknown'
  }
}

export function createDefaultUavInputs(): UavInputs {
  return {
    mtowKg: 4,
    wingspanM: 2,
    averageChordM: 0.25,
    wingAreaMode: 'rectangular',
    wingAreaM2: 0.5,
    airDensity: 1.225,
    clMax: 1.4,
    cd0: 0.035,
    oswaldEfficiency: 0.8,
    propellerEfficiency: 0.7,
    electricalEfficiency: 0.9,
    climbRateMps: 3,
    climbSpeedKmh: 90,
    cruiseSpeedKmh: 90,
    takeoffSpeedMultiplier: 1.2,
    motorName: 'T-MOTOR MN4120 KV465',
    motorWeightG: 253,
    motorKv: 465,
    maxCurrentA: 50,
    maxCurrentDurationS: 180,
    maxPowerW: 1200,
    maxPowerDurationS: 180,
    propellerName: 'Turnigy Multirotor Carbon Fiber 15×5.5',
    propDiameterIn: 15,
    propPitchIn: 5.5,
    staticThrustN: null,
    motorTests: [],
    thrustCurve: [],
    escName: 'T-MOTOR AT75A',
    escCurrentRatingA: null,
    flightControllerName: 'CUAV X7+',
    batteryName: 'Zeee 6S LiPo',
    cellCount: 6,
    nominalVoltageV: 22.2,
    fullVoltageV: 25.2,
    capacityAh: 6,
    usablePercent: 80,
    reservePercent: 20,
    internalResistanceOhm: null,
    lowVoltageV: 21,
    rollingResistance: 0.025,
    runwaySlopeDeg: 0,
    headwindMs: 0,
    targetDurationMin: 30,
    phases: [
      { id: 'takeoff', name: 'Runway takeoff', durationMin: 0.5, mode: 'estimated', currentA: null, speedKmh: null },
      { id: 'climb', name: 'Initial climb', durationMin: 2, mode: 'climb', currentA: null, speedKmh: 90 },
      { id: 'cruise', name: 'Cruise', durationMin: 24.5, mode: 'aerodynamic', currentA: null, speedKmh: 90 },
      { id: 'descent', name: 'Descent', durationMin: 1.5, mode: 'estimated', currentA: null, speedKmh: null },
      { id: 'approach', name: 'Approach', durationMin: 1, mode: 'estimated', currentA: null, speedKmh: null },
      { id: 'landing', name: 'Landing', durationMin: 0.5, mode: 'estimated', currentA: null, speedKmh: null },
    ],
  }
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function wingAreaM2(input: Pick<UavInputs, 'wingAreaMode' | 'wingAreaM2' | 'wingspanM' | 'averageChordM'>): Sourced<number> {
  if (input.wingAreaMode === 'entered') {
    const area = finiteNumber(input.wingAreaM2)
    if (area === null || area <= 0) return sourced(null, 'unknown', 'Enter a wing area greater than zero.')
    return sourced(area, 'measured', ENTERED_AREA_NOTE)
  }
  if (!(input.wingspanM > 0) || !(input.averageChordM > 0)) {
    return sourced(null, 'unknown', 'Wingspan and average chord must be greater than zero.')
  }
  return sourced(input.wingspanM * input.averageChordM, 'estimate', RECT_NOTE)
}

interface Polar {
  wingArea: number
  aspectRatio: number
  weightN: number
  inputErrors: string[]
}

function collectInputErrors(input: UavInputs): string[] {
  const errors: string[] = []
  if (!(input.mtowKg > 0)) errors.push('MTOW must be greater than zero.')
  if (!(input.wingspanM > 0)) errors.push('Wingspan must be greater than zero.')
  if (input.wingAreaMode === 'rectangular' && !(input.averageChordM > 0)) errors.push('Average chord must be greater than zero.')
  if (input.wingAreaMode === 'entered' && !(input.wingAreaM2 > 0)) errors.push('Entered wing area must be greater than zero.')
  if (!(input.airDensity > 0)) errors.push('Air density must be positive.')
  if (!(input.clMax > 0)) errors.push('Maximum lift coefficient must be positive.')
  if (!(input.cd0 >= 0)) errors.push('Zero-lift drag coefficient cannot be negative.')
  if (!(input.oswaldEfficiency > 0 && input.oswaldEfficiency <= 1)) errors.push('Oswald efficiency must be greater than 0 and no more than 1.')
  if (!(input.propellerEfficiency > 0 && input.propellerEfficiency <= 1)) errors.push('Propeller efficiency must be greater than 0 and no more than 1.')
  if (!(input.electricalEfficiency > 0 && input.electricalEfficiency <= 1)) errors.push('Electrical efficiency must be greater than 0 and no more than 1.')
  if (!(input.capacityAh > 0)) errors.push('Battery capacity must be positive.')
  if (!(input.nominalVoltageV > 0)) errors.push('Nominal battery voltage must be positive.')
  if (!(input.usablePercent >= 0 && input.usablePercent <= 100)) errors.push('Usable capacity must be from 0 to 100 percent.')
  if (!(input.reservePercent >= 0 && input.reservePercent <= 100)) errors.push('Reserve must be from 0 to 100 percent.')
  if (input.reservePercent > input.usablePercent) errors.push('Battery reserve must not exceed usable capacity.')
  if (input.internalResistanceOhm !== null && input.internalResistanceOhm < 0) errors.push('Internal resistance cannot be negative.')
  if (!(input.takeoffSpeedMultiplier > 0)) errors.push('Takeoff-speed multiplier must be positive.')
  for (const phase of input.phases) {
    if (!(phase.durationMin >= 0)) errors.push(`${phase.name || 'A phase'} duration cannot be negative.`)
    if (phase.currentA !== null && phase.currentA < 0) errors.push(`${phase.name || 'A phase'} current cannot be negative.`)
  }
  return errors
}

function emptyAero(): AeroPoint {
  const blank = sourced(null, 'unknown', 'Not enough valid inputs.')
  return {
    speedMs: null,
    dynamicPressurePa: blank,
    liftCoefficient: blank,
    inducedDragCoefficient: blank,
    dragCoefficient: blank,
    dragN: blank,
    aeroPowerW: blank,
    electricalPowerW: blank,
    currentA: blank,
  }
}

function aeroAt(input: UavInputs, polar: Polar, speedMs: number, kind: 'cruise' | 'climb'): AeroPoint {
  const q = 0.5 * input.airDensity * speedMs * speedMs
  const cl = q > 0 ? polar.weightN / (q * polar.wingArea) : Number.POSITIVE_INFINITY
  const cdi = (cl * cl) / (Math.PI * input.oswaldEfficiency * polar.aspectRatio)
  const cd = input.cd0 + cdi
  const drag = q * polar.wingArea * cd
  const aeroPower = kind === 'climb' ? polar.weightN * input.climbRateMps + drag * speedMs : drag * speedMs
  const electrical = aeroPower / (input.propellerEfficiency * input.electricalEfficiency)
  const current = input.nominalVoltageV > 0 ? electrical / input.nominalVoltageV : Number.NaN
  const dragNote = kind === 'climb'
    ? 'Climb aerodynamic power is weight × climb rate plus drag × speed. Drag is evaluated at the climb speed.'
    : AERO_NOTE
  return {
    speedMs,
    dynamicPressurePa: sourced(q, 'estimate', 'Dynamic pressure from the entered air density and speed.'),
    liftCoefficient: sourced(cl, 'estimate', 'Lift coefficient required for level flight at this speed. Not a measured CLmax.'),
    inducedDragCoefficient: sourced(cdi, 'estimate', 'Induced drag from the lift coefficient, Oswald efficiency, and aspect ratio.'),
    dragCoefficient: sourced(cd, 'estimate', 'CD0 plus induced drag. CD0 is an assumption.'),
    dragN: sourced(drag, 'estimate', AERO_NOTE),
    aeroPowerW: sourced(aeroPower, 'estimate', dragNote),
    electricalPowerW: sourced(electrical, 'estimate', POWER_NOTE),
    currentA: sourced(current, 'estimate', 'Aerodynamic estimate of current at nominal battery voltage. This is not a measured current.'),
  }
}

function stallSpeedMs(input: UavInputs, polar: Polar): number {
  return Math.sqrt((2 * polar.weightN) / (input.airDensity * polar.wingArea * input.clMax))
}

export function interpolateCurrentAtPower(powerW: number, tests: MotorTestPoint[]): Sourced<number> {
  const points = tests
    .map((point) => {
      const power = finiteNumber(point.powerW) ?? (
        finiteNumber(point.voltageV) !== null && finiteNumber(point.currentA) !== null
          ? (point.voltageV as number) * (point.currentA as number)
          : null
      )
      const current = finiteNumber(point.currentA)
      if (power === null || current === null) return null
      return { power, current }
    })
    .filter((point): point is { power: number; current: number } => point !== null)
    .sort((a, b) => a.power - b.power)
  if (points.length < 2) {
    return sourced(null, 'unknown', 'Interpolation needs at least two test points with power and current. Throttle is not treated as linear.')
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last || powerW < first.power || powerW > last.power) {
    return sourced(null, 'unknown', 'Cruise power is outside the measured map, so the current is not extrapolated.')
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]
    const right = points[index + 1]
    if (!left || !right || powerW > right.power) continue
    const span = right.power - left.power
    const fraction = span === 0 ? 0 : (powerW - left.power) / span
    return sourced(left.current + (right.current - left.current) * fraction, 'interpolated', 'Linear interpolation of entered test points by electrical power. Throttle percentage is not used.')
  }
  return sourced(null, 'unknown', 'The measured map did not contain this power.')
}

function cruisePhase(input: UavInputs): MissionPhase | undefined {
  return input.phases.find((phase) => phase.id === 'cruise') ?? input.phases.find((phase) => phase.mode === 'aerodynamic' || phase.mode === 'interpolated')
}

function resolveCruiseCurrent(input: UavInputs, aero: AeroPoint): Sourced<number> {
  const cruise = cruisePhase(input)
  const mode = cruise?.mode ?? 'aerodynamic'
  if (mode === 'measured') {
    if (!cruise || cruise.currentA === null) {
      return sourced(null, 'unknown', 'The cruise phase is set to measured current, and no current was entered.')
    }
    return sourced(cruise.currentA, 'measured', 'Cruise current entered from a test or a flight. The aerodynamic estimate is kept separate.')
  }
  if (mode === 'estimated') {
    if (!cruise || cruise.currentA === null) {
      return sourced(null, 'unknown', 'The cruise phase is an estimate, and no current was entered.')
    }
    return sourced(cruise.currentA, 'estimate', 'Cruise current is the number entered for this phase, not a measurement and not the aerodynamic model.')
  }
  if (mode === 'interpolated') {
    if (aero.electricalPowerW.value === null) return sourced(null, 'unknown', 'Interpolation needs an aerodynamic power estimate.')
    return interpolateCurrentAtPower(aero.electricalPowerW.value, input.motorTests)
  }
  return aero.currentA
}

function thrustAtAirspeed(input: UavInputs, airspeedMs: number): Sourced<number> {
  const curve = input.thrustCurve
    .filter((point) => Number.isFinite(point.airspeedMs) && Number.isFinite(point.thrustN))
    .slice()
    .sort((a, b) => a.airspeedMs - b.airspeedMs)
  if (curve.length >= 2) {
    const first = curve[0]
    const last = curve[curve.length - 1]
    if (!first || !last) return sourced(null, 'unknown', 'Thrust curve is empty.')
    if (airspeedMs <= first.airspeedMs) return sourced(first.thrustN, 'measured', 'Thrust is the first entered point. It is not extrapolated below that speed.')
    if (airspeedMs >= last.airspeedMs) return sourced(last.thrustN, 'measured', 'Thrust is the last entered point. It is not extrapolated above that speed.')
    for (let index = 0; index < curve.length - 1; index += 1) {
      const left = curve[index]
      const right = curve[index + 1]
      if (!left || !right || airspeedMs > right.airspeedMs) continue
      const span = right.airspeedMs - left.airspeedMs
      const fraction = span === 0 ? 0 : (airspeedMs - left.airspeedMs) / span
      return sourced(left.thrustN + (right.thrustN - left.thrustN) * fraction, 'interpolated', 'Thrust is interpolated from the entered thrust-versus-airspeed points.')
    }
  }
  if (input.staticThrustN !== null && input.staticThrustN > 0) {
    return sourced(input.staticThrustN, 'estimate', 'Thrust is held at the entered static value for the whole run. That is a low-confidence assumption, not a thrust curve.')
  }
  return sourced(null, 'unknown', 'No static thrust and no thrust-versus-airspeed points. Diameter and pitch are not converted into thrust.')
}

export function dragAt(input: UavInputs, polar: Polar, airspeedMs: number): number {
  const q = 0.5 * input.airDensity * airspeedMs * airspeedMs
  const clRequired = q > 0 ? polar.weightN / (q * polar.wingArea) : input.clMax
  const cl = Math.min(input.clMax, Math.max(0, clRequired))
  const cdi = (cl * cl) / (Math.PI * input.oswaldEfficiency * polar.aspectRatio)
  return q * polar.wingArea * (input.cd0 + cdi)
}

export interface TakeoffIntegration {
  distanceM: number | null
  timeS: number | null
  reason: string
}

/** Numerical ground roll. Headwind is added to ground speed to get airspeed. */
export function integrateTakeoff(input: UavInputs, polar: Polar, targetAirspeedMs: number): TakeoffIntegration {
  if (input.headwindMs >= targetAirspeedMs) {
    return { distanceM: 0, timeS: 0, reason: 'The entered headwind is already at the takeoff airspeed, so the ground roll is zero in this model.' }
  }
  const slope = (input.runwaySlopeDeg * Math.PI) / 180
  let groundSpeed = 0
  let distance = 0
  const dt = 0.02
  const limit = 120
  for (let elapsed = 0; elapsed < limit; elapsed += dt) {
    const airspeed = groundSpeed + input.headwindMs
    if (airspeed >= targetAirspeedMs) {
      return { distanceM: distance, timeS: elapsed, reason: 'Integrated until the takeoff airspeed.' }
    }
    const thrust = thrustAtAirspeed(input, airspeed)
    if (thrust.value === null) {
      return { distanceM: null, timeS: null, reason: thrust.note }
    }
    const drag = dragAt(input, polar, Math.max(0, airspeed))
    const q = 0.5 * input.airDensity * airspeed * airspeed
    const cl = Math.min(input.clMax, q > 0 ? polar.weightN / (q * polar.wingArea) : input.clMax)
    const lift = q * polar.wingArea * cl
    const normal = Math.max(0, polar.weightN * Math.cos(slope) - lift)
    const rolling = input.rollingResistance * normal
    const grade = polar.weightN * Math.sin(slope)
    const acceleration = (thrust.value - drag - rolling - grade) / (polar.weightN / GRAVITY)
    groundSpeed = Math.max(0, groundSpeed + acceleration * dt)
    distance += groundSpeed * dt
    if (elapsed > 1 && groundSpeed < 0.05 && acceleration <= 0) {
      return { distanceM: null, timeS: null, reason: 'Thrust does not overcome drag and rolling resistance, so the model never reaches takeoff speed.' }
    }
  }
  return { distanceM: null, timeS: null, reason: 'The ground roll did not reach takeoff speed within 120 seconds.' }
}

function preliminaryTakeoff(input: UavInputs, polar: Polar, liftoffGroundMs: number): Sourced<number> {
  if (input.staticThrustN === null || !(input.staticThrustN > 0)) {
    return sourced(null, 'unknown', 'The constant-acceleration preview needs an entered static thrust, and it still would not be a thrust curve.')
  }
  const mid = liftoffGroundMs * 0.7
  const drag = dragAt(input, polar, mid + Math.max(0, input.headwindMs))
  const rolling = input.rollingResistance * polar.weightN
  const acceleration = (input.staticThrustN - drag - rolling) / (polar.weightN / GRAVITY)
  if (!(acceleration > 0) || !(liftoffGroundMs > 0)) {
    return sourced(null, 'unknown', 'The constant-acceleration preview does not produce a positive acceleration.')
  }
  const distance = (liftoffGroundMs * liftoffGroundMs) / (2 * acceleration)
  return sourced(distance, 'estimate', 'Preliminary estimate only. Thrust is held at the entered static value and drag is taken at 70% of liftoff ground speed.')
}

function resolvePhase(input: UavInputs, phase: MissionPhase, cruise: AeroPoint, climb: AeroPoint): ResolvedPhase {
  let current: Sourced<number>
  if (phase.mode === 'measured') {
    current = phase.currentA === null
      ? sourced(null, 'unknown', 'Measured current was not entered for this phase.')
      : sourced(phase.currentA, 'measured', 'Current entered for this phase.')
  } else if (phase.mode === 'estimated') {
    current = phase.currentA === null
      ? sourced(null, 'unknown', 'An estimated current was not entered for this phase, so it is left out of the energy sum.')
      : sourced(phase.currentA, 'estimate', 'Current entered as an estimate for this phase. It is not a measurement.')
  } else if (phase.mode === 'climb') {
    current = { ...climb.currentA, note: 'Climb current from weight × climb rate plus drag, divided by the efficiency assumptions and nominal voltage.' }
  } else if (phase.mode === 'interpolated') {
    current = cruise.electricalPowerW.value === null
      ? sourced(null, 'unknown', 'Interpolation needs an aerodynamic power estimate.')
      : interpolateCurrentAtPower(cruise.electricalPowerW.value, input.motorTests)
  } else if (phase.mode === 'aerodynamic') {
    current = { ...cruise.currentA, note: 'Cruise current from the aerodynamic power model at nominal voltage.' }
  } else {
    current = sourced(null, 'unknown', 'This phase has no current source.')
  }
  const ampHours = current.value === null || !(phase.durationMin >= 0)
    ? sourced(null, 'unknown', current.note)
    : sourced(current.value * phase.durationMin / 60, current.source, 'Amp-hours are current × minutes / 60.')
  const wattHours = current.value === null || !(phase.durationMin >= 0) || !(input.nominalVoltageV > 0)
    ? sourced(null, 'unknown', 'Watt-hours need a current and a nominal voltage.')
    : sourced(current.value * input.nominalVoltageV * phase.durationMin / 60, current.source, 'Watt-hours use nominal voltage, not a measured loaded voltage.')
  const power = current.value === null
    ? sourced(null, 'unknown', current.note)
    : sourced(current.value * input.nominalVoltageV, current.source, 'Phase power is phase current × nominal voltage.')
  return {
    id: phase.id,
    name: phase.name,
    durationMin: phase.durationMin,
    mode: phase.mode,
    currentA: current,
    powerW: power,
    ampHours,
    wattHours,
  }
}

interface Core {
  inputErrors: string[]
  geometry: PerformanceResults['geometry']
  stallSpeedMs: Sourced<number>
  stallSpeedKmh: Sourced<number>
  takeoffSpeedMs: Sourced<number>
  takeoffSpeedKmh: Sourced<number>
  cruise: AeroPoint
  climb: AeroPoint
  cruiseCurrent: Sourced<number>
  staticThrustN: Sourced<number>
  thrustToWeight: Sourced<number>
  takeoffDistanceM: Sourced<number>
  preliminaryTakeoffDistanceM: Sourced<number>
  phases: ResolvedPhase[]
  missionDurationMin: number
}

function computeCore(input: UavInputs, mtowKg = input.mtowKg): Core {
  const inputErrors = mtowKg === input.mtowKg ? collectInputErrors(input) : []
  const area = wingAreaM2(input)
  const polar = area.value !== null && input.wingspanM > 0 && mtowKg > 0 && input.airDensity > 0 && input.clMax > 0 && input.oswaldEfficiency > 0
    ? { wingArea: area.value, aspectRatio: (input.wingspanM * input.wingspanM) / area.value, weightN: mtowKg * GRAVITY, inputErrors }
    : null
  const geometry = {
    wingAreaM2: area,
    aspectRatio: polar ? sourced(polar.aspectRatio, area.source, 'Aspect ratio is wingspan squared divided by wing area.') : sourced(null, 'unknown', 'Aspect ratio needs a wingspan and a wing area.'),
    weightN: mtowKg > 0 ? sourced(mtowKg * GRAVITY, 'estimate', 'Weight is MTOW × 9.80665. Battery mass is not added again.') : sourced(null, 'unknown', 'MTOW must be greater than zero.'),
    wingLoadingNpm2: polar ? sourced(polar.weightN / polar.wingArea, 'estimate', 'Wing loading in newtons per square metre.') : sourced(null, 'unknown', 'Wing loading needs weight and area.'),
    wingLoadingKgM2: polar ? sourced(mtowKg / polar.wingArea, 'estimate', 'Wing loading in kilograms per square metre.') : sourced(null, 'unknown', 'Wing loading needs weight and area.'),
  }
  const stallMs = polar && inputErrors.length === 0 ? stallSpeedMs(input, polar) : null
  const stall = sourced(stallMs, 'estimate', 'Stall speed uses the assumed CLmax. It stays an estimate until CLmax is validated.')
  const takeoffMs = stallMs === null ? null : stallMs * input.takeoffSpeedMultiplier
  const cruise = polar && input.cruiseSpeedKmh > 0 && inputErrors.length === 0
    ? aeroAt(input, polar, kmhToMs(input.cruiseSpeedKmh), 'cruise')
    : emptyAero()
  const climb = polar && input.climbSpeedKmh > 0 && inputErrors.length === 0
    ? aeroAt(input, polar, kmhToMs(input.climbSpeedKmh), 'climb')
    : emptyAero()
  const cruiseCurrent = inputErrors.length === 0 ? resolveCruiseCurrent(input, cruise) : sourced(null, 'unknown', 'Cruise current waits for valid inputs.')
  const staticThrust = input.staticThrustN !== null && input.staticThrustN > 0
    ? sourced(input.staticThrustN, 'measured', 'Static thrust you entered. The motor bench sheet is for T-MOTOR propellers, not automatically this propeller.')
    : sourced(null, 'unknown', 'Static thrust is empty. It is not inferred from diameter or pitch.')
  const thrustToWeight = staticThrust.value !== null && mtowKg > 0
    ? sourced(staticThrust.value / (mtowKg * GRAVITY), staticThrust.source, 'Entered static thrust divided by weight.')
    : sourced(null, 'unknown', 'Thrust-to-weight needs an entered static thrust.')
  let takeoffDistance = sourced(null, 'unknown', 'Runway distance needs a takeoff speed and a thrust model.')
  let preliminary = sourced(null, 'unknown', 'No preliminary takeoff distance.')
  if (polar && takeoffMs !== null && inputErrors.length === 0) {
    const integrated = integrateTakeoff(input, polar, takeoffMs)
    const heldConstant = input.thrustCurve.filter((point) => Number.isFinite(point.thrustN)).length < 2 && input.staticThrustN !== null
    const staticHold = heldConstant && integrated.distanceM !== null
      ? ' Thrust is held at the entered static value for the whole run, so this distance is a low-confidence estimate.'
      : ''
    takeoffDistance = sourced(
      integrated.distanceM,
      integrated.distanceM === null ? 'unknown' : heldConstant ? 'estimate' : 'interpolated',
      `${integrated.reason}${staticHold}`,
    )
    const groundLiftoff = Math.max(0, takeoffMs - input.headwindMs)
    preliminary = preliminaryTakeoff(input, polar, groundLiftoff)
  }
  const phases = input.phases.map((phase) => resolvePhase(input, phase, cruise, climb))
  const missionDurationMin = input.phases.reduce((sum, phase) => sum + (phase.durationMin > 0 ? phase.durationMin : 0), 0)
  return {
    inputErrors,
    geometry,
    stallSpeedMs: stall,
    stallSpeedKmh: sourced(stallMs === null ? null : msToKmh(stallMs), 'estimate', stall.note),
    takeoffSpeedMs: sourced(takeoffMs, 'estimate', `Takeoff reference speed is ${input.takeoffSpeedMultiplier} × stall speed.`),
    takeoffSpeedKmh: sourced(takeoffMs === null ? null : msToKmh(takeoffMs), 'estimate', `Takeoff reference speed is ${input.takeoffSpeedMultiplier} × stall speed.`),
    cruise,
    climb,
    cruiseCurrent,
    staticThrustN: staticThrust,
    thrustToWeight,
    takeoffDistanceM: takeoffDistance,
    preliminaryTakeoffDistanceM: preliminary,
    phases,
    missionDurationMin,
  }
}

function sumKnown(values: Sourced<number>[]): Sourced<number> {
  if (values.some((item) => item.value === null)) {
    return sourced(null, 'unknown', 'The sum is withheld because at least one phase current is unknown.')
  }
  const total = values.reduce((sum, item) => sum + (item.value ?? 0), 0)
  const source = values.every((item) => item.source === 'measured')
    ? 'measured'
    : values.some((item) => item.source === 'interpolated')
      ? 'interpolated'
      : 'estimate'
  return sourced(total, source, 'Sum of the phase values.')
}

function buildProfile(input: UavInputs, phases: ResolvedPhase[], capacityAh: number | null): TimePoint[] {
  const points: TimePoint[] = []
  let time = 0
  let usedAh = 0
  for (const phase of phases) {
    const current = phase.currentA.value
    const duration = Math.max(0, phase.durationMin)
    const startRemaining = current === null || !(capacityAh && capacityAh > 0) ? null : (1 - usedAh / capacityAh) * 100
    points.push({
      tMin: time,
      currentA: current,
      powerW: current === null ? null : current * input.nominalVoltageV,
      remainingPercent: startRemaining,
      phase: phase.name,
    })
    if (current !== null && duration > 0) usedAh += current * duration / 60
    time += duration
    const endRemaining = current === null || !(capacityAh && capacityAh > 0) ? null : (1 - usedAh / capacityAh) * 100
    points.push({
      tMin: time,
      currentA: current,
      powerW: current === null ? null : current * input.nominalVoltageV,
      remainingPercent: endRemaining,
      phase: phase.name,
    })
  }
  return points
}

function speedSweep(input: UavInputs, polar: Polar, stallKmh: number): { speedKmh: number; electricalPowerW: number | null }[] {
  const rows: { speedKmh: number; electricalPowerW: number | null }[] = []
  for (let speed = 30; speed <= 220; speed += 2) {
    if (speed <= stallKmh) {
      rows.push({ speedKmh: speed, electricalPowerW: null })
      continue
    }
    const point = aeroAt(input, polar, kmhToMs(speed), 'cruise')
    rows.push({ speedKmh: speed, electricalPowerW: point.electricalPowerW.value })
  }
  return rows
}

export function calculateAircraftPerformance(input: UavInputs): PerformanceResults {
  const core = computeCore(input)
  const warnings: WarningItem[] = core.inputErrors.map((message) => ({ code: 'input', tone: 'red', message }))
  const area = core.geometry.wingAreaM2.value
  const polar = area !== null && input.wingspanM > 0 && input.mtowKg > 0
    ? { wingArea: area, aspectRatio: (input.wingspanM * input.wingspanM) / area, weightN: input.mtowKg * GRAVITY, inputErrors: core.inputErrors }
    : null

  if (core.stallSpeedKmh.value !== null && input.cruiseSpeedKmh <= core.stallSpeedKmh.value) {
    warnings.push({ code: 'stall', tone: 'red', message: 'Requested cruise speed is at or below the estimated stall speed.' })
  } else if (core.stallSpeedKmh.value !== null && input.cruiseSpeedKmh < core.stallSpeedKmh.value * 1.3) {
    warnings.push({ code: 'near-stall', tone: 'yellow', message: 'Requested cruise speed is less than 1.3 × the estimated stall speed. CLmax is still an assumption.' })
  }

  const cruisePower = core.cruise.electricalPowerW.value
  const cruiseCurrent = core.cruiseCurrent.value
  if (cruiseCurrent !== null && cruiseCurrent > input.maxCurrentA) {
    warnings.push({
      code: 'motor-current',
      tone: 'red',
      message: `Cruise current is above the motor's ${input.maxCurrentA} A rating. That rating is a ${input.maxCurrentDurationS}-second figure, not a continuous clearance.`,
    })
  }
  if (cruisePower !== null && cruisePower > input.maxPowerW) {
    warnings.push({
      code: 'motor-power',
      tone: 'red',
      message: `Cruise electrical power is above the motor's ${input.maxPowerW} W rating. That rating is a ${input.maxPowerDurationS}-second figure, not a continuous clearance.`,
    })
  }
  const longPhase = input.phases.some((phase) => phase.durationMin * 60 > input.maxCurrentDurationS && (phase.mode === 'aerodynamic' || phase.mode === 'climb' || (phase.currentA ?? 0) > 0))
  if (longPhase && cruiseCurrent !== null && cruiseCurrent <= input.maxCurrentA && (cruisePower === null || cruisePower <= input.maxPowerW)) {
    warnings.push({
      code: 'motor-duration',
      tone: 'yellow',
      message: `The motor current and power ratings are ${input.maxCurrentDurationS}-second ratings. A longer phase is not cleared for continuous operation just because the estimate is under those numbers.`,
    })
  }

  if (input.escCurrentRatingA === null || !(input.escCurrentRatingA > 0)) {
    warnings.push({
      code: 'esc-unknown',
      tone: 'yellow',
      message: `${input.escName || 'The ESC'} has no entered current rating. The model name is not treated as a verified amp limit; check the datasheet, cooling, and the operating case.`,
    })
  } else if (core.phases.some((phase) => phase.currentA.value !== null && (phase.currentA.value as number) > (input.escCurrentRatingA as number))) {
    warnings.push({
      code: 'esc',
      tone: 'red',
      message: `A phase current is above the entered ESC rating of ${input.escCurrentRatingA} A. Confirm that rating against the datasheet and the cooling you actually have.`,
    })
  }

  const climbPower = core.climb.electricalPowerW.value
  if (climbPower !== null && climbPower > input.maxPowerW) {
    warnings.push({
      code: 'climb-power',
      tone: 'red',
      message: 'The requested climb rate needs more electrical power than the motor power rating. Drag is included; this is not weight × climb rate alone.',
    })
  }

  if (input.staticThrustN === null && input.thrustCurve.length < 2 && input.motorTests.every((point) => point.thrustN === null)) {
    warnings.push({
      code: 'prop-missing',
      tone: 'yellow',
      message: 'Propeller thrust data is missing. The MN4120 bench figures were taken on T-MOTOR propellers, so they are not measured performance of the installed propeller. Diameter and pitch are not turned into thrust.',
    })
  }
  if (core.takeoffDistanceM.value !== null && core.takeoffDistanceM.note.includes('static value')) {
    warnings.push({ code: 'takeoff', tone: 'yellow', message: 'Runway distance holds thrust at the entered static value. Treat it as a low-confidence estimate until a thrust-versus-airspeed curve is entered.' })
  } else if (core.takeoffDistanceM.value === null && core.inputErrors.length === 0) {
    warnings.push({ code: 'takeoff', tone: 'yellow', message: core.takeoffDistanceM.note })
  }

  const nominalEnergy = input.nominalVoltageV > 0 && input.capacityAh > 0 ? input.nominalVoltageV * input.capacityAh : null
  const usableAh = input.capacityAh > 0 ? input.capacityAh * input.usablePercent / 100 : null
  const reserveAh = input.capacityAh > 0 ? input.capacityAh * input.reservePercent / 100 : null
  const availableAfterReserve = usableAh !== null && reserveAh !== null ? usableAh - reserveAh : null
  const totalAh = sumKnown(core.phases.map((phase) => phase.ampHours))
  const totalWh = sumKnown(core.phases.map((phase) => phase.wattHours))
  const remainingAh = totalAh.value !== null && input.capacityAh > 0 ? input.capacityAh - totalAh.value : null
  const remainingPercent = remainingAh !== null && input.capacityAh > 0 ? (remainingAh / input.capacityAh) * 100 : null
  const missionFits = totalAh.value === null || availableAfterReserve === null ? null : totalAh.value <= availableAfterReserve + 1e-9

  if (core.phases.some((phase) => phase.currentA.value === null)) {
    warnings.push({ code: 'phase-current', tone: 'yellow', message: 'One or more phases have no current, so mission amp-hours are incomplete. Nothing is silently filled in from another phase.' })
    warnings.push({ code: 'mission-incomplete', tone: 'yellow', message: 'Mission feasibility is unknown until every phase has a measured, estimated, or calculated current.' })
  } else if (missionFits === false) {
    warnings.push({ code: 'battery', tone: 'red', message: 'Mission amp-hours exceed usable capacity minus the reserve.' })
  }
  if (input.capacityAh > 0 && remainingPercent !== null && remainingPercent < input.reservePercent && missionFits !== null) {
    warnings.push({ code: 'reserve', tone: 'red', message: 'Predicted remaining capacity is below the reserve fraction of the pack.' })
  }

  let loadedVoltage = sourced(null, 'unknown', 'Loaded voltage needs an internal resistance and a cruise current. Open-circuit voltage is taken as the nominal voltage.')
  if (input.internalResistanceOhm !== null && input.internalResistanceOhm >= 0 && cruiseCurrent !== null) {
    const loaded = input.nominalVoltageV - cruiseCurrent * input.internalResistanceOhm
    loadedVoltage = sourced(loaded, 'estimate', 'Nominal voltage minus cruise current × entered internal resistance. This is not a full cell model.')
    if (loaded < input.lowVoltageV) {
      warnings.push({ code: 'voltage', tone: 'red', message: 'Predicted loaded voltage is below the low-voltage threshold.' })
    } else if (loaded < input.lowVoltageV + 0.6) {
      warnings.push({ code: 'voltage', tone: 'yellow', message: 'Predicted loaded voltage is close to the low-voltage threshold.' })
    }
  }

  const cruiseAmpsForEndurance = core.cruise.currentA.value
  const maxCruiseMin = availableAfterReserve !== null && cruiseAmpsForEndurance !== null && cruiseAmpsForEndurance > 0
    ? (availableAfterReserve / cruiseAmpsForEndurance) * 60
    : null
  const additionalCruiseMin = availableAfterReserve !== null && totalAh.value !== null && cruiseAmpsForEndurance !== null && cruiseAmpsForEndurance > 0
    ? Math.max(0, availableAfterReserve - totalAh.value) / cruiseAmpsForEndurance * 60
    : null

  if (Math.abs(core.missionDurationMin - input.targetDurationMin) > 0.05) {
    warnings.push({
      code: 'duration-target',
      tone: 'yellow',
      message: `Phase durations add up to ${core.missionDurationMin.toFixed(1)} min. The planning target is ${input.targetDurationMin} min. The mission uses the sum, not the target.`,
    })
  }

  const allMeasured = core.phases.length > 0 && core.phases.every((phase) => phase.currentA.source === 'measured')
  let batteryTone: PerformanceResults['battery']['tone'] = 'yellow'
  let toneLabel = 'Estimate. Do not read a number inside a limit as a clearance.'
  if (core.inputErrors.length > 0 || missionFits === false || warnings.some((item) => item.code === 'voltage' && item.tone === 'red')) {
    batteryTone = 'red'
    toneLabel = 'Exceeds a battery limit, or the inputs are not valid.'
  } else if (allMeasured && missionFits === true && loadedVoltage.value !== null && loadedVoltage.value >= input.lowVoltageV) {
    batteryTone = 'green'
    toneLabel = 'Every phase current was entered as a measurement, and the sum stays inside usable capacity minus reserve.'
  } else if (totalAh.value === null) {
    toneLabel = 'Mission energy is incomplete until every phase has a current.'
  }

  const sweep = polar && core.stallSpeedKmh.value !== null && core.inputErrors.length === 0
    ? speedSweep(input, polar, core.stallSpeedKmh.value)
    : []
  const powered = sweep.filter((row) => row.electricalPowerW !== null) as { speedKmh: number; electricalPowerW: number }[]
  const lowest = powered.reduce<{ speedKmh: number; electricalPowerW: number } | null>((best, row) => {
    if (!best || row.electricalPowerW < best.electricalPowerW) return row
    return best
  }, null)
  const withinPower = powered.filter((row) => row.electricalPowerW <= input.maxPowerW)
  const maxSpeed = withinPower.length > 0 ? withinPower[withinPower.length - 1]?.speedKmh ?? null : null

  const weightSweep: WeightPoint[] = []
  if (core.inputErrors.length === 0 && input.mtowKg > 0) {
    const upper = Math.max(8, input.mtowKg * 1.5)
    for (let mass = 1; mass <= upper + 1e-6; mass += 0.5) {
      const sample = computeCore(input, Number(mass.toFixed(2)))
      const usable = input.capacityAh * input.usablePercent / 100 - input.capacityAh * input.reservePercent / 100
      const amps = sample.cruise.currentA.value
      weightSweep.push({
        mtowKg: Number(mass.toFixed(2)),
        stallSpeedKmh: sample.stallSpeedKmh.value,
        cruisePowerW: sample.cruise.electricalPowerW.value,
        climbCurrentA: sample.climb.currentA.value,
        wingLoadingKgM2: sample.geometry.wingLoadingKgM2.value,
        enduranceMin: amps && amps > 0 ? (usable / amps) * 60 : null,
      })
    }
  }

  return {
    inputErrors: core.inputErrors,
    geometry: core.geometry,
    stallSpeedMs: core.stallSpeedMs,
    stallSpeedKmh: core.stallSpeedKmh,
    takeoffSpeedMs: core.takeoffSpeedMs,
    takeoffSpeedKmh: core.takeoffSpeedKmh,
    cruise: core.cruise,
    climb: core.climb,
    cruiseCurrent: core.cruiseCurrent,
    staticThrustN: core.staticThrustN,
    thrustToWeight: core.thrustToWeight,
    takeoffDistanceM: core.takeoffDistanceM,
    preliminaryTakeoffDistanceM: core.preliminaryTakeoffDistanceM,
    battery: {
      nominalEnergyWh: sourced(nominalEnergy, 'estimate', 'Nominal voltage × capacity. Not a measured watt-hour test.'),
      usableAh: sourced(usableAh, 'estimate', 'Capacity × usable percent. The usable percent is an assumption, not a cycle test.'),
      usableEnergyWh: sourced(nominalEnergy === null ? null : nominalEnergy * input.usablePercent / 100, 'estimate', 'Nominal energy × usable percent.'),
      reserveAh: sourced(reserveAh, 'estimate', 'Capacity × reserve percent. Reserve is held back inside the usable fraction.'),
      availableAfterReserveAh: sourced(availableAfterReserve, 'estimate', 'Usable amp-hours minus reserve amp-hours.'),
      totalAh,
      totalWh,
      remainingAh: sourced(remainingAh, totalAh.source, 'Nameplate capacity minus mission amp-hours. Incomplete when a phase current is unknown.'),
      remainingPercent: sourced(remainingPercent, totalAh.source, 'Remaining amp-hours divided by nameplate capacity.'),
      loadedVoltageV: loadedVoltage,
      maxCruiseMin: sourced(maxCruiseMin, 'estimate', 'Time at the aerodynamic cruise current that spends usable capacity down to the reserve. It ignores other phases.'),
      additionalCruiseMin: sourced(additionalCruiseMin, totalAh.source, 'Cruise minutes still available after this mission and the reserve.'),
      missionFits,
      tone: batteryTone,
      toneLabel,
    },
    missionDurationMin: core.missionDurationMin,
    phases: core.phases,
    warnings,
    speedSweep: sweep,
    lowestPowerSpeedKmh: lowest?.speedKmh ?? null,
    maxSpeedWithinPowerKmh: maxSpeed,
    weightSweep,
    timeProfile: buildProfile(input, core.phases, input.capacityAh > 0 ? input.capacityAh : null),
    usableRemainingPercent: input.usablePercent >= 0 && input.usablePercent <= 100 ? 100 - input.usablePercent : null,
    reserveRemainingPercent: input.usablePercent >= input.reservePercent ? 100 - input.usablePercent + input.reservePercent : null,
  }
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function performanceToCsv(input: UavInputs, results: PerformanceResults): string {
  const rows: (string | number | null)[][] = [
    ['section', 'name', 'value', 'unit', 'source', 'note'],
    ['aircraft', 'MTOW', input.mtowKg, 'kg', 'entered', 'Flight weight. Battery mass is not added again.'],
    ['aircraft', 'Wing area', results.geometry.wingAreaM2.value, 'm^2', results.geometry.wingAreaM2.source, results.geometry.wingAreaM2.note],
    ['aircraft', 'Aspect ratio', results.geometry.aspectRatio.value, '', results.geometry.aspectRatio.source, results.geometry.aspectRatio.note],
    ['aircraft', 'Wing loading', results.geometry.wingLoadingNpm2.value, 'N/m^2', results.geometry.wingLoadingNpm2.source, results.geometry.wingLoadingNpm2.note],
    ['aircraft', 'Wing loading', results.geometry.wingLoadingKgM2.value, 'kg/m^2', results.geometry.wingLoadingKgM2.source, results.geometry.wingLoadingKgM2.note],
    ['aircraft', 'Stall speed', results.stallSpeedKmh.value, 'km/h', results.stallSpeedKmh.source, results.stallSpeedKmh.note],
    ['aircraft', 'Takeoff speed', results.takeoffSpeedKmh.value, 'km/h', results.takeoffSpeedKmh.source, results.takeoffSpeedKmh.note],
    ['aircraft', 'Runway distance', results.takeoffDistanceM.value, 'm', results.takeoffDistanceM.source, results.takeoffDistanceM.note],
    ['propulsion', 'Static thrust', results.staticThrustN.value, 'N', results.staticThrustN.source, results.staticThrustN.note],
    ['propulsion', 'Cruise electrical power', results.cruise.electricalPowerW.value, 'W', results.cruise.electricalPowerW.source, results.cruise.electricalPowerW.note],
    ['propulsion', 'Cruise current', results.cruiseCurrent.value, 'A', results.cruiseCurrent.source, results.cruiseCurrent.note],
    ['propulsion', 'Climb current', results.climb.currentA.value, 'A', results.climb.currentA.source, results.climb.currentA.note],
    ['battery', 'Nominal energy', results.battery.nominalEnergyWh.value, 'Wh', results.battery.nominalEnergyWh.source, results.battery.nominalEnergyWh.note],
    ['battery', 'Mission consumption', results.battery.totalAh.value, 'Ah', results.battery.totalAh.source, results.battery.totalAh.note],
    ['battery', 'Remaining', results.battery.remainingPercent.value, '%', results.battery.remainingPercent.source, results.battery.remainingPercent.note],
  ]
  for (const phase of results.phases) {
    rows.push(['phase', phase.name, phase.currentA.value, 'A', phase.currentA.source, phase.currentA.note])
    rows.push(['phase', `${phase.name} duration`, phase.durationMin, 'min', 'entered', ''])
  }
  return rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n')
}

export function performanceReport(input: UavInputs, results: PerformanceResults): string {
  const line = (label: string, value: Sourced<number>, unit: string) =>
    `${label}: ${value.value === null ? 'unknown' : value.value.toFixed(3)} ${unit} (${provenanceLabel(value.source)}). ${value.note}`
  const warnings = results.warnings.map((item) => `- [${item.tone}] ${item.message}`).join('\n') || '- None'
  return [
    'Fixed-wing UAV performance report',
    `${input.motorName} · ${input.propellerName} · ${input.batteryName} · ${input.escName} · ${input.flightControllerName}`,
    '',
    'This report mixes published equipment data, entered measurements, and engineering estimates. An estimate inside a numerical limit is not a clearance.',
    'The motor current and power ratings used here are 180-second ratings when those durations are left at 180. The motor bench sheet is for T-MOTOR propellers, not automatically the installed propeller.',
    '',
    line('MTOW', sourced(input.mtowKg, 'measured', 'Entered flight weight.'), 'kg'),
    line('Wing area', results.geometry.wingAreaM2, 'm^2'),
    line('Aspect ratio', results.geometry.aspectRatio, ''),
    line('Wing loading', results.geometry.wingLoadingKgM2, 'kg/m^2'),
    line('Stall speed', results.stallSpeedKmh, 'km/h'),
    line('Takeoff speed', results.takeoffSpeedKmh, 'km/h'),
    line('Runway distance', results.takeoffDistanceM, 'm'),
    line('Cruise electrical power', results.cruise.electricalPowerW, 'W'),
    line('Cruise current', results.cruiseCurrent, 'A'),
    line('Climb current', results.climb.currentA, 'A'),
    line('Nominal energy', results.battery.nominalEnergyWh, 'Wh'),
    line('Mission consumption', results.battery.totalAh, 'Ah'),
    line('Remaining battery', results.battery.remainingPercent, '%'),
    `Mission duration (sum of phases): ${results.missionDurationMin.toFixed(2)} min`,
    `Battery status: ${results.battery.toneLabel}`,
    '',
    'Warnings',
    warnings,
    '',
  ].join('\n')
}
