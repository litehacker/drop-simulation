/**
 * Linear Kalman filter for ENU position and velocity.
 * The process model includes gravity and treats drag, wind, and control as process noise.
 * It is intentionally not an EKF. An EKF can replace `predict` / `update` later
 * without changing the estimator selector.
 */

export interface KalmanState {
  /** [px, py, pz, vx, vy, vz] */
  x: number[]
  /** Row-major 6×6 covariance. */
  p: number[]
}

export function createKalman(
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  positionStd: number,
  velocityStd: number,
): KalmanState {
  const p = new Array<number>(36).fill(0)
  for (let i = 0; i < 3; i += 1) p[i * 6 + i] = positionStd * positionStd
  for (let i = 3; i < 6; i += 1) p[i * 6 + i] = velocityStd * velocityStd
  return {
    x: [position.x, position.y, position.z, velocity.x, velocity.y, velocity.z],
    p,
  }
}

function idx(row: number, col: number): number {
  return row * 6 + col
}

/** Constant-velocity predict plus a known gravity acceleration on Up. */
export function kalmanPredict(state: KalmanState, dt: number, gravity: number, accelStd: number): void {
  const { x, p } = state
  const next = x.slice()
  next[0] = x[0] + x[3] * dt
  next[1] = x[1] + x[4] * dt
  next[2] = x[2] + x[5] * dt - 0.5 * gravity * dt * dt
  next[3] = x[3]
  next[4] = x[4]
  next[5] = x[5] - gravity * dt

  const fp = new Array<number>(36).fill(0)
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 6; row += 1) {
      const extra = row < 3 ? dt * p[idx(row + 3, col)] : 0
      fp[idx(row, col)] = p[idx(row, col)] + extra
    }
  }
  const fpf = new Array<number>(36).fill(0)
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const extra = col < 3 ? dt * fp[idx(row, col + 3)] : 0
      fpf[idx(row, col)] = fp[idx(row, col)] + extra
    }
  }

  const qPos = accelStd * accelStd * dt * dt * dt * dt * 0.25
  const qVel = accelStd * accelStd * dt * dt
  for (let i = 0; i < 3; i += 1) {
    fpf[idx(i, i)] += qPos
    fpf[idx(i + 3, i + 3)] += qVel
  }
  state.x = next
  state.p = fpf
}

/** Position update. Variances are σ² on East, North, and Up. */
export function kalmanUpdatePosition(
  state: KalmanState,
  measurement: { x: number; y: number; z: number },
  variance: { x: number; y: number; z: number },
): void {
  updateScalar(state, 0, measurement.x, variance.x)
  updateScalar(state, 1, measurement.y, variance.y)
  updateScalar(state, 2, measurement.z, variance.z)
}

export function kalmanUpdateAltitude(state: KalmanState, altitude: number, variance: number): void {
  updateScalar(state, 2, altitude, variance)
}

function updateScalar(state: KalmanState, index: number, measurement: number, variance: number): void {
  const { x, p } = state
  const innovationVar = p[idx(index, index)] + Math.max(variance, 1e-8)
  if (innovationVar <= 0) return
  const kalmanGain = new Array<number>(6)
  for (let row = 0; row < 6; row += 1) kalmanGain[row] = p[idx(row, index)] / innovationVar
  const innovation = measurement - x[index]
  for (let row = 0; row < 6; row += 1) x[row] += kalmanGain[row] * innovation
  const nextP = p.slice()
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 6; row += 1) {
      nextP[idx(row, col)] = p[idx(row, col)] - kalmanGain[row] * p[idx(index, col)]
    }
  }
  for (let row = 0; row < 6; row += 1) {
    for (let col = row + 1; col < 6; col += 1) {
      const average = 0.5 * (nextP[idx(row, col)] + nextP[idx(col, row)])
      nextP[idx(row, col)] = average
      nextP[idx(col, row)] = average
    }
  }
  state.p = nextP
}

export function kalmanPosition(state: KalmanState): { x: number; y: number; z: number } {
  return { x: state.x[0], y: state.x[1], z: state.x[2] }
}

export function kalmanVelocity(state: KalmanState): { x: number; y: number; z: number } {
  return { x: state.x[3], y: state.x[4], z: state.x[5] }
}
