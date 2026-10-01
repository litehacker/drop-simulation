import { gpxTrack, kmlTrack } from '../integrations/gpxKml'
import { saveFile } from '../integrations/files'
import { nmeaLog } from '../integrations/nmea'
import { useSimStore } from '../store/useSimStore'

const START = Date.UTC(2026, 0, 1)

export function ExportMenu() {
  const scenario = useSimStore((state) => state.scenario)
  const samples = useSimStore((state) => state.result.samples)
  const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dropsim'
  return (
    <details className="export-menu">
      <summary>Share</summary>
      <button type="button" onClick={() => saveFile(`${slug}.gpx`, gpxTrack(scenario.name, scenario.origin, samples, START), 'application/gpx+xml')}>GPX</button>
      <button type="button" onClick={() => saveFile(`${slug}.kml`, kmlTrack(scenario.name, scenario.origin, samples), 'application/vnd.google-earth.kml+xml')}>KML</button>
      <button type="button" onClick={() => { void import('../integrations/mavlinkLog').then(({ mavlinkTlog }) => saveFile(`${slug}.tlog`, mavlinkTlog(scenario.origin, samples, START), 'application/octet-stream')) }}>MAVLink tlog</button>
      <button type="button" onClick={() => saveFile(`${slug}.nmea`, nmeaLog(scenario.origin, samples, START), 'text/plain')}>NMEA</button>
      <button type="button" onClick={() => { void import('../integrations/mcapLog').then(({ mcapBytes }) => mcapBytes(scenario.origin, samples, START).then((bytes) => saveFile(`${slug}.mcap`, bytes, 'application/octet-stream'))) }}>Foxglove MCAP</button>
    </details>
  )
}
