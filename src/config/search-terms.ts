// Target subreddits for robotaxi content
export const TARGET_SUBREDDITS = [
  // Robotaxi-specific
  'Waymo',
  'robotaxi',
  'SelfDrivingCars',

  // Tesla communities
  'TeslaMotors',
  'TeslaLounge',
  'electricvehicles',

  // Operating area cities (high priority)
  'sanfrancisco',
  'bayarea',
  'Phoenix',
  'Austin',
  'LosAngeles',

  // Secondary cities
  'SanJose',
  'MountainView',
  'PaloAlto',
  'SantaMonica',
  'Scottsdale',

  // Expansion cities
  'Atlanta',
  'Denver',
  'Seattle',
  'Miami',
  'Dallas',

  // Tech subreddits
  'technology',
  'Futurology',
  'cars',
  'Autos',

  // Competitor awareness
  'Cruise',
  'Zoox',
  'Aurora',
] as const

// Robotaxi-specific subreddits (skip keyword filtering for these)
export const ROBOTAXI_SUBREDDITS = new Set([
  'Waymo',
  'robotaxi',
  'SelfDrivingCars',
  'Cruise',
  'Zoox',
  'Aurora',
])

// Keywords that strongly indicate robotaxi content
export const ROBOTAXI_KEYWORDS = [
  'robotaxi',
  'waymo',
  'cybercab',
  'autonomous taxi',
  'self driving',
  'driverless',
  'fsd',
  'robo taxi',
  'autonomous vehicle',
  'self-driving',
  'waymo one',
  'driverless taxi',
] as const
