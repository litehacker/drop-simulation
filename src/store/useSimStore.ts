import { create } from 'zustand'
import { starterCatalog } from '../catalog/catalog'
import { importComponentCsv, importComponentJson } from '../catalog/importer'
import type { ComponentRecord } from '../catalog/schema'
import { commProfiles, profileById } from '../communications/profiles'
import { applyComponent } from '../simulation/applyComponent'
import type { ComparisonRow } from '../simulation/compare'
import { runSimulation, type SimulationResult } from '../simulation/engine'
import { monteCarloCsv, scenarioJson, trajectoryCsv } from '../simulation/export'
import {
  defaultMonteCarloRequest,
  runMonteCarlo,
  type MonteCarloRequest,
  type MonteCarloResult,
} from '../simulation/monteCarlo'
import { duplicateScenario, presets } from '../simulation/presets'
import { cloneScenario, createDefaultScenario, hydrateScenario, type Scenario } from '../simulation/scenario'
import { defaultVectorVisibility, type VectorId } from '../visualization/colors'

export type CameraMode = 'orbit' | 'top' | 'side' | 'follow' | 'free'
export type LeftTab = 'scenario' | 'object' | 'environment' | 'sensors' | 'link' | 'control' | 'catalog' | 'integrations'
export type RightTab = 'now' | 'compare' | 'trials' | 'notes'

const LIBRARY_KEY = 'dropsim.scenarios.v1'
const CATALOG_KEY = 'dropsim.catalog.v1'

interface SavedScenario {
  name: string
  savedAt: string
  scenario: Scenario
}

