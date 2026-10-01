import type { Rng } from '../math/random'
import { chance, gaussian } from '../math/random'

export interface ScalarSensorConfig {
  enabled: boolean
  updateRateHz: number
  latencyS: number
  bias: number
  noiseStd: number
  dropoutProbability: number
  /** Round to this quantum. 0 disables quantization. */
  quantization: number
  /** Documented accuracy. Not substituted for noiseStd unless the user copies it. */
  accuracy: number
  /** Model limit. A non-finite or very large value means "no limit loaded". */
  range: number
}

export function quantize(value: number, quantum: number): number {
  if (!(quantum > 0)) return value
  return Math.round(value / quantum) * quantum
}

export function readScalar(
  truth: number,
  config: ScalarSensorConfig,
  rng: Rng,
  noiseScale = 1,
  dropoutScale = 1,
): number | null {
  if (!config.enabled) return null
  if (Number.isFinite(config.range) && Math.abs(truth) > config.range) return null
  const dropout = Math.min(1, Math.max(0, config.dropoutProbability * dropoutScale))
  if (chance(rng, dropout)) return null
  const noisy = truth + config.bias + gaussian(rng) * config.noiseStd * noiseScale
  return quantize(noisy, config.quantization)
}

export interface DelayedSample<T> {
  availableAt: number
  value: T
}

export interface DelayQueue<T> {
  pending: DelayedSample<T>[]
  latest: T | null
  latestAvailableAt: number | null
}

export function createDelayQueue<T>(): DelayQueue<T> {
  return { pending: [], latest: null, latestAvailableAt: null }
}

export function enqueue<T>(queue: DelayQueue<T>, time: number, latency: number, value: T): void {
  queue.pending.push({ availableAt: time + Math.max(0, latency), value })
}

/** Release every sample whose latency has elapsed. Returns the newest one this call. */
export function releaseDue<T>(queue: DelayQueue<T>, time: number): T | null {
  let delivered: T | null = null
  const remaining: DelayedSample<T>[] = []
  for (const sample of queue.pending) {
    if (sample.availableAt <= time + 1e-12) {
      delivered = sample.value
      queue.latest = sample.value
      queue.latestAvailableAt = sample.availableAt
    } else {
      remaining.push(sample)
    }
  }
  queue.pending = remaining
  return delivered
}

export function dueForSample(time: number, nextTime: number, dt: number): boolean {
  return time + 1e-12 >= nextTime && time < nextTime + dt
}

export function advanceSchedule(nextTime: number, rateHz: number, now: number): number {
  const period = 1 / Math.max(rateHz, 1e-6)
  let next = nextTime
  while (next <= now + 1e-12) next += period
  return next
}
