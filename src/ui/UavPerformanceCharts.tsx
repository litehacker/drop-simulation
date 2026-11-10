import { useState, type ReactNode } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PerformanceResults } from '../estimation/uavPerformance'

const axis = { stroke: '#93a89c', fontSize: 11 }
const grid = '#2a3a32'

export function UavPerformanceCharts({ results, cruiseKmh }: { results: PerformanceResults; cruiseKmh: number }) {
  const [metric, setMetric] = useState<'stallSpeedKmh' | 'cruisePowerW' | 'climbCurrentA' | 'wingLoadingKgM2' | 'enduranceMin'>('cruisePowerW')
  const metricLabel: Record<typeof metric, string> = {
    stallSpeedKmh: 'Stall speed (km/h)',
    cruisePowerW: 'Cruise electrical power (W)',
    climbCurrentA: 'Climb current (A)',
    wingLoadingKgM2: 'Wing loading (kg/m²)',
    enduranceMin: 'Cruise endurance (min)',
  }
  const stall = results.stallSpeedKmh.value
  return (
    <div className="uav-charts">
      <Chart title="Current versus time" note="Each segment is one phase. A gap means that phase has no current.">
        <div className="uav-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={results.timeProfile}>
            <CartesianGrid stroke={grid} />
            <XAxis dataKey="tMin" type="number" tick={axis} unit=" min" />
            <YAxis tick={axis} unit=" A" />
            <Tooltip content={<PhaseTip unit="A" valueKey="currentA" />} />
            <Line type="linear" dataKey="currentA" name="Current" stroke="#e2b657" dot={false} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Chart>
      <Chart title="Power versus time" note="Electrical power is phase current times nominal voltage.">
        <div className="uav-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={results.timeProfile}>
            <CartesianGrid stroke={grid} />
            <XAxis dataKey="tMin" type="number" tick={axis} unit=" min" />
            <YAxis tick={axis} unit=" W" />
            <Tooltip content={<PhaseTip unit="W" valueKey="powerW" />} />
            <Line type="linear" dataKey="powerW" name="Power" stroke="#7eb6ff" dot={false} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Chart>
      <Chart title="Battery state of charge" note="Remaining percent of nameplate capacity. The lines are the usable floor and the reserve floor.">
        <div className="uav-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={results.timeProfile}>
            <CartesianGrid stroke={grid} />
            <XAxis dataKey="tMin" type="number" tick={axis} unit=" min" />
            <YAxis tick={axis} unit="%" domain={[0, 100]} />
            <Tooltip content={<PhaseTip unit="%" valueKey="remainingPercent" />} />
            <Legend />
            {results.usableRemainingPercent !== null && (
              <ReferenceLine y={results.usableRemainingPercent} stroke="#d0b15a" strokeDasharray="4 4" label="Usable floor" />
            )}
            {results.reserveRemainingPercent !== null && (
              <ReferenceLine y={results.reserveRemainingPercent} stroke="#d36b6b" strokeDasharray="4 4" label="Reserve floor" />
            )}
            <Line type="monotone" dataKey="remainingPercent" name="Remaining" stroke="#8dcea8" dot={false} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Chart>
      <Chart title="Cruise speed versus electrical power" note="Below stall the power line stops. The power limit is the motor's short-duration rating.">
        <div className="uav-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={results.speedSweep}>
            <CartesianGrid stroke={grid} />
            <XAxis dataKey="speedKmh" type="number" tick={axis} unit=" km/h" />
            <YAxis tick={axis} unit=" W" />
            <Tooltip />
            {stall !== null && <ReferenceLine x={stall} stroke="#d36b6b" label="Stall" />}
            <ReferenceLine x={cruiseKmh} stroke="#e2b657" label="Cruise" />
            {results.lowestPowerSpeedKmh !== null && <ReferenceLine x={results.lowestPowerSpeedKmh} stroke="#8dcea8" label="Lowest power" />}
            {results.maxSpeedWithinPowerKmh !== null && <ReferenceLine x={results.maxSpeedWithinPowerKmh} stroke="#7eb6ff" label="Power limit" />}
            <Line type="monotone" dataKey="electricalPowerW" name="Electrical power" stroke="#e2b657" dot={false} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Chart>
      <Chart title="MTOW sensitivity" note="Same wing, battery, and speeds. Battery mass is not added on top of these weights.">
        <label className="field">
          <span className="field-label">Metric</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)}>
            <option value="stallSpeedKmh">Stall speed</option>
            <option value="cruisePowerW">Cruise power</option>
            <option value="climbCurrentA">Climb current</option>
            <option value="wingLoadingKgM2">Wing loading</option>
            <option value="enduranceMin">Endurance</option>
          </select>
        </label>
        <div className="uav-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results.weightSweep}>
              <CartesianGrid stroke={grid} />
              <XAxis dataKey="mtowKg" type="number" tick={axis} unit=" kg" />
              <YAxis tick={axis} />
              <Tooltip />
              <Line type="monotone" dataKey={metric} name={metricLabel[metric]} stroke="#c9d6ce" dot={false} strokeWidth={2} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Chart>
    </div>
  )
}

function Chart({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section>
      <h3>{title}</h3>
      <p className="calc">{note}</p>
      {children}
    </section>
  )
}

function PhaseTip({ active, payload, unit, valueKey }: { active?: boolean; payload?: { payload: { phase: string; tMin: number; currentA: number | null; powerW: number | null; remainingPercent: number | null } }[]; unit: string; valueKey: 'currentA' | 'powerW' | 'remainingPercent' }) {
  if (!active || !payload?.[0]) return null
  const row = payload[0].payload
  const value = row[valueKey]
  return (
    <div className="uav-tip">
      <strong>{row.phase}</strong>
      <div>{row.tMin.toFixed(2)} min</div>
      <div>{value === null ? 'No current' : `${value.toFixed(2)} ${unit}`}</div>
    </div>
  )
}
