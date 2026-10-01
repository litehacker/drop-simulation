import { useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { colors } from './colors'
import { sampleAt } from './sampleAt'
import { landingsInside, meanOffsetSentence } from './trialSummary'

export function MapPlot() {
  const samples = useSimStore((state) => state.result.samples)
  const prediction = useSimStore((state) => state.result.prediction)
  const target = useSimStore((state) => state.scenario.control.target)
  const carrier = useSimStore((state) => state.scenario.parent.position)
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
    { e: carrier.x, n: carrier.y },
    ...(landing ? [{ e: landing.position.x, n: landing.position.y }] : []),
    ...(monteCarlo?.landings.map((point) => ({ e: point.east, n: point.north })) ?? []),
    ...(monteCarlo?.meanEast !== null && monteCarlo?.meanEast !== undefined && monteCarlo.meanNorth !== null
      ? [{ e: monteCarlo.meanEast, n: monteCarlo.meanNorth }]
      : []),
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
  const mean =
    monteCarlo && monteCarlo.meanEast !== null && monteCarlo.meanNorth !== null
      ? { e: monteCarlo.meanEast, n: monteCarlo.meanNorth }
      : null
  const inside = monteCarlo ? landingsInside(monteCarlo, target, radius) : 0
  const patch = useSimStore((state) => state.patch)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const [frozen, setFrozen] = useState<{ midE: number; midN: number; scale: number } | null>(null)
  const frame = frozen ?? { midE, midN, scale }
  const frameRef = useRef(frame)
  frameRef.current = frame
  const xOfFrame = (east: number) => size / 2 + (east - frame.midE) * frame.scale
  const yOfFrame = (north: number) => size / 2 - (north - frame.midN) * frame.scale
  const pathFrame = (coords: { e: number; n: number }[]) => coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOfFrame(point.e)} ${yOfFrame(point.n)}`).join(' ')
  const moveAim = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!dragging.current || !svgRef.current) return
    const point = svgRef.current.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svgRef.current.getScreenCTM()
    if (!matrix) return
    const local = point.matrixTransform(matrix.inverse())
    const held = frameRef.current
    const east = held.midE + (local.x - size / 2) / held.scale
    const north = held.midN - (local.y - size / 2) / held.scale
    patch((draft) => {
      draft.control.target.x = east
      draft.control.target.y = north
      draft.control.target.z = 0
    })
  }

  return (
    <figure className="map-figure">
      <svg ref={svgRef} className="map" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="East-north ground track. Drag the target circle to move its center.">
        <rect width={size} height={size} fill="#121a16" />
        <text x="12" y="18" className="map-label">North up · East right</text>
        <path d={pathFrame(prediction.map((point) => ({ e: point.position.x, n: point.position.y })))} stroke={colors.predicted} fill="none" strokeDasharray="4 4" />
        <path d={pathFrame(samples.map((sample) => ({ e: sample.estimatedPosition.x, n: sample.estimatedPosition.y })))} stroke={colors.estimated} fill="none" strokeDasharray="2 3" />
        <path d={pathFrame(samples.map((sample) => ({ e: sample.truePosition.x, n: sample.truePosition.y })))} stroke={colors.truePath} fill="none" strokeWidth="2" />
        <circle
          className="aim-circle"
          cx={xOfFrame(target.x)}
          cy={yOfFrame(target.y)}
          r={Math.max(radius * frame.scale, 8)}
          fill={colors.target}
          fillOpacity="0.16"
          stroke={colors.target}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            const next = { midE, midN, scale }
            frameRef.current = next
            dragging.current = true
            setFrozen(next)
          }}
          onPointerMove={moveAim}
          onPointerUp={() => {
            dragging.current = false
            setFrozen(null)
          }}
        />
        <circle cx={xOfFrame(target.x)} cy={yOfFrame(target.y)} r="3.5" fill="#f7f4ea" />
        <text x={xOfFrame(target.x) + 8} y={yOfFrame(target.y) - 6} className="map-label">target</text>
        <rect x={xOfFrame(carrier.x) - 5} y={yOfFrame(carrier.y) - 5} width="10" height="10" fill="none" stroke={colors.parent} />
        <text x={xOfFrame(carrier.x) + 8} y={yOfFrame(carrier.y) + 4} className="map-label">carrier</text>
        {comparison?.map((row) =>
          row.result.landing ? (
            <circle key={row.id} cx={xOfFrame(row.result.landing.position.x)} cy={yOfFrame(row.result.landing.position.y)} r="3.5" fill={colors.air}>
              <title>{row.name}</title>
            </circle>
          ) : null,
        )}
        {monteCarlo?.landings.map((point) => (
          <circle key={point.run} cx={xOfFrame(point.east)} cy={yOfFrame(point.north)} r="2.2" fill={colors.correction} opacity="0.75">
            <title>{`Trial ${point.run + 1}: ${point.radialError.toFixed(0)} m from the ring center`}</title>
          </circle>
        ))}
        {mean && (
          <g>
            <line x1={xOfFrame(mean.e) - 6} y1={yOfFrame(mean.n)} x2={xOfFrame(mean.e) + 6} y2={yOfFrame(mean.n)} stroke="#f7f4ea" strokeWidth="1.6" />
            <line x1={xOfFrame(mean.e)} y1={yOfFrame(mean.n) - 6} x2={xOfFrame(mean.e)} y2={yOfFrame(mean.n) + 6} stroke="#f7f4ea" strokeWidth="1.6" />
          </g>
        )}
        {current && <circle cx={xOfFrame(current.truePosition.x)} cy={yOfFrame(current.truePosition.y)} r="4.5" fill={colors.object} />}
        <g className="map-key">
          <circle cx="18" cy={size - 46} r="3" fill={colors.correction} />
          <text x="26" y={size - 42} className="map-label">trial landing</text>
          <circle cx="108" cy={size - 46} r="5" fill="none" stroke={colors.target} />
          <text x="118" y={size - 42} className="map-label">target area</text>
          <line x1="14" y1={size - 28} x2="28" y2={size - 28} stroke={colors.truePath} strokeWidth="2" />
          <text x="34" y={size - 24} className="map-label">this playback</text>
          {mean && (
            <>
              <line x1="128" y1={size - 28} x2="140" y2={size - 28} stroke="#f7f4ea" strokeWidth="1.4" />
              <line x1="134" y1={size - 34} x2="134" y2={size - 22} stroke="#f7f4ea" strokeWidth="1.4" />
              <text x="146" y={size - 24} className="map-label">average</text>
            </>
          )}
        </g>
      </svg>
      {monteCarlo && (
        <figcaption>
          Each yellow dot is where one trial hit the ground. The ring is the landing area you set. The green line is the single run in the 3D view, not an average of the trials. {inside} of {monteCarlo.runsLanded} landed inside the ring. {meanOffsetSentence(monteCarlo, target)} A tight cloud far from the ring means the trials agree with each other, and they agree on missing the area.
        </figcaption>
      )}
    </figure>
  )
}
