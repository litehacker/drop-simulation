import { useSimStore } from '../store/useSimStore'
import { colors } from './colors'
import { sampleAt } from './sampleAt'

export function MapPlot() {
  const samples = useSimStore((state) => state.result.samples)
  const prediction = useSimStore((state) => state.result.prediction)
  const target = useSimStore((state) => state.scenario.control.target)
  const radius = useSimStore((state) => state.scenario.control.targetRadius)
  const landing = useSimStore((state) => state.result.landing)
  const comparison = useSimStore((state) => state.comparison)
  const monteCarlo = useSimStore((state) => state.monteCarlo)
  const time = useSimStore((state) => state.time)
  const current = sampleAt(samples, time)

  const points = [
    ...samples.map((sample) => ({ e: sample.truePosition.x, n: sample.truePosition.y })),
    ...prediction.map((sample) => ({ e: sample.position.x, n: sample.position.y })),
    { e: target.x, n: target.y },
    ...(landing ? [{ e: landing.position.x, n: landing.position.y }] : []),
    ...(monteCarlo?.landings.map((point) => ({ e: point.east, n: point.north })) ?? []),
  ]
  if (points.length === 0) return <div className="map empty">Run a simulation to draw the ground track.</div>
  const minE = Math.min(...points.map((point) => point.e))
  const maxE = Math.max(...points.map((point) => point.e))
  const minN = Math.min(...points.map((point) => point.n))
  const maxN = Math.max(...points.map((point) => point.n))
  const span = Math.max(maxE - minE, maxN - minN, radius * 2, 40)
  const midE = (minE + maxE) / 2
  const midN = (minN + maxN) / 2
  const pad = 28
  const size = 320
  const scale = (size - pad * 2) / span
  const xOf = (east: number) => size / 2 + (east - midE) * scale
  const yOf = (north: number) => size / 2 - (north - midN) * scale
  const path = (coords: { e: number; n: number }[]) => coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(point.e)} ${yOf(point.n)}`).join(' ')

  return (
    <svg className="map" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="East-north ground track">
      <rect width={size} height={size} fill="#121a16" />
      <text x="12" y="18" className="map-label">North up · East right</text>
      <path d={path(prediction.map((point) => ({ e: point.position.x, n: point.position.y })))} stroke={colors.predicted} fill="none" strokeDasharray="4 4" />
      <path d={path(samples.map((sample) => ({ e: sample.estimatedPosition.x, n: sample.estimatedPosition.y })))} stroke={colors.estimated} fill="none" strokeDasharray="2 3" />
      <path d={path(samples.map((sample) => ({ e: sample.truePosition.x, n: sample.truePosition.y })))} stroke={colors.truePath} fill="none" strokeWidth="2" />
      <circle cx={xOf(target.x)} cy={yOf(target.y)} r={Math.max(radius * scale, 3)} fill="none" stroke={colors.target} />
      {comparison?.map((row) =>
        row.result.landing ? (
          <circle key={row.id} cx={xOf(row.result.landing.position.x)} cy={yOf(row.result.landing.position.y)} r="3.5" fill={colors.air}>
            <title>{row.name}</title>
          </circle>
        ) : null,
      )}
      {monteCarlo?.landings.map((point) => (
        <circle key={point.run} cx={xOf(point.east)} cy={yOf(point.north)} r="2" fill={colors.correction} opacity="0.7" />
      ))}
      {current && <circle cx={xOf(current.truePosition.x)} cy={yOf(current.truePosition.y)} r="4.5" fill={colors.object} />}
    </svg>
  )
}
