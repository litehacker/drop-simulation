import { lerp, type Vec3 } from '../math/vec3'
import type { Sample } from '../simulation/engine'

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return lerp(a, b, t)
}

function mixOptional(a: Vec3 | null, b: Vec3 | null, t: number): Vec3 | null {
  if (a && b) return lerp(a, b, t)
  return b ?? a
}

/** Visual interpolation between stored output samples. Physics itself used a fixed timestep. */
export function sampleAt(samples: Sample[], time: number): Sample | null {
  if (samples.length === 0) return null
  if (time <= samples[0].t) return samples[0]
  const last = samples[samples.length - 1]
  if (time >= last.t) return last
  let low = 0
  let high = samples.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (samples[mid].t < time) low = mid
    else high = mid
  }
  const left = samples[low]
  const right = samples[high]
  const span = right.t - left.t
  const fraction = span <= 1e-9 ? 0 : (time - left.t) / span
  return {
    ...right,
    t: time,
    truePosition: mixVec(left.truePosition, right.truePosition, fraction),
    trueVelocity: mixVec(left.trueVelocity, right.trueVelocity, fraction),
    estimatedPosition: mixVec(left.estimatedPosition, right.estimatedPosition, fraction),
    estimatedVelocity: mixVec(left.estimatedVelocity, right.estimatedVelocity, fraction),
    measuredPosition: mixOptional(left.measuredPosition, right.measuredPosition, fraction),
    wind: mixVec(left.wind, right.wind, fraction),
    airRelative: mixVec(left.airRelative, right.airRelative, fraction),
    groundVelocity: mixVec(left.groundVelocity, right.groundVelocity, fraction),
    gravity: mixVec(left.gravity, right.gravity, fraction),
    drag: mixVec(left.drag, right.drag, fraction),
    lift: mixVec(left.lift, right.lift, fraction),
    correction: mixVec(left.correction, right.correction, fraction),
    parentPosition: mixVec(left.parentPosition, right.parentPosition, fraction),
    distance: left.distance + (right.distance - left.distance) * fraction,
    modeledLoss: left.modeledLoss + (right.modeledLoss - left.modeledLoss) * fraction,
    modeledLatency: left.modeledLatency + (right.modeledLatency - left.modeledLatency) * fraction,
    estimatedRssi: left.estimatedRssi + (right.estimatedRssi - left.estimatedRssi) * fraction,
  }
}
