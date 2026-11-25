import {
  ALL_RESOURCES,
  TERRAIN_TO_RESOURCE,
  createExpandedArchipelagoTiles,
  createInitialHexTiles,
  generateRandomSeed,
  getProbabilityDots,
  shuffleArray,
} from './hexMath.ts';
import {
  DevCardItem,
  DevCardType,
  Edge,
  EdgePieceType,
  GameConfig,
  GamePhase,
  GameState,
  GoldPickItem,
  LogEntry,
  Player,
  PlayerColor,
  ResourceType,
  TradeOffer,
  Vertex,
} from '../types/catan.ts';

export const BUILD_COSTS: Record<
  'road' | 'ship' | 'settlement' | 'city' | 'devCard',
  Partial<Record<ResourceType, number>>
> = {
  road: { wood: 1, brick: 1 },
  ship: { wood: 1, wool: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devCard: { wool: 1, grain: 1, ore: 1 },
};

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'white', 'brown', 'green'];

let logCounter = 0;
function makeLog(
  turn: number,
  messageKey: string,
  params?: Record<string, string | number>,
  playerId?: number,
): LogEntry {
  return {
    id: `log_${Date.now()}_${logCounter++}`,
    turn,
    playerId,
    messageKey,
    params,
  };
}

export function createDeck(expandedFiveSix = false): DevCardType[] {
  const deck: DevCardType[] = expandedFiveSix
    ? [
        ...Array(20).fill('knight'),
        ...Array(3).fill('roadBuilding'),
        ...Array(3).fill('yearOfPlenty'),
        ...Array(3).fill('monopoly'),
        ...Array(5).fill('victoryPoint'),
        'disaster',
        'plague',
      ]
    : [
        ...Array(14).fill('knight'),
        ...Array(2).fill('roadBuilding'),
        ...Array(2).fill('yearOfPlenty'),
        ...Array(2).fill('monopoly'),
        ...Array(5).fill('victoryPoint'),
        'disaster',
        'plague',
      ];
  return shuffleArray(deck);
}

