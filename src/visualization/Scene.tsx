import { Grid, GizmoHelper, GizmoViewport, Line, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { enuToThree } from '../coordinates/enu'
import { length, type Vec3 } from '../math/vec3'
import { meanWind } from '../physics/wind'
import type { Sample } from '../simulation/engine'
import { useSimStore, type CameraMode } from '../store/useSimStore'
import { colors } from './colors'
import { sampleAt } from './sampleAt'

const VELOCITY_SCALE = 7
const FORCE_SCALE = 4

function Arrow({
  color,
  read,
}: {
  color: string
  read: (sample: Sample, vectorScale: number) => { origin: Vec3; vector: Vec3 } | null
}) {
  const group = useRef<THREE.Group>(null)
  const shaft = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const traveler = useRef<THREE.Mesh>(null)
  const direction = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame(({ clock }) => {
    const state = useSimStore.getState()
    const sample = sampleAt(state.result.samples, state.time)
    const node = group.current
    if (!sample || !node || !shaft.current || !head.current || !traveler.current) return
    const reading = read(sample, state.vectorScale)
    if (!reading) {
      node.visible = false
      return
    }
    const magnitude = length(reading.vector)
    const visual = magnitude * state.vectorScale
    if (visual < 1.5) {
      node.visible = false
      return
    }
    node.visible = true
    const [x, y, z] = enuToThree(reading.origin)
    node.position.set(x, y, z)
    const [dx, dy, dz] = enuToThree(reading.vector)
    direction.set(dx, dy, dz).normalize()
    node.quaternion.setFromUnitVectors(up, direction)
    const headLength = Math.min(18, visual * 0.22)
    const shaftLength = Math.max(visual - headLength, 0.5)
    const thickness = Math.max(4.5, visual * 0.03)
    shaft.current.scale.set(thickness, shaftLength, thickness)
    shaft.current.position.y = shaftLength / 2
    head.current.scale.set(thickness * 2.3, headLength, thickness * 2.3)
    head.current.position.y = shaftLength + headLength / 2
    const phase = (clock.elapsedTime % 1.6) / 1.6
    traveler.current.position.y = phase * visual
    traveler.current.scale.setScalar(Math.max(2.2, thickness * 1.7))
  })

  return (
    <group ref={group}>
      <mesh ref={shaft}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={head}>
        <coneGeometry args={[1, 1, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={traveler}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color="#f7f4ea" emissive={color} emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

function Movers() {
  const objectRef = useRef<THREE.Group>(null)
  const parentRef = useRef<THREE.Group>(null)
  const estimateRef = useRef<THREE.Mesh>(null)
  const measuredRef = useRef<THREE.Mesh>(null)
  const rangeRef = useRef<THREE.Mesh>(null)
  const linkLine = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: colors.link }))
  }, [])

  useFrame(() => {
    const state = useSimStore.getState()
    const sample = sampleAt(state.result.samples, state.time)
    if (!sample) return
    const place = (object: THREE.Object3D | null, position: Vec3) => {
      if (!object) return
      const [x, y, z] = enuToThree(position)
      object.position.set(x, y, z)
    }
    place(objectRef.current, sample.truePosition)
    place(parentRef.current, sample.parentPosition)
    if (parentRef.current) {
      parentRef.current.rotation.y = (state.scenario.parent.headingDeg * Math.PI) / 180
    }
    place(estimateRef.current, sample.estimatedPosition)
    if (measuredRef.current) {
      measuredRef.current.visible = sample.measuredPosition !== null
      if (sample.measuredPosition) place(measuredRef.current, sample.measuredPosition)
    }
    if (rangeRef.current) {
      place(rangeRef.current, { ...sample.parentPosition, z: 0.4 })
      const range = state.scenario.communication.profile.nominalRangeM
      rangeRef.current.scale.set(range, range, 1)
    }
    const attribute = linkLine.geometry.getAttribute('position') as THREE.BufferAttribute
    const [px, py, pz] = enuToThree(sample.parentPosition)
    const [ox, oy, oz] = enuToThree(sample.truePosition)
    attribute.setXYZ(0, px, py, pz)
    attribute.setXYZ(1, ox, oy, oz)
    attribute.needsUpdate = true
    const material = linkLine.material as THREE.LineBasicMaterial
    material.color.set(sample.modeledLoss > 0.4 ? colors.gravity : sample.modeledLoss > 0.12 ? colors.air : colors.link)
  })

  const diameter = useSimStore((state) => state.scenario.object.diameter)
  const shape = useSimStore((state) => state.scenario.object.shape)
  const display = Math.max(6, diameter * 28)
  return (
    <>
      <group ref={objectRef}>
        <mesh castShadow>
          {shape === 'box' ? (
            <boxGeometry args={[display * 1.4, display * 0.45, display]} />
          ) : shape === 'cylinder' ? (
            <cylinderGeometry args={[display * 0.45, display * 0.45, display, 20]} />
          ) : (
            <sphereGeometry args={[display * 0.5, 28, 20]} />
          )}
          <meshStandardMaterial color={colors.object} roughness={0.45} metalness={0.05} />
        </mesh>
      </group>
      <group ref={parentRef} scale={3}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[2.4, 2.2, 16]} />
          <meshStandardMaterial color={colors.parent} />
        </mesh>
        <mesh position={[0, 0.2, 1]}>
          <boxGeometry args={[22, 0.35, 3.2]} />
          <meshStandardMaterial color="#b7c9bf" />
        </mesh>
        <mesh position={[0, 0.4, -6]}>
          <boxGeometry args={[7, 0.3, 2]} />
          <meshStandardMaterial color="#b7c9bf" />
        </mesh>
      </group>
      <mesh ref={estimateRef}>
        <octahedronGeometry args={[5, 0]} />
        <meshBasicMaterial color={colors.estimated} wireframe />
      </mesh>
      <mesh ref={measuredRef}>
        <sphereGeometry args={[3.2, 12, 12]} />
        <meshBasicMaterial color={colors.measured} wireframe />
      </mesh>
      <mesh ref={rangeRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1, 72]} />
        <meshBasicMaterial color={colors.link} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={linkLine} />
    </>
  )
}

