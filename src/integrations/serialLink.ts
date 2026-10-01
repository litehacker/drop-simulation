interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  writable: { getWriter: () => { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void } } | null
}

interface SerialLike {
  requestPort: () => Promise<SerialPortLike>
}

export function webSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/** Write a text log to a user-selected serial port. Chrome and Edge only. */
export async function writeTextToSerial(text: string, baudRate = 57600): Promise<void> {
  const serial = (navigator as Navigator & { serial?: SerialLike }).serial
  if (!serial) throw new Error('Web Serial is not available in this browser. Download the file instead.')
  const port = await serial.requestPort()
  await port.open({ baudRate })
  const writer = port.writable?.getWriter()
  if (!writer) {
    await port.close()
    throw new Error('The serial port cannot be written.')
  }
  await writer.write(new TextEncoder().encode(text))
  writer.releaseLock()
  await port.close()
}
