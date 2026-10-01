import { Grid, GizmoHelper, GizmoViewport, Line, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { enuToThree, threeToEnu } from '../coordinates/enu'
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
  maxVisual,
}: {
  color: string
  read: (sample: Sample, vectorScale: number) => { origin: Vec3; vector: Vec3 } | null
  maxVisual: number
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
    const visual = Math.min(magnitude * state.vectorScale, maxVisual)
    if (visual < 0.8) {
      node.visible = false
      return
    }
    node.visible = true
    const [x, y, z] = enuToThree(reading.origin)
    node.position.set(x, y, z)
    const [dx, dy, dz] = enuToThree(reading.vector)
    direction.set(dx, dy, dz).normalize()
    node.quaternion.setFromUnitVectors(up, direction)
    const headLength = Math.max(0.4, visual * 0.22)
    const shaftLength = Math.max(visual - headLength, 0.4)
    const thickness = Math.min(2.2, Math.max(0.35, visual * 0.035))
    shaft.current.scale.set(thickness, shaftLength, thickness)
    shaft.current.position.y = shaftLength / 2
    head.current.scale.set(thickness * 2.3, headLength, thickness * 2.3)
    head.current.position.y = shaftLength + headLength / 2
    const phase = (clock.elapsedTime % 1.6) / 1.6
    traveler.current.position.y = phase * visual
    traveler.current.scale.setScalar(Math.max(0.45, thickness * 1.4))
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
    const physical = Math.max(state.scenario.object.diameter, 0.05)
    const exaggeration = state.displayScale === 'true' ? 1 : Math.max(1, 8 / physical)
    objectRef.current?.scale.setScalar(exaggeration)
    estimateRef.current?.scale.setScalar(exaggeration)
    measuredRef.current?.scale.setScalar(exaggeration)
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
    linkLine.visible = state.visibleVectors.link
    if (rangeRef.current) rangeRef.current.visible = state.visibleVectors.link
  })

  const diameter = useSimStore((state) => state.scenario.object.diameter)
  const lengthM = useSimStore((state) => state.scenario.object.length)
  const width = useSimStore((state) => state.scenario.object.width)
  const height = useSimStore((state) => state.scenario.object.height)
  const shape = useSimStore((state) => state.scenario.object.shape)
  return (
    <>
      <group ref={objectRef}>
        <mesh castShadow scale={shape === 'ellipsoid' ? [width, height, lengthM] : [1, 1, 1]}>
          {shape === 'box' ? (
            <boxGeometry args={[width, height, lengthM]} />
          ) : shape === 'cylinder' ? (
            <cylinderGeometry args={[Math.max(diameter, 0.02) / 2, Math.max(diameter, 0.02) / 2, lengthM, 20]} />
          ) : shape === 'ellipsoid' ? (
            <sphereGeometry args={[0.5, 24, 16]} />
          ) : (
            <sphereGeometry args={[Math.max(diameter, 0.02) / 2, 28, 20]} />
          )}
          <meshStandardMaterial color={colors.object} roughness={0.45} metalness={0.05} />
        </mesh>
      </group>
      <group ref={parentRef}>
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
        <octahedronGeometry args={[Math.max(diameter, 0.05) * 0.7, 0]} />
        <meshBasicMaterial color={colors.estimated} wireframe />
      </mesh>
      <mesh ref={measuredRef}>
        <sphereGeometry args={[Math.max(diameter, 0.05) * 0.35, 12, 12]} />
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

function AimCircle() {
  const target = useSimStore((state) => state.scenario.control.target)
  const radius = useSimStore((state) => state.scenario.control.targetRadius)
  const patch = useSimStore((state) => state.patch)
  const setDraggingAim = useSimStore((state) => state.setDraggingAim)
  const { gl } = useThree()
  const dragging = useRef(false)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const place = (event: { ray: THREE.Ray; stopPropagation: () => void }) => {
    if (!dragging.current) return
    event.stopPropagation()
    if (!event.ray.intersectPlane(plane, hit)) return
    const enu = threeToEnu(hit.x, hit.y, hit.z)
    patch((draft) => {
      draft.control.target.x = enu.x
      draft.control.target.y = enu.y
      draft.control.target.z = 0
    })
  }
  const grab = (event: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    event.stopPropagation()
    dragging.current = true
    setDraggingAim(true)
    gl.domElement.style.cursor = 'grabbing'
    gl.domElement.setPointerCapture(event.nativeEvent.pointerId)
  }
  const release = (event: { nativeEvent: PointerEvent }) => {
    dragging.current = false
    setDraggingAim(false)
    gl.domElement.style.cursor = ''
    if (gl.domElement.hasPointerCapture(event.nativeEvent.pointerId)) {
      gl.domElement.releasePointerCapture(event.nativeEvent.pointerId)
    }
  }
  return (
    <group position={enuToThree({ x: target.x, y: target.y, z: 0.7 })}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={grab} onPointerMove={place} onPointerUp={release}>
        <circleGeometry args={[Math.max(radius, 2), 48]} />
        <meshBasicMaterial color={colors.target} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(radius - Math.min(2, radius * 0.08), 0.4), Math.max(radius, 0.8), 64]} />
        <meshBasicMaterial color={colors.target} transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.5, 0]} onPointerDown={grab} onPointerMove={place} onPointerUp={release}>
        <sphereGeometry args={[Math.max(1.4, Math.min(radius * 0.08, 4)), 16, 16]} />
        <meshBasicMaterial color="#f7f4ea" />
      </mesh>
    </group>
  )
}

