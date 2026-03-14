export const TILE_SIZE = 32;
export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 64;

// Camera
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;
export const PAN_SPEED = 1;

// Simulation
export const TICK_DURATION_NORMAL  = 200; // ms per tick at 1× speed
export const TICK_DURATION_FAST    = 100; // ms per tick at 2× speed
export const TICK_DURATION_DEVMODE = 10;  // ms per tick at Dev speed (~20×)

// Economy
export const STARTING_MONEY     = 150_000;
export const DEV_START_MONEY    = 99_999_999;
export const CITY_UNLOCK_COST   = 100_000;
export const ROAD_COST = 250;
export const STATION_COST = 5_000;
export const DEPOT_COST = 12_000;           // road truck depot (2×1)
export const TRAIN_YARD_COST = 30_000;      // rail train yard (2×2)
export const TRUCK_COST       = 15_000;     // basic truck
export const CARGO_TRUCK_COST = 28_000;
export const HEAVY_HAULER_COST = 55_000;
export const BUS_COST         = 18_000;
export const LOCOMOTIVE_COST   = 50_000;    // freight train
export const EXPRESS_TRAIN_COST = 85_000;
export const PLANE_COST        = 36_000;    // light aircraft
export const CARGO_PLANE_COST  = 75_000;
export const JUMBO_JET_COST    = 140_000;
export const SHIP_COST         = 30_000;    // river barge
export const CARGO_SHIP_COST   = 60_000;
export const SUPERTANKER_COST  = 120_000;
export const AIRPORT_SMALL_COST = 48_000;   // 2×2
export const AIRPORT_LARGE_COST = 130_000;  // 3×3
export const SEAPORT_SMALL_COST = 34_000;   // 2×2
export const SEAPORT_LARGE_COST = 95_000;   // 3×3
// Keep old names for backward compat in existing code
export const AIRPORT_COST  = AIRPORT_SMALL_COST;
export const SEAPORT_COST  = SEAPORT_SMALL_COST;
export const BRIDGE_COST = 1_800;
export const TUNNEL_COST = 5_000;
export const DEMOLISH_REFUND_RATIO = 0.5;

// Delivery rewards per cargo type
export const DELIVERY_REWARDS: Record<string, number> = {
  coal:       400,
  wood:       350,
  grain:      300,
  steel:      800,
  oil:        700,
  goods:     1000,
  iron:       550,
  chemicals:  950,
  food:       600,
  passengers: 1_200,  // high value inter-city passengers
};

// Difficulty multipliers (applied to DELIVERY_REWARDS and costs)
export const DIFFICULTY_REWARD_MULT: Record<string, number> = {
  easy:   1.5,
  normal: 1.0,
  hard:   0.75,
  brutal: 0.5,
};
export const DIFFICULTY_COST_MULT: Record<string, number> = {
  easy:   0.75,
  normal: 1.0,
  hard:   1.25,
  brutal: 1.6,
};
export const DIFFICULTY_START_MONEY_MULT: Record<string, number> = {
  easy:   1.5,
  normal: 1.0,
  hard:   0.7,
  brutal: 0.5,
};

