export type ResourceType = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';

export type TerrainType = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert' | 'sea' | 'gold';

export type DevCardType =
  | 'knight'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly'
  | 'victoryPoint'
  | 'disaster'
  | 'plague';

export type HarborType = 'generic' | ResourceType;

export type PlayerColor = 'red' | 'blue' | 'orange' | 'white' | 'brown' | 'green';

export type BuildingType = 'settlement' | 'city';

export type EdgePieceType = 'road' | 'ship';

export type GameMode = 'basic' | 'expanded';

export type ScenarioId = 'new_shores' | 'four_islands' | 'fog_islands';

export type PlayerCount = 3 | 4 | 5 | 6;

export type GamePhase =
  | 'title'
  | 'setup_settlement'
  | 'setup_road'
  | 'roll'
  | 'discard'
  | 'gold_pick'
  | 'move_robber'
  | 'select_disaster_hex'
  | 'select_plague_hex'
  | 'steal'
  | 'action'
  | 'special_build'
  | 'road_building_1'
  | 'road_building_2'
  | 'game_over';

export type BuildMode = 'none' | 'road' | 'ship' | 'move_ship' | 'settlement' | 'city';

export type CameraPreset = 'isometric' | 'top' | 'low' | 'overview';

export type MapMode = 'standard' | 'random';

export type Language = 'vi' | 'en';

export interface HexTile {
  id: number;
  q: number;
  r: number;
  x: number;
  z: number;
  terrain: TerrainType;
  numberToken: number | null; // 2-12 excluding 7, null for desert/sea/unrevealed fog
  vertexIds: string[]; // 6 vertex IDs in clockwise order
  edgeIds: string[]; // 6 edge IDs
  islandGroupId?: number; // 0 = main island, >= 1 = outer islands for Seafarers bonus VP
  fogged?: boolean; // Unexplored Fog Island tile (flips open when reached)
}

export interface Vertex {
  id: string;
  x: number;
  z: number;
  hexIds: number[];
  adjacentVertexIds: string[];
  adjacentEdgeIds: string[];
  harbor: HarborType | null;
  ownerId: number | null;
  building: BuildingType | null;
}

export interface Edge {
  id: string;
  v1: string;
  v2: string;
  x: number;
  z: number;
  angle: number;
  hexIds: number[];
  isCoastal: boolean;
  ownerId: number | null;
  pieceType?: EdgePieceType | null;
  builtOnTurn?: number;
}

export interface Harbor {
  id: number;
  type: HarborType;
  edgeId: string;
  vertexIds: [string, string];
  x: number;
  z: number;
  outwardAngle: number;
}

export interface DevCardItem {
  id: string;
  type: DevCardType;
  boughtOnTurn: number;
  played: boolean;
  hidden?: boolean;
}

export interface Player {
  id: number;
  name: string;
  color: PlayerColor;
  isAI: boolean;
  isMasked?: boolean;
  resources: Record<ResourceType, number>;
  devCards: DevCardItem[];
  knightsPlayed: number;
  settlementsLeft: number; // Max 5
  citiesLeft: number; // Max 4
  roadsLeft: number; // Max 15
  shipsLeft: number; // Max 15 in Expanded Mode (0 in Basic)
  longestRoadLength: number;
  bonusVP: number; // Seafarers island-discovery Catan Chits
  settledIslands: number[]; // Island group IDs already settled by this player
}

export interface TradeOffer {
  fromPlayerId: number;
  toPlayerId: number;
  give: Partial<Record<ResourceType, number>>;
  want: Partial<Record<ResourceType, number>>;
}

export interface GoldPickItem {
  playerId: number;
  count: number;
}

export interface LogEntry {
  id: string;
  turn: number;
  playerId?: number;
  messageKey: string;
  params?: Record<string, string | number>;
}

export interface GameConfig {
  gameMode: GameMode;
  scenario: ScenarioId;
  playerCount: PlayerCount;
  humanCount: 1 | 2 | 3 | 4 | 5 | 6;
  mapMode: MapMode;
  mapSeed?: number;
  playerNames: string[];
}

export interface GameState {
  gameMode: GameMode;
  scenario: ScenarioId;
  mapMode?: MapMode;
  mapSeed?: number;
  targetVP: number;
  phase: GamePhase;
  turnNumber: number;
  currentPlayerIndex: number;
  players: Player[];
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  harbors: Harbor[];
  robberHexId: number;
  pirateHexId: number | null; // Null in Basic Mode, sea hex ID in Expanded Mode
  fogNumberPool: number[]; // Reserve number tokens for Fog Island discoveries
  pendingGoldPicks: GoldPickItem[];
  returnPhaseAfterGold: GamePhase | null;
  specialBuildOriginIndex: number | null;
  specialBuildQueue: number[];
  shipMovedThisTurn: boolean;
  bank: Record<ResourceType, number>;
  devDeck: DevCardType[];
  dice: [number, number];
  diceRollCount: number;
  setupSequence: number[]; // e.g. [0,1,2,3,3,2,1,0]
  setupStep: number;
  pendingSettlementVertexId: string | null;
  discardQueue: number[]; // Player IDs who must discard (>7 cards)
  stealCandidates: number[]; // Player IDs adjacent to new robber/pirate hex
  stealKind: 'robber' | 'pirate';
  longestRoadHolderId: number | null;
  largestArmyHolderId: number | null;
  devCardPlayedThisTurn: boolean;
  knightPlayedBeforeRoll: boolean;
  lastBoughtDevCard: { playerId: number; type: DevCardType } | null;
  pendingTradeOffer?: TradeOffer | null;
  winnerId: number | null;
  logs: LogEntry[];
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  wins: number;
  gamesPlayed: number;
}

export interface RoomSeat {
  seatIndex: number;
  userId: string | null;
  username: string | null;
  displayName: string;
  color: PlayerColor;
  ready: boolean;
  connected: boolean;
  isAI: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderName: string;
  senderColor?: PlayerColor;
  text: string;
  timestamp: number;
}

export interface RoomSummary {
  code: string;
  name: string;
  hostUserId: string;
  hostName: string;
  gameMode: GameMode;
  scenario: ScenarioId;
  maxPlayers: PlayerCount;
  mapMode: MapMode;
  mapSeed?: number;
  fillWithAI: boolean;
  status: 'lobby' | 'playing' | 'finished';
  humanCount: number;
  connectedCount: number;
}

export interface RoomInfo extends RoomSummary {
  seats: RoomSeat[];
  chat: RoomChatMessage[];
  mySeatIndex: number | null;
  gameState: GameState | null;
}
