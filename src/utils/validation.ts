export type VehicleProvider = 'tesla' | 'waymo'

// Plate format patterns (matching main app)
const PLATE_PATTERNS: Record<VehicleProvider, RegExp> = {
  tesla: /^[A-Z0-9]{7}$/,
  waymo: /^[A-Z0-9]{5,8}$/,
}

export function isValidPlate(provider: VehicleProvider, plate: string): boolean {
  const pattern = PLATE_PATTERNS[provider]
  return pattern.test(plate)
}

export function cleanPlateNumber(plate: string): string {
  // Remove spaces, convert to uppercase, keep only alphanumeric
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

export function validateAndCleanPlate(provider: VehicleProvider, plate: string): string | null {
  const cleaned = cleanPlateNumber(plate)
  if (isValidPlate(provider, cleaned)) {
    return cleaned
  }
  return null
}