// Industries
export const INDUSTRY_SIZE = 2; // 2×2 tiles
export const COAL_MINE_PRODUCTION_INTERVAL = 8;
export const COAL_MINE_CAPACITY = 100;
export const POWER_PLANT_CAPACITY = 100;
export const FOREST_PRODUCTION_INTERVAL = 6;
export const FOREST_CAPACITY = 80;
export const SAWMILL_CAPACITY = 80;
export const FARM_PRODUCTION_INTERVAL = 12;
export const FARM_CAPACITY = 80;
export const BAKERY_CAPACITY = 80;
export const OIL_WELL_PRODUCTION_INTERVAL = 10;
export const OIL_WELL_CAPACITY = 80;
export const REFINERY_CAPACITY = 80;
export const STEEL_MILL_CAPACITY = 100;
export const FACTORY_CAPACITY = 60;
export const NEIGHBORHOOD_CAPACITY = 200;
/** @deprecated use NEIGHBORHOOD_CAPACITY */
export const CITY_CAPACITY = NEIGHBORHOOD_CAPACITY;
export const IRON_MINE_PRODUCTION_INTERVAL = 9;
export const IRON_MINE_CAPACITY = 80;
export const SMELTER_CAPACITY = 90;
export const CHEM_PLANT_CAPACITY = 70;
export const MARKET_CAPACITY = 200;
export const CHEM_DIST_CAPACITY = 150;
export const PASSENGER_TERMINAL_CAPACITY = 180;
export const PASSENGER_PRODUCTION_INTERVAL = 10; // ticks between each +10 passengers generated
// Vehicles — base stats (before tech multipliers)
export const TRUCK_SPEED            = 0.20;
export const TRUCK_CAPACITY         = 20;
export const CARGO_TRUCK_SPEED      = 0.17;
export const CARGO_TRUCK_CAPACITY   = 35;
export const HEAVY_HAULER_SPEED     = 0.13;
export const HEAVY_HAULER_CAPACITY  = 55;
export const BUS_SPEED              = 0.24;
export const BUS_CAPACITY           = 28;

export const LOCOMOTIVE_SPEED       = 0.38;
export const LOCOMOTIVE_CAPACITY    = 60;
export const EXPRESS_TRAIN_SPEED    = 0.55;
export const EXPRESS_TRAIN_CAPACITY = 40;

export const PLANE_SPEED            = 0.55;
export const PLANE_CAPACITY         = 30;
export const CARGO_PLANE_SPEED      = 0.45;
export const CARGO_PLANE_CAPACITY   = 60;
export const JUMBO_SPEED            = 0.35;
export const JUMBO_CAPACITY         = 120;

export const SHIP_SPEED             = 0.07;
export const SHIP_CAPACITY          = 80;
export const CARGO_SHIP_SPEED       = 0.055;
export const CARGO_SHIP_CAPACITY    = 150;
export const SUPERTANKER_SPEED      = 0.035;
export const SUPERTANKER_CAPACITY   = 300;

// Depot vehicle limits
export const DEPOT_MAX_VEHICLES      = 8;   // road truck depot
export const TRAIN_YARD_MAX_VEHICLES = 6;   // train yard
export const AIRPORT_SMALL_MAX_PLANES = 3;
export const AIRPORT_LARGE_MAX_PLANES = 8;
export const SEAPORT_SMALL_MAX_SHIPS  = 3;
export const SEAPORT_LARGE_MAX_SHIPS  = 8;

// Rail
export const RAIL_COST = 600;

// Stations
export const STATION_CARGO_CAPACITY = 200;
export const STATION_LINK_RANGE = 6;

// Map generation
export const WATER_THRESHOLD = 0.38;
export const MOUNTAIN_THRESHOLD = 0.83;
export const NOISE_SCALE = 8;
export const MIN_INDUSTRY_DISTANCE = 8;
export const NUM_COAL_MINES = 2;
export const NUM_POWER_PLANTS = 1;
export const NUM_FORESTS = 2;
export const NUM_SAWMILLS = 1;
export const NUM_FARMS = 2;
export const NUM_BAKERIES = 1;
export const NUM_OIL_WELLS = 1;
export const NUM_REFINERIES = 1;
export const NUM_STEEL_MILLS = 1;
export const NUM_FACTORIES = 1;
export const NUM_CHEM_DISTS = 1;
export const NUM_CITIES        = 4;
export const NUM_LOCKED_CITIES = 2;
export const NUM_IRON_MINES = 2;
export const NUM_SMELTERS = 1;
export const NUM_CHEM_PLANTS = 1;
export const NUM_MARKETS = 2;

export const NEIGHBORHOODS_PER_CITY = 4;
export const CITY_CLUSTER_RADIUS    = 20;
export const MIN_CITY_SPACING       = 75;

