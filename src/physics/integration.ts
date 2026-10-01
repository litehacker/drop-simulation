import type { Attitude } from '../coordinates/enu'
import { add, scale, type Vec3 } from '../math/vec3'

export interface KinematicState {
  position: Vec3
  velocity: Vec3
  attitude: Attitude
  rates: Attitude
}

export interface KinematicDerivative {
  velocity: Vec3
  acceleration: Vec3
  rates: Attitude
  rateDot: Attitude
}

export function addState(state: KinematicState, derivative: KinematicDerivative, dt: number): KinematicState {
  return {
    position: add(state.position, scale(derivative.velocity, dt)),
    velocity: add(state.velocity, scale(derivative.acceleration, dt)),
    attitude: {
      yaw: state.attitude.yaw + derivative.rates.yaw * dt,
      pitch: state.attitude.pitch + derivative.rates.pitch * dt,
      roll: state.attitude.roll + derivative.rates.roll * dt,
    },
    rates: {
      yaw: state.rates.yaw + derivative.rateDot.yaw * dt,
      pitch: state.rates.pitch + derivative.rateDot.pitch * dt,
      roll: state.rates.roll + derivative.rateDot.roll * dt,
    },
  }
}

export function combineDerivatives(
  a: KinematicDerivative,
  b: KinematicDerivative,
  scaleB: number,
): KinematicDerivative {
  const mix = (left: number, right: number) => left + right * scaleB
  return {
    velocity: add(a.velocity, scale(b.velocity, scaleB)),
    acceleration: add(a.acceleration, scale(b.acceleration, scaleB)),
    rates: {
      yaw: mix(a.rates.yaw, b.rates.yaw),
      pitch: mix(a.rates.pitch, b.rates.pitch),
      roll: mix(a.rates.roll, b.rates.roll),
    },
    rateDot: {
      yaw: mix(a.rateDot.yaw, b.rateDot.yaw),
      pitch: mix(a.rateDot.pitch, b.rateDot.pitch),
      roll: mix(a.rateDot.roll, b.rateDot.roll),
    },
  }
}

/**
 * Classical fourth-order Runge–Kutta.
 * Constant acceleration (gravity only) is integrated exactly because the
 * solution is a polynomial of degree 2.
 */
export function rk4Step(
  state: KinematicState,
  dt: number,
  derivative: (state: KinematicState) => KinematicDerivative,
): KinematicState {
  const k1 = derivative(state)
  const k2 = derivative(addState(state, k1, dt / 2))
  const k3 = derivative(addState(state, k2, dt / 2))
  const k4 = derivative(addState(state, k3, dt))

  const weighted = (a: number, b: number, c: number, d: number) => (a + 2 * b + 2 * c + d) / 6
  return {
    position: {
      x: state.position.x + weighted(k1.velocity.x, k2.velocity.x, k3.velocity.x, k4.velocity.x) * dt,
      y: state.position.y + weighted(k1.velocity.y, k2.velocity.y, k3.velocity.y, k4.velocity.y) * dt,
      z: state.position.z + weighted(k1.velocity.z, k2.velocity.z, k3.velocity.z, k4.velocity.z) * dt,
    },
    velocity: {
      x: state.velocity.x + weighted(k1.acceleration.x, k2.acceleration.x, k3.acceleration.x, k4.acceleration.x) * dt,
      y: state.velocity.y + weighted(k1.acceleration.y, k2.acceleration.y, k3.acceleration.y, k4.acceleration.y) * dt,
      z: state.velocity.z + weighted(k1.acceleration.z, k2.acceleration.z, k3.acceleration.z, k4.acceleration.z) * dt,
    },
    attitude: {
      yaw: state.attitude.yaw + weighted(k1.rates.yaw, k2.rates.yaw, k3.rates.yaw, k4.rates.yaw) * dt,
      pitch: state.attitude.pitch + weighted(k1.rates.pitch, k2.rates.pitch, k3.rates.pitch, k4.rates.pitch) * dt,
      roll: state.attitude.roll + weighted(k1.rates.roll, k2.rates.roll, k3.rates.roll, k4.rates.roll) * dt,
    },
    rates: {
      yaw: state.rates.yaw + weighted(k1.rateDot.yaw, k2.rateDot.yaw, k3.rateDot.yaw, k4.rateDot.yaw) * dt,
      pitch: state.rates.pitch + weighted(k1.rateDot.pitch, k2.rateDot.pitch, k3.rateDot.pitch, k4.rateDot.pitch) * dt,
      roll: state.rates.roll + weighted(k1.rateDot.roll, k2.rateDot.roll, k3.rateDot.roll, k4.rateDot.roll) * dt,
    },
  }
}
