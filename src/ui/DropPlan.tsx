import { useState } from 'react'
import { applyDropBody, dropBodies } from '../simulation/dropBodies'
import { passiveFlightDuration, suggestRelease, type ReleaseAdvice } from '../simulation/releaseSolve'
import { useSimStore } from '../store/useSimStore'
import { ParamField } from './ParamField'

export function DropPlan() {
  const scenario = useSimStore((state) => state.scenario)
  const patch = useSimStore((state) => state.patch)
  const run = useSimStore((state) => state.run)
  const toggleLock = useSimStore((state) => state.toggleLock)
  const [advice, setAdvice] = useState<ReleaseAdvice | null>(null)
  const [solving, setSolving] = useState(false)
  const locked = (id: string) => scenario.locks.includes(id)
  const number = (
    id: string,
    label: string,
    value: number,
    unit: string,
    tooltip: string,
    set: (value: number) => void,
    step = 1,
  ) => (
    <ParamField
      id={id}
      label={label}
      value={value}
      unit={unit}
      tooltip={tooltip}
      source="User assumption"
      locked={locked(id)}
      step={step}
      onChange={set}
      onLock={(next) => toggleLock(id, next)}
    />
  )

  return (
    <div>
      <h2>Drop plan</h2>
      <p className="calc">
        Set where the carrier lets go, and the landing area you want to hit. After a run, the readout says whether the impact is inside that area.
        Suggest release speed searches heading and speed with steering left off.
      </p>
      <h2>Carrier release</h2>
      {number('plan-east', 'East', scenario.parent.position.x, 'm', 'Carrier position, east of the local origin.', (value) => patch((draft) => { draft.parent.position.x = value }))}
      {number('plan-north', 'North', scenario.parent.position.y, 'm', 'Carrier position, north of the local origin.', (value) => patch((draft) => { draft.parent.position.y = value }))}
      {number('plan-altitude', 'Altitude', scenario.parent.position.z, 'm', 'Height above the ground at release.', (value) => patch((draft) => { draft.parent.position.z = value }))}
      {number('plan-speed', 'Release speed', scenario.parent.horizontalSpeed, 'm/s', 'Horizontal speed the object inherits from the carrier.', (value) => patch((draft) => { draft.parent.horizontalSpeed = value }), 0.5)}
      {number('plan-heading', 'Release heading', scenario.parent.headingDeg, '°', '0 is north, 90 is east.', (value) => patch((draft) => { draft.parent.headingDeg = value }))}
      <h2>Landing area</h2>
      {number('plan-tx', 'Target east', scenario.control.target.x, 'm', 'Center of the area you are trying to reach.', (value) => patch((draft) => { draft.control.target.x = value }))}
      {number('plan-ty', 'Target north', scenario.control.target.y, 'm', 'Center of the area you are trying to reach.', (value) => patch((draft) => { draft.control.target.y = value }))}
      {number('plan-tr', 'Radius', scenario.control.targetRadius, 'm', 'A landing inside this radius is a success.', (value) => patch((draft) => { draft.control.targetRadius = value }))}
      <div className="save-row">
        <button
          className="btn quiet"
          disabled={solving}
          onClick={() => {
            setSolving(true)
            window.setTimeout(() => {
              setAdvice(suggestRelease(scenario))
              setSolving(false)
            }, 0)
          }}
        >
          {solving ? 'Searching…' : 'Suggest release speed'}
        </button>
        {advice && (
          <button
            className="btn primary"
            onClick={() => {
              patch((draft) => {
                draft.parent.horizontalSpeed = advice.horizontalSpeed
                draft.parent.headingDeg = advice.headingDeg
                draft.parent.inheritVelocity = true
                draft.control.enabled = false
                draft.control.actuator = 'none'
                draft.simulation.duration = passiveFlightDuration(draft)
              })
              run()
            }}
          >
            {advice.reachable ? 'Use and run' : 'Use closest and run'}
          </button>
        )}
      </div>
      {advice && <p className={advice.reachable ? 'outcome good' : 'outcome bad'}>{advice.note}</p>}
      <h2>What you drop</h2>
      <div className="preset-grid">
        {dropBodies.map((body) => (
          <button
            key={body.id}
            className="preset"
            title={body.summary}
            onClick={() => {
              patch((draft) => applyDropBody(draft, body.id))
              setAdvice(null)
            }}
          >
            <strong>{body.name}</strong>
            <span>{body.summary}</span>
          </button>
        ))}
      </div>
      <p className="calc">
        Lift-to-drag is the range knob: still air carries a glider about altitude times that ratio, which can reach past a sphere or fly past a close area.
        Mass and wing area change speed along that slope and how far the wind pushes the landing. A heavier body, or a smaller wing, drifts less.
        Release speed places a sphere. On a glider it aims the glide and does not steepen the slope. Edit the numbers on the Object tab after you pick a body.
      </p>
    </div>
  )
}
