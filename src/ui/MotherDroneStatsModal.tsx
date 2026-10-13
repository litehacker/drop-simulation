import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import type { ComponentRecord } from '../catalog/schema'
import {
  allUpWeightKg,
  applyWhatIf,
  createDefaultFlightTimeInput,
  createDefaultWhatIf,
  flightStyleOptions,
  nominalPackVoltage,
  weightFromCatalog,
  type FlightStyleId,
  type FlightTimeInput,
  type FlightTimeWhatIf,
  type MassLineItem,
} from '../estimation/flightTime'
import { useSimStore } from '../store/useSimStore'

const STORAGE_KEY = 'dropsim.mother-drone.v1'

interface PersistedForm {
  input: FlightTimeInput
  whatIf: FlightTimeWhatIf
}

function loadForm(): PersistedForm {
  const defaults = createDefaultFlightTimeInput()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { input: defaults, whatIf: createDefaultWhatIf() }
    const parsed = JSON.parse(raw) as Partial<PersistedForm>
    const saved = parsed.input
    return {
      input: {
        ...defaults,
        ...saved,
        items: Array.isArray(saved?.items) && saved.items.length > 0 ? saved.items : defaults.items,
        motors: { ...defaults.motors, ...saved?.motors },
        battery: { ...defaults.battery, ...saved?.battery },
      },
      whatIf: { ...createDefaultWhatIf(), ...parsed.whatIf },
    }
  } catch {
    return { input: defaults, whatIf: createDefaultWhatIf() }
  }
}

function saveForm(input: FlightTimeInput, whatIf: FlightTimeWhatIf) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, whatIf } satisfies PersistedForm))
}

function formatMin(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—'
  const whole = Math.floor(minutes)
  const seconds = Math.round((minutes - whole) * 60)
  if (whole >= 60) {
    const hours = Math.floor(whole / 60)
    const rem = whole % 60
    return `${hours} h ${rem} min`
  }
  return `${whole} min ${seconds.toString().padStart(2, '0')} s`
}

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div>
      <dt>
        {label}
        <span className="source"> {source}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  )
}

