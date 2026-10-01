import type { Rng } from '../math/random'
import { uniform } from '../math/random'
import {
  deterministicLatency,
  packetLossProbability,
  type CommProfile,
} from './packetLoss'

export interface TransitPacket<T> {
  id: number
  payload: T
  arriveAt: number
  sentAt: number
  attempts: number
}

export interface LinkRuntime<T> {
  nextId: number
  nextAttemptAt: number
  /** Payload waiting for a retry. Null when the link is idle. */
  waiting: { payload: T; attemptsLeft: number; startedAt: number } | null
  inflight: TransitPacket<T>[]
  latest: T | null
  latestSentAt: number | null
  latestArrivedAt: number | null
  sent: number
  lost: number
  delivered: number
  latencySum: number
}

export function createLinkRuntime<T>(): LinkRuntime<T> {
  return {
    nextId: 1,
    nextAttemptAt: 0,
    waiting: null,
    inflight: [],
    latest: null,
    latestSentAt: null,
    latestArrivedAt: null,
    sent: 0,
    lost: 0,
    delivered: 0,
    latencySum: 0,
  }
}

export interface LinkTick<T> {
  link: LinkRuntime<T>
  /** Newly arrived payload this tick, if any. */
  arrived: T | null
  /** True when `offer` was accepted onto the link this tick. */
  accepted: boolean
}

/**
 * Symmetric one-way link used for both telemetry and commands.
 * Loss, latency, jitter, and retries come only from the selected profile.
 */
export function tickLink<T>(
  link: LinkRuntime<T>,
  time: number,
  dt: number,
  distanceM: number,
  profile: CommProfile,
  rng: Rng,
  /** Offered once per interval when the link is not already retrying. */
  offer: T | null,
): LinkTick<T> {
  const next: LinkRuntime<T> = {
    ...link,
    inflight: link.inflight.slice(),
    waiting: link.waiting,
  }
  let accepted = false

  if (next.waiting === null && offer !== null && time + 1e-12 >= next.nextAttemptAt) {
    next.waiting = {
      payload: offer,
      attemptsLeft: Math.max(0, profile.retryCount) + 1,
      startedAt: time,
    }
    accepted = true
  }

  if (next.waiting && time + 1e-12 >= next.nextAttemptAt) {
    const loss = packetLossProbability(distanceM, profile.loss)
    const lost = rng() < loss
    next.sent += 1
    next.waiting = { ...next.waiting, attemptsLeft: next.waiting.attemptsLeft - 1 }
    if (!lost) {
      const jitter = uniform(rng, -profile.jitterS, profile.jitterS)
      const latency = Math.max(0, deterministicLatency(distanceM, profile) + jitter)
      next.inflight.push({
        id: next.nextId,
        payload: next.waiting.payload,
        arriveAt: time + latency,
        sentAt: next.waiting.startedAt,
        attempts: Math.max(0, profile.retryCount) + 1 - next.waiting.attemptsLeft,
      })
      next.nextId += 1
      next.waiting = null
      next.nextAttemptAt = time + Math.max(profile.intervalS, dt)
    } else if (next.waiting.attemptsLeft <= 0) {
      next.lost += 1
      next.waiting = null
      next.nextAttemptAt = time + Math.max(profile.intervalS, dt)
    } else {
      next.nextAttemptAt = time + Math.max(profile.retryGapS, dt)
    }
  }

  let arrived: T | null = null
  const stillFlying: TransitPacket<T>[] = []
  for (const packet of next.inflight) {
    if (packet.arriveAt <= time + 1e-12) {
      arrived = packet.payload
      next.latest = packet.payload
      next.latestSentAt = packet.sentAt
      next.latestArrivedAt = packet.arriveAt
      next.delivered += 1
      next.latencySum += Math.max(0, packet.arriveAt - packet.sentAt)
    } else {
      stillFlying.push(packet)
    }
  }
  next.inflight = stillFlying
  return { link: next, arrived, accepted }
}

export function averageLatency(link: LinkRuntime<unknown>): number {
  if (link.delivered === 0) return 0
  return link.latencySum / link.delivered
}
