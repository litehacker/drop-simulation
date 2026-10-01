import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { linkCurve } from '../communications/packetLoss'
import { commProfiles } from '../communications/profiles'
import { length } from '../math/vec3'
import { useSimStore } from '../store/useSimStore'
import { colors } from '../visualization/colors'

type ChartTab = 'altitude' | 'speed' | 'error' | 'link'

export function ChartsPanel() {
  const [tab, setTab] = useState<ChartTab>('altitude')
  const samples = useSimStore((state) => state.result.samples)
  const profile = useSimStore((state) => state.scenario.communication.profile)
  const stride = Math.max(1, Math.floor(samples.length / 240))
  const rows = samples.filter((_, index) => index % stride === 0).map((sample) => ({
    t: Number(sample.t.toFixed(2)),
    up: sample.truePosition.z,
    estimated: sample.estimatedPosition.z,
    speed: length(sample.trueVelocity),
    positionError: Math.hypot(
      sample.estimatedPosition.x - sample.truePosition.x,
      sample.estimatedPosition.y - sample.truePosition.y,
      sample.estimatedPosition.z - sample.truePosition.z,
    ),
    altitudeError: sample.estimatedPosition.z - sample.truePosition.z,
    velocityError: length({
      x: sample.estimatedVelocity.x - sample.trueVelocity.x,
      y: sample.estimatedVelocity.y - sample.trueVelocity.y,
      z: sample.estimatedVelocity.z - sample.trueVelocity.z,
    }),
  }))
  const maxDistance = Math.max(profile.nominalRangeM * 1.3, 1000)
  const currentCurve = linkCurve(profile, maxDistance)
  const linkRows = currentCurve.map((point, index) => {
    const row: Record<string, number> = {
      distance: Math.round(point.distanceM),
      loss: point.loss * 100,
      latency: point.latencyS * 1000,
    }
    for (const example of commProfiles) {
      const curve = linkCurve(example, maxDistance)
      row[example.id] = (curve[index]?.loss ?? 0) * 100
    }
    return row
  })

  return (
    <div className="charts">
      <div className="tabs">
        {(['altitude', 'speed', 'error', 'link'] as ChartTab[]).map((item) => (
          <button key={item} className={item === tab ? 'tab on' : 'tab'} onClick={() => setTab(item)}>
            {item === 'link' ? 'Link model' : item}
          </button>
        ))}
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          {tab === 'link' ? (
            <LineChart data={linkRows}>
              <CartesianGrid stroke="#2a3b32" />
              <XAxis dataKey="distance" stroke="#93a89c" unit=" m" />
              <YAxis stroke="#93a89c" unit="%" />
              <Tooltip />
              <Legend />
              <Line dataKey="loss" name={`${profile.name} (${profile.confidence})`} stroke={colors.correction} dot={false} strokeWidth={2} />
              {commProfiles.filter((item) => item.id !== profile.id).map((item) => (
                <Line key={item.id} dataKey={item.id} name={`${item.name} (${item.confidence})`} stroke={item.id === 'ideal' ? colors.velocity : colors.predicted} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          ) : (
            <LineChart data={rows}>
              <CartesianGrid stroke="#2a3b32" />
              <XAxis dataKey="t" stroke="#93a89c" unit=" s" />
              <YAxis stroke="#93a89c" />
              <Tooltip />
              <Legend />
              {tab === 'altitude' && <Line dataKey="up" name="True altitude" stroke={colors.truePath} dot={false} strokeWidth={2} />}
              {tab === 'altitude' && <Line dataKey="estimated" name="Estimated altitude" stroke={colors.estimated} dot={false} strokeWidth={2} />}
              {tab === 'speed' && <Line dataKey="speed" name="Ground speed" stroke={colors.velocity} dot={false} strokeWidth={2} />}
              {tab === 'error' && <Line dataKey="positionError" name="Position error" stroke={colors.gravity} dot={false} strokeWidth={2} />}
              {tab === 'error' && <Line dataKey="altitudeError" name="Altitude error" stroke={colors.air} dot={false} strokeWidth={2} />}
              {tab === 'error' && <Line dataKey="velocityError" name="Velocity error" stroke={colors.drag} dot={false} strokeWidth={2} />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {tab === 'link' && (
        <p className="calc">Loss and latency curves are the selected model. They are not measurements. Nominal range is not a guaranteed link.</p>
      )}
    </div>
  )
}