/** Map dimensions keyed by size preset */
export const MAP_SIZES = {
  small:  { width: 128, height: 128, startMoney: 220_000 },
  normal: { width: 200, height: 200, startMoney: 380_000 },
  large:  { width: 280, height: 280, startMoney: 550_000 },
  huge:   { width: 360, height: 360, startMoney: 800_000 },
} as const;

// ─── Maintenance costs (billed every MAINTENANCE_INTERVAL ticks) ─────────────

/** How often maintenance is charged (ticks) */
export const MAINTENANCE_INTERVAL = 200;

/** Cost per road tile per billing cycle */
export const ROAD_MAINTENANCE_PER_TILE = 4;
/** Cost per rail tile per billing cycle */
export const RAIL_MAINTENANCE_PER_TILE = 12;
/** Cost per truck (basic/cargo/heavy) per billing cycle */
export const TRUCK_MAINTENANCE = 220;
/** Extra cost multiplier for larger trucks: cargo = 1.5×, heavy = 2.2× */
export const CARGO_TRUCK_MAINTENANCE_MULT = 1.5;
export const HEAVY_HAULER_MAINTENANCE_MULT = 2.2;
export const BUS_MAINTENANCE = 240;
/** Cost per locomotive per billing cycle */
export const LOCO_MAINTENANCE = 900;
export const EXPRESS_TRAIN_MAINTENANCE_MULT = 1.5;
/** Cost per plane per billing cycle */
export const PLANE_MAINTENANCE = 1_400;
export const CARGO_PLANE_MAINTENANCE_MULT = 1.6;
export const JUMBO_JET_MAINTENANCE_MULT = 2.5;
/** Cost per ship per billing cycle */
export const SHIP_MAINTENANCE = 700;
export const CARGO_SHIP_MAINTENANCE_MULT = 1.8;
export const SUPERTANKER_MAINTENANCE_MULT = 3.0;
/** Cost per station/airport/seaport per billing cycle */
export const STATION_MAINTENANCE = 80;
export const DEPOT_MAINTENANCE = 120;
export const TRAIN_YARD_MAINTENANCE = 350;
export const AIRPORT_SMALL_MAINTENANCE = 500;
export const AIRPORT_LARGE_MAINTENANCE = 1_200;
export const SEAPORT_SMALL_MAINTENANCE = 400;
export const SEAPORT_LARGE_MAINTENANCE = 900;

/** Difficulty maintenance multiplier — harder = more expenses */
export const DIFFICULTY_MAINTENANCE_MULT: Record<string, number> = {
  easy:   0.4,
  normal: 1.0,
  hard:   1.5,
  brutal: 2.2,
};

// Colors (rendering)
export const COLORS = {
  grass: '#5a8f3c',
  grassDark: '#4d7a32',
  water: '#2b6ca3',
  waterDeep: '#1e5588',
  sand: '#c2b280',
  road: '#888888',
  roadBorder: '#666666',
  mountain: '#7a6a58',
  mountainDark: '#6a5a4a',
  mountainSnow: '#d0cdc8',
  rail: '#9a8878',
  railTie: '#5a4a36',
  coalMine: '#8B4513',
  powerPlant: '#B22222',
  forest: '#2d6e2d',
  sawmill: '#c47a2e',
  farm: '#d4b83a',
  bakery: '#e8a742',
  oilWell: '#3a3a3a',
  refinery: '#555577',
  steelMill: '#7a7aaa',
  factory: '#8855aa',
  neighborhood: '#4488cc',
  // New industry colors
  ironMine: '#6b2d0f',
  smelter: '#c26a00',
  chemPlant: '#3a9a5c',
  market: '#9944cc',
  chemDist: '#1a7a6b',
  airport:  '#1a3a6b',
  seaport:  '#0a5a5a',
  station: '#4169E1',
  depot: '#DAA520',
  truck: '#FFD700',
  hover: 'rgba(255, 255, 255, 0.3)',
  selection: 'rgba(0, 120, 255, 0.4)',
  grid: 'rgba(0, 0, 0, 0.08)',
  text: '#ffffff',
} as const;
