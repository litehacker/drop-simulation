declare module 'mavlink-browser' {
  export const mavlink20: {
    MAV_TYPE_GENERIC: number
    MAV_AUTOPILOT_INVALID: number
    MAV_STATE_ACTIVE: number
    messages: Record<string, new (...args: unknown[]) => { pack: (processor: unknown) => { length: number; [index: number]: number } }>
  }
  export class MAVLink20Processor {
    constructor(logger: null, systemId: number, componentId: number)
    parseBuffer(buffer: Uint8Array): void
    on(event: string, callback: (message: { lat?: number; lon?: number }) => void): void
  }
}