function CameraRig() {
  const mode = useSimStore((state) => state.cameraMode)
  const { camera } = useThree()
  useFrame(() => {
    const current = useSimStore.getState().cameraMode
    if (current === 'orbit' || current === 'free') return
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
  useEffect(() => {
    if (mode === 'top') camera.up.set(0, 0, 1)
    else camera.up.set(0, 1, 0)
  }, [mode, camera])
  const draggingAim = useSimStore((state) => state.draggingAim)
  return <OrbitControls makeDefault enabled={(mode === 'orbit' || mode === 'free') && !draggingAim} maxPolarAngle={Math.PI * 0.49} />
}

function FrameTrajectory() {
  const samples = useSimStore((state) => state.result.samples)
  const { camera, controls } = useThree()
  const key = samples.length ? `${samples.length}:${samples[samples.length - 1].t.toFixed(2)}` : '0'
  useEffect(() => {
    const frames = useSimStore.getState().result.samples
    if (frames.length < 2) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const sample of frames) {
      const [x, y, z] = enuToThree(sample.truePosition)
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 80)
    const persp = camera as THREE.PerspectiveCamera
    persp.up.set(0, 1, 0)
    persp.near = Math.max(0.2, span / 500)
    persp.far = Math.max(1200, span * 14)
    persp.updateProjectionMatrix()
    persp.position.set(cx + span * 0.85, cy + span * 0.45, cz + span * 0.95)
    persp.lookAt(cx, cy, cz)
    const orbit = controls as { target?: { set: (x: number, y: number, z: number) => void } } | null
    orbit?.target?.set(cx, cy, cz)
  }, [key, camera, controls])
  return null
}

function paths(samples: Sample[], pick: (sample: Sample) => Vec3): [number, number, number][] {
  return samples.map((sample) => enuToThree(pick(sample)))
}

export function SceneContents() {
  const samples = useSimStore((state) => state.result.samples)
  const prediction = useSimStore((state) => state.result.prediction)
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

  const span = useMemo(() => {
    if (samples.length === 0) return 200
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (const sample of samples) {
      const [x, y, z] = enuToThree(sample.truePosition)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
    }
    return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 80)
  }, [samples])
  const ground = Math.max(240, span * 1.8)
  const cell = ground > 800 ? 50 : 25
  const maxArrow = Math.max(18, span * 0.22)
  const visible = useSimStore((state) => state.visibleVectors)
  return (
    <>
      <color attach="background" args={['#101614']} />
      <fog attach="fog" args={['#101614', ground * 0.55, ground * 1.4]} />
      <hemisphereLight args={['#d5efe4', '#243028', 0.85]} />
      <directionalLight position={[200, 400, 120]} intensity={1.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[ground, ground]} />
        <meshStandardMaterial color="#15201b" />
      </mesh>
      <Grid
        args={[ground, ground]}
        position={[0, 0.05, 0]}
        cellSize={cell}
        cellThickness={0.6}
        sectionSize={cell * 5}
        sectionThickness={1.1}
        cellColor="#3c5648"
        sectionColor="#6d8f78"
        fadeDistance={ground * 0.75}
        infiniteGrid={false}
      />
      <mesh position={[20, 0.08, 0]}>
        <boxGeometry args={[40, 0.15, 0.4]} />
        <meshBasicMaterial color="#d7e2dc" />
      </mesh>
      <mesh position={[0, 0.08, 20]}>
        <boxGeometry args={[0.4, 0.15, 40]} />
        <meshBasicMaterial color="#d7e2dc" />
      </mesh>
      <Line points={truePoints} color={colors.truePath} lineWidth={2} />
      <Line points={estimatedPoints} color={colors.estimated} lineWidth={1.2} dashed dashSize={8} gapSize={5} />
      <Line points={predictedPoints} color={colors.predicted} lineWidth={1.2} dashed dashSize={4} gapSize={6} />
      <AimCircle />
      {landing && (
        <mesh position={enuToThree({ ...landing.position, z: 0.4 })}>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshBasicMaterial color={colors.gravity} />
        </mesh>
      )}
      {visible.wind &&
        field.map((mark) => <StaticArrow key={mark.key} origin={mark.origin} vector={mark.vector} />)}
      <Movers />
      {visible.wind && <Arrow maxVisual={maxArrow} color={colors.wind} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.wind, VELOCITY_SCALE) })} />}
      {visible.velocity && <Arrow maxVisual={maxArrow} color={colors.velocity} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.trueVelocity, VELOCITY_SCALE) })} />}
      {visible.ground && <Arrow maxVisual={maxArrow} color={colors.ground} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.groundVelocity, VELOCITY_SCALE) })} />}
      {visible.air && <Arrow maxVisual={maxArrow} color={colors.air} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.airRelative, VELOCITY_SCALE) })} />}
      {visible.gravity && <Arrow maxVisual={maxArrow} color={colors.gravity} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.gravity, FORCE_SCALE) })} />}
      {visible.drag && <Arrow maxVisual={maxArrow} color={colors.drag} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.drag, FORCE_SCALE) })} />}
      {visible.lift && <Arrow maxVisual={maxArrow} color={colors.lift} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.lift, FORCE_SCALE) })} />}
      {visible.correction && <Arrow maxVisual={maxArrow} color={colors.correction} read={(sample) => ({ origin: sample.truePosition, vector: scaleVec(sample.correction, FORCE_SCALE) })} />}
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
