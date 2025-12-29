// Target subreddits for robotaxi content
export const TARGET_SUBREDDITS = [
  // Company-specific
  'Waymo',
  'TeslaMotors',
  'TeslaLounge',
  'TeslaFSD',

  // Service cities
  'Austin',
  'Atlanta',
  'LosAngeles',
  'Phoenix',

  // Bay Area cities (general subreddits)
  'bayarea',
  'sanfrancisco',
  'Oakland',
  'SanJose',
  'berkeley',
  'DalyCity',
  'SanMateo',
  'RedwoodCity',
  'Fremont',
  'Sunnyvale',
  'MountainView',
  'PaloAlto',
  'MenloPark',
  'LosAltos',
] as const

// Robotaxi-specific subreddits (skip keyword filtering for these)
export const ROBOTAXI_SUBREDDITS = new Set([
  'Waymo',
  'TeslaFSD',
])

// Keywords that strongly indicate robotaxi content
export const ROBOTAXI_KEYWORDS = [
  'waymo',
  'waymo one',
  'tesla',
  'tesla robotaxi',
  'tesla robo taxi',
  'cybercab',
  'fsd',
  'full self driving',
  'full self-driving',
  'autopilot',
  'tesla autonomy',
] as const
