import { runMonteCarlo, type MonteCarloRequest } from '../simulation/monteCarlo'
import type { Scenario } from '../simulation/scenario'

interface StartMessage {
  type: 'start'
  scenario: Scenario
  request: MonteCarloRequest
}

self.onmessage = (event: MessageEvent<StartMessage>) => {
  const { scenario, request } = event.data
  const result = runMonteCarlo(scenario, request, (completed, total) => {
    self.postMessage({ type: 'progress', completed, total })
  })
  self.postMessage({ type: 'done', result })
}
