import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import {
  calculateAircraftPerformance,
  createDefaultUavInputs,
  performanceReport,
  performanceToCsv,
  provenanceLabel,
  type MissionPhase,
  type MotorTestPoint,
  type PhaseMode,
  type Sourced,
  type ThrustSpeedPoint,
  type UavInputs,
} from '../estimation/uavPerformance'
import { UavPerformanceCharts } from './UavPerformanceCharts'

const STORAGE_KEY = 'dropsim.uav-performance.v1'

const PHASE_MODES: { id: PhaseMode; label: string }[] = [
  { id: 'measured', label: 'Measured' },
  { id: 'estimated', label: 'Estimated' },
  { id: 'aerodynamic', label: 'Aerodynamic model' },
  { id: 'climb', label: 'Climb model' },
  { id: 'interpolated', label: 'Interpolated from tests' },
]

function loadInput(): UavInputs {
  const defaults = createDefaultUavInputs()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const saved = JSON.parse(raw) as Partial<UavInputs>
    return {
      ...defaults,
      ...saved,
      motorTests: Array.isArray(saved.motorTests) ? saved.motorTests : [],
      thrustCurve: Array.isArray(saved.thrustCurve) ? saved.thrustCurve : [],
      phases: Array.isArray(saved.phases) && saved.phases.length > 0 ? saved.phases : defaults.phases,
    }
  } catch {
    return defaults
  }
}