export function MotherDroneStatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const catalog = useSimStore((state) => state.catalog)
  const [input, setInput] = useState<FlightTimeInput>(() => loadForm().input)
  const [whatIf, setWhatIf] = useState<FlightTimeWhatIf>(() => loadForm().whatIf)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    saveForm(input, whatIf)
  }, [input, whatIf, open])

  const comparison = useMemo(() => applyWhatIf(input, whatIf), [input, whatIf])
  const auw = allUpWeightKg(input)
  const motors = catalog.filter((item) => item.category === 'motor')
  const batteries = catalog.filter((item) => item.category === 'battery')

  if (!open) return null

  const patchItem = (id: string, patch: Partial<MassLineItem>) => {
    setInput((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const applyMotorFromCatalog = (component: ComponentRecord) => {
    const weight = weightFromCatalog(component.weightKg)
    setInput((prev) => ({
      ...prev,
      motors: {
        ...prev.motors,
        weightKg: weight ?? prev.motors.weightKg,
        maxThrustG: component.maxThrustG ?? prev.motors.maxThrustG,
        efficiencyGPerW: component.efficiencyGPerW ?? prev.motors.efficiencyGPerW,
      },
    }))
  }

  const applyBatteryFromCatalog = (component: ComponentRecord) => {
    const weight = weightFromCatalog(component.weightKg)
    const volts = component.voltageV
    const cells = component.cellCount
    setInput((prev) => ({
      ...prev,
      battery: {
        ...prev.battery,
        weightKg: weight ?? prev.battery.weightKg,
        capacityMah: component.capacityMah ?? prev.battery.capacityMah,
        cellCount: cells ?? prev.battery.cellCount,
        voltsPerCell:
          volts && cells && cells > 0
            ? volts / cells
            : prev.battery.voltsPerCell,
      },
    }))
  }

  const applyWeightToItem = (itemId: string, component: ComponentRecord) => {
    const weight = weightFromCatalog(component.weightKg)
    if (weight === null) return
    patchItem(itemId, { weightKg: weight })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="modal mother-drone-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>Mother-drone flight stats</h2>
            <p className="calc">
              Estimate carrier endurance from component masses, motor thrust-table efficiency, and pack energy.
              Results are estimates — DropSim does not invent datasheet numbers.
            </p>
          </div>
          <Button onClick={onClose}>Close</Button>
        </header>

        <div className="modal-body">
          <section>
            <h3>Mass breakdown</h3>
            <p className="calc">Every installed part needs a mass. Motors and the battery are entered below and counted in AUW.</p>
            <div className="table-wrap">
              <table className="mass-table">
                <thead>
                  <tr>
                    <th>Use</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Mass each</th>
                    <th>From catalog</th>
                  </tr>
                </thead>
                <tbody>
                  {input.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={item.included}
                          aria-label={`Include ${item.label}`}
                          onChange={(event) => patchItem(item.id, { included: event.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.label}
                          aria-label={`Label for ${item.id}`}
                          onChange={(event) => patchItem(item.id, { label: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.quantity}
                          onChange={(event) => patchItem(item.id, { quantity: Number(event.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <label className="inline-unit">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.weightKg}
                            onChange={(event) => patchItem(item.id, { weightKg: Number(event.target.value) || 0 })}
                          />
                          <span>kg</span>
                        </label>
                      </td>
                      <td>
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const component = catalog.find((entry) => entry.id === event.target.value)
                            if (component) applyWeightToItem(item.id, component)
                            event.target.value = ''
                          }}
                        >
                          <option value="">Load weight…</option>
                          {catalog.map((entry) => (
                            <option key={entry.id} value={entry.id} disabled={entry.weightKg == null}>
                              {entry.manufacturer} {entry.model}
                              {entry.weightKg == null ? ' (no mass)' : ` (${entry.weightKg} kg)`}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="calc">
              Current AUW (items + motors + battery): <strong>{auw.toFixed(3)} kg</strong>
              <span className="source"> calculated</span>
            </p>
          </section>

          <section className="modal-grid">
            <div>
              <h3>Cruise motors</h3>
              <p className="calc">Typical mother-drone cruise set is 2–3 identical motors. Efficiency must be the g/W at the operating thrust row, not peak.</p>
              <label className="field">
                <span className="field-top">
                  <span className="field-label">Motor count</span>
                  <span className="source">user assumption</span>
                </span>
                <select
                  value={input.motors.count}
                  onChange={(event) => setInput((prev) => ({
                    ...prev,
                    motors: { ...prev.motors, count: Number(event.target.value) },
                  }))}
                >
                  {[2, 3, 4, 6].map((count) => (
                    <option key={count} value={count}>{count} motors{count <= 3 ? ' (cruise set)' : ''}</option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Mass each"
                unit="kg"
                source="user assumption"
                value={input.motors.weightKg}
                step={0.01}
                onChange={(weightKg) => setInput((prev) => ({ ...prev, motors: { ...prev.motors, weightKg } }))}
              />
              <NumberField
                label="Max thrust each"
                unit="g"
                source="user assumption"
                value={input.motors.maxThrustG}
                step={10}
                onChange={(maxThrustG) => setInput((prev) => ({ ...prev, motors: { ...prev.motors, maxThrustG } }))}
              />
              <NumberField
                label="Efficiency at operating thrust"
                unit="g/W"
                source="user assumption"
                value={input.motors.efficiencyGPerW}
                step={0.1}
                onChange={(efficiencyGPerW) => setInput((prev) => ({ ...prev, motors: { ...prev.motors, efficiencyGPerW } }))}
              />
              <label className="field">
                <span className="field-top">
                  <span className="field-label">Fill from catalog motor</span>
                  <span className="source">catalog</span>
                </span>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const component = motors.find((entry) => entry.id === event.target.value)
                    if (component) applyMotorFromCatalog(component)
                    event.target.value = ''
                  }}
                >
                  <option value="">Choose motor…</option>
                  {motors.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.manufacturer} {entry.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <h3>Battery pack</h3>
              <p className="calc">Energy is Ah × nominal voltage. Usable fraction defaults to 0.8 so the pack is not flown flat.</p>
              <NumberField
                label="Capacity"
                unit="mAh"
                source="user assumption"
                value={input.battery.capacityMah}
                step={100}
                onChange={(capacityMah) => setInput((prev) => ({ ...prev, battery: { ...prev.battery, capacityMah } }))}
              />
              <NumberField
                label="Cells in series"
                unit="S"
                source="user assumption"
                value={input.battery.cellCount}
                step={1}
                onChange={(cellCount) => setInput((prev) => ({ ...prev, battery: { ...prev.battery, cellCount } }))}
              />
              <NumberField
                label="Volts per cell"
                unit="V"
                source="estimate"
                value={input.battery.voltsPerCell}
                step={0.01}
                onChange={(voltsPerCell) => setInput((prev) => ({ ...prev, battery: { ...prev.battery, voltsPerCell } }))}
              />
              <NumberField
                label="Pack mass"
                unit="kg"
                source="user assumption"
                value={input.battery.weightKg}
                step={0.01}
                onChange={(weightKg) => setInput((prev) => ({ ...prev, battery: { ...prev.battery, weightKg } }))}
              />
              <NumberField
                label="Usable capacity"
                unit="frac"
                source="estimate"
                value={input.battery.usableFraction}
                step={0.05}
                min={0.05}
                max={1}
                onChange={(usableFraction) => setInput((prev) => ({ ...prev, battery: { ...prev.battery, usableFraction } }))}
              />
              <p className="calc">
                Nominal pack: {nominalPackVoltage(input.battery).toFixed(1)} V
                <span className="source"> calculated</span>
              </p>
              <label className="field">
                <span className="field-top">
                  <span className="field-label">Fill from catalog battery</span>
                  <span className="source">catalog</span>
                </span>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const component = batteries.find((entry) => entry.id === event.target.value)
                    if (component) applyBatteryFromCatalog(component)
                    event.target.value = ''
                  }}
                >
                  <option value="">Choose battery…</option>
                  {batteries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.manufacturer} {entry.model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="modal-grid">
            <div>
              <h3>Operating point</h3>
              <NumberField
                label="Thrust share of weight"
                unit="×"
                source="user assumption"
                value={input.thrustShare}
                step={0.05}
                min={0.05}
                max={1.5}
                onChange={(thrustShare) => setInput((prev) => ({ ...prev, thrustShare }))}
              />
              <p className="calc">1.0 for multirotor hover. A wing-borne cruise often sits near 0.15–0.40.</p>
              <label className="field">
                <span className="field-top">
                  <span className="field-label">Flight style</span>
                  <span className="source">estimate</span>
                </span>
                <select
                  value={input.flightStyle}
                  onChange={(event) => setInput((prev) => ({ ...prev, flightStyle: event.target.value as FlightStyleId }))}
                >
                  {flightStyleOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label} — {option.note}</option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Avionics / hotel load"
                unit="W"
                source="user assumption"
                value={input.avionicsW}
                step={1}
                onChange={(avionicsW) => setInput((prev) => ({ ...prev, avionicsW }))}
              />
              <NumberField
                label="ESC efficiency"
                unit="frac"
                source="estimate"
                value={input.escEfficiency}
                step={0.01}
                min={0.5}
                max={1}
                onChange={(escEfficiency) => setInput((prev) => ({ ...prev, escEfficiency }))}
              />
            </div>

            <div>
              <h3>What-if</h3>
              <p className="calc">Try a pack upgrade or a mass cut without rewriting the baseline build.</p>
              <NumberField
                label="Capacity change"
                unit="mAh"
                source="user assumption"
                value={whatIf.capacityMahDelta}
                step={100}
                onChange={(capacityMahDelta) => setWhatIf((prev) => ({ ...prev, capacityMahDelta }))}
              />
              <NumberField
                label="Battery mass change"
                unit="kg"
                source="user assumption"
                value={whatIf.batteryWeightKgDelta}
                step={0.01}
                onChange={(batteryWeightKgDelta) => setWhatIf((prev) => ({ ...prev, batteryWeightKgDelta }))}
              />
              <NumberField
                label="Mass reduction elsewhere"
                unit="kg"
                source="user assumption"
                value={whatIf.massReductionKg}
                step={0.01}
                min={0}
                onChange={(massReductionKg) => setWhatIf((prev) => ({ ...prev, massReductionKg }))}
              />
              <NumberField
                label="Alternate cell count"
                unit="S"
                source="user assumption"
                value={whatIf.cellCountOverride ?? 0}
                step={1}
                min={0}
                onChange={(value) => setWhatIf((prev) => ({
                  ...prev,
                  cellCountOverride: value > 0 ? value : null,
                }))}
              />
              <p className="calc">Leave alternate cells at 0 to keep the baseline series count.</p>
            </div>
          </section>

          <section>
            <h3>Estimate</h3>
            {comparison.missing.length > 0 ? (
              <div className="outcome bad">
                <p>Enter the missing inputs before an endurance number is shown:</p>
                <ul>
                  {comparison.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="metrics mother-metrics">
                  <Metric label="Baseline AUW" value={`${comparison.baseline!.allUpWeightKg.toFixed(3)} kg`} source="calculated" />
                  <Metric label="Baseline flight time" value={formatMin(comparison.baseline!.flightTimeMin)} source="estimate" />
                  <Metric label="What-if AUW" value={`${comparison.modified!.allUpWeightKg.toFixed(3)} kg`} source="calculated" />
                  <Metric label="What-if flight time" value={formatMin(comparison.modified!.flightTimeMin)} source="estimate" />
                  <Metric
                    label="Δ flight time"
                    value={`${comparison.deltaFlightTimeMin! >= 0 ? '+' : ''}${comparison.deltaFlightTimeMin!.toFixed(1)} min`}
                    source="calculated"
                  />
                  <Metric label="Thrust / weight" value={`${comparison.baseline!.thrustToWeight.toFixed(2)}×`} source="calculated" />
                  <Metric label="Thrust / motor" value={`${comparison.baseline!.thrustPerMotorG.toFixed(0)} g`} source="calculated" />
                  <Metric label="Avg power" value={`${comparison.baseline!.averagePowerW.toFixed(0)} W`} source="estimate" />
                  <Metric label="Avg current" value={`${comparison.baseline!.averageCurrentA.toFixed(1)} A`} source="estimate" />
                  <Metric label="Usable energy" value={`${comparison.baseline!.usableEnergyWh.toFixed(1)} Wh`} source="calculated" />
                  <Metric
                    label="Hover throttle (est.)"
                    value={
                      comparison.baseline!.hoverThrottleEstimate == null
                        ? '—'
                        : `${(comparison.baseline!.hoverThrottleEstimate * 100).toFixed(0)} %`
                    }
                    source="estimate"
                  />
                  <Metric label="Pack energy" value={`${comparison.baseline!.batteryEnergyWh.toFixed(1)} Wh`} source="calculated" />
                </div>
                {[...comparison.baseline!.warnings, ...comparison.modified!.warnings]
                  .filter((item, index, list) => list.indexOf(item) === index)
                  .map((warning) => (
                    <p key={warning} className="warn">{warning}</p>
                  ))}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  unit,
  source,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  unit: string
  source: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">{label}</span>
        <span className="source">{source}</span>
      </span>
      <span className="field-control">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  )
}
