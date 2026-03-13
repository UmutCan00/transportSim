// ── Primitives ──────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ── Tiles ───────────────────────────────────────────────

export enum TileType {
  Grass    = 0,
  Road     = 1,
  Water    = 2,
  Sand     = 3,
  Mountain = 4,  // impassable terrain — no building, no roads, no pathfinding
  Rail     = 5,  // railway track — passable, unlocked by Railway tech
}

export interface TileMap {
  width: number;
  height: number;
  /** Flat array, index = y * width + x */
  tiles: TileType[];
}

// ── Cargo ───────────────────────────────────────────────

export enum CargoType {
  Coal      = 'coal',
  Wood      = 'wood',
  Grain     = 'grain',
  Steel     = 'steel',
  Oil       = 'oil',
  Goods     = 'goods',
  Iron      = 'iron',
  Chemicals = 'chemicals',
  Food      = 'food',
}

export interface CargoStock {
  type: CargoType;
  amount: number;
  capacity: number;
}

// ── Industries ──────────────────────────────────────────

export enum IndustryType {
  CoalMine      = 'coal_mine',
  PowerPlant    = 'power_plant',
  Forest        = 'forest',
  Sawmill       = 'sawmill',
  Farm          = 'farm',
  Bakery        = 'bakery',
  OilWell       = 'oil_well',
  Refinery      = 'refinery',
  SteelMill     = 'steel_mill',
  Factory       = 'factory',
  Neighborhood  = 'neighborhood',
  // ── New industries ────────────────────────────────────
  IronMine        = 'iron_mine',      // produces Iron
  Smelter         = 'smelter',        // Iron → Steel (alt chain)
  ChemicalPlant   = 'chem_plant',     // Oil → Chemicals
  ChemDistributor = 'chem_dist',      // consumes Chemicals (final)
  Market          = 'market',         // consumes Food (Bakery output)
}

export interface Industry {
  id: number;
  /** Procedurally generated unique name, e.g. "Blackrock Mine" */
  name: string;
  type: IndustryType;
  position: Vec2;
  size: Vec2;
  produces: CargoType | null;
  consumes: CargoType | null;
  /** Secondary input needed (e.g. Steel Mill needs Coal + Iron — placeholder for future) */
  consumesSecondary: CargoType | null;
  stock: CargoStock;
  /** How much demand the city/industry still needs this tick */
  demandPerDelivery: number;
  /** Total units consumed (for scoring) */
  totalConsumed: number;
  productionInterval: number;
  ticksSinceLastProduction: number;
  /** If true, neighborhood doesn't consume goods — player must pay unlockCost to activate */
  locked?: boolean;
  /** Cost to unlock this locked neighborhood */
  unlockCost?: number;
  /** Which city cluster this industry belongs to (undefined = wilderness) */
  cityId?: number;
}

// ── Buildings ───────────────────────────────────────────

export enum BuildingType {
  Depot    = 'depot',
  Station  = 'station',
  Airport  = 'airport',  // air hub — planes fly directly between airports
  Seaport  = 'seaport',  // sea hub — ships navigate water tiles
}

export interface Station {
  id: number;
  type: BuildingType.Station;
  position: Vec2;
  cargo: CargoStock;
  linkedIndustryId: number | null;
}

export interface Depot {
  id: number;
  type: BuildingType.Depot;
  position: Vec2;
}

export interface Airport {
  id: number;
  type: BuildingType.Airport;
  position: Vec2;
  cargo: CargoStock;
  linkedIndustryId: number | null;
  name: string;
}

export interface Seaport {
  id: number;
  type: BuildingType.Seaport;
  position: Vec2;
  cargo: CargoStock;
  linkedIndustryId: number | null;
  name: string;
}

export type Building = Station | Depot | Airport | Seaport;

// ── Vehicle Types ───────────────────────────────────────

export enum VehicleType {
  Truck      = 'truck',
  Locomotive = 'locomotive',  // fast, high-capacity, unlocked by Railway tech
  Plane      = 'plane',       // flies directly between airports, ignores road network
  Ship       = 'ship',        // sails via water tiles — slow but very high capacity
}

// ── Vehicles ────────────────────────────────────────────

export enum VehicleState {
  Idle = 'idle',
  Moving = 'moving',
  Loading = 'loading',
  Unloading = 'unloading',
}

