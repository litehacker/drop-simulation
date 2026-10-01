export type SpecConfidence = 'measured' | 'manufacturer-rated' | 'estimated' | 'user-defined' | 'unspecified'

export type ComponentCategory =
  | 'flight-controller'
  | 'gnss'
  | 'motor'
  | 'esc'
  | 'servo'
  | 'battery'
  | 'radio'
  | 'sensor'
  | 'camera'
  | 'companion-computer'

export interface ComponentDimensions {
  lengthM: number
  widthM: number
  heightM: number
}

/**
 * Normalized component record.
 * Null specification fields are unknown. DropSim will not invent them and will not
 * apply them to a simulation.
 */
export interface ComponentRecord {
  id: string
  manufacturer: string
  model: string
  category: ComponentCategory
  price: number | null
  currency: string | null
  weightKg: number | null
  dimensionsM: ComponentDimensions | null
  voltageV: number | null
  currentA: number | null
  interfaces: string[]
  protocols: string[]
  updateRateHz: number | null
  accuracy: number | null
  accuracyUnit: string | null
  rangeM: number | null
  sourceUrl: string | null
  sourceDate: string | null
  specificationSource: string
  confidence: SpecConfidence
  userNotes: string
  /** Original text kept beside the normalized fields. */
  rawSpecification: string
}

export const componentCategories: { id: ComponentCategory; label: string }[] = [
  { id: 'flight-controller', label: 'Flight controllers' },
  { id: 'gnss', label: 'GNSS / RTK' },
  { id: 'motor', label: 'Motors' },
  { id: 'esc', label: 'ESCs' },
  { id: 'servo', label: 'Servos' },
  { id: 'battery', label: 'Batteries' },
  { id: 'radio', label: 'Radio / telemetry' },
  { id: 'sensor', label: 'Sensors' },
  { id: 'camera', label: 'Cameras' },
  { id: 'companion-computer', label: 'Companion computers' },
]
