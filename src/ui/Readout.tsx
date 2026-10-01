import { length } from '../math/vec3'
import { useSimStore, type RightTab } from '../store/useSimStore'
import { downloadMonteCarlo } from '../store/useSimStore'
import { vectorLegend, colors } from '../visualization/colors'
import { sampleAt } from '../visualization/sampleAt'
import { Button } from '../components/Button'
import { formatMetric } from '../simulation/export'
import { landingsInside, meanOffsetSentence } from '../visualization/trialSummary'

const rightTabs: { id: RightTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'compare', label: 'Compare' },
  { id: 'trials', label: 'Trials' },
  { id: 'notes', label: 'Notes' },
]

export function Readout() {
  const tab = useSimStore((state) => state.rightTab)
  const setTab = useSimStore((state) => state.setRightTab)
  return (
    <aside className="panel readout">
      <div className="tabs">
        {rightTabs.map((item) => (
          <button key={item.id} className={item.id === tab ? 'tab on' : 'tab'} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="panel-scroll">
        {tab === 'now' && <NowPanel />}
        {tab === 'compare' && <ComparePanel />}
        {tab === 'trials' && <TrialsPanel />}
        {tab === 'notes' && <NotesPanel />}
      </div>
    </aside>
  )
}

function NowPanel() {
  const result = useSimStore((state) => state.result)
  const time = useSimStore((state) => state.time)
  const scenario = useSimStore((state) => state.scenario)
  const visibleVectors = useSimStore((state) => state.visibleVectors)
  const toggleVector = useSimStore((state) => state.toggleVector)
  const setAllVectors = useSimStore((state) => state.setAllVectors)
  const sample = sampleAt(result.samples, time)
  const metrics = result.metrics
  const positionError = sample
    ? Math.hypot(sample.estimatedPosition.x - sample.truePosition.x, sample.estimatedPosition.y - sample.truePosition.y, sample.estimatedPosition.z - sample.truePosition.z)
    : null
  return (
    <div>
      <h2>Landing</h2>
      {metrics.landed && metrics.landingPosition ? (
        <dl className="metrics">
          <div><dt>East</dt><dd>{metrics.landingPosition.x.toFixed(1)} m</dd></div>
          <div><dt>North</dt><dd>{metrics.landingPosition.y.toFixed(1)} m</dd></div>
          <div><dt>Miss</dt><dd>{formatMetric(metrics.horizontalMiss, 1)} m</dd></div>
          <div><dt>Time</dt><dd>{formatMetric(metrics.landingTime, 2)} s</dd></div>
          <div><dt>Impact</dt><dd>{formatMetric(metrics.impactSpeed, 1)} m/s</dd></div>
        </dl>
      ) : (
        <p className="calc">{result.problems[0] ?? 'The object has not reached the ground in this run.'}</p>
      )}
      <h2>This instant</h2>
      {sample && (
        <>
          <dl className="metrics">
            <div><dt>Altitude</dt><dd>{sample.truePosition.z.toFixed(1)} m</dd></div>
            <div><dt>Speed</dt><dd>{length(sample.trueVelocity).toFixed(1)} m/s</dd></div>
            <div><dt>Position error</dt><dd>{positionError?.toFixed(2)} m</dd></div>
            <div><dt>Distance</dt><dd>{sample.distance.toFixed(0)} m</dd></div>
            <div><dt>Modeled loss</dt><dd>{(sample.modeledLoss * 100).toFixed(1)}%</dd></div>
            <div><dt>Modeled latency</dt><dd>{(sample.modeledLatency * 1000).toFixed(0)} ms</dd></div>
          </dl>
          <div className="legend-actions">
            <h2>Vectors</h2>
            <button type="button" onClick={() => setAllVectors(true)}>Show all</button>
            <button type="button" onClick={() => setAllVectors(false)}>Hide all</button>
          </div>
          <ul className="legend">
            {vectorLegend.map((entry) => (
              <li key={entry.id} className={visibleVectors[entry.id] ? 'legend-row' : 'legend-row off'}>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleVectors[entry.id]}
                    onChange={() => toggleVector(entry.id)}
                  />
                  <i style={{ background: colors[entry.id] }} />
                  <span>{entry.name}</span>
                  <strong>{magnitude(entry.id, sample, scenario.object.mass)}</strong>
                </label>
                <em className="bubble">{entry.tip} Uncheck to hide this arrow. The number stays.</em>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>Run totals</h2>
      <dl className="metrics">
        <div><dt>RMS position error</dt><dd>{formatMetric(metrics.rmsPositionError)} m</dd></div>
        <div><dt>RMS velocity error</dt><dd>{formatMetric(metrics.rmsVelocityError)} m/s</dd></div>
        <div><dt>Packets sent</dt><dd>{metrics.packetsSent}</dd></div>
        <div><dt>Packets lost</dt><dd>{metrics.packetsLost}</dd></div>
        <div><dt>Average latency</dt><dd>{(metrics.averageLatency * 1000).toFixed(0)} ms</dd></div>
        <div><dt>Corrections delivered</dt><dd>{metrics.correctionCount}</dd></div>
        <div><dt>Compute</dt><dd>{metrics.computeSeconds.toFixed(3)} s</dd></div>
      </dl>
      <p className="calc">Air density {result.airDensity.toFixed(3)} kg/m³ · {result.densitySource}</p>
      {result.warnings.map((warning) => (
        <p key={warning} className="warn">{warning}</p>
      ))}
    </div>
  )
}

function magnitude(id: string, sample: NonNullable<ReturnType<typeof sampleAt>>, mass: number): string {
  const table: Record<string, number> = {
    wind: length(sample.wind),
    velocity: length(sample.trueVelocity),
    ground: length(sample.groundVelocity),
    air: length(sample.airRelative),
    gravity: length(sample.gravity),
    drag: length(sample.drag),
    lift: length(sample.lift),
    correction: length(sample.correction),
    link: sample.distance,
  }
  const value = table[id] ?? 0
  if (id === 'link') return `${value.toFixed(0)} m`
  if (id === 'gravity' || id === 'drag' || id === 'lift' || id === 'correction') {
    return `${value.toFixed(1)} N`
  }
  void mass
  return `${value.toFixed(1)} m/s`
}

function ComparePanel() {
  const comparison = useSimStore((state) => state.comparison)
  const comparing = useSimStore((state) => state.comparing)
  const compare = useSimStore((state) => state.compare)
  return (
    <div>
      <p className="calc">Same release, different information or control. There is no single score. Read the meters that matter for the hardware you might buy.</p>
      <Button tone="primary" onClick={() => void compare()} disabled={comparing}>{comparing ? 'Comparing…' : 'Compare cases'}</Button>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Miss m</th>
              <th>RMS path m</th>
              <th>Pos err m</th>
              <th>Lost</th>
              <th>Latency ms</th>
            </tr>
          </thead>
          <tbody>
            {comparison?.map((row) => (
              <tr key={row.id} title={row.detail}>
                <td>{row.name}</td>
                <td>{formatMetric(row.result.metrics.horizontalMiss, 1)}</td>
                <td>{formatMetric(row.result.metrics.rmsTrajectoryError, 1)}</td>
                <td>{formatMetric(row.result.metrics.rmsPositionError, 2)}</td>
                <td>{row.result.metrics.packetsLost}</td>
                <td>{(row.result.metrics.averageLatency * 1000).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TrialsPanel() {
  const request = useSimStore((state) => state.mcRequest)
  const target = useSimStore((state) => state.scenario.control.target)
  const radius = useSimStore((state) => state.scenario.control.targetRadius)
  const setMcRequest = useSimStore((state) => state.setMcRequest)
  const start = useSimStore((state) => state.startMonteCarlo)
  const progress = useSimStore((state) => state.mcProgress)
  const result = useSimStore((state) => state.monteCarlo)
  const error = useSimStore((state) => state.mcError)
  return (
    <div>
      <p className="calc">Each trial changes wind, mass, drag, and release a little, then flies the same object again. The map’s yellow dots are those impact points. The numbers below are distances to the center of the landing ring, not distances between the dots.</p>
      <label className="field">
        <span className="field-label">Runs</span>
        <select value={request.runs} onChange={(event) => setMcRequest((draft) => { draft.runs = Number(event.target.value) })}>
          {[10, 100, 1000, 10000].map((count) => (
            <option key={count} value={count}>{count}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Wind speed sigma m/s</span>
        <input type="number" value={request.windSpeedSigma} step={0.1} onChange={(event) => setMcRequest((draft) => { draft.windSpeedSigma = Number(event.target.value) })} />
      </label>
      <label className="field">
        <span className="field-label">Wind direction sigma °</span>
        <input type="number" value={request.windDirectionSigmaDeg} step={1} onChange={(event) => setMcRequest((draft) => { draft.windDirectionSigmaDeg = Number(event.target.value) })} />
      </label>
      <label className="field">
        <span className="field-label">Mass fraction sigma</span>
        <input type="number" value={request.massFractionSigma} step={0.01} onChange={(event) => setMcRequest((draft) => { draft.massFractionSigma = Number(event.target.value) })} />
      </label>
      <label className="field">
        <span className="field-label">Cd fraction sigma</span>
        <input type="number" value={request.cdFractionSigma} step={0.01} onChange={(event) => setMcRequest((draft) => { draft.cdFractionSigma = Number(event.target.value) })} />
      </label>
      <Button tone="primary" onClick={start} disabled={progress !== null}>{progress ? `${progress.completed} / ${progress.total}` : 'Run trials'}</Button>
      {error && <p className="warn">{error}</p>}
      {result && (
        <>
          <p className="calc">{meanOffsetSentence(result, target)} {landingsInside(result, target, radius)} of {result.runsLanded} landed inside the ring ({radius.toFixed(0)} m radius).</p>
          <dl className="metrics">
            <div><dt>Reached the ground</dt><dd>{result.runsLanded} / {result.runsRequested}</dd></div>
            <div><dt>Average east</dt><dd>{formatMetric(result.meanEast, 1)} m</dd></div>
            <div><dt>Average north</dt><dd>{formatMetric(result.meanNorth, 1)} m</dd></div>
            <div><dt>East spread</dt><dd>{formatMetric(result.stdEast, 1)} m</dd></div>
            <div><dt>North spread</dt><dd>{formatMetric(result.stdNorth, 1)} m</dd></div>
            <div><dt>Half the trials within</dt><dd>{formatMetric(result.radialP50, 1)} m</dd></div>
            <div><dt>90% of trials within</dt><dd>{formatMetric(result.radialP90, 1)} m</dd></div>
          </dl>
          <p className="calc">“Within” is distance from the ring center. East and north spread describe how wide the yellow cloud is.</p>
          <Button onClick={downloadMonteCarlo}>Export landing CSV</Button>
        </>
      )}
    </div>
  )
}

function NotesPanel() {
  return (
    <div className="notes">
      <h2>What is actually modeled</h2>
      <p><strong>Physically modeled.</strong> Gravity, quadratic drag, wind-relative airspeed, optional lift, optional buoyancy, ideal-gas or ISA density, and fixed-step Runge–Kutta integration.</p>
      <p><strong>User assumption.</strong> Mass, size, Cd, Cl, wind, rain factors, sensor noise, and every radio number you did not import from a source.</p>
      <p><strong>Estimate.</strong> The textbook sphere Cd of 0.47, the turbulence shaping, and the free-space-like signal indicator. None of these are measurements of your hardware.</p>
      <p><strong>Not modeled.</strong> CFD, real radio fading, body-frame IMU strapdown, and an extended Kalman filter. Those slots exist so they can be added without replacing the scenario file.</p>
      <p>Coordinates are East, North, Up. The 3D view uses X = East, Y = Up, Z = North. Headings use 0° = north and 90° = east.</p>
      <p>The parent aircraft flies a straight kinematic path. It is a release platform, not a high-fidelity airplane.</p>
    </div>
  )
}
