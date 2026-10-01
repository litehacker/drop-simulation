import { useState } from 'react'
import { linkCurve } from '../communications/packetLoss'
import { commProfiles } from '../communications/profiles'
import { componentCategories } from '../catalog/schema'
import { geometryOf } from '../physics/shapes'
import { presets } from '../simulation/presets'
import { useSimStore, type LeftTab } from '../store/useSimStore'
import { IntegrationsPanel } from './IntegrationsPanel'
import { ChoiceField, ParamField, TextField, ToggleField } from './ParamField'

const tabs: { id: LeftTab; label: string }[] = [
  { id: 'scenario', label: 'Scenario' },
  { id: 'object', label: 'Object' },
  { id: 'environment', label: 'Environment' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'link', label: 'Link' },
  { id: 'control', label: 'Control' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'integrations', label: 'Integrations' },
]

export function ConfigPanel() {
  const tab = useSimStore((state) => state.leftTab)
  const setTab = useSimStore((state) => state.setLeftTab)
  const scenario = useSimStore((state) => state.scenario)
  const patch = useSimStore((state) => state.patch)
  const toggleLock = useSimStore((state) => state.toggleLock)
  const applyPreset = useSimStore((state) => state.applyPreset)
  const library = useSimStore((state) => state.library)
  const saveScenario = useSimStore((state) => state.saveScenario)
  const loadScenario = useSimStore((state) => state.loadScenario)
  const deleteScenario = useSimStore((state) => state.deleteScenario)
  const importScenarioText = useSimStore((state) => state.importScenarioText)
  const [saveName, setSaveName] = useState(scenario.name)
  const [importError, setImportError] = useState<string | null>(null)

  const locked = (id: string) => scenario.locks.includes(id)
  const number = (
    id: string,
    label: string,
    value: number,
    unit: string,
    tooltip: string,
    source: string,
    set: (value: number) => void,
    step = 0.1,
  ) => (
    <ParamField
      key={id}
      id={id}
      label={label}
      value={value}
      unit={unit}
      tooltip={tooltip}
      source={source}
      locked={locked(id)}
      step={step}
      onChange={set}
      onLock={(next) => toggleLock(id, next)}
    />
  )

  const geometry = geometryOf({
    shape: scenario.object.shape,
    mass: scenario.object.mass,
    diameter: scenario.object.diameter,
    length: scenario.object.length,
    width: scenario.object.width,
    height: scenario.object.height,
    customVolume: scenario.object.customVolume,
    referenceAreaOverride: scenario.object.referenceAreaOverride,
    wingArea: scenario.object.wingArea,
  })

  return (
    <div className="panel config">
      <div className="tabs">
        {tabs.map((item) => (
          <button key={item.id} className={item.id === tab ? 'tab on' : 'tab'} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="panel-scroll">
        {tab === 'scenario' && (
          <section>
            <h2>Presets</h2>
            <div className="preset-grid">
              {presets.map((preset) => (
                <button key={preset.id} className="preset" title={preset.summary} onClick={() => applyPreset(preset.id)}>
                  <strong>{preset.name}</strong>
                  <span>{preset.summary}</span>
                </button>
              ))}
            </div>
            <TextField
              label="Scenario name"
              value={scenario.name}
              tooltip="Name stored with the scenario file."
              source="User assumption"
              onChange={(value) => patch((draft) => { draft.name = value })}
            />
            {number('seed', 'Random seed', scenario.seed, '', 'Same seed repeats wind, sensor noise, and packet loss.', 'User assumption', (value) => patch((draft) => { draft.seed = Math.round(value) }), 1)}
            {number('duration', 'Duration', scenario.simulation.duration, 's', 'Maximum flight time. The run also stops at ground contact.', 'User assumption', (value) => patch((draft) => { draft.simulation.duration = value }), 1)}
            {number('dt', 'Physics timestep', scenario.simulation.physicsDt, 's', 'Fixed integration step. Sensor and telemetry rates cannot exceed 1/dt.', 'User assumption', (value) => patch((draft) => { draft.simulation.physicsDt = value }), 0.001)}
            {number('output', 'Output interval', scenario.simulation.outputDt, 's', 'How often a sample is stored for plots and playback. Physics still uses the timestep above.', 'User assumption', (value) => patch((draft) => { draft.simulation.outputDt = value }), 0.01)}
            {number('fps', 'UI refresh', scenario.simulation.uiFps, 'FPS', 'Display target. It does not change the physics step.', 'User assumption', (value) => patch((draft) => { draft.simulation.uiFps = value }), 1)}
            {number('altitude', 'Release altitude', scenario.parent.position.z, 'm', 'Parent height above the ground at the start. Up is positive.', 'User assumption', (value) => patch((draft) => { draft.parent.position.z = value }), 1)}
            {number('east', 'Release east', scenario.parent.position.x, 'm', 'Starting east position.', 'User assumption', (value) => patch((draft) => { draft.parent.position.x = value }), 1)}
            {number('north', 'Release north', scenario.parent.position.y, 'm', 'Starting north position.', 'User assumption', (value) => patch((draft) => { draft.parent.position.y = value }), 1)}
            {number('speed', 'Horizontal speed', scenario.parent.horizontalSpeed, 'm/s', 'Parent ground speed at release.', 'User assumption', (value) => patch((draft) => { draft.parent.horizontalSpeed = value }), 0.5)}
            {number('vertical', 'Vertical speed', scenario.parent.verticalSpeed, 'm/s', 'Positive is climb.', 'User assumption', (value) => patch((draft) => { draft.parent.verticalSpeed = value }), 0.1)}
            {number('heading', 'Heading', scenario.parent.headingDeg, '°', '0 is north, 90 is east. The released object inherits this direction when inherit is on.', 'User assumption', (value) => patch((draft) => { draft.parent.headingDeg = value }), 1)}
            {number('pitch', 'Parent pitch', scenario.parent.pitchDeg, '°', 'Nose-up angle of the parent. The parent itself flies a straight kinematic path.', 'User assumption', (value) => patch((draft) => { draft.parent.pitchDeg = value }), 1)}
            {number('roll', 'Parent roll', scenario.parent.rollDeg, '°', 'Right-wing-down angle of the parent.', 'User assumption', (value) => patch((draft) => { draft.parent.rollDeg = value }), 1)}
            {number('releaseTime', 'Release time', scenario.parent.releaseTime, 's', 'The object stays with the parent until this time, then flies on its own.', 'User assumption', (value) => patch((draft) => { draft.parent.releaseTime = value }), 0.1)}
            <ToggleField
              label="Inherit release velocity"
              checked={scenario.parent.inheritVelocity}
              tooltip="When on, the object starts with the parent velocity. When off, the release velocity below is used."
              source="User assumption"
              onChange={(checked) => patch((draft) => { draft.parent.inheritVelocity = checked })}
            />
            {number('rvx', 'Release east speed', scenario.parent.releaseVelocity.x, 'm/s', 'Used only when inherit is off.', 'User assumption', (value) => patch((draft) => { draft.parent.releaseVelocity.x = value }))}
            {number('rvy', 'Release north speed', scenario.parent.releaseVelocity.y, 'm/s', 'Used only when inherit is off.', 'User assumption', (value) => patch((draft) => { draft.parent.releaseVelocity.y = value }))}
            {number('rvz', 'Release vertical speed', scenario.parent.releaseVelocity.z, 'm/s', 'Used only when inherit is off.', 'User assumption', (value) => patch((draft) => { draft.parent.releaseVelocity.z = value }))}
            <div className="save-row">
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
              <button className="btn quiet" onClick={() => saveScenario(saveName || scenario.name)}>Save</button>
            </div>
            <label className="file-btn">
              Import JSON
              <input
                type="file"
                accept="application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  const error = importScenarioText(await file.text())
                  setImportError(error)
                }}
              />
            </label>
            {importError && <p className="warn">{importError}</p>}
            <ul className="library">
              {library.map((item) => (
                <li key={item.name}>
                  <button onClick={() => loadScenario(item.name)}>{item.name}</button>
                  <button onClick={() => deleteScenario(item.name)} title="Remove saved copy">Remove</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'object' && (
          <section>
            <h2>Object</h2>
            <ChoiceField
              label="Aerodynamic model"
              value={scenario.object.aeroMode}
              tooltip="Ballistic uses drag only. Glider adds lift and bank steering. Custom uses Cd, Cl, and Cm as entered."
              source="User assumption"
              options={[
                { value: 'ballistic', label: 'Simple ballistic object' },
                { value: 'glider', label: 'Simple glider' },
                { value: 'custom', label: 'Custom aerodynamic coefficients' },
              ]}
              onChange={(value) => patch((draft) => { draft.object.aeroMode = value as typeof draft.object.aeroMode })}
            />
            <ChoiceField
              label="Shape"
              value={scenario.object.shape}
              tooltip="Shape sets volume, reference area, and inertia unless you override the area."
              source="User assumption"
              options={['sphere', 'ellipsoid', 'cylinder', 'box', 'custom'].map((value) => ({ value, label: value }))}
              onChange={(value) => patch((draft) => { draft.object.shape = value as typeof draft.object.shape })}
            />
            {number('mass', 'Mass', scenario.object.mass, 'kg', 'Used for weight and for density = mass / volume.', 'User assumption', (value) => patch((draft) => { draft.object.mass = value }), 0.01)}
            {number('diameter', 'Diameter', scenario.object.diameter, 'm', 'Sphere diameter, or cylinder diameter.', 'User assumption', (value) => patch((draft) => { draft.object.diameter = value }), 0.01)}
            {number('length', 'Length', scenario.object.length, 'm', 'Box length, cylinder length, or ellipsoid axis.', 'User assumption', (value) => patch((draft) => { draft.object.length = value }), 0.01)}
            {number('width', 'Width', scenario.object.width, 'm', 'Box width or ellipsoid axis.', 'User assumption', (value) => patch((draft) => { draft.object.width = value }), 0.01)}
            {number('height', 'Height', scenario.object.height, 'm', 'Box height or ellipsoid axis.', 'User assumption', (value) => patch((draft) => { draft.object.height = value }), 0.01)}
            {number('cd', 'Cd', scenario.object.cd, '', 'Drag coefficient. 0.47 is a textbook subcritical sphere value, not a measurement of this object.', 'Estimate', (value) => patch((draft) => { draft.object.cd = value }), 0.01)}
            {number('cl', 'Cl', scenario.object.cl, '', 'Lift coefficient. Ignored for a ballistic object.', 'User assumption', (value) => patch((draft) => { draft.object.cl = value }), 0.01)}
            {number('cm', 'Cm', scenario.object.cm, '', 'Pitching-moment coefficient. Used only in the custom model.', 'User assumption', (value) => patch((draft) => { draft.object.cm = value }), 0.01)}
            {number('ld', 'Lift-to-drag', scenario.object.liftToDrag, '', 'If the switch below is on, Cl is set to Cd times this ratio.', 'User assumption', (value) => patch((draft) => { draft.object.liftToDrag = value }), 0.1)}
            <ToggleField label="Use lift-to-drag for Cl" checked={scenario.object.useLiftToDrag} tooltip="Replaces the Cl field for glider and custom models." source="User assumption" onChange={(checked) => patch((draft) => { draft.object.useLiftToDrag = checked })} />
            {number('wing', 'Wing area', scenario.object.wingArea ?? geometry.wingArea, 'm²', 'Reference area for lift. Clear the override by matching the geometric area.', 'User assumption', (value) => patch((draft) => { draft.object.wingArea = value }), 0.01)}
            {number('area', 'Reference area', scenario.object.referenceAreaOverride ?? geometry.referenceArea, 'm²', 'Area in the drag equation. Editing this stores an override.', 'User assumption', (value) => patch((draft) => { draft.object.referenceAreaOverride = value }), 0.001)}
            {number('aspect', 'Aspect ratio', scenario.object.aspectRatio, '', 'Stored with the scenario for later wing models. The MVP lift model does not use it.', 'User assumption', (value) => patch((draft) => { draft.object.aspectRatio = value }), 0.1)}
            {number('volume', 'Custom volume', scenario.object.customVolume, 'm³', 'Used when the shape is custom.', 'User assumption', (value) => patch((draft) => { draft.object.customVolume = value }), 0.001)}
            <ToggleField label="Buoyancy" checked={scenario.object.buoyancy} tooltip="Upward force equal to the weight of displaced air. Off by default." source="Physically modeled" onChange={(checked) => patch((draft) => { draft.object.buoyancy = checked })} />
            <p className="calc">Density {geometry.density.toFixed(2)} kg/m³ · volume {geometry.volume.toFixed(4)} m³ · drag area {geometry.referenceArea.toFixed(4)} m². Density is calculated, not typed.</p>
          </section>
        )}

        {tab === 'environment' && (
          <section>
            <h2>Environment</h2>
            {number('wind', 'Wind speed', scenario.wind.speed, 'm/s', 'Steady wind speed. Direction is the way the wind blows toward.', 'User assumption', (value) => patch((draft) => { draft.wind.speed = value }), 0.5)}
            {number('windDir', 'Wind direction', scenario.wind.directionDeg, '°', '0 means the wind blows north. 90 means it blows east.', 'User assumption', (value) => patch((draft) => { draft.wind.directionDeg = value }), 1)}
            {number('windUp', 'Vertical wind', scenario.wind.verticalSpeed, 'm/s', 'Positive is an updraft.', 'User assumption', (value) => patch((draft) => { draft.wind.verticalSpeed = value }), 0.1)}
            <ChoiceField label="Wind profile" value={scenario.wind.model} tooltip="Constant uses one speed. Altitude uses a power law about the reference height." source="User assumption" options={[{ value: 'constant', label: 'Constant' }, { value: 'altitude', label: 'Altitude power law' }]} onChange={(value) => patch((draft) => { draft.wind.model = value as typeof draft.wind.model })} />
            {number('refAlt', 'Reference altitude', scenario.wind.referenceAltitudeM, 'm', 'Height where the entered wind speed applies in the power-law model.', 'User assumption', (value) => patch((draft) => { draft.wind.referenceAltitudeM = value }), 1)}
            {number('shear', 'Shear exponent', scenario.wind.shearExponent, '', '0 keeps the wind constant with height. Typical surface values are about 0.1 to 0.3 and are assumptions here.', 'User assumption', (value) => patch((draft) => { draft.wind.shearExponent = value }), 0.01)}
            {number('turb', 'Turbulence', scenario.wind.turbulenceStd, 'm/s', 'Standard deviation of a smooth random gust. This is shaped noise, not a certified Dryden spectrum.', 'User assumption', (value) => patch((draft) => { draft.wind.turbulenceStd = value }), 0.1)}
            {number('turbT', 'Turbulence time', scenario.wind.turbulenceTimeConstant, 's', 'How slowly the turbulence changes.', 'User assumption', (value) => patch((draft) => { draft.wind.turbulenceTimeConstant = value }), 0.1)}
            <ToggleField label="Gusts" checked={scenario.wind.gustsEnabled} tooltip="Occasional extra wind bursts, separate from the smooth turbulence." source="User assumption" onChange={(checked) => patch((draft) => { draft.wind.gustsEnabled = checked })} />
            {number('gust', 'Gust amplitude', scenario.wind.gustAmplitude, 'm/s', 'Size of a gust when gusts are enabled.', 'User assumption', (value) => patch((draft) => { draft.wind.gustAmplitude = value }), 0.1)}
            {number('temp', 'Temperature', scenario.atmosphere.temperatureC, '°C', 'Used in the ideal-gas density when density is not overridden.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.temperatureC = value }), 0.5)}
            {number('pressure', 'Pressure', scenario.atmosphere.pressurePa, 'Pa', 'Surface pressure for density and the barometer model.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.pressurePa = value }), 10)}
            {number('humidity', 'Humidity', scenario.atmosphere.humidityPercent, '%', 'Lowers density slightly through virtual temperature. Ignored by the ISA option.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.humidityPercent = value }), 1)}
            <ChoiceField label="Density model" value={scenario.atmosphere.densityModel} tooltip="Constant uses the surface ideal-gas density. ISA varies density with altitude up to 11 km. An override replaces both." source="Physically modeled" options={[{ value: 'constant', label: 'Surface ideal gas' }, { value: 'isa', label: 'ISA troposphere' }]} onChange={(value) => patch((draft) => { draft.atmosphere.densityModel = value as typeof draft.atmosphere.densityModel })} />
            {number('gravity', 'Gravity', scenario.atmosphere.gravity, 'm/s²', 'Positive number. The force is downward.', 'Physically modeled', (value) => patch((draft) => { draft.atmosphere.gravity = value }), 0.01)}
            {number('rain', 'Rain', scenario.atmosphere.rainMillimetersPerHour, 'mm/h', 'Changes visibility and, through the factors below, sensor noise. It does not change drag unless the drag factor is non-zero.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.rainMillimetersPerHour = value }), 0.5)}
            {number('rainDrag', 'Rain drag factor', scenario.atmosphere.rainDragPerMmHr, 'per mm/h', 'Default 0. Rain then has no trajectory effect. Set this only if you have a model for it.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.rainDragPerMmHr = value }), 0.001)}
            {number('rainNoise', 'Rain noise factor', scenario.atmosphere.rainNoisePerMmHr, 'per mm/h', 'Fractional increase in sensor noise. This is an assumption, not a weather instrument law.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.rainNoisePerMmHr = value }), 0.001)}
            {number('rainDrop', 'Rain dropout factor', scenario.atmosphere.rainDropoutPerMmHr, 'per mm/h', 'Scales sensor dropout probability.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.rainDropoutPerMmHr = value }), 0.001)}
            {number('vis', 'Clear visibility', scenario.atmosphere.clearAirVisibilityM, 'm', 'Visibility before rain. The rain curve is an assumption.', 'User assumption', (value) => patch((draft) => { draft.atmosphere.clearAirVisibilityM = value }), 100)}
          </section>
        )}

        {tab === 'sensors' && (
          <section>
            <h2>Sensors</h2>
            <p className="calc">Measurements are noisy, delayed, and sampled. They are not the true state. Estimator: {scenario.estimator.kind}.</p>
            <ChoiceField label="Estimator" value={scenario.estimator.kind} tooltip="Perfect uses the truth. Raw holds sensor reports. Complementary blends IMU integration with position fixes. Kalman predicts with gravity and corrects with position." source="User assumption" options={[{ value: 'perfect', label: 'Perfect state' }, { value: 'raw', label: 'Raw sensors' }, { value: 'complementary', label: 'Complementary filter' }, { value: 'kalman', label: 'Kalman filter' }]} onChange={(value) => patch((draft) => { draft.estimator.kind = value as typeof draft.estimator.kind })} />
            {number('gnssHz', 'GNSS update', scenario.sensors.gnss.updateRateHz, 'Hz', 'How often a position fix is attempted.', 'User assumption', (value) => patch((draft) => { draft.sensors.gnss.updateRateHz = value }), 1)}
            {number('gnssH', 'GNSS horizontal noise', scenario.sensors.gnss.horizontalNoise, 'm', 'Standard deviation on East and North. Not a manufacturer accuracy unless you imported one.', 'User assumption', (value) => patch((draft) => { draft.sensors.gnss.horizontalNoise = value }), 0.01)}
            {number('gnssV', 'GNSS vertical noise', scenario.sensors.gnss.verticalNoise, 'm', 'Standard deviation on Up.', 'User assumption', (value) => patch((draft) => { draft.sensors.gnss.verticalNoise = value }), 0.01)}
            {number('gnssLat', 'GNSS latency', scenario.sensors.gnss.latencyS, 's', 'Delay before a fix becomes available to the estimator.', 'User assumption', (value) => patch((draft) => { draft.sensors.gnss.latencyS = value }), 0.01)}
            {number('gnssDrop', 'GNSS dropout', scenario.sensors.gnss.dropoutProbability, '', 'Probability that a scheduled fix is missing.', 'User assumption', (value) => patch((draft) => { draft.sensors.gnss.dropoutProbability = value }), 0.01)}
            {number('imuHz', 'IMU update', scenario.sensors.imu.updateRateHz, 'Hz', 'Specific-force sample rate. Limited by the physics step.', 'User assumption', (value) => patch((draft) => { draft.sensors.imu.updateRateHz = value }), 10)}
            {number('imuNoise', 'IMU accel noise', scenario.sensors.imu.accelNoise, 'm/s²', 'Standard deviation on each axis of specific force. The MVP IMU is in the ENU frame.', 'User assumption', (value) => patch((draft) => { draft.sensors.imu.accelNoise = value }), 0.01)}
            {number('baroHz', 'Barometer update', scenario.sensors.barometer.updateRateHz, 'Hz', 'Pressure is converted to altitude with an isothermal model.', 'User assumption', (value) => patch((draft) => { draft.sensors.barometer.updateRateHz = value }), 1)}
            {number('baroNoise', 'Barometer noise', scenario.sensors.barometer.noiseStd, 'Pa', 'Pressure noise. Altitude error follows from the same formula used to generate the pressure.', 'User assumption', (value) => patch((draft) => { draft.sensors.barometer.noiseStd = value }), 0.5)}
            {number('magHz', 'Magnetometer update', scenario.sensors.magnetometer.updateRateHz, 'Hz', 'Heading sensor. Declination is added before noise.', 'User assumption', (value) => patch((draft) => { draft.sensors.magnetometer.updateRateHz = value }), 1)}
            {number('magNoise', 'Heading noise', scenario.sensors.magnetometer.noiseStd, 'rad', 'Noise on the heading report.', 'User assumption', (value) => patch((draft) => { draft.sensors.magnetometer.noiseStd = value }), 0.001)}
            {number('decl', 'Declination', scenario.sensors.magneticDeclinationDeg, '°', 'Added to true heading. Default 0 means you have not entered a local value.', 'User assumption', (value) => patch((draft) => { draft.sensors.magneticDeclinationDeg = value }), 0.1)}
            {number('airHz', 'Airspeed update', scenario.sensors.airspeed.updateRateHz, 'Hz', 'Scalar air-relative speed.', 'User assumption', (value) => patch((draft) => { draft.sensors.airspeed.updateRateHz = value }), 1)}
            {number('airNoise', 'Airspeed noise', scenario.sensors.airspeed.noiseStd, 'm/s', 'Standard deviation of the airspeed report.', 'User assumption', (value) => patch((draft) => { draft.sensors.airspeed.noiseStd = value }), 0.05)}
            {number('altHz', 'Altimeter update', scenario.sensors.altimeter.updateRateHz, 'Hz', 'Direct altitude report, separate from the barometer.', 'User assumption', (value) => patch((draft) => { draft.sensors.altimeter.updateRateHz = value }), 1)}
            {number('altNoise', 'Altimeter noise', scenario.sensors.altimeter.noiseStd, 'm', 'Standard deviation of the direct altitude report.', 'User assumption', (value) => patch((draft) => { draft.sensors.altimeter.noiseStd = value }), 0.1)}
            {number('alpha', 'Complementary position gain', scenario.estimator.complementaryAlpha, '', 'Fraction of a new position fix applied in one update.', 'User assumption', (value) => patch((draft) => { draft.estimator.complementaryAlpha = value }), 0.05)}
            {number('q', 'Kalman accel noise', scenario.estimator.processNoiseAccel, 'm/s²', 'How much unmodeled acceleration the Kalman filter expects. Drag is not in its process model.', 'User assumption', (value) => patch((draft) => { draft.estimator.processNoiseAccel = value }), 0.1)}
          </section>
        )}

        {tab === 'link' && <LinkSection />}
        {tab === 'control' && <ControlSection />}
        {tab === 'catalog' && <CatalogSection />}
        {tab === 'integrations' && <IntegrationsPanel />}
      </div>
    </div>
  )
}

function LinkSection() {
  const scenario = useSimStore((state) => state.scenario)
  const patch = useSimStore((state) => state.patch)
  const selectProfile = useSimStore((state) => state.selectProfile)
  const profile = scenario.communication.profile
  const locked = (id: string) => scenario.locks.includes(id)
  const toggleLock = useSimStore((state) => state.toggleLock)
  const number = (
    id: string,
    label: string,
    value: number,
    unit: string,
    tooltip: string,
    apply: (profile: typeof scenario.communication.profile, value: number) => void,
    step = 0.01,
  ) => (
    <ParamField
      key={id}
      id={id}
      label={label}
      value={value}
      unit={unit}
      tooltip={tooltip}
      source={profile.confidence}
      locked={locked(id)}
      step={step}
      onChange={(next) => {
        patch((draft) => {
          apply(draft.communication.profile, next)
          draft.communication.profile.confidence = 'user-defined'
          draft.communication.profile.source = 'Edited in DropSim'
        })
      }}
      onLock={(next) => toggleLock(id, next)}
    />
  )
  const curve = linkCurve(profile, Math.max(profile.nominalRangeM * 1.4, 500), 2)
  return (
    <section>
      <h2>Communication</h2>
      <p className="calc">{profile.notes}</p>
      <ChoiceField
        label="Profile"
        value={scenario.communication.profileId}
        tooltip="Built-in profiles are examples. Nominal range is not a guaranteed radio range."
        source={profile.confidence}
        options={commProfiles.map((item) => ({ value: item.id, label: item.name }))}
        onChange={selectProfile}
      />
      <TextField label="Source" value={profile.source} tooltip="Where these numbers came from." source={profile.confidence} onChange={(value) => patch((draft) => { draft.communication.profile.source = value })} />
      <TextField label="Source date" value={profile.sourceDate} tooltip="Date attached to the source note." source={profile.confidence} onChange={(value) => patch((draft) => { draft.communication.profile.sourceDate = value })} />
      {number('carrier', 'Carrier frequency', profile.carrierFrequencyHz / 1e6, 'MHz', 'Stored for reference. DropSim does not convert frequency into range.', (profile, value) => { profile.carrierFrequencyHz = value * 1e6 }, 1)}
      {number('rate', 'Data rate', profile.dataRateBps / 1000, 'kbit/s', 'Used to estimate airtime and saturation. It does not by itself set packet loss.', (profile, value) => { profile.dataRateBps = value * 1000 }, 1)}
      {number('bytes', 'Packet size', profile.packetBytes, 'bytes', 'Payload size used in the airtime and goodput estimate.', (profile, value) => { profile.packetBytes = value }, 1)}
      {number('interval', 'Transmit interval', profile.intervalS, 's', 'How often a telemetry packet is offered.', (profile, value) => { profile.intervalS = value }, 0.01)}
      {number('latency', 'Latency', profile.latencyS, 's', 'One-way base delay before jitter and retries.', (profile, value) => { profile.latencyS = value }, 0.005)}
      {number('jitter', 'Jitter', profile.jitterS, 's', 'Half-width of the uniform random delay.', (profile, value) => { profile.jitterS = value }, 0.005)}
      {number('latPerM', 'Latency per meter', profile.latencyPerMeter, 's/m', 'Default 0. Distance does not add delay until you set this.', (profile, value) => { profile.latencyPerMeter = value }, 0.00001)}
      {number('range', 'Nominal range', profile.nominalRangeM, 'm', 'Profile input drawn on the map. Not a guaranteed operational range.', (profile, value) => { profile.nominalRangeM = value }, 10)}
      {number('retries', 'Retries', profile.retryCount, '', 'Extra attempts after a lost packet.', (profile, value) => { profile.retryCount = Math.max(0, Math.round(value)) }, 1)}
      {number('mid', 'Loss midpoint', profile.loss.midpointM, 'm', 'Distance scale of the loss curve.', (profile, value) => { profile.loss.midpointM = value }, 10)}
      {number('baseLoss', 'Loss at zero distance', profile.loss.baseLoss, '', 'Fraction lost next to the parent. 0.01 means 1%.', (profile, value) => { profile.loss.baseLoss = value }, 0.005)}
      {number('maxLoss', 'Loss far away', profile.loss.maxLoss, '', 'Fraction the curve approaches at long range.', (profile, value) => { profile.loss.maxLoss = value }, 0.01)}
      <p className="calc">At {curve[1]?.distanceM.toFixed(0) ?? 0} m the model loss is {((curve[1]?.loss ?? 0) * 100).toFixed(1)}%. The chart shows the full curve.</p>
    </section>
  )
}

function ControlSection() {
  const scenario = useSimStore((state) => state.scenario)
  const patch = useSimStore((state) => state.patch)
  const snapTarget = useSimStore((state) => state.snapTarget)
  const toggleLock = useSimStore((state) => state.toggleLock)
  const locked = (id: string) => scenario.locks.includes(id)
  const number = (id: string, label: string, value: number, unit: string, tooltip: string, set: (value: number) => void, step = 0.1) => (
    <ParamField key={id} id={id} label={label} value={value} unit={unit} tooltip={tooltip} source="User assumption" locked={locked(id)} step={step} onChange={set} onLock={(next) => toggleLock(id, next)} />
  )
  return (
    <section>
      <h2>Landing guidance</h2>
      <p className="calc">The parent steers toward a ground region using the telemetry it actually receives. This is a delivery or recovery aim point, not a seeker.</p>
      <ToggleField label="Corrections enabled" checked={scenario.control.enabled} tooltip="When off, the object is open-loop." source="User assumption" onChange={(checked) => patch((draft) => { draft.control.enabled = checked })} />
      <ChoiceField label="Actuator" value={scenario.control.actuator} tooltip="None logs commands and applies nothing. Acceleration is an abstract force, not sphere aerodynamics. Bank redirects lift on a glider." source="User assumption" options={[{ value: 'none', label: 'None' }, { value: 'acceleration', label: 'Generic acceleration' }, { value: 'bank', label: 'Bank the lift vector' }]} onChange={(value) => patch((draft) => { draft.control.actuator = value as typeof draft.control.actuator })} />
      <ChoiceField label="Guidance law" value={scenario.control.law} tooltip="Trajectory points ground velocity toward the landing area. Heading turns. Velocity changes speed. Abort aims at the abort point." source="User assumption" options={[{ value: 'trajectory', label: 'Trajectory' }, { value: 'heading', label: 'Heading' }, { value: 'velocity', label: 'Velocity' }, { value: 'abort', label: 'Return / abort' }]} onChange={(value) => patch((draft) => { draft.control.law = value as typeof draft.control.law })} />
      {number('interval', 'Correction interval', scenario.control.intervalS, 's', 'How often the parent may send a command. Delivery still depends on the link.', (value) => patch((draft) => { draft.control.intervalS = value }), 0.05)}
      {number('kp', 'Guidance gain', scenario.control.kp, '1/s', 'How hard the velocity error is corrected, before the acceleration limit.', (value) => patch((draft) => { draft.control.kp = value }), 0.05)}
      {number('amax', 'Maximum acceleration', scenario.control.maxAcceleration, 'm/s²', 'Actuator limit. Zero means the command cannot move the object.', (value) => patch((draft) => { draft.control.maxAcceleration = value }), 0.1)}
      {number('bank', 'Maximum bank', scenario.control.maxBankDeg, '°', 'Limit used by the bank actuator.', (value) => patch((draft) => { draft.control.maxBankDeg = value }), 1)}
      {number('vcmd', 'Desired ground speed', scenario.control.desiredGroundSpeed, 'm/s', 'Target speed for the velocity law.', (value) => patch((draft) => { draft.control.desiredGroundSpeed = value }), 0.5)}
      {number('tx', 'Target east', scenario.control.target.x, 'm', 'Landing area center.', (value) => patch((draft) => { draft.control.target.x = value }), 1)}
      {number('ty', 'Target north', scenario.control.target.y, 'm', 'Landing area center.', (value) => patch((draft) => { draft.control.target.y = value }), 1)}
      {number('tr', 'Target radius', scenario.control.targetRadius, 'm', 'Drawn on the ground. The miss metric is distance to the center.', (value) => patch((draft) => { draft.control.targetRadius = value }), 1)}
      {number('ax', 'Abort east', scenario.control.abortPoint.x, 'm', 'Aim point used by the abort law.', (value) => patch((draft) => { draft.control.abortPoint.x = value }), 1)}
      {number('ay', 'Abort north', scenario.control.abortPoint.y, 'm', 'Aim point used by the abort law.', (value) => patch((draft) => { draft.control.abortPoint.y = value }), 1)}
      <div className="save-row">
        <button className="btn quiet" onClick={() => snapTarget('calm')}>Target calm-air landing</button>
        <button className="btn quiet" onClick={() => snapTarget('landing')}>Target this landing</button>
      </div>
    </section>
  )
}

function CatalogSection() {
  const catalog = useSimStore((state) => state.catalog)
  const message = useSimStore((state) => state.catalogMessage)
  const importCatalogText = useSimStore((state) => state.importCatalogText)
  const applyCatalogComponent = useSimStore((state) => state.applyCatalogComponent)
  const [selected, setSelected] = useState(catalog[0]?.id ?? '')
  const component = catalog.find((item) => item.id === selected) ?? catalog[0]
  return (
    <section>
      <h2>Component catalog</h2>
      <p className="calc">{message}</p>
      <label className="file-btn">
        Import JSON or CSV
        <input
          type="file"
          accept="application/json,text/csv,.csv,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const text = await file.text()
            importCatalogText(text, file.name.endsWith('.csv') ? 'csv' : 'json')
          }}
        />
      </label>
      <ul className="library">
        {catalog.map((item) => (
          <li key={item.id}>
            <button className={item.id === component?.id ? 'on' : ''} onClick={() => setSelected(item.id)}>
              {item.manufacturer} {item.model}
              <small>{componentCategories.find((category) => category.id === item.category)?.label}</small>
            </button>
          </li>
        ))}
      </ul>
      {component && (
        <div className="spec">
          <p>{component.specificationSource}</p>
          <p>Confidence: {component.confidence}</p>
          <p>Mass: {component.weightKg ?? 'not loaded'} · accuracy: {component.accuracy ?? 'not loaded'} · rate: {component.updateRateHz ?? 'not loaded'} · range: {component.rangeM ?? 'not loaded'}</p>
          <div className="save-row">
            <button className="btn quiet" onClick={() => applyCatalogComponent(component.id, ['mass'])}>Apply mass</button>
            <button className="btn quiet" onClick={() => applyCatalogComponent(component.id, ['gnss-accuracy', 'gnss-rate'])}>Apply GNSS</button>
            <button className="btn quiet" onClick={() => applyCatalogComponent(component.id, ['radio-range', 'radio-rate'])}>Apply radio</button>
          </div>
        </div>
      )}
    </section>
  )
}
