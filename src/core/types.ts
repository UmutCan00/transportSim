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

// ── Difficulty / Theme ──────────────────────────────────

export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';
export type Theme = 'classic' | 'dark' | 'neon' | 'anime' | 'retro';

// ── Cargo ───────────────────────────────────────────────

export enum CargoType {
  Coal       = 'coal',
  Wood       = 'wood',
  Grain      = 'grain',
  Steel      = 'steel',
  Oil        = 'oil',
  Goods      = 'goods',
  Iron       = 'iron',
  Chemicals  = 'chemicals',
  Food       = 'food',
  Passengers = 'passengers',
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
  ChemDistributor   = 'chem_dist',        // consumes Chemicals (final)
  Market            = 'market',           // consumes Food (Bakery output)
  PassengerTerminal = 'passenger_terminal', // produces + consumes Passengers (inter-city)
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
  Airport  = 'airport',
  Seaport  = 'seaport',
  TrainYard = 'train_yard',
}

export enum DepotType {
  Road = 'road',  // trucks
  Rail = 'rail',  // locomotives (TrainYard)
}

export interface Station {
  id: number;
  type: BuildingType.Station;
  position: Vec2;
  size: Vec2;
  cargo: CargoStock;
  linkedIndustryId: number | null;
}

export interface Depot {
  id: number;
  type: BuildingType.Depot | BuildingType.TrainYard;
  depotType: DepotType;
  position: Vec2;
  size: Vec2;
  maxVehicles: number;
}

export interface Airport {
  id: number;
  type: BuildingType.Airport;
  tier: 'small' | 'large';
  position: Vec2;
  size: Vec2;
  maxVehicles: number;
  cargo: CargoStock;
  linkedIndustryId: number | null;
  name: string;
}

export interface Seaport {
  id: number;
  type: BuildingType.Seaport;
  tier: 'small' | 'large';
  position: Vec2;
  size: Vec2;
  maxVehicles: number;
  cargo: CargoStock;
  linkedIndustryId: number | null;
  name: string;
}

export type Building = Station | Depot | Airport | Seaport;

// ── Vehicle Types ───────────────────────────────────────

export enum VehicleType {
  Truck      = 'truck',
  Locomotive = 'locomotive',
  Plane      = 'plane',
  Ship       = 'ship',
}