function CameraRig() {
  const mode = useSimStore((state) => state.cameraMode)
  const { camera } = useThree()
  useFrame(() => {
    const current = useSimStore.getState().cameraMode
    if (current === 'orbit' || current === 'free') {
      camera.up.set(0, 1, 0)
      return
    }
    const sample = sampleAt(useSimStore.getState().result.samples, useSimStore.getState().time)
    if (!sample) return
    const [x, y, z] = enuToThree(sample.truePosition)
    if (current === 'top') {
      camera.up.set(0, 0, 1)
      camera.position.set(x, Math.max(500, y + 700), z)
      camera.lookAt(x, 0, z)
    } else if (current === 'side') {
      camera.up.set(0, 1, 0)
      camera.position.set(x + 650, y * 0.6 + 40, z)
      camera.lookAt(x, y * 0.45, z)
    } else if (current === 'follow') {
      camera.up.set(0, 1, 0)
      const [vx, vy, vz] = enuToThree(sample.trueVelocity)
      const scale = Math.hypot(vx, vy, vz) || 1
      camera.position.set(x - (vx / scale) * 160, y + 70, z - (vz / scale) * 160)
      camera.lookAt(x, y, z)
    }
  })
  return <OrbitControls makeDefault enabled={mode === 'orbit' || mode === 'free'} maxPolarAngle={Math.PI * 0.49} />
}

function FrameTrajectory() {
  const samples = useSimStore((state) => state.result.samples)
  const { camera, controls } = useThree()
  const key = samples.length ? `${samples.length}:${samples[samples.length - 1].t.toFixed(2)}` : '0'
  useEffect(() => {
    if (samples.length < 2) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const sample of samples) {
      const [x, y, z] = enuToThree(sample.truePosition)
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 80)
    camera.up.set(0, 1, 0)
    camera.position.set(cx + span * 0.85, cy + span * 0.45, cz + span * 0.95)
    camera.lookAt(cx, cy, cz)
    const orbit = controls as { target?: { set: (x: number, y: number, z: number) => void } } | null
    orbit?.target?.set(cx, cy, cz)
  }, [key, camera, controls, samples])
  return null
}

function paths(samples: Sample[], pick: (sample: Sample) => Vec3): [number, number, number][] {
  return samples.map((sample) => enuToThree(pick(sample)))
}

