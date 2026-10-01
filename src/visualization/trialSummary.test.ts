import { describe, expect, it } from 'vitest'
import { landingsInside, meanOffsetSentence } from './trialSummary'
import type { MonteCarloResult } from '../simulation/monteCarlo'

const result = {
  runsRequested: 2,
  runsLanded: 2,
  landings: [
    { run: 0, east: 0, north: 0, radialError: 0, time: 1 },
    { run: 1, east: 10, north: -40, radialError: 30, time: 1 },
  ],
  trajectories: [],
  meanEast: 5,
  meanNorth: -20,
  stdEast: 1,
  stdNorth: 1,
  radialP50: 15,
  radialP90: 30,
  radialP95: 30,
  computeSeconds: 0,
} satisfies MonteCarloResult

describe('trial summary', () => {
  it('counts impacts inside the ring and says where the average sits', () => {
    expect(landingsInside(result, { x: 0, y: 0, z: 0 }, 20)).toBe(1)
    expect(meanOffsetSentence(result, { x: 0, y: 0, z: 0 })).toBe('The average landing is 5 m east and 20 m south of the ring center.')
  })
})
