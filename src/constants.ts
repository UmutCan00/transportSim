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
export const CITY_UNLOCK_COST   = 100_000; // cost to activate a locked city
export const ROAD_COST = 250;
export const STATION_COST = 5_000;
export const DEPOT_COST = 10_000;
export const TRUCK_COST       = 15_000;
export const LOCOMOTIVE_COST  = 50_000;
export const PLANE_COST       = 40_000;  // requires Aviation tech
export const SHIP_COST        = 30_000;  // requires Maritime tech
export const AIRPORT_COST     = 75_000;  // build an airport tile
export const SEAPORT_COST     = 50_000;  // build a seaport tile
export const BRIDGE_COST = 1_800;    // per water tile — requires Bridging tech
export const TUNNEL_COST = 5_000;    // per mountain tile — requires Tunneling tech
export const DEMOLISH_REFUND_RATIO = 0.5;

// Delivery rewards per cargo type
export const DELIVERY_REWARDS: Record<string, number> = {
  coal:      400,
  wood:      350,
  grain:     300,
  steel:     800,
  oil:       700,
  goods:    1000,
  iron:      550,
  chemicals: 950,
  food:      600,
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
// New industry capacities
export const IRON_MINE_PRODUCTION_INTERVAL = 9;
export const IRON_MINE_CAPACITY = 80;
export const SMELTER_CAPACITY = 90;
export const CHEM_PLANT_CAPACITY = 70;
export const MARKET_CAPACITY = 200;
export const CHEM_DIST_CAPACITY = 150;

// Vehicles
export const TRUCK_SPEED          = 0.2;   // tiles per tick (base)
export const TRUCK_CAPACITY       = 20;
export const LOCOMOTIVE_SPEED     = 0.38;  // faster than trucks
export const LOCOMOTIVE_CAPACITY  = 60;    // 3× truck cargo
export const PLANE_SPEED          = 0.55;  // tiles per tick — fast, flies direct
export const PLANE_CAPACITY       = 30;
export const SHIP_SPEED           = 0.07;  // tiles per tick — slow but high capacity
export const SHIP_CAPACITY        = 80;

// Rail
export const RAIL_COST = 600;  // per tile (premium over road)

// Stations
export const STATION_CARGO_CAPACITY = 200;
export const STATION_LINK_RANGE = 6; // max tile distance to auto-link industry

// Map generation
export const WATER_THRESHOLD = 0.38;
export const MOUNTAIN_THRESHOLD = 0.83; // very high noise → impassable mountain
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
export const NUM_CITIES        = 4;   // number of active city clusters
export const NUM_LOCKED_CITIES = 2;   // extra city clusters player can unlock
// New industry counts
export const NUM_IRON_MINES = 2;
export const NUM_SMELTERS = 1;
export const NUM_CHEM_PLANTS = 1;
export const NUM_MARKETS = 2;

// City-cluster map generation
export const NEIGHBORHOODS_PER_CITY = 4; // consumption buildings per city cluster
export const CITY_CLUSTER_RADIUS    = 20; // tile radius for each city's industries
export const MIN_CITY_SPACING       = 75; // min distance between city centers

/** Map dimensions keyed by size preset */
export const MAP_SIZES = {
  small:  { width: 128, height: 128, startMoney: 220_000 },
  normal: { width: 200, height: 200, startMoney: 380_000 },
  large:  { width: 280, height: 280, startMoney: 550_000 },
  huge:   { width: 360, height: 360, startMoney: 800_000 },
} as const;

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