export function SceneContents() {
  const samples = useSimStore((state) => state.result.samples)
  const prediction = useSimStore((state) => state.result.prediction)
  const target = useSimStore((state) => state.scenario.control.target)
  const radius = useSimStore((state) => state.scenario.control.targetRadius)
  const wind = useSimStore((state) => state.scenario.wind)
  const landing = useSimStore((state) => state.result.landing)
  const truePoints = useMemo(() => paths(samples, (sample) => sample.truePosition), [samples])
  const estimatedPoints = useMemo(() => paths(samples, (sample) => sample.estimatedPosition), [samples])
  const predictedPoints = useMemo(
    () => prediction.map((point) => enuToThree(point.position)),
    [prediction],
  )
  const field = useMemo(() => {
    const marks: { key: string; origin: Vec3; vector: Vec3 }[] = []
    for (const east of [-250, 0, 250]) {
      for (const north of [0, 220, 440]) {
        const origin = { x: east, y: north, z: 80 }
        marks.push({ key: `${east}-${north}`, origin, vector: meanWind(wind, origin.z) })
      }
    }
    return marks
  }, [wind])

  return (
    <>
      <color attach="background" args={['#101614']} />
      <fog attach="fog" args={['#101614', 900, 3200]} />
      <hemisphereLight args={['#d5efe4', '#243028', 0.85]} />
      <directionalLight position={[200, 400, 120]} intensity={1.3} />
      <Grid
        args={[4000, 4000]}
        cellSize={50}
        cellThickness={0.6}
        sectionSize={250}
        sectionThickness={1.2}
        cellColor="#31443a"
        sectionColor="#567262"
        fadeDistance={2800}
        infiniteGrid
      />
      <Line points={truePoints} color={colors.truePath} lineWidth={2} />
      <Line points={estimatedPoints} color={colors.estimated} lineWidth={1.2} dashed dashSize={8} gapSize={5} />
      <Line points={predictedPoints} color={colors.predicted} lineWidth={1.2} dashed dashSize={4} gapSize={6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={enuToThree({ ...target, z: 0.6 })}>
        <ringGeometry args={[Math.max(radius - 2, 1), radius, 64]} />
        <meshBasicMaterial color={colors.target} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {landing && (
        <mesh position={enuToThree({ ...landing.position, z: 2 })}>
          <sphereGeometry args={[4, 16, 16]} />
          <meshBasicMaterial color={colors.gravity} />
        </mesh>
      )}
      {field.map((mark) => (
        <StaticArrow key={mark.key} origin={mark.origin} vector={mark.vector} />
      ))}
      <Movers />
      <Arrow color={colors.wind} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.wind, VELOCITY_SCALE) })} />
      <Arrow color={colors.velocity} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.trueVelocity, VELOCITY_SCALE) })} />
      <Arrow color={colors.ground} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.groundVelocity, VELOCITY_SCALE) })} />
      <Arrow color={colors.air} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.airRelative, VELOCITY_SCALE) })} />
      <Arrow color={colors.gravity} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.gravity, FORCE_SCALE) })} />
      <Arrow color={colors.drag} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.drag, FORCE_SCALE) })} />
      <Arrow color={colors.lift} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.lift, FORCE_SCALE) })} />
      <Arrow color={colors.correction} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.correction, FORCE_SCALE) })} />
      <CameraRig />
      <FrameTrajectory />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisHeadScale={0.85} labels={['E', 'U', 'N']} />
      </GizmoHelper>
    </>
  )
}

function scaleVec(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }
}

function StaticArrow({ origin, vector }: { origin: Vec3; vector: Vec3 }) {
  const magnitude = length(vector)
  if (magnitude < 0.2) return null
  const visual = magnitude * 8
  const [x, y, z] = enuToThree(origin)
  const [dx, dy, dz] = enuToThree(vector)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  )
  return (
    <mesh position={[x, y, z]} quaternion={quaternion}>
      <cylinderGeometry args={[0.7, 0.7, visual, 6]} />
      <meshBasicMaterial color={colors.wind} transparent opacity={0.28} />
    </mesh>
  )
}

export function cameraModeLabel(mode: CameraMode): string {
  if (mode === 'orbit') return 'Orbit'
  if (mode === 'top') return 'Top'
  if (mode === 'side') return 'Side'
  if (mode === 'follow') return 'Follow'
  return 'Free'
}
