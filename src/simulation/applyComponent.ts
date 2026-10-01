import type { ComponentRecord } from '../catalog/schema'
import type { Scenario } from './scenario'

export interface AppliedField {
  field: string
  value: number
  source: string
}

/**
 * Copy only non-null component fields into a scenario.
 * The returned scenario is a new object. The component catalog is not modified.
 */
export function applyComponent(scenario: Scenario, component: ComponentRecord, selections: string[]): {
  scenario: Scenario
  applied: AppliedField[]
  skipped: string[]
} {
  const next: Scenario = structuredClone(scenario)
  const applied: AppliedField[] = []
  const skipped: string[] = []
  const source = `${component.manufacturer} ${component.model} (${component.confidence})`

  const take = (selection: string, value: number | null, assign: (value: number) => void) => {
    if (!selections.includes(selection)) return
    if (value === null) {
      skipped.push(`${selection}: no specification loaded`)
      return
    }
    assign(value)
    applied.push({ field: selection, value, source })
  }

  take('mass', component.weightKg, (value) => {
    next.object.mass = value
  })
  take('gnss-accuracy', component.category === 'gnss' ? component.accuracy : null, (value) => {
    next.sensors.gnss.horizontalNoise = value
    next.sensors.gnss.accuracy = value
  })
  take('gnss-rate', component.category === 'gnss' ? component.updateRateHz : null, (value) => {
    next.sensors.gnss.updateRateHz = value
  })
  take('radio-range', component.category === 'radio' ? component.rangeM : null, (value) => {
    next.communication.profile.nominalRangeM = value
    next.communication.profile.loss.midpointM = value
    next.communication.profile.confidence =
      component.confidence === 'measured' ||
      component.confidence === 'manufacturer-rated' ||
      component.confidence === 'estimated'
        ? component.confidence
        : 'user-defined'
    next.communication.profile.source = component.specificationSource
    next.communication.profile.sourceDate = component.sourceDate ?? ''
    next.communication.profile.notes = `Applied from ${source}. Nominal range is the imported number, not a guaranteed link.`
  })
  take('radio-rate', component.category === 'radio' ? component.updateRateHz : null, (value) => {
    if (value > 0) next.communication.profile.intervalS = 1 / value
  })

  if (applied.length === 0 && skipped.length === 0) {
    skipped.push('Nothing was selected.')
  }
  return { scenario: next, applied, skipped }
}
