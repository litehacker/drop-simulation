export type Confidence = 'measured' | 'manufacturer-rated' | 'estimated' | 'user-defined'

export interface LossModel {
  /** Constant ignores distance. Distance uses a logistic curve between base and max. */
  kind: 'constant' | 'distance'
  /** Loss fraction at zero distance, 0–1. */
  baseLoss: number
  /** Distance where the logistic is halfway between base and max. */
  midpointM: number
  /** Transition sharpness in 1/m. */
  steepness: number
  maxLoss: number
}

export interface CommProfile {
  id: string
  name: string
  /** Carrier frequency in Hz. Stored for the user. It does not by itself change range. */
  carrierFrequencyHz: number
  dataRateBps: number
  packetBytes: number
  intervalS: number
  latencyS: number
  jitterS: number
  /** Added seconds per meter. Default 0 so distance does not invent delay. */
  latencyPerMeter: number
  /** Profile input. Not a guaranteed operational range. */
  nominalRangeM: number
  retryCount: number
  retryGapS: number
  bandwidthHz: number
  loss: LossModel
  /** Estimated indicator only. Not a measured link budget. */
  rssiAtOneMeterDbm: number
  pathLossExponent: number
  source: string
  sourceDate: string
  confidence: Confidence
  notes: string
}

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Packet loss fraction from the selected model. This is the model, not a measurement. */
/** Distance curve equals baseLoss at 0 m and approaches maxLoss far away. */
export function packetLossProbability(distanceM: number, model: LossModel): number {
  const base = clamp01(model.baseLoss)
  const maxLoss = clamp01(Math.max(model.maxLoss, base))
  if (model.kind === 'constant') return base
  const distance = Math.max(0, distanceM)
  const logistic = (value: number) => 1 / (1 + Math.exp(-model.steepness * (value - model.midpointM)))
  const atZero = logistic(0)
  const span = 1 - atZero
  const shaped = span < 1e-6 ? 1 : (logistic(distance) - atZero) / span
  return clamp01(base + (maxLoss - base) * shaped)
}

/** Deterministic part of one-way latency, before jitter and retries. */
export function deterministicLatency(distanceM: number, profile: CommProfile): number {
  return Math.max(0, profile.latencyS + profile.latencyPerMeter * Math.max(0, distanceM))
}

/**
 * Free-space-like indicator. The exponent and reference level are profile inputs.
 * DropSim does not treat this number as a measured RSSI.
 */
export function estimatedRssi(distanceM: number, profile: CommProfile): number {
  const distance = Math.max(distanceM, 1)
  return profile.rssiAtOneMeterDbm - 10 * profile.pathLossExponent * Math.log10(distance)
}

/** Approximate goodput after the loss model and retries. Labeled as a model output. */
export function effectiveDataRateBps(distanceM: number, profile: CommProfile): number {
  const loss = packetLossProbability(distanceM, profile.loss)
  const attempts = Math.max(0, profile.retryCount) + 1
  const success = 1 - loss ** attempts
  const interval = Math.max(profile.intervalS, 1e-4)
  return (profile.packetBytes * 8 * success) / interval
}

export function airtimeSeconds(profile: CommProfile): number {
  return (profile.packetBytes * 8) / Math.max(profile.dataRateBps, 1)
}

export interface LinkCurvePoint {
  distanceM: number
  loss: number
  latencyS: number
  rssiDbm: number
  dataRateBps: number
}

export function linkCurve(profile: CommProfile, maxDistance: number, count = 40): LinkCurvePoint[] {
  const points: LinkCurvePoint[] = []
  const steps = Math.max(2, count)
  for (let i = 0; i < steps; i += 1) {
    const distanceM = (maxDistance * i) / (steps - 1)
    points.push({
      distanceM,
      loss: packetLossProbability(distanceM, profile.loss),
      latencyS: deterministicLatency(distanceM, profile),
      rssiDbm: estimatedRssi(distanceM, profile),
      dataRateBps: effectiveDataRateBps(distanceM, profile),
    })
  }
  return points
}
