import type { ComponentCategory, ComponentRecord, SpecConfidence } from './schema'

const CONFIDENCE = new Set(['measured', 'manufacturer-rated', 'estimated', 'user-defined', 'unspecified'])
const CATEGORIES = new Set([
  'flight-controller',
  'gnss',
  'motor',
  'esc',
  'servo',
  'battery',
  'radio',
  'sensor',
  'camera',
  'companion-computer',
])

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') return value.split(/[|,]/).map((item) => item.trim()).filter(Boolean)
  return []
}

export function normalizeComponent(value: unknown, index = 0): ComponentRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const model = asString(record.model)
  const manufacturer = asString(record.manufacturer, 'Unknown')
  if (!model) return null
  const category = asString(record.category, 'sensor')
  const confidence = asString(record.confidence, 'user-defined')
  const dimensions = record.dimensionsM ?? record.dimensions
  let dimensionsM: ComponentRecord['dimensionsM'] = null
  if (dimensions && typeof dimensions === 'object') {
    const box = dimensions as Record<string, unknown>
    const lengthM = asNumber(box.lengthM ?? box.length)
    const widthM = asNumber(box.widthM ?? box.width)
    const heightM = asNumber(box.heightM ?? box.height)
    if (lengthM !== null && widthM !== null && heightM !== null) dimensionsM = { lengthM, widthM, heightM }
  }
  return {
    id: asString(record.id, `${manufacturer}-${model}-${index}`).toLowerCase().replace(/\s+/g, '-'),
    manufacturer,
    model,
    category: (CATEGORIES.has(category) ? category : 'sensor') as ComponentCategory,
    price: asNumber(record.price),
    currency: record.currency === null || record.currency === undefined ? null : asString(record.currency),
    weightKg: asNumber(record.weightKg ?? record.weight),
    dimensionsM,
    voltageV: asNumber(record.voltageV ?? record.voltage),
    currentA: asNumber(record.currentA ?? record.current),
    interfaces: asStringList(record.interfaces),
    protocols: asStringList(record.protocols),
    updateRateHz: asNumber(record.updateRateHz ?? record.update_rate),
    accuracy: asNumber(record.accuracy),
    accuracyUnit: record.accuracyUnit === undefined ? null : asString(record.accuracyUnit),
    rangeM: asNumber(record.rangeM ?? record.range),
    sourceUrl: record.sourceUrl === undefined ? null : asString(record.sourceUrl) || null,
    sourceDate: record.sourceDate === undefined ? null : asString(record.sourceDate) || null,
    specificationSource: asString(record.specificationSource, 'Imported file'),
    confidence: (CONFIDENCE.has(confidence) ? confidence : 'user-defined') as SpecConfidence,
    userNotes: asString(record.userNotes ?? record.user_notes),
    rawSpecification: asString(record.rawSpecification ?? record.raw),
  }
}

export function importComponentJson(text: string): { components: ComponentRecord[]; errors: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { components: [], errors: ['The file is not valid JSON.'] }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { components?: unknown }).components)
      ? (parsed as { components: unknown[] }).components
      : null
  if (!list) return { components: [], errors: ['Expected a JSON array of components, or an object with a components array.'] }
  const components: ComponentRecord[] = []
  const errors: string[] = []
  list.forEach((item, index) => {
    const component = normalizeComponent(item, index)
    if (component) components.push(component)
    else errors.push(`Row ${index + 1} is missing a model name.`)
  })
  return { components, errors }
}

export function importComponentCsv(text: string): { components: ComponentRecord[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return { components: [], errors: ['CSV needs a header and at least one row.'] }
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  const components: ComponentRecord[] = []
  const errors: string[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index])
    const record: Record<string, string> = {}
    headers.forEach((header, cell) => {
      record[header] = cells[cell] ?? ''
    })
    const component = normalizeComponent(record, index)
    if (component) components.push(component)
    else errors.push(`CSV row ${index + 1} is missing a model name.`)
  }
  return { components, errors }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells
}
