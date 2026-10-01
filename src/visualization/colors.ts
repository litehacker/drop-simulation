export const colors = {
  wind: '#49c2d4',
  velocity: '#9ad7a4',
  ground: '#d6e38a',
  air: '#f0a35e',
  gravity: '#ef6f6c',
  drag: '#c4b5fd',
  lift: '#7ee0d0',
  correction: '#f2c14e',
  link: '#f3d48a',
  truePath: '#9ad7a4',
  predicted: '#8eb4d6',
  estimated: '#e2a33a',
  measured: '#f0a35e',
  target: '#e2a33a',
  parent: '#d5e4dc',
  object: '#e2a33a',
}

export interface LegendEntry {
  id: keyof typeof colors
  name: string
  unit: string
  tip: string
}

export const vectorLegend: LegendEntry[] = [
  {
    id: 'wind',
    name: 'Wind',
    unit: 'm/s',
    tip: 'Air motion over the ground. The object does not feel wind directly; wind changes the air flowing past it.',
  },
  {
    id: 'velocity',
    name: 'Object velocity',
    unit: 'm/s',
    tip: 'How fast the object is moving relative to the ground, including climb or descent.',
  },
  {
    id: 'ground',
    name: 'Ground velocity',
    unit: 'm/s',
    tip: 'The horizontal part of object velocity. This is the ground track, without vertical speed.',
  },
  {
    id: 'air',
    name: 'Relative air velocity',
    unit: 'm/s',
    tip: 'Object velocity minus wind. Drag and lift use this vector, not ground speed.',
  },
  {
    id: 'gravity',
    name: 'Gravity',
    unit: 'N',
    tip: 'Weight, straight down. The arrow is scaled for visibility and the number is the force.',
  },
  {
    id: 'drag',
    name: 'Drag',
    unit: 'N',
    tip: 'Air resistance. It points opposite the relative air velocity. Magnitude is ½ ρ Cd A v².',
  },
  {
    id: 'lift',
    name: 'Lift',
    unit: 'N',
    tip: 'Aerodynamic force perpendicular to the relative air velocity. A ballistic sphere produces none.',
  },
  {
    id: 'correction',
    name: 'Correction',
    unit: 'N',
    tip: 'Commanded actuator force. It is applied only when an actuator is selected. It is not a property of a plain sphere.',
  },
  {
    id: 'link',
    name: 'Telemetry link',
    unit: '',
    tip: 'Line from the parent aircraft to the object. Its color follows the modeled packet loss, which is not a measured signal.',
  },
]
