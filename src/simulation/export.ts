import type { MonteCarloResult } from './monteCarlo'
import type { SimulationResult } from './engine'
import type { Scenario } from './scenario'

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return String(value)
}

export function trajectoryCsv(result: SimulationResult): string {
  const header = [
    't_s',
    'east_m',
    'north_m',
    'up_m',
    'vnorth_m_s',
    'veast_m_s',
    'vup_m_s',
    'est_east_m',
    'est_north_m',
    'est_up_m',
    'meas_east_m',
    'meas_north_m',
    'meas_up_m',
    'wind_east_m_s',
    'wind_north_m_s',
    'wind_up_m_s',
    'distance_m',
    'modeled_loss',
    'modeled_latency_s',
    'estimated_rssi_dbm',
  ]
  const lines = [header.join(',')]
  for (const sample of result.samples) {
    lines.push(
      [
        sample.t,
        sample.truePosition.x,
        sample.truePosition.y,
        sample.truePosition.z,
        sample.trueVelocity.y,
        sample.trueVelocity.x,
        sample.trueVelocity.z,
        sample.estimatedPosition.x,
        sample.estimatedPosition.y,
        sample.estimatedPosition.z,
        sample.measuredPosition?.x ?? '',
        sample.measuredPosition?.y ?? '',
        sample.measuredPosition?.z ?? '',
        sample.wind.x,
        sample.wind.y,
        sample.wind.z,
        sample.distance,
        sample.modeledLoss,
        sample.modeledLatency,
        sample.estimatedRssi,
      ].join(','),
    )
  }
  return lines.join('\n')
}

export function monteCarloCsv(result: MonteCarloResult): string {
  const lines = ['run,east_m,north_m,radial_error_m,time_s']
  for (const point of result.landings) {
    lines.push([point.run, point.east, point.north, point.radialError, point.time].join(','))
  }
  return lines.join('\n')
}

export function scenarioJson(scenario: Scenario, result?: SimulationResult): string {
  return JSON.stringify(
    {
      scenario,
      metrics: result?.metrics ?? null,
      warnings: result?.warnings ?? [],
      rates: result?.rates ?? null,
    },
    null,
    2,
  )
}

export function formatMetric(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

export { num }