function loadLibrary(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedScenario[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadCatalog(): ComponentRecord[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (!raw) return starterCatalog
    const parsed = JSON.parse(raw) as ComponentRecord[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : starterCatalog
  } catch {
    return starterCatalog
  }
}

const initialScenario = createDefaultScenario()
const initialResult = runSimulation(initialScenario)

interface SimState {
  scenario: Scenario
  result: SimulationResult
  dirty: boolean
  running: boolean
  time: number
  playing: boolean
  speed: number
  vectorScale: number
  visibleVectors: Record<VectorId, boolean>
  displayScale: 'visible' | 'true'
  cameraMode: CameraMode
  leftTab: LeftTab
  rightTab: RightTab
  comparison: ComparisonRow[] | null
  comparing: boolean
  monteCarlo: MonteCarloResult | null
  mcRequest: MonteCarloRequest
  mcProgress: { completed: number; total: number } | null
  mcError: string | null
  catalog: ComponentRecord[]
  catalogMessage: string
  library: SavedScenario[]
  patch: (recipe: (scenario: Scenario) => void) => void
  toggleLock: (id: string, locked: boolean) => void
  run: () => void
  setTime: (time: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setVectorScale: (scale: number) => void
  toggleVector: (id: VectorId) => void
  setAllVectors: (visible: boolean) => void
  setDisplayScale: (scale: 'visible' | 'true') => void
  setCameraMode: (mode: CameraMode) => void
  setLeftTab: (tab: LeftTab) => void
  setRightTab: (tab: RightTab) => void
  applyPreset: (id: string) => void
  compare: () => Promise<void>
  startMonteCarlo: () => void
  setMcRequest: (recipe: (request: MonteCarloRequest) => void) => void
  saveScenario: (name: string) => void
  loadScenario: (name: string) => void
  deleteScenario: (name: string) => void
  importScenarioText: (text: string) => string | null
  importCatalogText: (text: string, kind: 'json' | 'csv') => void
  applyCatalogComponent: (id: string, selections: string[]) => void
  snapTarget: (kind: 'calm' | 'landing') => void
  selectProfile: (id: string) => void
}

function download(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadTrajectory() {
  const { result, scenario } = useSimStore.getState()
  download(`${slug(scenario.name)}-trajectory.csv`, trajectoryCsv(result), 'text/csv')
}

export function downloadScenarioFile() {
  const { scenario, result } = useSimStore.getState()
  download(`${slug(scenario.name)}.json`, scenarioJson(scenario, result), 'application/json')
}

export function downloadMonteCarlo() {
  const monteCarlo = useSimStore.getState().monteCarlo
  if (!monteCarlo) return
  download('dropsim-landings.csv', monteCarloCsv(monteCarlo), 'text/csv')
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dropsim'
}

export const useSimStore = create<SimState>((set, get) => ({
  scenario: initialScenario,
  result: initialResult,
  dirty: false,
  running: false,
  time: 0,
  playing: true,
  speed: 1,
  vectorScale: 1,
  visibleVectors: defaultVectorVisibility(),
  displayScale: 'visible',
  cameraMode: 'orbit',
  leftTab: 'scenario',
  rightTab: 'now',
  comparison: null,
  comparing: false,
  monteCarlo: null,
  mcRequest: defaultMonteCarloRequest(),
  mcProgress: null,
  mcError: null,
  catalog: loadCatalog(),
  catalogMessage: 'Blank specifications are not applied. Import a datasheet you are allowed to use.',
  library: typeof localStorage === 'undefined' ? [] : loadLibrary(),
  patch: (recipe) => {
    const scenario = cloneScenario(get().scenario)
    recipe(scenario)
    set({ scenario, dirty: true })
  },
  toggleLock: (id, locked) => {
    get().patch((scenario) => {
      scenario.locks = locked ? Array.from(new Set([...scenario.locks, id])) : scenario.locks.filter((item) => item !== id)
    })
  },
  run: () => {
    set({ running: true })
    const result = runSimulation(get().scenario)
    set({ result, running: false, dirty: false, time: 0, playing: true })
  },
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setVectorScale: (vectorScale) => set({ vectorScale }),
  toggleVector: (id) =>
    set({ visibleVectors: { ...get().visibleVectors, [id]: !get().visibleVectors[id] } }),
  setAllVectors: (visible) =>
    set({
      visibleVectors: Object.fromEntries(
        Object.keys(get().visibleVectors).map((id) => [id, visible]),
      ) as Record<VectorId, boolean>,
    }),
  setDisplayScale: (displayScale) => set({ displayScale }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  applyPreset: (id) => {
    const preset = presets.find((item) => item.id === id)
    if (!preset) return
    set({ scenario: preset.apply(), dirty: true, comparison: null })
  },
  compare: async () => {
    set({ comparing: true, comparison: [], rightTab: 'compare' })
    const cases = (await import('../simulation/compare')).comparisonScenarios(get().scenario)
    const rows: ComparisonRow[] = []
    for (const item of cases) {
      rows.push({ id: item.id, name: item.name, detail: item.detail, result: runSimulation(item.scenario) })
      set({ comparison: rows.slice() })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    set({ comparing: false })
  },
  setMcRequest: (recipe) => {
    const mcRequest = { ...get().mcRequest }
    recipe(mcRequest)
    set({ mcRequest })
  },
  startMonteCarlo: () => {
    const scenario = cloneScenario(get().scenario)
    const request = { ...get().mcRequest }
    set({ mcProgress: { completed: 0, total: request.runs }, mcError: null, rightTab: 'trials', monteCarlo: null })
    try {
      const worker = new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ type: string; completed?: number; total?: number; result?: MonteCarloResult }>) => {
        if (event.data.type === 'progress' && event.data.completed && event.data.total) {
          set({ mcProgress: { completed: event.data.completed, total: event.data.total } })
        }
        if (event.data.type === 'done' && event.data.result) {
          set({ monteCarlo: event.data.result, mcProgress: null })
          worker.terminate()
        }
      }
      worker.onerror = () => {
        worker.terminate()
        const monteCarlo = runMonteCarlo(scenario, request, (completed, total) => {
          set({ mcProgress: { completed, total } })
        })
        set({ monteCarlo, mcProgress: null })
      }
      worker.postMessage({ type: 'start', scenario, request })
    } catch (error) {
      const monteCarlo = runMonteCarlo(scenario, request)
      set({
        monteCarlo,
        mcProgress: null,
        mcError: error instanceof Error ? error.message : 'Worker unavailable. Ran on the main thread.',
      })
    }
  },
  saveScenario: (name) => {
    const scenario = cloneScenario(get().scenario)
    scenario.name = name || scenario.name
    const library = loadLibrary().filter((item) => item.name !== scenario.name)
    library.unshift({ name: scenario.name, savedAt: new Date().toISOString(), scenario })
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
    set({ library, scenario, dirty: true })
  },
  loadScenario: (name) => {
    const found = get().library.find((item) => item.name === name)
    if (!found) return
    set({ scenario: hydrateScenario(found.scenario), dirty: true, comparison: null })
  },
  deleteScenario: (name) => {
    const library = get().library.filter((item) => item.name !== name)
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
    set({ library })
  },
  importScenarioText: (text) => {
    try {
      const parsed = JSON.parse(text) as { scenario?: unknown }
      const scenario = hydrateScenario(parsed.scenario ?? parsed)
      set({ scenario, dirty: true, comparison: null })
      return null
    } catch {
      return 'That file is not a DropSim scenario JSON document.'
    }
  },
  importCatalogText: (text, kind) => {
    const imported = kind === 'csv' ? importComponentCsv(text) : importComponentJson(text)
    if (imported.components.length === 0) {
      set({ catalogMessage: imported.errors.join(' ') || 'Nothing imported.' })
      return
    }
    const catalog = [...imported.components, ...get().catalog.filter((item) => !imported.components.some((next) => next.id === item.id))]
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog))
    set({
      catalog,
      catalogMessage: `Imported ${imported.components.length} component${imported.components.length === 1 ? '' : 's'}. ${imported.errors.join(' ')}`,
    })
  },
  applyCatalogComponent: (id, selections) => {
    const component = get().catalog.find((item) => item.id === id)
    if (!component) return
    const applied = applyComponent(get().scenario, component, selections)
    set({
      scenario: applied.scenario,
      dirty: true,
      catalogMessage: [
        applied.applied.length ? `Applied ${applied.applied.map((field) => field.field).join(', ')}.` : '',
        applied.skipped.join(' '),
      ]
        .filter(Boolean)
        .join(' '),
    })
  },
  snapTarget: (kind) => {
    const scenario = cloneScenario(get().scenario)
    if (kind === 'calm') {
      scenario.wind = { ...scenario.wind, speed: 0, turbulenceStd: 0, gustsEnabled: false }
      scenario.control = { ...scenario.control, enabled: false }
    }
    const result = kind === 'landing' ? get().result : runSimulation(scenario, true)
    if (!result.landing) return
    get().patch((draft) => {
      draft.control.target = { x: result.landing!.position.x, y: result.landing!.position.y, z: 0 }
    })
  },
  selectProfile: (id) => {
    get().patch((scenario) => {
      scenario.communication.profileId = id
      scenario.communication.profile = structuredClone(profileById(id))
    })
  },
}))

export { commProfiles, duplicateScenario, presets }
