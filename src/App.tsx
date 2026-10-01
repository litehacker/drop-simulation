import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Button } from './components/Button'
import { useSimStore, downloadScenarioFile, downloadTrajectory, type CameraMode } from './store/useSimStore'
import { ConfigPanel } from './ui/ConfigPanel'
import { ExportMenu } from './ui/ExportMenu'
import { ChartsPanel } from './ui/ChartsPanel'
import { Readout } from './ui/Readout'
import { MapPlot } from './visualization/MapPlot'
import { SceneContents, cameraModeLabel } from './visualization/Scene'
import { effectiveRate } from './sensors/bank'

const cameras: CameraMode[] = ['orbit', 'top', 'side', 'follow', 'free']

export function App() {
  usePlaybackClock()
  const scenario = useSimStore((state) => state.scenario)
  const dirty = useSimStore((state) => state.dirty)
  const running = useSimStore((state) => state.running)
  const run = useSimStore((state) => state.run)
  const compare = useSimStore((state) => state.compare)
  const comparing = useSimStore((state) => state.comparing)
  const time = useSimStore((state) => state.time)
  const setTime = useSimStore((state) => state.setTime)
  const playing = useSimStore((state) => state.playing)
  const setPlaying = useSimStore((state) => state.setPlaying)
  const speed = useSimStore((state) => state.speed)
  const setSpeed = useSimStore((state) => state.setSpeed)
  const vectorScale = useSimStore((state) => state.vectorScale)
  const setVectorScale = useSimStore((state) => state.setVectorScale)
  const cameraMode = useSimStore((state) => state.cameraMode)
  const setCameraMode = useSimStore((state) => state.setCameraMode)
  const end = useSimStore((state) => state.result.samples.at(-1)?.t ?? 0)
  const physicsHz = 1 / scenario.simulation.physicsDt
  const rates = [
    ['Physics', physicsHz],
    ['IMU', effectiveRate(scenario.sensors.imu.updateRateHz, scenario.simulation.physicsDt)],
    ['GNSS', effectiveRate(scenario.sensors.gnss.updateRateHz, scenario.simulation.physicsDt)],
    ['Telemetry', 1 / Math.max(scenario.communication.profile.intervalS, scenario.simulation.physicsDt)],
    ['UI', scenario.simulation.uiFps],
  ] as const

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>DropSim</h1>
          <p>Flight-behavior sandbox for a released or gliding object</p>
        </div>
        <div className="rate-strip" title="These clocks are independent. Physics does not run at the display frame rate.">
          {rates.map(([label, value]) => (
            <span key={label}>
              <em>{label}</em>
              {label === 'UI' ? `${Math.round(value)} FPS` : `${trim(value)} Hz`}
            </span>
          ))}
        </div>
        <div className="header-actions">
          <Button tone="primary" onClick={run} disabled={running}>{running ? 'Running' : dirty ? 'Run again' : 'Run'}</Button>
          <Button onClick={() => void compare()} disabled={comparing}>Compare</Button>
          <Button onClick={downloadScenarioFile}>Export JSON</Button>
          <Button onClick={downloadTrajectory}>Export CSV</Button>
          <ExportMenu />
        </div>
      </header>
      <div className="workspace">
        <ConfigPanel />
        <main>
          <section className="stage">
            <Canvas camera={{ position: [280, 180, -360], fov: 42, near: 1, far: 4000 }} gl={{ logarithmicDepthBuffer: true, antialias: true }}>
              <SceneContents />
            </Canvas>
            <div className="stage-tools">
              {cameras.map((mode) => (
                <button key={mode} className={mode === cameraMode ? 'chip on' : 'chip'} onClick={() => setCameraMode(mode)}>
                  {cameraModeLabel(mode)}
                </button>
              ))}
              <label className="chip-range">
                Arrow scale
                <input type="range" min={0.3} max={3} step={0.1} value={vectorScale} onChange={(event) => setVectorScale(Number(event.target.value))} />
              </label>
              <ScaleToggle />
            </div>
            <p className="stage-note">East, North, Up. Arrows are exaggerated so forces and velocities can share the picture. The legend lists the real magnitudes. The object is drawn larger than its physical diameter.</p>
          </section>
          <div className="playback">
            <button className="btn quiet" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
            <input
              type="range"
              min={0}
              max={end || 1}
              step={0.05}
              value={Math.min(time, end)}
              onChange={(event) => {
                setPlaying(false)
                setTime(Number(event.target.value))
              }}
            />
            <span>{time.toFixed(1)} s</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[0.25, 0.5, 1, 2, 4].map((item) => (
                <option key={item} value={item}>{item}×</option>
              ))}
            </select>
          </div>
          <section className="lower">
            <MapPlot />
            <ChartsPanel />
          </section>
        </main>
        <Readout />
      </div>
    </div>
  )
}

function usePlaybackClock() {
  const playing = useSimStore((state) => state.playing)
  const speed = useSimStore((state) => state.speed)
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000)
      previous = now
      const state = useSimStore.getState()
      const duration = state.result.samples.at(-1)?.t ?? 0
      let next = state.time + dt * state.speed
      if (next >= duration) next = 0
      useSimStore.setState({ time: next })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed])
}

function trim(value: number): string {
  if (value >= 100) return String(Math.round(value))
  return value.toFixed(value >= 10 ? 0 : 1)
}

function ScaleToggle() {
  const mode = useSimStore((state) => state.displayScale)
  const setDisplayScale = useSimStore((state) => state.setDisplayScale)
  const diameter = useSimStore((state) => state.scenario.object.diameter)
  const factor = mode === 'true' ? 1 : Math.max(1, 8 / Math.max(diameter, 0.05))
  return (
    <label className="chip-range">
      Model scale
      <select value={mode} onChange={(event) => setDisplayScale(event.target.value === 'true' ? 'true' : 'visible')}>
        <option value="visible">Visible</option>
        <option value="true">True size</option>
      </select>
      <span>{factor === 1 ? '1×' : `${factor.toFixed(0)}×`}</span>
    </label>
  )
}
