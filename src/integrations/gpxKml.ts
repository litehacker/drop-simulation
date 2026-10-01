import type { Sample } from '../simulation/engine'
import type { SiteOrigin } from './geodesy'
import { geodeticOf } from './geodesy'

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function gpxTrack(name: string, origin: SiteOrigin, samples: Sample[], startEpochMs: number): string {
  const points = samples
    .map((sample) => {
      const geo = geodeticOf(origin, sample.truePosition)
      return `      <trkpt lat="${geo.latitudeDeg.toFixed(7)}" lon="${geo.longitudeDeg.toFixed(7)}"><ele>${geo.altitudeMsl.toFixed(2)}</ele><time>${iso(startEpochMs + sample.t * 1000)}</time></trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DropSim" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}

export function kmlTrack(name: string, origin: SiteOrigin, samples: Sample[]): string {
  const coordinates = samples
    .map((sample) => {
      const geo = geodeticOf(origin, sample.truePosition)
      return `${geo.longitudeDeg.toFixed(7)},${geo.latitudeDeg.toFixed(7)},${geo.altitudeMsl.toFixed(2)}`
    })
    .join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Placemark>
      <name>${escapeXml(name)}</name>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`
}