function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function format(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

export function UavPerformanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const [input, setInput] = useState<UavInputs>(() => loadInput())
  const results = useMemo(() => calculateAircraftPerformance(input), [input])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input))
  }, [input])

  if (!open) return null

  const patch = (partial: Partial<UavInputs>) => setInput((prev) => ({ ...prev, ...partial }))
  const setPhase = (id: string, partial: Partial<MissionPhase>) => {
    setInput((prev) => ({
      ...prev,
      phases: prev.phases.map((phase) => (phase.id === id ? { ...phase, ...partial } : phase)),
    }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="modal uav-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>Fixed-wing performance</h2>
            <p className="calc">
              Conventional single-propeller estimate. Every result updates as you edit. Manufacturer figures, measurements, and assumptions stay labeled. Nothing here is sent off this browser.
            </p>
          </div>
          <div className="header-actions">
            <Button onClick={() => setInput(createDefaultUavInputs())}>Reset</Button>
            <Button onClick={() => download('uav-configuration.json', JSON.stringify(input, null, 2), 'application/json')}>Save JSON</Button>
            <label className="btn quiet">
              Load JSON
              <input
                className="visually-hidden"
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void file.text().then((text) => {
                    const saved = JSON.parse(text) as Partial<UavInputs>
                    setInput({
                      ...createDefaultUavInputs(),
                      ...saved,
                      motorTests: Array.isArray(saved.motorTests) ? saved.motorTests : [],
                      thrustCurve: Array.isArray(saved.thrustCurve) ? saved.thrustCurve : [],
                      phases: Array.isArray(saved.phases) && saved.phases.length > 0 ? saved.phases : createDefaultUavInputs().phases,
                    })
                  }).catch(() => {
                    setInput((prev) => prev)
                  })
                  event.target.value = ''
                }}
              />
            </label>
            <Button onClick={() => download('uav-results.csv', performanceToCsv(input, results), 'text/csv')}>Export CSV</Button>
            <Button onClick={() => download('uav-mission-report.txt', performanceReport(input, results), 'text/plain')}>Mission report</Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </header>
        <div className="modal-body">
          <nav className="uav-nav">
            {[
              ['geometry', 'Geometry'],
              ['aero', 'Aerodynamics'],
              ['motor', 'Motor and propeller'],
              ['electrical', 'ESC'],
              ['battery', 'Battery'],
              ['mission', 'Mission'],
              ['results', 'Results'],
              ['graphs', 'Graphs'],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => document.getElementById(`uav-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>
            ))}
          </nav>

          <section className={`uav-banner tone-${results.battery.tone}`}>
            <strong>{results.battery.toneLabel}</strong>
            <span>
              Cruise {format(results.cruise.electricalPowerW.value, 0)} W · {format(results.cruiseCurrent.value, 1)} A ({provenanceLabel(results.cruiseCurrent.source)}) · stall {format(results.stallSpeedKmh.value, 1)} km/h · mission {format(results.missionDurationMin, 1)} min
            </span>
          </section>

          {results.warnings.length > 0 && (
            <ul className="warn-list">
              {results.warnings.map((item) => (
                <li key={`${item.code}-${item.message}`} className={item.tone === 'red' ? 'warn-red' : 'warn-yellow'}>{item.message}</li>
              ))}
            </ul>
          )}

          <section id="uav-geometry">
            <h3>Aircraft geometry and weight</h3>
            <p className="calc">MTOW is the flight weight. Motor mass and battery mass are recorded below and are not added on top of it.</p>
            <div className="uav-fields">
              <NumberField label="MTOW" unit="kg" value={input.mtowKg} min={0.5} max={12} step={0.05} slider onChange={(value) => patch({ mtowKg: value })} />
              <NumberField label="Wingspan" unit="m" value={input.wingspanM} min={0.4} max={4} step={0.01} slider onChange={(value) => patch({ wingspanM: value })} />
              <NumberField label="Average chord" unit="m" value={input.averageChordM} min={0.05} max={0.8} step={0.005} slider onChange={(value) => patch({ averageChordM: value })} hint="Rectangular-equivalent chord. Ignored for area when you enter wing area directly." />
              <label className="field">
                <span className="field-label">Wing area source</span>
                <select value={input.wingAreaMode} onChange={(event) => patch({ wingAreaMode: event.target.value as UavInputs['wingAreaMode'] })}>
                  <option value="rectangular">Span × chord</option>
                  <option value="entered">Entered area is authoritative</option>
                </select>
              </label>
              <NumberField label="Wing area" unit="m²" value={input.wingAreaMode === 'entered' ? input.wingAreaM2 : results.geometry.wingAreaM2.value ?? 0} step={0.01} disabled={input.wingAreaMode !== 'entered'} onChange={(value) => patch({ wingAreaM2: value, wingAreaMode: 'entered' })} />
              <NumberField label="Air density" unit="kg/m³" value={input.airDensity} min={0.3} max={1.5} step={0.001} slider onChange={(value) => patch({ airDensity: value })} hint="1.225 is sea-level ISA. Change it for the site; it is not measured here." />
              <Readout label="Aspect ratio" sourced={results.geometry.aspectRatio} digits={2} />
              <Readout label="Wing loading" sourced={results.geometry.wingLoadingNpm2} unit="N/m²" digits={1} />
              <Readout label="Wing loading" sourced={results.geometry.wingLoadingKgM2} unit="kg/m²" digits={2} />
              <Readout label="Weight" sourced={results.geometry.weightN} unit="N" digits={2} />
            </div>
          </section>

          <section id="uav-aero">
            <h3>Aerodynamic characteristics</h3>
            <p className="calc">CD0, CLmax, and Oswald efficiency should come from aerodynamic analysis or flight testing. The starting numbers are assumptions.</p>
            <div className="uav-fields">
              <NumberField label="CLmax" unit="—" value={input.clMax} min={0.2} max={2.2} step={0.01} slider onChange={(value) => patch({ clMax: value })} hint="Assumption until a stall test or analysis replaces it." />
              <NumberField label="CD0" unit="—" value={input.cd0} min={0} max={0.2} step={0.001} slider onChange={(value) => patch({ cd0: value })} hint="Zero-lift drag. Assumption until analysis or a flight test." />
              <NumberField label="Oswald efficiency" unit="—" value={input.oswaldEfficiency} min={0.4} max={1} step={0.01} slider onChange={(value) => patch({ oswaldEfficiency: value })} hint="Span efficiency. Assumption until analysis or a flight test." />
              <NumberField label="Propeller efficiency" unit="—" value={input.propellerEfficiency} min={0.3} max={0.9} step={0.01} slider onChange={(value) => patch({ propellerEfficiency: value })} hint="Assumed propulsive efficiency. Not measured on this propeller." />
              <NumberField label="Electrical efficiency" unit="—" value={input.electricalEfficiency} min={0.5} max={1} step={0.01} slider onChange={(value) => patch({ electricalEfficiency: value })} hint="ESC, wiring, and motor electrical path. Assumption." />
              <NumberField label="Target cruise speed" unit="km/h" value={input.cruiseSpeedKmh} min={30} max={180} step={1} slider onChange={(value) => patch({ cruiseSpeedKmh: value })} />
              <NumberField label="Climb speed" unit="km/h" value={input.climbSpeedKmh} min={30} max={180} step={1} slider onChange={(value) => patch({ climbSpeedKmh: value })} hint="Speed used for climb drag. It starts equal to cruise and can be changed on its own." />
              <NumberField label="Target climb rate" unit="m/s" value={input.climbRateMps} min={0} max={10} step={0.1} slider onChange={(value) => patch({ climbRateMps: value })} />
              <NumberField label="Takeoff speed multiplier" unit="× Vs" value={input.takeoffSpeedMultiplier} min={1} max={1.6} step={0.01} slider onChange={(value) => patch({ takeoffSpeedMultiplier: value })} />
            </div>
          </section>

          <section id="uav-motor">
            <h3>Motor and propeller</h3>
            <p className="calc">
              {input.motorName} bench current and power are {input.maxCurrentDurationS}-second ratings, and those bench figures were taken on T-MOTOR propellers. They are not measured performance of the {input.propellerName}. Diameter and pitch are not converted into thrust.
            </p>
            <div className="uav-fields">
              <TextField label="Motor" value={input.motorName} onChange={(motorName) => patch({ motorName })} />
              <NumberField label="Motor mass" unit="g" value={input.motorWeightG} step={1} onChange={(motorWeightG) => patch({ motorWeightG })} hint="Recorded so it is not forgotten. Not added to MTOW." />
              <NumberField label="Motor KV" unit="RPM/V" value={input.motorKv} step={1} onChange={(motorKv) => patch({ motorKv })} hint="Published KV. Not used to invent thrust or current." />
              <NumberField label="Maximum motor current" unit="A" value={input.maxCurrentA} step={0.5} onChange={(maxCurrentA) => patch({ maxCurrentA })} hint={`${input.maxCurrentDurationS}-second rating, not a continuous clearance.`} />
              <NumberField label="Current rating duration" unit="s" value={input.maxCurrentDurationS} step={1} onChange={(maxCurrentDurationS) => patch({ maxCurrentDurationS })} />
              <NumberField label="Maximum motor power" unit="W" value={input.maxPowerW} step={10} onChange={(maxPowerW) => patch({ maxPowerW })} hint={`${input.maxPowerDurationS}-second rating, not a continuous clearance.`} />
              <NumberField label="Power rating duration" unit="s" value={input.maxPowerDurationS} step={1} onChange={(maxPowerDurationS) => patch({ maxPowerDurationS })} />
              <TextField label="Propeller" value={input.propellerName} onChange={(propellerName) => patch({ propellerName })} />
              <NumberField label="Propeller diameter" unit="in" value={input.propDiameterIn} step={0.1} onChange={(propDiameterIn) => patch({ propDiameterIn })} />
              <NumberField label="Propeller pitch" unit="in" value={input.propPitchIn} step={0.1} onChange={(propPitchIn) => patch({ propPitchIn })} />
              <OptionalNumber label="Static thrust" unit="N" value={input.staticThrustN} onChange={(staticThrustN) => patch({ staticThrustN })} hint="Enter a measurement. Leave blank if you have not measured this propeller." />
            </div>
            <h3>Motor test points</h3>
            <p className="calc">Throttle percentage is stored and is not treated as proportional to power, thrust, or current. Interpolation uses power and current only, and it does not extrapolate.</p>
            <TestTable
              points={input.motorTests}
              onChange={(motorTests) => patch({ motorTests })}
            />
            <h3>Thrust versus airspeed</h3>
            <p className="calc">Optional. Without at least two points, runway distance can only hold the static thrust constant, and that result stays low confidence.</p>
            <ThrustTable points={input.thrustCurve} onChange={(thrustCurve) => patch({ thrustCurve })} />
            <div className="uav-fields">
              <NumberField label="Rolling resistance" unit="—" value={input.rollingResistance} min={0} max={0.1} step={0.001} slider onChange={(rollingResistance) => patch({ rollingResistance })} hint="Coefficient on the weight still on the wheels. 0.025 is an assumption for a hard surface." />
              <NumberField label="Runway slope" unit="deg" value={input.runwaySlopeDeg} min={-6} max={6} step={0.1} slider onChange={(runwaySlopeDeg) => patch({ runwaySlopeDeg })} hint="Positive is uphill." />
              <NumberField label="Headwind" unit="m/s" value={input.headwindMs} min={0} max={15} step={0.1} slider onChange={(headwindMs) => patch({ headwindMs })} />
            </div>
          </section>

          <section id="uav-electrical">
            <h3>ESC and electrical system</h3>
            <p className="calc">The ESC model name is not an amp rating. Enter the continuous current you are willing to use after reading the datasheet and the cooling case.</p>
            <div className="uav-fields">
              <TextField label="ESC" value={input.escName} onChange={(escName) => patch({ escName })} />
              <OptionalNumber label="ESC current rating" unit="A" value={input.escCurrentRatingA} onChange={(escCurrentRatingA) => patch({ escCurrentRatingA })} hint="Leave blank until the datasheet rating is entered. The name alone is not used." />
              <TextField label="Flight controller" value={input.flightControllerName} onChange={(flightControllerName) => patch({ flightControllerName })} />
            </div>
          </section>

          <section id="uav-battery">
            <h3>Battery</h3>
            <p className="calc">
              {input.batteryName}. An advertised C rating is not a verified discharge capability. Usable percent and reserve are assumptions. Reserve is held back inside the usable fraction, so both reduce what the mission may spend. Pack mass is not added to MTOW.
            </p>
            <div className="uav-fields">
              <TextField label="Battery" value={input.batteryName} onChange={(batteryName) => patch({ batteryName })} />
              <NumberField label="Cell count" unit="S" value={input.cellCount} min={1} max={14} step={1} onChange={(cellCount) => patch({ cellCount })} />
              <NumberField label="Nominal voltage" unit="V" value={input.nominalVoltageV} step={0.1} onChange={(nominalVoltageV) => patch({ nominalVoltageV })} />
              <NumberField label="Fully charged voltage" unit="V" value={input.fullVoltageV} step={0.1} onChange={(fullVoltageV) => patch({ fullVoltageV })} />
              <NumberField label="Capacity" unit="Ah" value={input.capacityAh} min={0.5} max={30} step={0.1} slider onChange={(capacityAh) => patch({ capacityAh })} />
              <NumberField label="Usable capacity" unit="%" value={input.usablePercent} min={10} max={100} step={1} slider onChange={(usablePercent) => patch({ usablePercent })} />
              <NumberField label="Required reserve" unit="%" value={input.reservePercent} min={0} max={80} step={1} slider onChange={(reservePercent) => patch({ reservePercent })} />
              <OptionalNumber label="Internal resistance" unit="Ω" value={input.internalResistanceOhm} onChange={(internalResistanceOhm) => patch({ internalResistanceOhm })} hint="Measured pack resistance. Leave blank to skip voltage sag." />
              <NumberField label="Low-voltage threshold" unit="V" value={input.lowVoltageV} step={0.1} onChange={(lowVoltageV) => patch({ lowVoltageV })} hint="Compared with nominal voltage minus current × resistance. 21 V is 3.5 V per cell on 6S, an assumption." />
              <Readout label="Nominal energy" sourced={results.battery.nominalEnergyWh} unit="Wh" digits={1} />
              <Readout label="Usable energy" sourced={results.battery.usableEnergyWh} unit="Wh" digits={1} />
              <Readout label="Loaded voltage" sourced={results.battery.loadedVoltageV} unit="V" digits={2} />
            </div>
          </section>

          <section id="uav-mission">
            <h3>Flight mission profile</h3>
            <p className="calc">
              Mission duration is the sum of the phases: <strong>{format(results.missionDurationMin, 2)} min</strong>
              <span className="source"> calculated</span>. The planning target does not replace that sum.
            </p>
            <NumberField label="Planning target" unit="min" value={input.targetDurationMin} min={1} max={180} step={1} slider onChange={(targetDurationMin) => patch({ targetDurationMin })} />
            <div className="table-wrap">
              <table className="mass-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Minutes</th>
                    <th>Current source</th>
                    <th>Entered current</th>
                    <th>Resolved current</th>
                    <th>Ah</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {input.phases.map((phase) => {
                    const resolved = results.phases.find((item) => item.id === phase.id)
                    const currentLocked = phase.mode === 'aerodynamic' || phase.mode === 'climb' || phase.mode === 'interpolated'
                    return (
                      <tr key={phase.id}>
                        <td>
                          <input aria-label={`${phase.name} name`} value={phase.name} onChange={(event) => setPhase(phase.id, { name: event.target.value })} />
                        </td>
                        <td>
                          <input aria-label={`${phase.name} duration`} type="number" min={0} step={0.1} value={phase.durationMin} onChange={(event) => setPhase(phase.id, { durationMin: Number(event.target.value) })} />
                        </td>
                        <td>
                          <select aria-label={`${phase.name} source`} value={phase.mode} onChange={(event) => setPhase(phase.id, { mode: event.target.value as PhaseMode })}>
                            {PHASE_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`${phase.name} current`}
                            type="number"
                            min={0}
                            step={0.1}
                            disabled={currentLocked}
                            value={phase.currentA ?? ''}
                            placeholder={currentLocked ? 'From model' : 'A'}
                            onChange={(event) => setPhase(phase.id, { currentA: event.target.value === '' ? null : Number(event.target.value) })}
                          />
                        </td>
                        <td>{format(resolved?.currentA.value ?? null, 2)} A <span className="source">{resolved ? provenanceLabel(resolved.currentA.source) : ''}</span></td>
                        <td>{format(resolved?.ampHours.value ?? null, 3)}</td>
                        <td>
                          <button type="button" onClick={() => patch({ phases: input.phases.filter((item) => item.id !== phase.id) })}>Remove</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Button onClick={() => patch({
              phases: [...input.phases, { id: `phase-${crypto.randomUUID()}`, name: 'Phase', durationMin: 1, mode: 'estimated', currentA: null, speedKmh: null }],
            })}>Add phase</Button>
          </section>

          <section id="uav-results">
            <h3>Live performance results</h3>
            <h3>Aircraft</h3>
            <dl className="metrics uav-metrics">
              <Metric label="MTOW" value={`${format(input.mtowKg, 2)} kg`} source="Entered flight weight" />
              <Metric label="Wing area" value={`${format(results.geometry.wingAreaM2.value, 3)} m²`} source={provenanceLabel(results.geometry.wingAreaM2.source)} />
              <Metric label="Aspect ratio" value={format(results.geometry.aspectRatio.value, 2)} source={provenanceLabel(results.geometry.aspectRatio.source)} />
              <Metric label="Wing loading" value={`${format(results.geometry.wingLoadingKgM2.value, 2)} kg/m²`} source={provenanceLabel(results.geometry.wingLoadingKgM2.source)} />
              <Metric label="Stall speed" value={`${format(results.stallSpeedKmh.value, 1)} km/h`} source={provenanceLabel(results.stallSpeedKmh.source)} />
              <Metric label="Takeoff speed" value={`${format(results.takeoffSpeedKmh.value, 1)} km/h`} source={provenanceLabel(results.takeoffSpeedKmh.source)} />
              <Metric label="Runway distance" value={`${format(results.takeoffDistanceM.value, 0)} m`} source={provenanceLabel(results.takeoffDistanceM.source)} />
              <Metric label="Preliminary runway" value={`${format(results.preliminaryTakeoffDistanceM.value, 0)} m`} source={provenanceLabel(results.preliminaryTakeoffDistanceM.source)} />
            </dl>
            <h3>Propulsion</h3>
            <dl className="metrics uav-metrics">
              <Metric label="Static thrust" value={`${format(results.staticThrustN.value, 1)} N`} source={provenanceLabel(results.staticThrustN.source)} />
              <Metric label="Thrust-to-weight" value={format(results.thrustToWeight.value, 2)} source={provenanceLabel(results.thrustToWeight.source)} />
              <Metric label="Cruise current" value={`${format(results.cruiseCurrent.value, 2)} A`} source={provenanceLabel(results.cruiseCurrent.source)} />
              <Metric label="Aero cruise current" value={`${format(results.cruise.currentA.value, 2)} A`} source={provenanceLabel(results.cruise.currentA.source)} />
              <Metric label="Climb current" value={`${format(results.climb.currentA.value, 2)} A`} source={provenanceLabel(results.climb.currentA.source)} />
              <Metric label="Motor current rating" value={`${format(input.maxCurrentA, 0)} A`} source={`${input.maxCurrentDurationS} s manufacturer rating`} />
              <Metric label="Motor power rating" value={`${format(input.maxPowerW, 0)} W`} source={`${input.maxPowerDurationS} s manufacturer rating`} />
              <Metric label="ESC current rating" value={input.escCurrentRatingA === null ? '—' : `${format(input.escCurrentRatingA, 0)} A`} source={input.escCurrentRatingA === null ? 'Unknown' : 'Entered rating'} />
            </dl>
            <h3>Flight</h3>
            <dl className="metrics uav-metrics">
              <Metric label="Cruise speed" value={`${format(input.cruiseSpeedKmh, 0)} km/h`} source="Entered target" />
              <Metric label="Cruise electrical power" value={`${format(results.cruise.electricalPowerW.value, 0)} W`} source={provenanceLabel(results.cruise.electricalPowerW.source)} />
              <Metric label="Climb rate" value={`${format(input.climbRateMps, 1)} m/s`} source="Entered target" />
              <Metric label="Climb electrical power" value={`${format(results.climb.electricalPowerW.value, 0)} W`} source={provenanceLabel(results.climb.electricalPowerW.source)} />
              <Metric label="Mission duration" value={`${format(results.missionDurationMin, 1)} min`} source="Sum of phases" />
              <Metric label="Cruise endurance" value={`${format(results.battery.maxCruiseMin.value, 1)} min`} source={provenanceLabel(results.battery.maxCruiseMin.source)} />
            </dl>
            <h3>Battery</h3>
            <dl className="metrics uav-metrics">
              <Metric label="Nominal energy" value={`${format(results.battery.nominalEnergyWh.value, 0)} Wh`} source={provenanceLabel(results.battery.nominalEnergyWh.source)} />
              <Metric label="Usable energy" value={`${format(results.battery.usableEnergyWh.value, 0)} Wh`} source={provenanceLabel(results.battery.usableEnergyWh.source)} />
              <Metric label="Mission energy" value={`${format(results.battery.totalWh.value, 0)} Wh`} source={provenanceLabel(results.battery.totalWh.source)} />
              <Metric label="Capacity consumed" value={`${format(results.battery.totalAh.value, 2)} Ah`} source={provenanceLabel(results.battery.totalAh.source)} />
              <Metric label="Remaining" value={`${format(results.battery.remainingPercent.value, 1)} %`} source={provenanceLabel(results.battery.remainingPercent.source)} />
              <Metric label="Reserve" value={`${format(results.battery.reserveAh.value, 2)} Ah`} source={provenanceLabel(results.battery.reserveAh.source)} />
              <Metric label="Additional cruise" value={`${format(results.battery.additionalCruiseMin.value, 1)} min`} source={provenanceLabel(results.battery.additionalCruiseMin.source)} />
              <Metric label="Mission fit" value={results.battery.missionFits === null ? 'Incomplete' : results.battery.missionFits ? 'Inside reserve' : 'Over reserve'} source={results.battery.toneLabel} />
            </dl>
          </section>

          <section id="uav-graphs">
            <h3>Graphs and warnings</h3>
            <UavPerformanceCharts results={results} cruiseKmh={input.cruiseSpeedKmh} />
          </section>
        </div>
      </div>
    </div>
  )
}

function NumberField({ label, unit, value, onChange, min, max, step, slider = false, hint, disabled = false }: {
  label: string
  unit: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  slider?: boolean
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">{label}{hint ? <i className="info" title={hint}>i</i> : null}</span>
        <span className="unit">{unit}</span>
      </span>
      <span className="field-control">
        <input type="number" min={min} max={max} step={step} disabled={disabled} value={Number.isFinite(value) ? value : ''} onChange={(event) => onChange(Number(event.target.value))} />
      </span>
      {slider && min !== undefined && max !== undefined && (
        <input type="range" min={min} max={max} step={step} disabled={disabled} value={Math.min(max, Math.max(min, value || min))} onChange={(event) => onChange(Number(event.target.value))} />
      )}
    </label>
  )
}

function OptionalNumber({ label, unit, value, onChange, hint }: {
  label: string
  unit: string
  value: number | null
  onChange: (value: number | null) => void
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">{label}{hint ? <i className="info" title={hint}>i</i> : null}</span>
        <span className="unit">{unit}</span>
      </span>
      <span className="field-control">
        <input
          type="number"
          step="any"
          value={value ?? ''}
          placeholder="Not entered"
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
      </span>
    </label>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Readout({ label, sourced, unit, digits }: { label: string; sourced: Sourced<number>; unit?: string; digits: number }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <strong>{format(sourced.value, digits)}{unit ? ` ${unit}` : ''}</strong>
      <span className="source">{provenanceLabel(sourced.source)}</span>
    </div>
  )
}

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div>
      <dt>{label} <span className="source">{source}</span></dt>
      <dd>{value}</dd>
    </div>
  )
}

function TestTable({ points, onChange }: { points: MotorTestPoint[]; onChange: (points: MotorTestPoint[]) => void }) {
  const edit = (id: string, partial: Partial<MotorTestPoint>) => {
    onChange(points.map((point) => (point.id === id ? { ...point, ...partial } : point)))
  }
  const blank = (): MotorTestPoint => ({
    id: `test-${crypto.randomUUID()}`,
    voltageV: null,
    currentA: null,
    powerW: null,
    rpm: null,
    thrustN: null,
    throttlePercent: null,
    temperatureC: null,
  })
  return (
    <div className="table-wrap">
      <table className="mass-table">
        <thead>
          <tr>
            <th>Voltage</th>
            <th>Current</th>
            <th>Power</th>
            <th>RPM</th>
            <th>Thrust</th>
            <th>Throttle</th>
            <th>Temp</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              {([
                ['voltageV', 'V'],
                ['currentA', 'A'],
                ['powerW', 'W'],
                ['rpm', 'RPM'],
                ['thrustN', 'N'],
                ['throttlePercent', '%'],
                ['temperatureC', '°C'],
              ] as const).map(([key, unit]) => (
                <td key={key}>
                  <input
                    aria-label={`${unit} test`}
                    type="number"
                    step="any"
                    value={point[key] ?? ''}
                    onChange={(event) => edit(point.id, { [key]: event.target.value === '' ? null : Number(event.target.value) })}
                  />
                </td>
              ))}
              <td><button type="button" onClick={() => onChange(points.filter((item) => item.id !== point.id))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button onClick={() => onChange([...points, blank()])}>Add test point</Button>
    </div>
  )
}

function ThrustTable({ points, onChange }: { points: ThrustSpeedPoint[]; onChange: (points: ThrustSpeedPoint[]) => void }) {
  return (
    <div className="table-wrap">
      <table className="mass-table">
        <thead>
          <tr>
            <th>Airspeed (m/s)</th>
            <th>Thrust (N)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              <td>
                <input type="number" step="any" value={point.airspeedMs} onChange={(event) => onChange(points.map((item) => item.id === point.id ? { ...item, airspeedMs: Number(event.target.value) } : item))} />
              </td>
              <td>
                <input type="number" step="any" value={point.thrustN} onChange={(event) => onChange(points.map((item) => item.id === point.id ? { ...item, thrustN: Number(event.target.value) } : item))} />
              </td>
              <td><button type="button" onClick={() => onChange(points.filter((item) => item.id !== point.id))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button onClick={() => onChange([...points, { id: `thrust-${crypto.randomUUID()}`, airspeedMs: 0, thrustN: 0 }])}>Add thrust point</Button>
    </div>
  )
}