export function createEmptyResources(): Record<ResourceType, number> {
  return { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

export function totalResources(res: Record<ResourceType, number>): number {
  return res.wood + res.brick + res.wool + res.grain + res.ore;
}

export function canAfford(
  res: Record<ResourceType, number>,
  cost: Partial<Record<ResourceType, number>>,
): boolean {
  for (const [r, amt] of Object.entries(cost)) {
    if ((res[r as ResourceType] || 0) < (amt || 0)) return false;
  }
  return true;
}

export function createNewGame(config: GameConfig): GameState {
  const gameMode = config.gameMode ?? 'basic';
  const scenario = config.scenario ?? 'new_shores';
  const mapMode = config.mapMode ?? 'standard';
  const mapSeed = mapMode === 'random' ? (config.mapSeed ?? generateRandomSeed()) : undefined;
  const isExpanded = gameMode === 'expanded';
  const isFiveSix = isExpanded && config.playerCount >= 5;

  let hexes;
  let vertices;
  let edges;
  let harbors;
  let robberHexId = 0;
  let pirateHexId: number | null = null;
  let fogNumberPool: number[] = [];

  if (isExpanded) {
    const board = createExpandedArchipelagoTiles(scenario, mapMode, mapSeed);
    hexes = board.hexes;
    vertices = board.vertices;
    edges = board.edges;
    harbors = board.harbors;
    robberHexId = board.robberHexId;
    pirateHexId = board.pirateHexId;
    fogNumberPool = board.fogNumberPool;
  } else {
    const board = createInitialHexTiles(mapMode, mapSeed);
    hexes = board.hexes;
    vertices = board.vertices;
    edges = board.edges;
    harbors = board.harbors;
    robberHexId = board.robberHexId;
  }

  const targetVP = !isExpanded ? 10 : scenario === 'new_shores' ? 13 : 12;
  const bankPerResource = isFiveSix ? 24 : 19;

  const players: Player[] = Array.from({ length: config.playerCount }, (_, idx) => ({
    id: idx,
    name: config.playerNames[idx] || `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx],
    isAI: idx >= config.humanCount,
    resources: createEmptyResources(),
    devCards: [],
    knightsPlayed: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
    shipsLeft: isExpanded ? 15 : 0,
    longestRoadLength: 0,
    bonusVP: 0,
    settledIslands: isExpanded && scenario === 'new_shores' ? [0] : [],
  }));

  // Snake draft: [0,1,2,...,N-1, N-1,...,2,1,0]
  const forward = players.map((p) => p.id);
  const setupSequence = [...forward, ...[...forward].reverse()];

  return {
    gameMode,
    scenario,
    mapMode,
    mapSeed,
    targetVP,
    phase: 'setup_settlement',
    turnNumber: 1,
    currentPlayerIndex: setupSequence[0],
    players,
    hexes,
    vertices,
    edges,
    harbors,
    robberHexId,
    pirateHexId,
    fogNumberPool,
    pendingGoldPicks: [],
    returnPhaseAfterGold: null,
    specialBuildOriginIndex: null,
    specialBuildQueue: [],
    shipMovedThisTurn: false,
    bank: {
      wood: bankPerResource,
      brick: bankPerResource,
      wool: bankPerResource,
      grain: bankPerResource,
      ore: bankPerResource,
    },
    devDeck: createDeck(isFiveSix),
    dice: [3, 4],
    diceRollCount: 0,
    setupSequence,
    setupStep: 0,
    pendingSettlementVertexId: null,
    discardQueue: [],
    stealCandidates: [],
    stealKind: 'robber',
    longestRoadHolderId: null,
    largestArmyHolderId: null,
    devCardPlayedThisTurn: false,
    knightPlayedBeforeRoll: false,
    lastBoughtDevCard: null,
    pendingTradeOffer: null,
    winnerId: null,
    logs: [makeLog(1, isExpanded ? 'logExpandedGameStart' : 'logGameStart', { targetVP })],
  };
}

// =========================================================================
// VICTORY POINT & EXPANDED TOPOLOGY HELPERS
// =========================================================================

export function getVisibleVP(state: GameState, playerId: number): number {
  const p = state.players[playerId];
  let settlementsOnBoard = 0;
  let citiesOnBoard = 0;
  for (const v of Object.values(state.vertices)) {
    if (v.ownerId !== playerId) continue;
    if (v.building === 'settlement') settlementsOnBoard += 1;
    else if (v.building === 'city') citiesOnBoard += 1;
  }
  let vp = settlementsOnBoard * 1 + citiesOnBoard * 2 + (p.bonusVP || 0);
  if (state.longestRoadHolderId === playerId) vp += 2;
  if (state.largestArmyHolderId === playerId) vp += 2;
  return vp;
}

export function getHiddenVPCardsCount(player: Player): number {
  return player.devCards.filter((c) => !c.hidden && c.type === 'victoryPoint').length;
}

export function getTotalVP(state: GameState, playerId: number): number {
  return getVisibleVP(state, playerId) + getHiddenVPCardsCount(state.players[playerId]);
}

export function checkVictory(state: GameState): GameState {
  // Rule: Win when reaching >= targetVP on your own turn (or your own Special Building Phase turn)
  const activeId = state.currentPlayerIndex;
  if (state.phase === 'setup_settlement' || state.phase === 'setup_road') return state;
  if (getTotalVP(state, activeId) >= (state.targetVP || 10)) {
    return {
      ...state,
      phase: 'game_over',
      winnerId: activeId,
    };
  }
  return state;
}

function isVisibleLandHex(hex: GameState['hexes'][number] | undefined): boolean {
  return Boolean(hex && !hex.fogged && hex.terrain !== 'sea');
}

function isVisibleSeaHex(hex: GameState['hexes'][number] | undefined): boolean {
  return Boolean(hex && !hex.fogged && hex.terrain === 'sea');
}

export function isLandEdge(state: GameState, edge: Edge): boolean {
  if (state.gameMode !== 'expanded') return true;
  return edge.hexIds.some((hid) => isVisibleLandHex(state.hexes[hid]));
}

export function isSeaEdge(state: GameState, edge: Edge): boolean {
  if (state.gameMode !== 'expanded') return false;
  return edge.hexIds.some((hid) => isVisibleSeaHex(state.hexes[hid]));
}

export function isBlockedByPirate(state: GameState, edge: Edge): boolean {
  return state.gameMode === 'expanded' && state.pirateHexId !== null && edge.hexIds.includes(state.pirateHexId);
}

function getEdgePieceType(edge: Edge): EdgePieceType {
  return edge.pieceType === 'ship' ? 'ship' : 'road';
}

// =========================================================================
// PLACEMENT VALIDATORS
// =========================================================================

export function getValidSettlementVertices(state: GameState, playerId: number, isSetup: boolean): string[] {
  const player = state.players[playerId];
  if (player.settlementsLeft <= 0) return [];
  if (!isSetup && !canAfford(player.resources, BUILD_COSTS.settlement)) return [];

  const valid: string[] = [];
  for (const v of Object.values(state.vertices)) {
    if (v.ownerId !== null) continue;
    // Distance rule: no adjacent vertex can have any settlement/city
    const tooClose = v.adjacentVertexIds.some((adjId) => state.vertices[adjId].ownerId !== null);
    if (tooClose) continue;

    // In Expanded Mode, vertex must touch at least 1 visible land hex (never pure open sea or hidden fog)
    if (state.gameMode === 'expanded') {
      const touchesLand = v.hexIds.some((hid) => isVisibleLandHex(state.hexes[hid]));
      if (!touchesLand) continue;
      if (isSetup) {
        // During the 2 free initial settlement turns in Expanded Mode, players cannot settle adjacent to a Gold Field
        const touchesGold = v.hexIds.some((hid) => {
          const h = state.hexes[hid];
          return Boolean(h && !h.fogged && h.terrain === 'gold');
        });
        if (touchesGold) continue;

        // During setup in New Shores, players start on the main island (islandGroupId === 0)
        if (state.scenario === 'new_shores') {
          const touchesMain = v.hexIds.some((hid) => {
            const h = state.hexes[hid];
            return isVisibleLandHex(h) && h.islandGroupId === 0;
          });
          if (!touchesMain) continue;
        }
      }
    }

    if (!isSetup) {
      // Must connect to at least one Road OR Ship owned by player
      const connected = v.adjacentEdgeIds.some((eid) => state.edges[eid].ownerId === playerId);
      if (!connected) continue;
    }
    valid.push(v.id);
  }
  return valid;
}

export function getValidRoadEdges(
  state: GameState,
  playerId: number,
  options?: { isSetup?: boolean; setupVertexId?: string | null; freeRoad?: boolean },
): string[] {
  const player = state.players[playerId];
  if (player.roadsLeft <= 0) return [];
  const isSetup = options?.isSetup ?? false;
  const freeRoad = options?.freeRoad ?? false;
  if (!isSetup && !freeRoad && !canAfford(player.resources, BUILD_COSTS.road)) return [];

  if (isSetup && options?.setupVertexId) {
    const v = state.vertices[options.setupVertexId];
    return v
      ? v.adjacentEdgeIds.filter((eid) => {
          const edge = state.edges[eid];
          return edge.ownerId === null && isLandEdge(state, edge);
        })
      : [];
  }

  const valid: string[] = [];
  for (const edge of Object.values(state.edges)) {
    if (edge.ownerId !== null) continue;
    if (!isLandEdge(state, edge)) continue;
    const endpoints = [state.vertices[edge.v1], state.vertices[edge.v2]];
    const isConnected = endpoints.some((v) => {
      if (v.ownerId === playerId) return true;
      if (v.ownerId !== null && v.ownerId !== playerId) return false;
      // Roads can ONLY extend from another Road at an empty vertex (never straight from a Ship)
      return v.adjacentEdgeIds.some((adjEid) => {
        if (adjEid === edge.id) return false;
        const adj = state.edges[adjEid];
        return adj.ownerId === playerId && getEdgePieceType(adj) === 'road';
      });
    });
    if (isConnected) valid.push(edge.id);
  }
  return valid;
}

export function getValidShipEdges(
  state: GameState,
  playerId: number,
  options?: { isSetup?: boolean; setupVertexId?: string | null; freeShip?: boolean },
): string[] {
  if (state.gameMode !== 'expanded') return [];
  const player = state.players[playerId];
  if (player.shipsLeft <= 0 && !options?.freeShip) return [];
  const isSetup = options?.isSetup ?? false;
  const freeShip = options?.freeShip ?? false;
  if (!isSetup && !freeShip && !canAfford(player.resources, BUILD_COSTS.ship)) return [];

  if (isSetup && options?.setupVertexId) {
    const v = state.vertices[options.setupVertexId];
    return v
      ? v.adjacentEdgeIds.filter((eid) => {
          const edge = state.edges[eid];
          return edge.ownerId === null && isSeaEdge(state, edge) && !isBlockedByPirate(state, edge);
        })
      : [];
  }

  const valid: string[] = [];
  for (const edge of Object.values(state.edges)) {
    if (edge.ownerId !== null) continue;
    if (!isSeaEdge(state, edge)) continue;
    if (isBlockedByPirate(state, edge)) continue;

    const endpoints = [state.vertices[edge.v1], state.vertices[edge.v2]];
    const isConnected = endpoints.some((v) => {
      if (v.ownerId === playerId) return true;
      if (v.ownerId !== null && v.ownerId !== playerId) return false;
      // Ships can ONLY extend from another Ship at an empty vertex (never straight from a Road)
      return v.adjacentEdgeIds.some((adjEid) => {
        if (adjEid === edge.id) return false;
        const adj = state.edges[adjEid];
        return adj.ownerId === playerId && getEdgePieceType(adj) === 'ship';
      });
    });
    if (isConnected) valid.push(edge.id);
  }
  return valid;
}

export function getMovableShipEdges(state: GameState, playerId: number): string[] {
  if (state.gameMode !== 'expanded') return [];
  if (state.phase !== 'action' || state.shipMovedThisTurn || state.currentPlayerIndex !== playerId) {
    return [];
  }

  const movable: string[] = [];
  for (const edge of Object.values(state.edges)) {
    if (edge.ownerId !== playerId || getEdgePieceType(edge) !== 'ship') continue;
    if ((edge.builtOnTurn ?? 0) === state.turnNumber) continue;
    if (isBlockedByPirate(state, edge)) continue;

    // Must be at an open end (at least one endpoint has NO building AND NO other ship of playerId)
    const endpoints = [state.vertices[edge.v1], state.vertices[edge.v2]];
    const hasOpenEnd = endpoints.some((v) => {
      if (v.ownerId !== null) return false;
      const otherShipAtV = v.adjacentEdgeIds.some((adjEid) => {
        if (adjEid === edge.id) return false;
        const adj = state.edges[adjEid];
        return adj.ownerId === playerId && getEdgePieceType(adj) === 'ship';
      });
      return !otherShipAtV;
    });
    if (!hasOpenEnd) continue;

    // Also verify there is at least 1 valid destination once lifted
    if (getValidShipMoveTargets(state, playerId, edge.id).length > 0) {
      movable.push(edge.id);
    }
  }
  return movable;
}

export function getValidShipMoveTargets(state: GameState, playerId: number, fromEdgeId: string): string[] {
  const fromEdge = state.edges[fromEdgeId];
  if (!fromEdge || fromEdge.ownerId !== playerId || getEdgePieceType(fromEdge) !== 'ship') return [];
  if ((fromEdge.builtOnTurn ?? 0) === state.turnNumber || isBlockedByPirate(state, fromEdge)) return [];

  const simulatedState: GameState = {
    ...state,
    edges: {
      ...state.edges,
      [fromEdgeId]: { ...fromEdge, ownerId: null, pieceType: null },
    },
  };
  return getValidShipEdges(simulatedState, playerId, { freeShip: true }).filter((eid) => eid !== fromEdgeId);
}

export function getValidCityVertices(state: GameState, playerId: number): string[] {
  const player = state.players[playerId];
  if (player.citiesLeft <= 0) return [];
  if (!canAfford(player.resources, BUILD_COSTS.city)) return [];
  return Object.values(state.vertices)
    .filter((v) => v.ownerId === playerId && v.building === 'settlement')
    .map((v) => v.id);
}

// =========================================================================
// LONGEST ROAD / TRADE ROUTE DFS (Roads + Ships bridged only by own buildings)
// =========================================================================

export function computePlayerLongestRoad(
  playerId: number,
  vertices: Record<string, Vertex>,
  edges: Record<string, Edge>,
): number {
  const playerEdges = Object.values(edges).filter((e) => e.ownerId === playerId);
  if (playerEdges.length === 0) return 0;

  const vertexEdges = new Map<string, Edge[]>();
  for (const e of playerEdges) {
    if (!vertexEdges.has(e.v1)) vertexEdges.set(e.v1, []);
    if (!vertexEdges.has(e.v2)) vertexEdges.set(e.v2, []);
    vertexEdges.get(e.v1)!.push(e);
    vertexEdges.get(e.v2)!.push(e);
  }

  let best = 0;
  const visitedEdges = new Set<string>();

  function dfs(currentVertexId: string, prevPieceType: EdgePieceType | null, length: number) {
    if (length > best) best = length;
    const v = vertices[currentVertexId];
    // Cannot pass THROUGH an opponent's settlement/city
    if (length > 0 && v.ownerId !== null && v.ownerId !== playerId) {
      return;
    }
    const adj = vertexEdges.get(currentVertexId) || [];
    for (const edge of adj) {
      if (visitedEdges.has(edge.id)) continue;
      const nextType = getEdgePieceType(edge);
      // Road <-> Ship transition requires player's own settlement/city at currentVertexId
      if (prevPieceType !== null && prevPieceType !== nextType && v.ownerId !== playerId) {
        continue;
      }
      visitedEdges.add(edge.id);
      const nextVertexId = edge.v1 === currentVertexId ? edge.v2 : edge.v1;
      dfs(nextVertexId, nextType, length + 1);
      visitedEdges.delete(edge.id);
    }
  }

  for (const startVertexId of vertexEdges.keys()) {
    dfs(startVertexId, null, 0);
  }

  return best;
}

function updateLongestRoadTitle(state: GameState): GameState {
  const players = state.players.map((p) => ({
    ...p,
    longestRoadLength: computePlayerLongestRoad(p.id, state.vertices, state.edges),
  }));

  let maxLen = 0;
  for (const p of players) {
    if (p.longestRoadLength > maxLen) maxLen = p.longestRoadLength;
  }

  let newHolder = state.longestRoadHolderId;
  const logs = [...state.logs];

  if (maxLen < 5) {
    newHolder = null;
  } else {
    const leaders = players.filter((p) => p.longestRoadLength === maxLen);
    if (newHolder !== null) {
      const currentHolderLen = players[newHolder].longestRoadLength;
      if (currentHolderLen === maxLen && currentHolderLen >= 5) {
        // Current holder keeps tie
      } else if (leaders.length === 1) {
        newHolder = leaders[0].id;
        if (newHolder !== state.longestRoadHolderId) {
          logs.push(
            makeLog(state.turnNumber, 'logLongestRoad', { name: players[newHolder].name, len: maxLen }, newHolder),
          );
        }
      } else {
        newHolder = null;
      }
    } else if (leaders.length === 1) {
      newHolder = leaders[0].id;
      logs.push(
        makeLog(state.turnNumber, 'logLongestRoad', { name: players[newHolder].name, len: maxLen }, newHolder),
      );
    }
  }

  return {
    ...state,
    players,
    longestRoadHolderId: newHolder,
    logs,
  };
}

function updateLargestArmyTitle(state: GameState): GameState {
  let maxKnights = 0;
  for (const p of state.players) {
    if (p.knightsPlayed > maxKnights) maxKnights = p.knightsPlayed;
  }
  if (maxKnights < 3) return state;

  const currentHolder = state.largestArmyHolderId;
  const currentMax = currentHolder !== null ? state.players[currentHolder].knightsPlayed : 2;
  const challenger = state.players.find((p) => p.knightsPlayed === maxKnights && p.knightsPlayed > currentMax);

  if (challenger) {
    return {
      ...state,
      largestArmyHolderId: challenger.id,
      logs: [
        ...state.logs,
        makeLog(
          state.turnNumber,
          'logLargestArmy',
          { name: challenger.name, count: challenger.knightsPlayed },
          challenger.id,
        ),
      ],
    };
  }
  return state;
}

// =========================================================================
// FOG ISLAND REVEAL, ISLAND CHITS & GOLD FIELD PICK HELPERS
// =========================================================================

function resolveGoldPicksQueue(state: GameState, fallbackReturnPhase?: GamePhase): GameState {
  let queue = [...state.pendingGoldPicks];
  let bank = { ...state.bank };
  let players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  const logs = [...state.logs];

  const remaining: GoldPickItem[] = [];
  for (const item of queue) {
    const bankTotal = totalResources(bank);
    const actualCount = Math.min(item.count, bankTotal);
    if (actualCount <= 0) continue;

    const p = players[item.playerId];
    if (p && p.isAI) {
      // AI automatically picks its scarcest available resources
      for (let i = 0; i < actualCount; i++) {
        const pick = [...ALL_RESOURCES]
          .filter((r) => bank[r] > 0)
          .sort((a, b) => players[item.playerId].resources[a] - players[item.playerId].resources[b])[0];
        if (!pick) break;
        bank[pick] -= 1;
        players[item.playerId].resources[pick] += 1;
      }
      logs.push(makeLog(state.turnNumber, 'logGoldPick', { name: p.name, count: actualCount }, p.id));
    } else {
      remaining.push({ playerId: item.playerId, count: actualCount });
    }
  }

  queue = remaining;
  const targetReturn = state.returnPhaseAfterGold ?? fallbackReturnPhase ?? 'action';

  if (queue.length > 0) {
    return {
      ...state,
      bank,
      players,
      logs,
      pendingGoldPicks: queue,
      returnPhaseAfterGold: targetReturn,
      phase: 'gold_pick',
    };
  }

  return {
    ...state,
    bank,
    players,
    logs,
    pendingGoldPicks: [],
    returnPhaseAfterGold: null,
    phase: state.phase === 'gold_pick' ? targetReturn : state.phase,
  };
}

function discoverFogAroundVertex(state: GameState, vertexId: string, pid: number): GameState {
  if (state.gameMode !== 'expanded') return state;
  const v = state.vertices[vertexId];
  if (!v) return state;

  const fogHexIds = v.hexIds.filter((hid) => state.hexes[hid]?.fogged);
  if (fogHexIds.length === 0) return state;

  const hexes = [...state.hexes];
  const fogNumberPool = [...state.fogNumberPool];
  const bank = { ...state.bank };
  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  const pendingGoldPicks = [...state.pendingGoldPicks];
  const logs = [...state.logs];

  for (const hid of fogHexIds) {
    const hex = hexes[hid];
    if (!hex || !hex.fogged) continue;

    let assignedNum: number | null = null;
    if (hex.terrain !== 'sea' && hex.terrain !== 'desert') {
      assignedNum = fogNumberPool.shift() ?? [4, 5, 6, 8, 9, 10][hid % 6];
      if (hex.terrain === 'gold') {
        const existing = pendingGoldPicks.find((item) => item.playerId === pid);
        if (existing) existing.count += 1;
        else pendingGoldPicks.push({ playerId: pid, count: 1 });
      } else {
        const res = TERRAIN_TO_RESOURCE[hex.terrain];
        if (res && bank[res] > 0) {
          bank[res] -= 1;
          players[pid].resources[res] += 1;
        }
      }
    }

    hexes[hid] = {
      ...hex,
      fogged: false,
      numberToken: assignedNum,
    };
    logs.push(
      makeLog(state.turnNumber, 'logDiscoverFog', { name: players[pid].name, terrain: hex.terrain }, pid),
    );
  }

  return {
    ...state,
    hexes,
    fogNumberPool,
    bank,
    players,
    pendingGoldPicks,
    logs,
  };
}

function awardIslandDiscoveryBonus(state: GameState, vertexId: string, pid: number): GameState {
  if (state.gameMode !== 'expanded') return state;
  const v = state.vertices[vertexId];
  if (!v) return state;

  const player = state.players[pid];
  const newIslands = new Set<number>();
  for (const hid of v.hexIds) {
    const hex = state.hexes[hid];
    if (isVisibleLandHex(hex) && hex.islandGroupId !== undefined && hex.islandGroupId >= 0) {
      if (!player.settledIslands.includes(hex.islandGroupId)) {
        newIslands.add(hex.islandGroupId);
      }
    }
  }
  if (newIslands.size === 0) return state;

  const addedCount = newIslands.size;
  const bonusGain = addedCount * 2;
  const players = state.players.map((p) =>
    p.id === pid
      ? {
          ...p,
          bonusVP: (p.bonusVP || 0) + bonusGain,
          settledIslands: [...p.settledIslands, ...Array.from(newIslands)],
        }
      : p,
  );

  return {
    ...state,
    players,
    logs: [
      ...state.logs,
      makeLog(state.turnNumber, 'logIslandBonus', { name: player.name, vp: bonusGain }, pid),
    ],
  };
}

export function pickGoldResources(
  state: GameState,
  playerId: number,
  picks: Partial<Record<ResourceType, number>>,
): GameState {
  if (state.phase !== 'gold_pick' || state.pendingGoldPicks.length === 0) return state;
  const currentItem = state.pendingGoldPicks[0];
  if (currentItem.playerId !== playerId) return state;

  const bankTotal = totalResources(state.bank);
  const need = Math.min(currentItem.count, bankTotal);
  let sum = 0;
  for (const r of ALL_RESOURCES) {
    const amt = picks[r] || 0;
    if (!Number.isInteger(amt) || amt < 0 || amt > state.bank[r]) return state;
    sum += amt;
  }
  if (sum !== need) return state;

  const bank = { ...state.bank };
  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  for (const r of ALL_RESOURCES) {
    const amt = picks[r] || 0;
    if (amt > 0) {
      bank[r] -= amt;
      players[playerId].resources[r] += amt;
    }
  }

  const nextState: GameState = {
    ...state,
    bank,
    players,
    pendingGoldPicks: state.pendingGoldPicks.slice(1),
    logs: [
      ...state.logs,
      makeLog(state.turnNumber, 'logGoldPick', { name: players[playerId].name, count: need }, playerId),
    ],
  };

  return resolveGoldPicksQueue(nextState, state.returnPhaseAfterGold || 'action');
}

// =========================================================================
// SETUP PLACEMENT ACTIONS
// =========================================================================

export function placeSetupSettlement(state: GameState, vertexId: string): GameState {
  if (state.phase !== 'setup_settlement') return state;
  const pid = state.currentPlayerIndex;
  const valid = getValidSettlementVertices(state, pid, true);
  if (!valid.includes(vertexId)) return state;

  const vertices = {
    ...state.vertices,
    [vertexId]: {
      ...state.vertices[vertexId],
      ownerId: pid,
      building: 'settlement' as const,
    },
  };

  // Record initial island(s) settled during setup so only NEW outer islands award Catan Chits later
  const initialIslands = new Set(state.players[pid].settledIslands);
  if (state.gameMode === 'expanded') {
    for (const hid of state.vertices[vertexId].hexIds) {
      const h = state.hexes[hid];
      if (isVisibleLandHex(h) && h.islandGroupId !== undefined && h.islandGroupId >= 0) {
        initialIslands.add(h.islandGroupId);
      }
    }
  }

  const players = state.players.map((p) =>
    p.id === pid
      ? {
          ...p,
          settlementsLeft: p.settlementsLeft - 1,
          settledIslands: Array.from(initialIslands),
        }
      : p,
  );

  return {
    ...state,
    vertices,
    players,
    phase: 'setup_road',
    pendingSettlementVertexId: vertexId,
  };
}

export function placeSetupRoad(
  state: GameState,
  edgeId: string,
  preferredPieceType?: EdgePieceType,
): GameState {
  if (state.phase !== 'setup_road' || !state.pendingSettlementVertexId) return state;
  const pid = state.currentPlayerIndex;
  const edge = state.edges[edgeId];
  if (!edge) return state;

  const validRoads = getValidRoadEdges(state, pid, {
    isSetup: true,
    setupVertexId: state.pendingSettlementVertexId,
  });
  const validShips = getValidShipEdges(state, pid, {
    isSetup: true,
    setupVertexId: state.pendingSettlementVertexId,
  });

  let chosenType: EdgePieceType | null = null;
  if (preferredPieceType === 'ship' && validShips.includes(edgeId)) {
    chosenType = 'ship';
  } else if (preferredPieceType === 'road' && validRoads.includes(edgeId)) {
    chosenType = 'road';
  } else if (validShips.includes(edgeId) && !validRoads.includes(edgeId)) {
    chosenType = 'ship';
  } else if (validRoads.includes(edgeId)) {
    chosenType = 'road';
  } else if (validShips.includes(edgeId)) {
    chosenType = 'ship';
  }
  if (!chosenType) return state;

  const edges = {
    ...state.edges,
    [edgeId]: {
      ...edge,
      ownerId: pid,
      pieceType: chosenType,
      builtOnTurn: state.turnNumber,
    },
  };

  const bank = { ...state.bank };
  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      roadsLeft: chosenType === 'road' ? p.roadsLeft - 1 : p.roadsLeft,
      shipsLeft: chosenType === 'ship' ? p.shipsLeft - 1 : p.shipsLeft,
      resources: { ...p.resources },
    };
  });

  const pendingGoldPicks = [...state.pendingGoldPicks];
  // If this is the player's SECOND setup settlement (setupStep >= playerCount), grant initial resources
  const isSecondRound = state.setupStep >= state.players.length;
  if (isSecondRound) {
    const settleV = state.vertices[state.pendingSettlementVertexId];
    for (const hid of settleV.hexIds) {
      const hex = state.hexes[hid];
      if (!hex || hex.fogged) continue;
      if (hex.terrain === 'gold') {
        const existing = pendingGoldPicks.find((item) => item.playerId === pid);
        if (existing) existing.count += 1;
        else pendingGoldPicks.push({ playerId: pid, count: 1 });
        continue;
      }
      const res = TERRAIN_TO_RESOURCE[hex.terrain];
      if (res && bank[res] > 0) {
        bank[res] -= 1;
        players[pid].resources[res] += 1;
      }
    }
  }

  const nextStep = state.setupStep + 1;
  const logs = [
    ...state.logs,
    makeLog(
      state.turnNumber,
      chosenType === 'ship' ? 'logSetupPlaceShip' : 'logSetupPlace',
      { name: players[pid].name },
      pid,
    ),
  ];

  let nextState: GameState = {
    ...state,
    edges,
    bank,
    players,
    pendingGoldPicks,
    pendingSettlementVertexId: null,
    setupStep: nextStep,
    logs,
  };

  // Placing a coastal road/ship could touch a Fog Island edge
  const otherV = edge.v1 === state.pendingSettlementVertexId ? edge.v2 : edge.v1;
  nextState = discoverFogAroundVertex(nextState, otherV, pid);
  nextState = updateLongestRoadTitle(nextState);

  if (nextStep >= state.setupSequence.length) {
    const finalSetup: GameState = {
      ...nextState,
      phase: 'roll',
      currentPlayerIndex: state.setupSequence[0],
    };
    return finalSetup.pendingGoldPicks.length > 0 ? resolveGoldPicksQueue(finalSetup, 'roll') : finalSetup;
  }

  const nextSetup: GameState = {
    ...nextState,
    phase: 'setup_settlement',
    currentPlayerIndex: state.setupSequence[nextStep],
  };
  return nextSetup.pendingGoldPicks.length > 0
    ? resolveGoldPicksQueue(nextSetup, 'setup_settlement')
    : nextSetup;
}

// =========================================================================
// PHASE 1: ROLL DICE & DISTRIBUTE RESOURCES (INCLUDING GOLD FIELDS)
// =========================================================================

export function rollDice(state: GameState, forcedDice?: [number, number]): GameState {
  if (state.phase !== 'roll') return state;
  const d1 = forcedDice ? forcedDice[0] : Math.floor(Math.random() * 6) + 1;
  const d2 = forcedDice ? forcedDice[1] : Math.floor(Math.random() * 6) + 1;
  const sum = d1 + d2;
  const activePlayer = state.players[state.currentPlayerIndex];

  const logs = [
    ...state.logs,
    makeLog(state.turnNumber, 'logRoll', { name: activePlayer.name, d1, d2, sum }, activePlayer.id),
  ];

  if (sum === 7) {
    logs.push(makeLog(state.turnNumber, 'logSeven', undefined, activePlayer.id));
    const discardQueue: number[] = [];
    for (let offset = 0; offset < state.players.length; offset++) {
      const idx = (state.currentPlayerIndex + offset) % state.players.length;
      if (totalResources(state.players[idx].resources) > 7) {
        discardQueue.push(idx);
      }
    }

    return {
      ...state,
      dice: [d1, d2],
      diceRollCount: state.diceRollCount + 1,
      discardQueue,
      lastBoughtDevCard: null,
      phase: discardQueue.length > 0 ? 'discard' : 'move_robber',
      logs,
    };
  }

  const dueByResource: Record<ResourceType, Record<number, number>> = {
    wood: {},
    brick: {},
    wool: {},
    grain: {},
    ore: {},
  };
  const goldDueByPlayer: Record<number, number> = {};

  for (const hex of state.hexes) {
    if (hex.fogged || hex.numberToken !== sum) continue;
    if (hex.id === state.robberHexId) continue; // Robber blocks production

    if (hex.terrain === 'gold') {
      for (const vid of hex.vertexIds) {
        const v = state.vertices[vid];
        if (v.ownerId === null || v.building === null) continue;
        const amt = v.building === 'city' ? 2 : 1;
        goldDueByPlayer[v.ownerId] = (goldDueByPlayer[v.ownerId] || 0) + amt;
      }
      continue;
    }

    const res = TERRAIN_TO_RESOURCE[hex.terrain];
    if (!res) continue;

    for (const vid of hex.vertexIds) {
      const v = state.vertices[vid];
      if (v.ownerId === null || v.building === null) continue;
      const amt = v.building === 'city' ? 2 : 1;
      dueByResource[res][v.ownerId] = (dueByResource[res][v.ownerId] || 0) + amt;
    }
  }

  const bank = { ...state.bank };
  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));

  for (const res of ALL_RESOURCES) {
    const dueMap = dueByResource[res];
    const recipients = Object.keys(dueMap).map(Number);
    if (recipients.length === 0) continue;

    const totalNeeded = recipients.reduce((acc, pid) => acc + dueMap[pid], 0);
    if (bank[res] >= totalNeeded) {
      for (const pid of recipients) {
        players[pid].resources[res] += dueMap[pid];
      }
      bank[res] -= totalNeeded;
    } else if (recipients.length === 1) {
      const pid = recipients[0];
      const give = bank[res];
      if (give > 0) {
        players[pid].resources[res] += give;
        bank[res] = 0;
      }
    } else {
      logs.push(makeLog(state.turnNumber, 'logBankShortage', { res }));
    }
  }

  // Enqueue Gold Field picks in clockwise order from active player
  const pendingGoldPicks: GoldPickItem[] = [...state.pendingGoldPicks];
  for (let offset = 0; offset < state.players.length; offset++) {
    const pid = (state.currentPlayerIndex + offset) % state.players.length;
    const count = goldDueByPlayer[pid] || 0;
    if (count > 0) {
      pendingGoldPicks.push({ playerId: pid, count });
    }
  }

  const nextState: GameState = {
    ...state,
    dice: [d1, d2],
    diceRollCount: state.diceRollCount + 1,
    bank,
    players,
    pendingGoldPicks,
    lastBoughtDevCard: null,
    phase: 'action',
    logs,
  };

  if (pendingGoldPicks.length > 0) {
    return resolveGoldPicksQueue(nextState, 'action');
  }
  return nextState;
}

// =========================================================================
// DISCARD, ROBBER / PIRATE & STEAL
// =========================================================================

export function discardCards(
  state: GameState,
  playerId: number,
  toDiscard: Partial<Record<ResourceType, number>>,
): GameState {
  if (state.phase !== 'discard' || state.discardQueue[0] !== playerId) return state;
  const player = state.players[playerId];
  const total = totalResources(player.resources);
  const required = Math.floor(total / 2);

  let count = 0;
  for (const r of ALL_RESOURCES) {
    const amt = toDiscard[r] || 0;
    if (amt < 0 || amt > player.resources[r]) return state;
    count += amt;
  }
  if (count !== required) return state;

  const bank = { ...state.bank };
  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  for (const r of ALL_RESOURCES) {
    const amt = toDiscard[r] || 0;
    players[playerId].resources[r] -= amt;
    bank[r] += amt;
  }

  const remainingQueue = state.discardQueue.slice(1);
  return {
    ...state,
    bank,
    players,
    discardQueue: remainingQueue,
    phase: remainingQueue.length > 0 ? 'discard' : 'move_robber',
    logs: [
      ...state.logs,
      makeLog(state.turnNumber, 'logDiscard', { name: player.name, count: required }, playerId),
    ],
  };
}

// Move Robber (land hex) OR Pirate (sea hex in Expanded Mode)
export function moveRobber(state: GameState, hexId: number, returnToRollIfBeforeRoll = false): GameState {
  if (state.phase !== 'move_robber') return state;
  const hex = state.hexes[hexId];
  if (!hex || hex.fogged) return state;

  const activeId = state.currentPlayerIndex;

  // Sea hex -> move The Pirate (Expanded Mode only)
  if (hex.terrain === 'sea') {
    if (state.gameMode !== 'expanded') return state;
    if (hexId === state.pirateHexId) return state;

    const candidatesSet = new Set<number>();
    for (const eid of hex.edgeIds) {
      const e = state.edges[eid];
      if (e.ownerId !== null && e.ownerId !== activeId && getEdgePieceType(e) === 'ship') {
        candidatesSet.add(e.ownerId);
      }
    }
    const candidatesWithCards = Array.from(candidatesSet).filter(
      (pid) => totalResources(state.players[pid].resources) > 0,
    );

    const logs = [
      ...state.logs,
      makeLog(state.turnNumber, 'logPirateMove', { name: state.players[activeId].name }, activeId),
    ];

    if (candidatesWithCards.length === 0) {
      const returnToRoll = returnToRollIfBeforeRoll || state.knightPlayedBeforeRoll;
      return {
        ...state,
        pirateHexId: hexId,
        stealCandidates: [],
        stealKind: 'pirate',
        knightPlayedBeforeRoll: false,
        phase: returnToRoll ? 'roll' : 'action',
        logs,
      };
    }

    if (candidatesWithCards.length === 1) {
      return executeSteal(
        {
          ...state,
          pirateHexId: hexId,
          stealCandidates: candidatesWithCards,
          stealKind: 'pirate',
          phase: 'steal',
          logs,
        },
        candidatesWithCards[0],
        returnToRollIfBeforeRoll,
      );
    }

    return {
      ...state,
      pirateHexId: hexId,
      stealCandidates: candidatesWithCards,
      stealKind: 'pirate',
      phase: 'steal',
      logs,
    };
  }

  // Land hex -> move The Robber
  if (hexId === state.robberHexId) return state;

  const candidatesSet = new Set<number>();
  for (const vid of hex.vertexIds) {
    const v = state.vertices[vid];
    if (v.ownerId !== null && v.ownerId !== activeId) {
      candidatesSet.add(v.ownerId);
    }
  }
  const candidatesWithCards = Array.from(candidatesSet).filter(
    (pid) => totalResources(state.players[pid].resources) > 0,
  );

  const logs = [
    ...state.logs,
    makeLog(
      state.turnNumber,
      'logRobberMove',
      { name: state.players[activeId].name, terrain: hex.terrain },
      activeId,
    ),
  ];

  if (candidatesWithCards.length === 0) {
    const returnToRoll = returnToRollIfBeforeRoll || state.knightPlayedBeforeRoll;
    return {
      ...state,
      robberHexId: hexId,
      stealCandidates: [],
      stealKind: 'robber',
      knightPlayedBeforeRoll: false,
      phase: returnToRoll ? 'roll' : 'action',
      logs,
    };
  }

  if (candidatesWithCards.length === 1) {
    return executeSteal(
      {
        ...state,
        robberHexId: hexId,
        stealCandidates: candidatesWithCards,
        stealKind: 'robber',
        phase: 'steal',
        logs,
      },
      candidatesWithCards[0],
      returnToRollIfBeforeRoll,
    );
  }

  return {
    ...state,
    robberHexId: hexId,
    stealCandidates: candidatesWithCards,
    stealKind: 'robber',
    phase: 'steal',
    logs,
  };
}

export function executeSteal(state: GameState, victimId: number, returnToRollIfBeforeRoll = false): GameState {
  if (state.phase !== 'steal' || !state.stealCandidates.includes(victimId)) return state;
  const activeId = state.currentPlayerIndex;
  const victim = state.players[victimId];
  const pool: ResourceType[] = [];
  for (const r of ALL_RESOURCES) {
    for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
  }

  const players = state.players.map((p) => ({ ...p, resources: { ...p.resources } }));
  const logs = [...state.logs];

  if (pool.length > 0) {
    const stolen = pool[Math.floor(Math.random() * pool.length)];
    players[victimId].resources[stolen] -= 1;
    players[activeId].resources[stolen] += 1;
    logs.push(
      makeLog(state.turnNumber, 'logSteal', { name: players[activeId].name, victim: victim.name }, activeId),
    );
  }

  const returnToRoll = returnToRollIfBeforeRoll || state.knightPlayedBeforeRoll;
  return {
    ...state,
    players,
    stealCandidates: [],
    knightPlayedBeforeRoll: false,
    phase: returnToRoll ? 'roll' : 'action',
    logs,
  };
}

// =========================================================================
// BUILDING ACTIONS (Roads, Ships, Move Ship, Settlements, Cities, Dev Cards)
// =========================================================================

export function buildRoad(state: GameState, edgeId: string, free = false): GameState {
  const pid = state.currentPlayerIndex;
  if (!free && state.phase !== 'action' && state.phase !== 'special_build') return state;
  if (free && state.phase !== 'road_building_1' && state.phase !== 'road_building_2') return state;

  const valid = getValidRoadEdges(state, pid, { freeRoad: free });
  if (!valid.includes(edgeId)) return state;

  const edge = state.edges[edgeId];
  const edges = {
    ...state.edges,
    [edgeId]: {
      ...edge,
      ownerId: pid,
      pieceType: 'road' as const,
      builtOnTurn: state.turnNumber,
    },
  };
  const bank = { ...state.bank };
  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    const resources = { ...p.resources };
    if (!free) {
      resources.wood -= 1;
      resources.brick -= 1;
      bank.wood += 1;
      bank.brick += 1;
    }
    return { ...p, roadsLeft: p.roadsLeft - 1, resources };
  });

  let nextPhase = state.phase;
  let clearBeforeRoll = state.knightPlayedBeforeRoll;
  if (state.phase === 'road_building_1') {
    const simState = { ...state, edges, players };
    const moreRoads = getValidRoadEdges(simState, pid, { freeRoad: true });
    const moreShips = getValidShipEdges(simState, pid, { freeShip: true });
    if (moreRoads.length > 0 || moreShips.length > 0) {
      nextPhase = 'road_building_2';
    } else {
      nextPhase = state.knightPlayedBeforeRoll ? 'roll' : 'action';
      clearBeforeRoll = false;
    }
  } else if (state.phase === 'road_building_2') {
    nextPhase = state.knightPlayedBeforeRoll ? 'roll' : 'action';
    clearBeforeRoll = false;
  }

  let next: GameState = {
    ...state,
    edges,
    bank,
    players,
    knightPlayedBeforeRoll: clearBeforeRoll,
    phase: nextPhase,
    logs: [...state.logs, makeLog(state.turnNumber, 'logBuildRoad', { name: players[pid].name }, pid)],
  };

  next = discoverFogAroundVertex(next, edge.v1, pid);
  next = discoverFogAroundVertex(next, edge.v2, pid);
  next = updateLongestRoadTitle(next);
  if (next.pendingGoldPicks.length > 0) {
    next = resolveGoldPicksQueue(next, next.phase);
  }
  return checkVictory(next);
}

export function buildShip(state: GameState, edgeId: string, free = false): GameState {
  if (state.gameMode !== 'expanded') return state;
  const pid = state.currentPlayerIndex;
  if (!free && state.phase !== 'action' && state.phase !== 'special_build') return state;
  if (free && state.phase !== 'road_building_1' && state.phase !== 'road_building_2') return state;

  const valid = getValidShipEdges(state, pid, { freeShip: free });
  if (!valid.includes(edgeId)) return state;

  const edge = state.edges[edgeId];
  const edges = {
    ...state.edges,
    [edgeId]: {
      ...edge,
      ownerId: pid,
      pieceType: 'ship' as const,
      builtOnTurn: state.turnNumber,
    },
  };
  const bank = { ...state.bank };
  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    const resources = { ...p.resources };
    if (!free) {
      resources.wood -= 1;
      resources.wool -= 1;
      bank.wood += 1;
      bank.wool += 1;
    }
    return { ...p, shipsLeft: p.shipsLeft - 1, resources };
  });

  let nextPhase = state.phase;
  let clearBeforeRoll = state.knightPlayedBeforeRoll;
  if (state.phase === 'road_building_1') {
    const simState = { ...state, edges, players };
    const moreRoads = getValidRoadEdges(simState, pid, { freeRoad: true });
    const moreShips = getValidShipEdges(simState, pid, { freeShip: true });
    if (moreRoads.length > 0 || moreShips.length > 0) {
      nextPhase = 'road_building_2';
    } else {
      nextPhase = state.knightPlayedBeforeRoll ? 'roll' : 'action';
      clearBeforeRoll = false;
    }
  } else if (state.phase === 'road_building_2') {
    nextPhase = state.knightPlayedBeforeRoll ? 'roll' : 'action';
    clearBeforeRoll = false;
  }

  let next: GameState = {
    ...state,
    edges,
    bank,
    players,
    knightPlayedBeforeRoll: clearBeforeRoll,
    phase: nextPhase,
    logs: [...state.logs, makeLog(state.turnNumber, 'logBuildShip', { name: players[pid].name }, pid)],
  };

  next = discoverFogAroundVertex(next, edge.v1, pid);
  next = discoverFogAroundVertex(next, edge.v2, pid);
  next = updateLongestRoadTitle(next);
  if (next.pendingGoldPicks.length > 0) {
    next = resolveGoldPicksQueue(next, next.phase);
  }
  return checkVictory(next);
}

export function moveShip(state: GameState, fromEdgeId: string, toEdgeId: string): GameState {
  if (state.gameMode !== 'expanded' || state.phase !== 'action' || state.shipMovedThisTurn) return state;
  const pid = state.currentPlayerIndex;
  const movable = getMovableShipEdges(state, pid);
  if (!movable.includes(fromEdgeId)) return state;
  const targets = getValidShipMoveTargets(state, pid, fromEdgeId);
  if (!targets.includes(toEdgeId)) return state;

  const targetEdge = state.edges[toEdgeId];
  const edges = {
    ...state.edges,
    [fromEdgeId]: {
      ...state.edges[fromEdgeId],
      ownerId: null,
      pieceType: null,
      builtOnTurn: undefined,
    },
    [toEdgeId]: {
      ...targetEdge,
      ownerId: pid,
      pieceType: 'ship' as const,
      builtOnTurn: state.turnNumber,
    },
  };

  let next: GameState = {
    ...state,
    edges,
    shipMovedThisTurn: true,
    logs: [
      ...state.logs,
      makeLog(state.turnNumber, 'logMoveShip', { name: state.players[pid].name }, pid),
    ],
  };

  next = discoverFogAroundVertex(next, targetEdge.v1, pid);
  next = discoverFogAroundVertex(next, targetEdge.v2, pid);
  next = updateLongestRoadTitle(next);
  if (next.pendingGoldPicks.length > 0) {
    next = resolveGoldPicksQueue(next, 'action');
  }
  return checkVictory(next);
}

export function buildSettlement(state: GameState, vertexId: string): GameState {
  if (state.phase !== 'action' && state.phase !== 'special_build') return state;
  const pid = state.currentPlayerIndex;
  const valid = getValidSettlementVertices(state, pid, false);
  if (!valid.includes(vertexId)) return state;

  const vertices = {
    ...state.vertices,
    [vertexId]: { ...state.vertices[vertexId], ownerId: pid, building: 'settlement' as const },
  };
  const bank = { ...state.bank };
  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    const resources = { ...p.resources };
    for (const r of ['wood', 'brick', 'wool', 'grain'] as ResourceType[]) {
      resources[r] -= 1;
      bank[r] += 1;
    }
    return { ...p, settlementsLeft: p.settlementsLeft - 1, resources };
  });

  let next: GameState = {
    ...state,
    vertices,
    bank,
    players,
    logs: [...state.logs, makeLog(state.turnNumber, 'logBuildSettlement', { name: players[pid].name }, pid)],
  };

  next = awardIslandDiscoveryBonus(next, vertexId, pid);
  // Building a settlement may split an opponent's Longest Road
  next = updateLongestRoadTitle(next);
  return checkVictory(next);
}

export function buildCity(state: GameState, vertexId: string): GameState {
  if (state.phase !== 'action' && state.phase !== 'special_build') return state;
  const pid = state.currentPlayerIndex;
  const valid = getValidCityVertices(state, pid);
  if (!valid.includes(vertexId)) return state;

  const vertices = {
    ...state.vertices,
    [vertexId]: { ...state.vertices[vertexId], building: 'city' as const },
  };
  const bank = { ...state.bank };
  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    const resources = { ...p.resources };
    resources.grain -= 2;
    resources.ore -= 3;
    bank.grain += 2;
    bank.ore += 3;
    return {
      ...p,
      settlementsLeft: Math.min(5, p.settlementsLeft + 1),
      citiesLeft: p.citiesLeft - 1,
      resources,
    };
  });

  const next: GameState = {
    ...state,
    vertices,
    bank,
    players,
    logs: [...state.logs, makeLog(state.turnNumber, 'logBuildCity', { name: players[pid].name }, pid)],
  };

  return checkVictory(next);
}

export function buyDevCard(state: GameState): GameState {
  if (state.phase !== 'action' && state.phase !== 'special_build') return state;
  if (state.devDeck.length === 0) return state;
  const pid = state.currentPlayerIndex;
  const player = state.players[pid];
  if (!canAfford(player.resources, BUILD_COSTS.devCard)) return state;

  const [drawn, ...restDeck] = state.devDeck;
  const newCard: DevCardItem = {
    id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: drawn,
    boughtOnTurn: state.turnNumber,
    played: false,
  };

  const bank = { ...state.bank };
  bank.wool += 1;
  bank.grain += 1;
  bank.ore += 1;

  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    const resources = { ...p.resources };
    resources.wool -= 1;
    resources.grain -= 1;
    resources.ore -= 1;
    return { ...p, resources, devCards: [...p.devCards, newCard] };
  });

  const next: GameState = {
    ...state,
    devDeck: restDeck,
    bank,
    players,
    lastBoughtDevCard: { playerId: pid, type: drawn },
    logs: [...state.logs, makeLog(state.turnNumber, 'logBuyDev', { name: player.name }, pid)],
  };

  return checkVictory(next);
}

// =========================================================================
// DEVELOPMENT CARDS (Forbidden during Special Building Phase)
// =========================================================================

export function canPlayDevCard(state: GameState, playerId: number, cardId: string): boolean {
  if (state.currentPlayerIndex !== playerId) return false;
  if (state.phase !== 'roll' && state.phase !== 'action') return false;
  if (state.devCardPlayedThisTurn) return false;

  const card = state.players[playerId].devCards.find((c) => c.id === cardId);
  if (!card || card.played) return false;
  if (card.type === 'victoryPoint') return false;
  if (card.boughtOnTurn === state.turnNumber) return false;
  return true;
}

export function playKnightCard(state: GameState, cardId: string): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;

  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      knightsPlayed: p.knightsPlayed + 1,
      devCards: p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)),
    };
  });

  let next: GameState = {
    ...state,
    players,
    devCardPlayedThisTurn: true,
    knightPlayedBeforeRoll: state.phase === 'roll',
    phase: 'move_robber',
    logs: [...state.logs, makeLog(state.turnNumber, 'logPlayKnight', { name: players[pid].name }, pid)],
  };

  next = updateLargestArmyTitle(next);
  return checkVictory(next);
}

export function playRoadBuildingCard(state: GameState, cardId: string): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;

  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      devCards: p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)),
    };
  });

  const simState = { ...state, players };
  const validRoads = getValidRoadEdges(simState, pid, { freeRoad: true });
  const validShips = getValidShipEdges(simState, pid, { freeShip: true });
  const hasAny = validRoads.length > 0 || validShips.length > 0;
  const beforeRoll = state.phase === 'roll';
  return {
    ...state,
    players,
    devCardPlayedThisTurn: true,
    knightPlayedBeforeRoll: hasAny ? beforeRoll : false,
    phase: hasAny ? 'road_building_1' : state.phase,
    logs: [...state.logs, makeLog(state.turnNumber, 'logPlayRoadBuilding', { name: players[pid].name }, pid)],
  };
}

export function playYearOfPlentyCard(
  state: GameState,
  cardId: string,
  res1: ResourceType,
  res2: ResourceType,
): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;

  const bank = { ...state.bank };
  const players = state.players.map((p) => ({
    ...p,
    resources: { ...p.resources },
    devCards: p.id === pid ? p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)) : p.devCards,
  }));

  if (bank[res1] > 0) {
    bank[res1] -= 1;
    players[pid].resources[res1] += 1;
  }
  if (bank[res2] > 0) {
    bank[res2] -= 1;
    players[pid].resources[res2] += 1;
  }

  return {
    ...state,
    bank,
    players,
    devCardPlayedThisTurn: true,
    logs: [...state.logs, makeLog(state.turnNumber, 'logPlayYearOfPlenty', { name: players[pid].name }, pid)],
  };
}

export function playMonopolyCard(state: GameState, cardId: string, resource: ResourceType): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;

  let collected = 0;
  const players = state.players.map((p) => {
    const res = { ...p.resources };
    if (p.id !== pid) {
      collected += res[resource];
      res[resource] = 0;
    }
    return {
      ...p,
      resources: res,
      devCards: p.id === pid ? p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)) : p.devCards,
    };
  });
  players[pid].resources[resource] += collected;

  return {
    ...state,
    players,
    devCardPlayedThisTurn: true,
    logs: [
      ...state.logs,
      makeLog(
        state.turnNumber,
        'logPlayMonopoly',
        { name: players[pid].name, res: resource, count: collected },
        pid,
      ),
    ],
  };
}

export function getValidLandEffectHexes(state: GameState): number[] {
  return state.hexes.filter((h) => !h.fogged && h.terrain !== 'sea').map((h) => h.id);
}

export function playDisasterCard(state: GameState, cardId: string): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;
  const card = state.players[pid].devCards.find((c) => c.id === cardId);
  if (!card || card.type !== 'disaster') return state;

  const players = state.players.map((p) =>
    p.id === pid
      ? {
          ...p,
          devCards: p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)),
        }
      : p,
  );

  return {
    ...state,
    players,
    devCardPlayedThisTurn: true,
    knightPlayedBeforeRoll: state.phase === 'roll',
    phase: 'select_disaster_hex',
    logs: [...state.logs, makeLog(state.turnNumber, 'logPlayDisaster', { name: players[pid].name }, pid)],
  };
}

export function applyDisasterHex(state: GameState, hexId: number): GameState {
  if (state.phase !== 'select_disaster_hex') return state;
  const hex = state.hexes[hexId];
  if (!hex || hex.fogged || hex.terrain === 'sea') return state;

  const activeId = state.currentPlayerIndex;
  const edges = { ...state.edges };
  const players = state.players.map((p) => ({ ...p }));
  let removedCount = 0;

  for (const eid of hex.edgeIds) {
    const edge = edges[eid];
    if (!edge || edge.ownerId === null) continue;
    const owner = players[edge.ownerId];
    if (owner) {
      if (getEdgePieceType(edge) === 'ship') {
        owner.shipsLeft = Math.min(15, owner.shipsLeft + 1);
      } else {
        owner.roadsLeft = Math.min(15, owner.roadsLeft + 1);
      }
    }
    edges[eid] = {
      ...edge,
      ownerId: null,
      pieceType: null,
      builtOnTurn: undefined,
    };
    removedCount += 1;
  }

  let next: GameState = {
    ...state,
    edges,
    players,
    knightPlayedBeforeRoll: false,
    phase: state.knightPlayedBeforeRoll ? 'roll' : 'action',
    logs: [
      ...state.logs,
      makeLog(
        state.turnNumber,
        'logDisasterHex',
        { name: players[activeId].name, terrain: hex.terrain, count: removedCount },
        activeId,
      ),
    ],
  };

  next = updateLongestRoadTitle(next);
  return checkVictory(next);
}

export function playPlagueCard(state: GameState, cardId: string): GameState {
  const pid = state.currentPlayerIndex;
  if (!canPlayDevCard(state, pid, cardId)) return state;
  const card = state.players[pid].devCards.find((c) => c.id === cardId);
  if (!card || card.type !== 'plague') return state;

  const players = state.players.map((p) =>
    p.id === pid
      ? {
          ...p,
          devCards: p.devCards.map((c) => (c.id === cardId ? { ...c, played: true } : c)),
        }
      : p,
  );

  return {
    ...state,
    players,
    devCardPlayedThisTurn: true,
    knightPlayedBeforeRoll: state.phase === 'roll',
    phase: 'select_plague_hex',
    logs: [...state.logs, makeLog(state.turnNumber, 'logPlayPlague', { name: players[pid].name }, pid)],
  };
}

export function applyPlagueHex(state: GameState, hexId: number): GameState {
  if (state.phase !== 'select_plague_hex') return state;
  const hex = state.hexes[hexId];
  if (!hex || hex.fogged || hex.terrain === 'sea') return state;

  const activeId = state.currentPlayerIndex;
  const vertices = { ...state.vertices };
  const players = state.players.map((p) => ({ ...p }));
  let destroyedSettlements = 0;
  let downgradedCities = 0;

  // Pass 1: Remove settlements first so returned settlement supply can support downgraded cities
  for (const vid of hex.vertexIds) {
    const v = vertices[vid];
    if (!v || v.ownerId === null || v.building !== 'settlement') continue;
    const owner = players[v.ownerId];
    if (owner) {
      owner.settlementsLeft = Math.min(5, owner.settlementsLeft + 1);
    }
    vertices[vid] = {
      ...v,
      ownerId: null,
      building: null,
    };
    destroyedSettlements += 1;
  }

  // Pass 2: Downgrade cities to settlements
  for (const vid of hex.vertexIds) {
    const v = vertices[vid];
    if (!v || v.ownerId === null || v.building !== 'city') continue;
    const owner = players[v.ownerId];
    if (owner) {
      owner.citiesLeft = Math.min(4, owner.citiesLeft + 1);
      owner.settlementsLeft = Math.max(0, owner.settlementsLeft - 1);
    }
    vertices[vid] = {
      ...v,
      building: 'settlement',
    };
    downgradedCities += 1;
  }

  let next: GameState = {
    ...state,
    vertices,
    players,
    knightPlayedBeforeRoll: false,
    phase: state.knightPlayedBeforeRoll ? 'roll' : 'action',
    logs: [
      ...state.logs,
      makeLog(
        state.turnNumber,
        'logPlagueHex',
        {
          name: players[activeId].name,
          terrain: hex.terrain,
          settlements: destroyedSettlements,
          cities: downgradedCities,
        },
        activeId,
      ),
    ],
  };

  next = updateLongestRoadTitle(next);
  return checkVictory(next);
}

// =========================================================================
// MARITIME & DOMESTIC TRADE (Forbidden during Special Building Phase)
// =========================================================================

export function getMaritimeTradeRate(state: GameState, playerId: number, giveRes: ResourceType): number {
  let rate = 4;
  for (const v of Object.values(state.vertices)) {
    if (v.ownerId !== playerId || v.harbor === null) continue;
    if (v.harbor === giveRes) return 2;
    if (v.harbor === 'generic') rate = Math.min(rate, 3);
  }
  return rate;
}

export function executeMaritimeTrade(
  state: GameState,
  giveRes: ResourceType,
  receiveRes: ResourceType,
): GameState {
  if (state.phase !== 'action' || giveRes === receiveRes) return state;
  const pid = state.currentPlayerIndex;
  const rate = getMaritimeTradeRate(state, pid, giveRes);
  const player = state.players[pid];

  if (player.resources[giveRes] < rate || state.bank[receiveRes] < 1) return state;

  const bank = { ...state.bank };
  bank[giveRes] += rate;
  bank[receiveRes] -= 1;

  const players = state.players.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      resources: {
        ...p.resources,
        [giveRes]: p.resources[giveRes] - rate,
        [receiveRes]: p.resources[receiveRes] + 1,
      },
    };
  });

  return {
    ...state,
    bank,
    players,
    logs: [...state.logs, makeLog(state.turnNumber, 'logTradeBank', { name: player.name }, pid)],
  };
}

export function isValidDomesticTrade(state: GameState, offer: TradeOffer): boolean {
  if (offer.fromPlayerId === offer.toPlayerId) return false;
  const fromP = state.players[offer.fromPlayerId];
  const toP = state.players[offer.toPlayerId];

  let totalGive = 0;
  let totalWant = 0;
  const giveTypes = new Set<ResourceType>();
  const wantTypes = new Set<ResourceType>();

  for (const r of ALL_RESOURCES) {
    const g = offer.give[r] || 0;
    const w = offer.want[r] || 0;
    if (g < 0 || w < 0) return false;
    if (g > fromP.resources[r] || w > toP.resources[r]) return false;
    if (g > 0) {
      totalGive += g;
      giveTypes.add(r);
    }
    if (w > 0) {
      totalWant += w;
      wantTypes.add(r);
    }
  }

  if (totalGive === 0 || totalWant === 0) return false;
  for (const r of giveTypes) {
    if (wantTypes.has(r)) return false;
  }
  return true;
}

export function evaluateAIDomesticTrade(state: GameState, offer: TradeOffer): boolean {
  if (!isValidDomesticTrade(state, offer)) return false;
  const ai = state.players[offer.toPlayerId];
  if (!ai.isAI) return true;

  let giveTotal = 0;
  let wantTotal = 0;
  let valueToAI = 0;

  for (const r of ALL_RESOURCES) {
    const incoming = offer.give[r] || 0;
    const outgoing = offer.want[r] || 0;
    giveTotal += incoming;
    wantTotal += outgoing;

    const currentStock = ai.resources[r];
    if (incoming > 0) {
      valueToAI += incoming * (currentStock === 0 ? 1.6 : currentStock === 1 ? 1.2 : 0.85);
    }
    if (outgoing > 0) {
      valueToAI -= outgoing * (currentStock - outgoing <= 0 ? 1.5 : 1.0);
    }
  }

  const proposerVP = getVisibleVP(state, offer.fromPlayerId);
  if (proposerVP >= (state.targetVP || 10) - 2 && giveTotal <= wantTotal) return false;

  return valueToAI >= 0.15;
}

export function executeDomesticTrade(state: GameState, offer: TradeOffer): GameState {
  if (state.phase !== 'action') return state;
  if (!isValidDomesticTrade(state, offer)) return state;

  const players = state.players.map((p) => {
    if (p.id !== offer.fromPlayerId && p.id !== offer.toPlayerId) return p;
    const res = { ...p.resources };
    for (const r of ALL_RESOURCES) {
      const g = offer.give[r] || 0;
      const w = offer.want[r] || 0;
      if (p.id === offer.fromPlayerId) {
        res[r] = res[r] - g + w;
      } else {
        res[r] = res[r] + g - w;
      }
    }
    return { ...p, resources: res };
  });

  return {
    ...state,
    players,
    logs: [
      ...state.logs,
      makeLog(
        state.turnNumber,
        'logTradePlayer',
        { p1: players[offer.fromPlayerId].name, p2: players[offer.toPlayerId].name },
        offer.fromPlayerId,
      ),
    ],
  };
}

// =========================================================================
// TURN PROGRESSION & 5-6 PLAYER SPECIAL BUILDING PHASE
// =========================================================================

export function finishSpecialBuildTurn(state: GameState): GameState {
  if (state.phase !== 'special_build') return state;

  const remaining = state.specialBuildQueue.slice(1);
  if (remaining.length > 0) {
    return {
      ...state,
      currentPlayerIndex: remaining[0],
      specialBuildQueue: remaining,
      lastBoughtDevCard: null,
    };
  }

  const origin = state.specialBuildOriginIndex ?? state.currentPlayerIndex;
  const nextPlayerIndex = (origin + 1) % state.players.length;
  const nextTurnNumber = nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber;

  const next: GameState = {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    turnNumber: nextTurnNumber,
    phase: 'roll',
    specialBuildOriginIndex: null,
    specialBuildQueue: [],
    shipMovedThisTurn: false,
    devCardPlayedThisTurn: false,
    knightPlayedBeforeRoll: false,
    lastBoughtDevCard: null,
    pendingTradeOffer: null,
  };
  return checkVictory(next);
}

export function endTurn(state: GameState): GameState {
  if (state.phase === 'special_build') {
    return finishSpecialBuildTurn(state);
  }
  if (state.phase !== 'action') return state;

  // 5-6 Player Extension: enter Special Building Phase clockwise for all other players
  if (state.gameMode === 'expanded' && state.players.length >= 5) {
    const origin = state.currentPlayerIndex;
    const queue = Array.from({ length: state.players.length - 1 }, (_, i) => (origin + 1 + i) % state.players.length);
    return {
      ...state,
      phase: 'special_build',
      specialBuildOriginIndex: origin,
      specialBuildQueue: queue,
      currentPlayerIndex: queue[0],
      shipMovedThisTurn: false,
      devCardPlayedThisTurn: false,
      knightPlayedBeforeRoll: false,
      lastBoughtDevCard: null,
      pendingTradeOffer: null,
      logs: [...state.logs, makeLog(state.turnNumber, 'logSpecialBuild', { name: state.players[queue[0]].name }, queue[0])],
    };
  }

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextTurnNumber = nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber;

  const next: GameState = {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    turnNumber: nextTurnNumber,
    phase: 'roll',
    shipMovedThisTurn: false,
    devCardPlayedThisTurn: false,
    knightPlayedBeforeRoll: false,
    lastBoughtDevCard: null,
    pendingTradeOffer: null,
  };
  return checkVictory(next);
}

// Sanitize GameState for a specific online player's separate screen
export function sanitizeGameStateForViewer(state: GameState, viewerSeatIndex: number | null): GameState {
  if (state.phase === 'game_over') {
    return state;
  }

  return {
    ...state,
    fogNumberPool: state.fogNumberPool.map(() => 0),
    hexes: state.hexes.map((h) =>
      h.fogged
        ? {
            ...h,
            terrain: 'sea' as const,
            numberToken: null,
          }
        : h,
    ),
    devDeck: state.devDeck.map(() => 'knight' as DevCardType),
    lastBoughtDevCard:
      state.lastBoughtDevCard && state.lastBoughtDevCard.playerId === viewerSeatIndex
        ? state.lastBoughtDevCard
        : null,
    players: state.players.map((p) => {
      if (p.id === viewerSeatIndex) {
        return p;
      }
      const total = totalResources(p.resources);
      return {
        ...p,
        isMasked: true,
        resources: { wood: total, brick: 0, wool: 0, grain: 0, ore: 0 },
        devCards: p.devCards.map((c) =>
          c.played
            ? c
            : {
                id: c.id,
                type: 'knight' as DevCardType,
                boughtOnTurn: c.boughtOnTurn,
                played: false,
                hidden: true,
              },
        ),
      };
    }),
  };
}

// =========================================================================
// SMART AI BOT DECISION ENGINE
// =========================================================================

function scoreVertexForAI(state: GameState, vertexId: string, playerId: number): number {
  const v = state.vertices[vertexId];
  let score = 0;
  const seenResources = new Set<ResourceType>();
  const playerHasRes = new Set<ResourceType>();

  for (const otherV of Object.values(state.vertices)) {
    if (otherV.ownerId === playerId) {
      for (const hid of otherV.hexIds) {
        const h = state.hexes[hid];
        if (!h || h.fogged) continue;
        const res = TERRAIN_TO_RESOURCE[h.terrain];
        if (res) playerHasRes.add(res);
      }
    }
  }

  for (const hid of v.hexIds) {
    const hex = state.hexes[hid];
    if (!hex || hex.fogged) continue;
    const dots = getProbabilityDots(hex.numberToken);
    score += dots * 3.0;
    if (hex.terrain === 'gold') {
      score += 5.5;
    }
    const res = TERRAIN_TO_RESOURCE[hex.terrain];
    if (res) {
      seenResources.add(res);
      if (!playerHasRes.has(res)) score += 2.5;
      if (res === 'wood' || res === 'brick' || res === 'grain') score += 1.0;
    }
  }
  score += seenResources.size * 2.0;
  if (v.harbor === 'generic') score += 1.8;
  else if (v.harbor !== null) score += 2.2;
  if (state.gameMode === 'expanded') {
    const player = state.players[playerId];
    for (const hid of v.hexIds) {
      const h = state.hexes[hid];
      if (isVisibleLandHex(h) && h.islandGroupId !== undefined && !player.settledIslands.includes(h.islandGroupId)) {
        score += 4.5;
      }
    }
  }
  return score;
}

export function runAIStep(state: GameState): GameState {
  const pid = state.currentPlayerIndex;
  const player = state.players[pid];

  if (state.phase === 'discard') {
    const discardPid = state.discardQueue[0];
    const dp = state.players[discardPid];
    if (!dp || !dp.isAI) return state;
    const need = Math.floor(totalResources(dp.resources) / 2);
    const toDiscard: Partial<Record<ResourceType, number>> = {};
    let remaining = need;
    const sorted = [...ALL_RESOURCES].sort((a, b) => dp.resources[b] - dp.resources[a]);
    let idx = 0;
    while (remaining > 0) {
      const r = sorted[idx % sorted.length];
      const currentPicked = toDiscard[r] || 0;
      if (dp.resources[r] - currentPicked > 0) {
        toDiscard[r] = currentPicked + 1;
        remaining--;
      }
      idx++;
    }
    return discardCards(state, discardPid, toDiscard);
  }

  if (state.phase === 'gold_pick') {
    const item = state.pendingGoldPicks[0];
    if (!item || !state.players[item.playerId]?.isAI) return state;
    return resolveGoldPicksQueue(state, state.returnPhaseAfterGold || 'action');
  }

  if (!player.isAI) return state;

  if (state.phase === 'setup_settlement') {
    const valid = getValidSettlementVertices(state, pid, true);
    valid.sort((a, b) => scoreVertexForAI(state, b, pid) - scoreVertexForAI(state, a, pid));
    return placeSetupSettlement(state, valid[0]);
  }

  if (state.phase === 'setup_road') {
    const validRoads = getValidRoadEdges(state, pid, {
      isSetup: true,
      setupVertexId: state.pendingSettlementVertexId,
    });
    const validShips = getValidShipEdges(state, pid, {
      isSetup: true,
      setupVertexId: state.pendingSettlementVertexId,
    });
    // In Four Islands or coastal starts, AI occasionally launches a Ship directly from setup
    if (
      state.gameMode === 'expanded' &&
      validShips.length > 0 &&
      (validRoads.length === 0 || state.scenario === 'four_islands' || Math.random() < 0.3)
    ) {
      return placeSetupRoad(state, validShips[0], 'ship');
    }
    validRoads.sort((a, b) => {
      const ea = state.edges[a];
      const eb = state.edges[b];
      const va = ea.v1 === state.pendingSettlementVertexId ? ea.v2 : ea.v1;
      const vb = eb.v1 === state.pendingSettlementVertexId ? eb.v2 : eb.v1;
      return scoreVertexForAI(state, vb, pid) - scoreVertexForAI(state, va, pid);
    });
    return placeSetupRoad(state, validRoads[0], 'road');
  }

  if (state.phase === 'roll') {
    const robberHex = state.hexes[state.robberHexId];
    const robberBlocksMe = robberHex?.vertexIds.some((vid) => state.vertices[vid].ownerId === pid);
    const playableKnight = player.devCards.find(
      (c) => c.type === 'knight' && !c.played && c.boughtOnTurn < state.turnNumber,
    );
    if (robberBlocksMe && playableKnight && !state.devCardPlayedThisTurn) {
      return playKnightCard(state, playableKnight.id);
    }
    return rollDice(state);
  }

  if (state.phase === 'move_robber') {
    let bestHex = state.hexes.find((h) => !h.fogged && h.terrain !== 'sea' && h.id !== state.robberHexId)?.id ?? 0;
    let bestScore = -999;

    for (const hex of state.hexes) {
      if (hex.fogged) continue;
      if (hex.terrain === 'sea') {
        if (state.gameMode !== 'expanded' || hex.id === state.pirateHexId) continue;
        let s = 0;
        let hitsOpponent = false;
        for (const eid of hex.edgeIds) {
          const e = state.edges[eid];
          if (e.ownerId === pid && getEdgePieceType(e) === 'ship') s -= 15;
          else if (e.ownerId !== null && getEdgePieceType(e) === 'ship') {
            hitsOpponent = true;
            s += 5 + getVisibleVP(state, e.ownerId);
          }
        }
        if (!hitsOpponent) s -= 12;
        if (s > bestScore) {
          bestScore = s;
          bestHex = hex.id;
        }
        continue;
      }

      if (hex.id === state.robberHexId) continue;
      let s = getProbabilityDots(hex.numberToken) * 2 + (hex.terrain === 'gold' ? 3 : 0);
      let hitsOpponent = false;
      for (const vid of hex.vertexIds) {
        const v = state.vertices[vid];
        if (v.ownerId === pid) s -= 20;
        else if (v.ownerId !== null) {
          hitsOpponent = true;
          const oppVP = getVisibleVP(state, v.ownerId);
          s += (v.building === 'city' ? 6 : 3) + oppVP * 1.2;
        }
      }
      if (!hitsOpponent) s -= 10;
      if (s > bestScore) {
        bestScore = s;
        bestHex = hex.id;
      }
    }
    return moveRobber(state, bestHex);
  }

  if (state.phase === 'steal') {
    const sorted = [...state.stealCandidates].sort((a, b) => getVisibleVP(state, b) - getVisibleVP(state, a));
    return executeSteal(state, sorted[0]);
  }

  if (state.phase === 'select_disaster_hex') {
    const landHexes = getValidLandEffectHexes(state);
    let bestHex = landHexes[0] ?? 0;
    let bestScore = -999;
    for (const hid of landHexes) {
      const hex = state.hexes[hid];
      let s = 0;
      for (const eid of hex.edgeIds) {
        const e = state.edges[eid];
        if (!e || e.ownerId === null) continue;
        if (e.ownerId === pid) {
          s -= 7;
        } else {
          const oppVP = getVisibleVP(state, e.ownerId);
          s += 4 + oppVP * 0.4 + (state.longestRoadHolderId === e.ownerId ? 2 : 0);
        }
      }
      if (s > bestScore) {
        bestScore = s;
        bestHex = hid;
      }
    }
    return applyDisasterHex(state, bestHex);
  }

  if (state.phase === 'select_plague_hex') {
    const landHexes = getValidLandEffectHexes(state);
    let bestHex = landHexes[0] ?? 0;
    let bestScore = -999;
    for (const hid of landHexes) {
      const hex = state.hexes[hid];
      let s = 0;
      for (const vid of hex.vertexIds) {
        const v = state.vertices[vid];
        if (!v || v.ownerId === null || v.building === null) continue;
        if (v.ownerId === pid) {
          s -= v.building === 'city' ? 9 : 11;
        } else {
          const oppVP = getVisibleVP(state, v.ownerId);
          s += (v.building === 'city' ? 6 : 5) + oppVP * 0.6;
        }
      }
      if (s > bestScore) {
        bestScore = s;
        bestHex = hid;
      }
    }
    return applyPlagueHex(state, bestHex);
  }

  if (state.phase === 'road_building_1' || state.phase === 'road_building_2') {
    const validRoads = getValidRoadEdges(state, pid, { freeRoad: true });
    const validShips = getValidShipEdges(state, pid, { freeShip: true });
    if (validShips.length > 0 && (validRoads.length === 0 || Math.random() < 0.4)) {
      return buildShip(state, validShips[0], true);
    }
    if (validRoads.length > 0) {
      return buildRoad(state, validRoads[0], true);
    }
    return {
      ...state,
      knightPlayedBeforeRoll: false,
      phase: state.knightPlayedBeforeRoll ? 'roll' : 'action',
    };
  }

  if (state.phase === 'special_build') {
    const validCities = getValidCityVertices(state, pid);
    if (validCities.length > 0) return buildCity(state, validCities[0]);

    const validSettlements = getValidSettlementVertices(state, pid, false);
    if (validSettlements.length > 0) {
      validSettlements.sort((a, b) => scoreVertexForAI(state, b, pid) - scoreVertexForAI(state, a, pid));
      return buildSettlement(state, validSettlements[0]);
    }

    const validShips = getValidShipEdges(state, pid);
    if (validShips.length > 0 && player.shipsLeft > 10) {
      return buildShip(state, validShips[0]);
    }

    const validRoads = getValidRoadEdges(state, pid);
    if (validRoads.length > 0 && player.roadsLeft > 10) {
      return buildRoad(state, validRoads[0]);
    }

    if (canAfford(player.resources, BUILD_COSTS.devCard) && state.devDeck.length > 0 && totalResources(player.resources) >= 6) {
      return buyDevCard(state);
    }

    return finishSpecialBuildTurn(state);
  }

  if (state.phase === 'action') {
    // 1. Upgrade Settlement -> City
    const validCities = getValidCityVertices(state, pid);
    if (validCities.length > 0) {
      return buildCity(state, validCities[0]);
    }

    // 2. Build Settlement
    const validSettlements = getValidSettlementVertices(state, pid, false);
    if (validSettlements.length > 0) {
      validSettlements.sort((a, b) => scoreVertexForAI(state, b, pid) - scoreVertexForAI(state, a, pid));
      return buildSettlement(state, validSettlements[0]);
    }

    // 3. Play helpful Dev cards
    if (!state.devCardPlayedThisTurn) {
      const yop = player.devCards.find(
        (c) => c.type === 'yearOfPlenty' && !c.played && c.boughtOnTurn < state.turnNumber,
      );
      if (yop) {
        const needed = [...ALL_RESOURCES].sort((a, b) => player.resources[a] - player.resources[b]);
        return playYearOfPlentyCard(state, yop.id, needed[0], needed[1]);
      }

      const mono = player.devCards.find(
        (c) => c.type === 'monopoly' && !c.played && c.boughtOnTurn < state.turnNumber,
      );
      if (mono) {
        let bestRes: ResourceType = 'ore';
        let bestSum = -1;
        for (const r of ALL_RESOURCES) {
          const sum = state.players.reduce((acc, op) => (op.id === pid ? acc : acc + op.resources[r]), 0);
          if (sum > bestSum) {
            bestSum = sum;
            bestRes = r;
          }
        }
        return playMonopolyCard(state, mono.id, bestRes);
      }

      const rb = player.devCards.find(
        (c) => c.type === 'roadBuilding' && !c.played && c.boughtOnTurn < state.turnNumber,
      );
      if (rb && (player.roadsLeft >= 2 || player.shipsLeft >= 2)) {
        return playRoadBuildingCard(state, rb.id);
      }

      const plague = player.devCards.find(
        (c) => c.type === 'plague' && !c.played && c.boughtOnTurn < state.turnNumber,
      );
      if (plague) {
        const hasGoodTarget = getValidLandEffectHexes(state).some((hid) => {
          let opp = 0;
          let own = 0;
          for (const vid of state.hexes[hid].vertexIds) {
            const v = state.vertices[vid];
            if (v.ownerId === pid) own += 1;
            else if (v.ownerId !== null) opp += 1;
          }
          return opp > 0 && opp > own;
        });
        if (hasGoodTarget) return playPlagueCard(state, plague.id);
      }

      const disaster = player.devCards.find(
        (c) => c.type === 'disaster' && !c.played && c.boughtOnTurn < state.turnNumber,
      );
      if (disaster) {
        const hasGoodTarget = getValidLandEffectHexes(state).some((hid) => {
          let opp = 0;
          let own = 0;
          for (const eid of state.hexes[hid].edgeIds) {
            const e = state.edges[eid];
            if (e.ownerId === pid) own += 1;
            else if (e.ownerId !== null) opp += 1;
          }
          return opp >= 2 && opp > own;
        });
        if (hasGoodTarget) return playDisasterCard(state, disaster.id);
      }
    }

    // 4. Maritime Trade if AI has excess
    for (const giveRes of ALL_RESOURCES) {
      const rate = getMaritimeTradeRate(state, pid, giveRes);
      if (player.resources[giveRes] >= rate + (totalResources(player.resources) > 7 ? 0 : 1)) {
        const scarcest = [...ALL_RESOURCES]
          .filter((r) => r !== giveRes && state.bank[r] > 0)
          .sort((a, b) => player.resources[a] - player.resources[b])[0];
        if (scarcest) {
          return executeMaritimeTrade(state, giveRes, scarcest);
        }
      }
    }

    // 5. Build Ship in Expanded Mode (sail toward Gold Fields, outer islands, or Fog Reefs)
    if (state.gameMode === 'expanded') {
      const validShips = getValidShipEdges(state, pid);
      if (validShips.length > 0 && (player.shipsLeft > 8 || player.longestRoadLength >= 4)) {
        const scoredShips = [...validShips].sort((a, b) => {
          const scoreEdge = (eid: string) => {
            const e = state.edges[eid];
            const touchesFog = [state.vertices[e.v1], state.vertices[e.v2]].some((v) =>
              v.hexIds.some((hid) => state.hexes[hid]?.fogged),
            );
            const touchesLand = [state.vertices[e.v1], state.vertices[e.v2]].some((v) =>
              v.hexIds.some((hid) => isVisibleLandHex(state.hexes[hid])),
            );
            return (touchesFog ? 6 : 0) + (touchesLand ? 3 : 0) + Math.random();
          };
          return scoreEdge(b) - scoreEdge(a);
        });
        return buildShip(state, scoredShips[0]);
      }
    }

    // 6. Build Road
    const validRoads = getValidRoadEdges(state, pid);
    if (validRoads.length > 0 && (player.roadsLeft > 9 || player.longestRoadLength >= 4)) {
      return buildRoad(state, validRoads[Math.floor(Math.random() * Math.min(3, validRoads.length))]);
    }

    // 7. Buy Dev Card
    if (canAfford(player.resources, BUILD_COSTS.devCard) && state.devDeck.length > 0) {
      return buyDevCard(state);
    }

    // 8. End Turn
    return endTurn(state);
  }

  return state;
}
