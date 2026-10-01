import { useState } from 'react'
import { applyDropBody, dropBodies } from '../simulation/dropBodies'
import { passiveFlightDuration, suggestDropLocation, suggestRelease, type ReleaseAdvice } from '../simulation/releaseSolve'
import { useSimStore } from '../store/useSimStore'
import { ParamField, ToggleField } from './ParamField'

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
        Set the landing area, then either search a release speed from the carrier, or ask where to let go when the plane is already heading toward that destination.
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
      {number('plan-tr', 'Radius', scenario.control.targetRadius, 'm', 'A landing inside this radius is a success. Drag the circle in the view or on the map to move its center.', (value) => patch((draft) => { draft.control.targetRadius = value }))}
      <h2>Suggestion limits</h2>
      <p className="calc">
        The search aims at the center of the circle and will not suggest a speed outside these bounds.
        Mass stays as it is unless you allow it to change, and then it stays inside its bounds.
      </p>
      {number('plan-speed-min', 'Slowest release', scenario.suggestion.speedMin, 'm/s', 'Lowest speed a suggestion may use.', (value) => patch((draft) => { draft.suggestion.speedMin = value }), 0.5)}
      {number('plan-speed-max', 'Fastest release', scenario.suggestion.speedMax, 'm/s', 'Highest speed a suggestion may use.', (value) => patch((draft) => { draft.suggestion.speedMax = value }), 0.5)}
      <ToggleField label="Suggestion may change mass" checked={scenario.suggestion.varyMass} tooltip="Off keeps the object's mass. On lets the search pick a mass between the two bounds to hit the center." source="User assumption" onChange={(checked) => patch((draft) => { draft.suggestion.varyMass = checked })} />
      {number('plan-mass-min', 'Lightest mass', scenario.suggestion.massMin, 'kg', 'Lowest mass a suggestion may use when mass may change.', (value) => patch((draft) => { draft.suggestion.massMin = Math.max(0.05, value) }), 0.05)}
      {number('plan-mass-max', 'Heaviest mass', scenario.suggestion.massMax, 'kg', 'Highest mass a suggestion may use when mass may change.', (value) => patch((draft) => { draft.suggestion.massMax = Math.max(0.05, value) }), 0.05)}
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
        <button
          className="btn quiet"
          disabled={solving}
          onClick={() => {
            setSolving(true)
            window.setTimeout(() => {
              setAdvice(suggestDropLocation(scenario))
              setSolving(false)
            }, 0)
          }}
        >
          {solving ? 'Searching…' : 'Suggest drop location'}
        </button>
        {advice && (
          <button
            className="btn primary"
            onClick={() => {
              patch((draft) => {
                if (advice.releaseEast !== undefined && advice.releaseNorth !== undefined) {
                  draft.parent.position.x = advice.releaseEast
                  draft.parent.position.y = advice.releaseNorth
                  if (advice.releaseAltitude !== undefined) draft.parent.position.z = advice.releaseAltitude
                }
                draft.parent.horizontalSpeed = advice.horizontalSpeed
                draft.parent.headingDeg = advice.headingDeg
                if (advice.mass !== undefined) draft.object.mass = advice.mass
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
