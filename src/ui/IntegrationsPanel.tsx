import { useEffect, useRef, useState } from 'react'
import type { MqttClient } from 'mqtt'
import { gpxTrack, kmlTrack } from '../integrations/gpxKml'
import { saveFile } from '../integrations/files'
import { nmeaLog } from '../integrations/nmea'
import { fetchOpenMeteo } from '../integrations/openMeteo'
import { writeTextToSerial, webSerialAvailable } from '../integrations/serialLink'
import { sampleAt } from '../visualization/sampleAt'
import { useSimStore } from '../store/useSimStore'
import { ParamField, TextField } from './ParamField'

const START = Date.UTC(2026, 0, 1)

export function IntegrationsPanel() {
  const scenario = useSimStore((state) => state.scenario)
  const result = useSimStore((state) => state.result)
  const patch = useSimStore((state) => state.patch)
  const toggleLock = useSimStore((state) => state.toggleLock)
  const time = useSimStore((state) => state.time)
  const [status, setStatus] = useState(scenario.weather?.attribution ?? 'Weather is hand-entered until you load a forecast.')
  const [mqttState, setMqttState] = useState('Not connected')
  const [password, setPassword] = useState('')
  const clientRef = useRef<MqttClient | null>(null)
  const lastPublish = useRef(0)
  const locked = (id: string) => scenario.locks.includes(id)

  useEffect(() => {
    return () => {
      clientRef.current?.end(true)
    }
  }, [])

  useEffect(() => {
    const client = clientRef.current
    if (!client?.connected) return
    const now = performance.now()
    if (now - lastPublish.current < 200) return
    lastPublish.current = now
    const state = useSimStore.getState()
    const sample = sampleAt(state.result.samples, state.time)
    if (!sample) return
    client.publish(
      state.scenario.mqttTopic || 'dropsim/state',
      JSON.stringify({
        t: sample.t,
        estimatedPosition: sample.estimatedPosition,
        truePosition: sample.truePosition,
        wind: sample.wind,
        source: 'DropSim',
      }),
    )
  }, [time])

  const number = (
    id: string,
    label: string,
    value: number,
    unit: string,
    tooltip: string,
    set: (value: number) => void,
    step = 0.0001,
  ) => (
    <ParamField
      key={id}
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
  const samples = result.samples
  const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dropsim'

  return (
    <section>
      <h2>Site</h2>
      <p className="calc">
        Latitude and longitude are the local origin. East and north metres are a flat offset from that point, which is
        reasonable for a few kilometres. It is not a surveyed geodesic.
      </p>
      <TextField
        label="Site name"
        value={scenario.origin.label}
        tooltip="A label stored with the scenario. It does not change the physics."
        source="User assumption"
        onChange={(value) => patch((draft) => { draft.origin.label = value })}
      />
      {number('lat', 'Latitude', scenario.origin.latitudeDeg, '°', 'Positive is north.', (value) => patch((draft) => { draft.origin.latitudeDeg = value }))}
      {number('lon', 'Longitude', scenario.origin.longitudeDeg, '°', 'Positive is east.', (value) => patch((draft) => { draft.origin.longitudeDeg = value }))}
      {number('elev', 'Ground elevation', scenario.origin.groundElevationM, 'm MSL', 'Height of the z = 0 plane above mean sea level. A forecast can fill this.', (value) => patch((draft) => { draft.origin.groundElevationM = value }), 1)}
      <button
        className="btn quiet"
        onClick={() => {
          void fetchOpenMeteo(scenario.origin.latitudeDeg, scenario.origin.longitudeDeg)
            .then((weather) => {
              patch((draft) => {
                Object.assign(draft.wind, weather.wind)
                Object.assign(draft.atmosphere, weather.atmosphere)
                if (weather.elevationM !== null) draft.origin.groundElevationM = weather.elevationM
                draft.weather = weather.provenance
              })
              setStatus(`${weather.provenance.attribution} Valid ${weather.provenance.validTime || 'time unknown'}. ${weather.provenance.note}`)
            })
            .catch((error: unknown) => {
              setStatus(error instanceof Error ? error.message : 'Forecast request failed.')
            })
        }}
      >
        Load Open-Meteo forecast
      </button>
      <p className="calc">{status}</p>
      <p className="calc">The 3D view builds a terrain surface from this latitude and longitude. The site itself stays the flat drop ground; hills and valleys are the elevation around it.</p>

      <h2>Files other tools open</h2>
      <div className="save-row">
        <button className="btn quiet" onClick={() => saveFile(`${slug}.gpx`, gpxTrack(scenario.name, scenario.origin, samples, START), 'application/gpx+xml')}>GPX</button>
        <button className="btn quiet" onClick={() => saveFile(`${slug}.kml`, kmlTrack(scenario.name, scenario.origin, samples), 'application/vnd.google-earth.kml+xml')}>KML</button>
        <button className="btn quiet" onClick={() => { void import('../integrations/mavlinkLog').then(({ mavlinkTlog }) => saveFile(`${slug}.tlog`, mavlinkTlog(scenario.origin, samples, START), 'application/octet-stream')) }}>MAVLink</button>
        <button className="btn quiet" onClick={() => saveFile(`${slug}.nmea`, nmeaLog(scenario.origin, samples, START), 'text/plain')}>NMEA</button>
        <button
          className="btn quiet"
          onClick={() => {
            void import('../integrations/mcapLog').then(({ mcapBytes }) => mcapBytes(scenario.origin, samples, START).then((bytes) => saveFile(`${slug}.mcap`, bytes, 'application/octet-stream')))
          }}
        >
          MCAP
        </button>
      </div>
      <p className="calc">
        GPX and KML open in Google Earth and QGIS. The MAVLink log is a QGroundControl .tlog with autopilot type set to
        invalid, so it is not pretending to be PX4. NMEA is GGA, RMC, and VTG. MCAP is a Foxglove LocationFix channel.
      </p>
      {webSerialAvailable() && (
        <button
          className="btn quiet"
          onClick={() => {
            void writeTextToSerial(nmeaLog(scenario.origin, samples, START)).then(
              () => setStatus('NMEA log written to the selected serial port.'),
              (error: unknown) => setStatus(error instanceof Error ? error.message : 'Serial write failed.'),
            )
          }}
        >
          Send NMEA to a serial port
        </button>
      )}

      <h2>MQTT</h2>
      <TextField
        label="Broker WebSocket URL"
        value={scenario.mqttUrl}
        tooltip="ws:// or wss:// only. The browser cannot open raw MQTT TCP. The password stays in this session and is not saved in the scenario."
        source="User assumption"
        onChange={(value) => patch((draft) => { draft.mqttUrl = value })}
      />
      <TextField
        label="Topic"
        value={scenario.mqttTopic}
        tooltip="JSON state is published here about five times a second while connected."
        source="User assumption"
        onChange={(value) => patch((draft) => { draft.mqttTopic = value })}
      />
      <label className="field">
        <span className="field-label">Password for this session</span>
        <input type="password" value={password} autoComplete="off" onChange={(event) => setPassword(event.target.value)} />
      </label>
      <p className="calc">{mqttState}</p>
      <div className="save-row">
        <button
          className="btn quiet"
          disabled={!scenario.mqttUrl}
          onClick={() => {
            clientRef.current?.end(true)
            void import('mqtt').then((mod) => {
              const client = mod.default.connect(scenario.mqttUrl, { password: password || undefined, reconnectPeriod: 2000 })
              clientRef.current = client
              setMqttState('Connecting…')
              client.on('connect', () => setMqttState(`Connected. Publishing to ${scenario.mqttTopic}.`))
              client.on('error', (error) => setMqttState(error.message))
            })
          }}
        >
          Connect
        </button>
        <button
          className="btn quiet"
          onClick={() => {
            clientRef.current?.end(true)
            clientRef.current = null
            setMqttState('Not connected')
          }}
        >
          Disconnect
        </button>
      </div>
    </section>
  )
}