/** Sub-model within a VehicleType — determines speed/capacity/cost */
export enum VehicleModel {
  // Trucks
  BasicTruck    = 'basic_truck',
  CargoTruck    = 'cargo_truck',
  HeavyHauler   = 'heavy_hauler',
  // Locomotives
  FreightTrain  = 'freight_train',
  ExpressTrain  = 'express_train',
  // Planes
  LightAircraft = 'light_aircraft',
  CargoPlane    = 'cargo_plane',
  JumboJet      = 'jumbo_jet',
  // Ships
  RiverBarge    = 'river_barge',
  CargoShip     = 'cargo_ship',
  Supertanker   = 'supertanker',
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
  model: VehicleModel;
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

export interface Transaction {
  tick: number;
  delta: number;  // positive = income, negative = expense
  label: string;
}

export interface Economy {
  money: number;
  totalEarned: number;
  deliveriesCompleted: number;
  /** Per-cargo delivered counts */
  cargoDelivered: Partial<Record<CargoType, number>>;
  /** Cumulative maintenance paid (informational) */
  totalMaintenancePaid: number;
  /** Maintenance cost paid last billing cycle (for HUD display) */
  lastMaintenanceBill: number;
  /** Last 50 financial transactions (capped) for money panel */
  transactions: Transaction[];
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
  HeavyHaulers      = 'heavy_haulers',
  BulkTerminals     = 'bulk_terminals',
  AutoLoader        = 'auto_loader',
  EfficientRoutes   = 'efficient_routes',
  MassTransit       = 'mass_transit',
  Railway           = 'railway',
  Bridging          = 'bridging',
  Tunneling         = 'tunneling',
  Aviation          = 'aviation',
  Maritime          = 'maritime',
  // Road exclusive branch
  HighwayNet        = 'highway_net',
  BulkNetwork       = 'bulk_network',
  // Rail exclusive branch
  FreightYard       = 'freight_yard',
  ExpressLine       = 'express_line',
  // Advanced tiers
  AdvancedAviation  = 'advanced_aviation',
  DeepSea           = 'deep_sea',
  // ── New additions for 40-item tree ──────────────────
  // New roots (row 0)
  FuelEfficiency    = 'fuel_efficiency',
  ContainerSystem   = 'container_system',
  // Finance branch (exclusive)
  FreightInsurance  = 'freight_insurance',
  DirectDelivery    = 'direct_delivery',
  // Maintenance / operations
  MaintenanceDept   = 'maintenance_dept',
  NightFreight      = 'night_freight',
  // Cargo-specialisation (exclusive)
  ColdChain         = 'cold_chain',
  BulkDiscount      = 'bulk_discount',
  // Power source (exclusive)
  Electrification   = 'electrification',
  FossilSurge       = 'fossil_surge',
  // Economy bonuses
  GreenRoutes       = 'green_routes',
  // Passenger vs Cargo priority (exclusive)
  PassengerPlus     = 'passenger_plus',
  CargoNetwork      = 'cargo_network',
  // Endgame rail (exclusive)
  MaglevRail        = 'maglev_rail',
  HyperCargo        = 'hyper_cargo',
  // Endgame aviation (exclusive)
  HeavyLift         = 'heavy_lift',
  RapidCargo        = 'rapid_cargo',
  // Endgame general
  GlobalLogistics   = 'global_logistics',
  SupplyChainAI     = 'supply_chain_ai',
}

export interface TechNode {
  id: TechId;
  name: string;
  description: string;
  cost: number;
  tier: 1 | 2 | 3;
  requires: TechId[];
  unlocked: boolean;
  icon: string;
  /** Techs sharing the same group are mutually exclusive — only one can be unlocked */
  exclusiveGroup?: string;
  /** Visual tree layout column (0-based) */
  treeCol: number;
  /** Visual tree layout row (0-based, top = 0) */
  treeRow: number;
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
  Select         = 'select',
  BuildRoad      = 'build_road',
  PlaceStation   = 'place_station',
  PlaceDepot     = 'place_depot',
  PlaceTrainYard = 'place_train_yard',
  Demolish       = 'demolish',
  LayRail        = 'lay_rail',
  BuildBridge    = 'build_bridge',
  BuildTunnel    = 'build_tunnel',
  PlaceAirport       = 'place_airport',
  PlaceAirportLarge  = 'place_airport_large',
  PlaceSeaport       = 'place_seaport',
  PlaceSeaportLarge  = 'place_seaport_large',
}

// ── UI Panel ────────────────────────────────────────────

export type ActivePanel = 'none' | 'tech' | 'objectives' | 'depot' | 'routes' | 'newgame' | 'help' | 'save' | 'money';

export type MapSize = 'small' | 'normal' | 'large' | 'huge';

// ── UI State (not part of simulation) ───────────────────

export interface UIState {
  activeTool: ToolType;
  hoveredTile: Vec2 | null;
  selectedTile: Vec2 | null;
  selectedEntityId: number | null;
  selectedEntityType: 'industry' | 'building' | 'vehicle' | null;
  activePanel: ActivePanel;
  /** Start tile for line-drag road/rail placement */
  lineDragStart: Vec2 | null;
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
  roadsBuilt: number;
  railsBuilt: number;
  /** Running count of road tiles (kept in sync to avoid O(n) tile scans) */
  roadTileCount: number;
  /** Running count of rail tiles */
  railTileCount: number;
  devMode: boolean;
  difficulty: Difficulty;
  theme: Theme;
}