export interface Vehicle {
  id: number;
  vehicleType: VehicleType;
  position: Vec2;
  path: Vec2[];
  pathIndex: number;
  moveProgress: number;
  speed: number;
  cargoCapacity: number;
  cargo: CargoType | null;
  cargoAmount: number;
  routeId: number | null;
  currentOrderIndex: number;
  state: VehicleState;
}

// ── Routes ──────────────────────────────────────────────

export interface RouteOrder {
  stationId: number;
  action: 'load' | 'unload';
}

export interface Route {
  id: number;
  /** Human-readable route name, e.g. "Blackrock Mine → Portville City" */
  name: string;
  orders: RouteOrder[];
}

// ── Economy ─────────────────────────────────────────────

export interface Economy {
  money: number;
  totalEarned: number;
  deliveriesCompleted: number;
  /** Per-cargo delivered counts */
  cargoDelivered: Partial<Record<CargoType, number>>;
}

// ── Time ────────────────────────────────────────────────

export enum SimSpeed {
  Paused = 0,
  Normal = 1,
  Fast   = 2,
  Dev    = 3,   // ~20× speed, active when ?dev=1 URL param is set
}

export interface SimTime {
  tick: number;
  speed: SimSpeed;
}

// ── Tech Tree ───────────────────────────────────────────

export enum TechId {
  FasterTrucks      = 'faster_trucks',
  LargerStations    = 'larger_stations',
  CheaperRoads      = 'cheaper_roads',
  DoubleCapacity    = 'double_capacity',
  ExpressTrucks     = 'express_trucks',
  BulkTerminals     = 'bulk_terminals',
  AutoLoader        = 'auto_loader',
  EfficientRoutes   = 'efficient_routes',
  MassTransit       = 'mass_transit',
  Railway           = 'railway',
  Bridging          = 'bridging',   // unlocks BuildBridge tool
  Tunneling         = 'tunneling',  // unlocks BuildTunnel tool
  Aviation          = 'aviation',   // unlocks airports + planes
  Maritime          = 'maritime',   // unlocks seaports + ships
}

export interface TechNode {
  id: TechId;
  name: string;
  description: string;
  cost: number;
  tier: 1 | 2 | 3;
  requires: TechId[];
  unlocked: boolean;
  /** icon emoji */
  icon: string;
}

// ── Objectives ──────────────────────────────────────────

export interface Objective {
  id: string;
  title: string;
  description: string;
  reward: number;
  completed: boolean;
  /** Check function serialised as type + value */
  type: 'deliver_cargo' | 'earn_money' | 'build_roads' | 'lay_rail' | 'buy_vehicles' | 'unlock_tech';
  target: number;
  cargo?: CargoType;
}

// ── Tool State ──────────────────────────────────────────

export enum ToolType {
  Select       = 'select',
  BuildRoad    = 'build_road',
  PlaceStation = 'place_station',
  PlaceDepot   = 'place_depot',
  Demolish     = 'demolish',
  LayRail      = 'lay_rail',
  BuildBridge  = 'build_bridge',  // cross water — requires Bridging tech
  BuildTunnel  = 'build_tunnel',  // cross mountain — requires Tunneling tech
  PlaceAirport = 'place_airport', // place an airport — requires Aviation tech
  PlaceSeaport = 'place_seaport', // place a seaport — requires Maritime tech
}

// ── UI Panel ────────────────────────────────────────────

export type ActivePanel = 'none' | 'tech' | 'objectives' | 'depot' | 'routes' | 'newgame' | 'help' | 'save';

export type MapSize = 'small' | 'normal' | 'large' | 'huge';

// ── UI State (not part of simulation) ───────────────────

export interface UIState {
  activeTool: ToolType;
  hoveredTile: Vec2 | null;
  selectedTile: Vec2 | null;
  selectedEntityId: number | null;
  selectedEntityType: 'industry' | 'building' | 'vehicle' | null;
  activePanel: ActivePanel;
  /** Toast notifications queue */
  toasts: { id: number; msg: string; ttl: number }[];
}

// ── GameState ───────────────────────────────────────────

export interface GameState {
  seed: number;
  mapSize: MapSize;
  map: TileMap;
  industries: Industry[];
  buildings: Building[];
  vehicles: Vehicle[];
  routes: Route[];
  economy: Economy;
  time: SimTime;
  nextId: number;
  tech: TechNode[];
  objectives: Objective[];
  /** Total road tiles ever built (for objectives) */
  roadsBuilt: number;
  /** Total rail tiles ever laid (for objectives) */
  railsBuilt: number;
  /** True when started with ?dev=1 URL param */
  devMode: boolean;
}
