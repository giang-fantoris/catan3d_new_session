import { Edge, Harbor, HarborType, HexTile, ResourceType, ScenarioId, TerrainType, Vertex } from '../types/catan.ts';

export const HEX_RADIUS = 1.65;
export const HEX_HEIGHT = 0.28;

export const ALL_RESOURCES: ResourceType[] = ['wood', 'brick', 'wool', 'grain', 'ore'];

export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
  sea: null,
  gold: null, // Gold Field lets player choose any resource
};

// Probability pip dots for dice sums 2..12
export function getProbabilityDots(num: number | null): number {
  if (num === null) return 0;
  return 6 - Math.abs(7 - num);
}

// Axial coordinates (q, r) for standard 19-hex Catan island in spiral/row order
export const ISLAND_AXIAL_COORDS: Array<[number, number]> = [
  // Row r = -2 (3 hexes)
  [0, -2],
  [1, -2],
  [2, -2],
  // Row r = -1 (4 hexes)
  [-1, -1],
  [0, -1],
  [1, -1],
  [2, -1],
  // Row r = 0 (5 hexes)
  [-2, 0],
  [-1, 0],
  [0, 0],
  [1, 0],
  [2, 0],
  // Row r = 1 (4 hexes)
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1],
  // Row r = 2 (3 hexes)
  [-2, 2],
  [-1, 2],
  [0, 2],
];

// Symmetric 85-hex rectangular archipelago grid for Expanded Mode (Seafarers + 5-6 Players)
export const EXPANDED_AXIAL_COORDS: Array<[number, number]> = [
  // r = -4 (9 hexes)
  [-2, -4], [-1, -4], [0, -4], [1, -4], [2, -4], [3, -4], [4, -4], [5, -4], [6, -4],
  // r = -3 (10 hexes)
  [-3, -3], [-2, -3], [-1, -3], [0, -3], [1, -3], [2, -3], [3, -3], [4, -3], [5, -3], [6, -3],
  // r = -2 (9 hexes)
  [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -2], [4, -2], [5, -2],
  // r = -1 (10 hexes)
  [-4, -1], [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1], [4, -1], [5, -1],
  // r = 0 (9 hexes)
  [-4, 0], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  // r = 1 (10 hexes)
  [-5, 1], [-4, 1], [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  // r = 2 (9 hexes)
  [-5, 2], [-4, 2], [-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [3, 2],
  // r = 3 (10 hexes)
  [-6, 3], [-5, 3], [-4, 3], [-3, 3], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 3], [3, 3],
  // r = 4 (9 hexes)
  [-6, 4], [-5, 4], [-4, 4], [-3, 4], [-2, 4], [-1, 4], [0, 4], [1, 4], [2, 4],
];

export function axialToWorld(q: number, r: number): { x: number; z: number } {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const z = HEX_RADIUS * 1.5 * r;
  return { x, z };
}

export function buildBoardTopologyForCoords(coordsList: Array<[number, number]>): {
  hexCoords: Array<{ id: number; q: number; r: number; x: number; z: number; vertexIds: string[]; edgeIds: string[] }>;
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  coastalEdges: Edge[];
  hexNeighbors: Record<number, number[]>;
} {
  const vertexKeyToId = new Map<string, string>();
  const vertices: Record<string, Vertex> = {};
  const edgeKeyToId = new Map<string, string>();
  const edges: Record<string, Edge> = {};

  let vCounter = 0;
  let eCounter = 0;

  const coordKey = (x: number, z: number) => `${Math.round(x * 1000)}_${Math.round(z * 1000)}`;

  const hexCoords = coordsList.map(([q, r], id) => {
    const { x, z } = axialToWorld(q, r);
    const vertexIds: string[] = [];

    // Pointy-top hex corners starting at -90 deg (top) going clockwise:
    // angles in XZ plane: -90, -30, 30, 90, 150, 210 deg
    for (let i = 0; i < 6; i++) {
      const angle = ((i * 60 - 90) * Math.PI) / 180;
      const vx = x + HEX_RADIUS * Math.cos(angle);
      const vz = z + HEX_RADIUS * Math.sin(angle);
      const key = coordKey(vx, vz);

      let vid = vertexKeyToId.get(key);
      if (!vid) {
        vid = `v${vCounter++}`;
        vertexKeyToId.set(key, vid);
        vertices[vid] = {
          id: vid,
          x: vx,
          z: vz,
          hexIds: [],
          adjacentVertexIds: [],
          adjacentEdgeIds: [],
          harbor: null,
          ownerId: null,
          building: null,
        };
      }
      if (!vertices[vid].hexIds.includes(id)) {
        vertices[vid].hexIds.push(id);
      }
      vertexIds.push(vid);
    }

    const edgeIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const v1 = vertexIds[i];
      const v2 = vertexIds[(i + 1) % 6];
      const sortedPair = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      let eid = edgeKeyToId.get(sortedPair);
      if (!eid) {
        eid = `e${eCounter++}`;
        edgeKeyToId.set(sortedPair, eid);
        const p1 = vertices[v1];
        const p2 = vertices[v2];
        const ex = (p1.x + p2.x) / 2;
        const ez = (p1.z + p2.z) / 2;
        const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);

        edges[eid] = {
          id: eid,
          v1: v1 < v2 ? v1 : v2,
          v2: v1 < v2 ? v2 : v1,
          x: ex,
          z: ez,
          angle,
          hexIds: [],
          isCoastal: false,
          ownerId: null,
          pieceType: null,
        };

        if (!p1.adjacentVertexIds.includes(v2)) p1.adjacentVertexIds.push(v2);
        if (!p2.adjacentVertexIds.includes(v1)) p2.adjacentVertexIds.push(v1);
        if (!p1.adjacentEdgeIds.includes(eid)) p1.adjacentEdgeIds.push(eid);
        if (!p2.adjacentEdgeIds.includes(eid)) p2.adjacentEdgeIds.push(eid);
      }
      if (!edges[eid].hexIds.includes(id)) {
        edges[eid].hexIds.push(id);
      }
      edgeIds.push(eid);
    }

    return { id, q, r, x, z, vertexIds, edgeIds };
  });

  // Mark coastal edges and sort them clockwise around origin (0,0)
  const coastalEdges: Edge[] = [];
  for (const edge of Object.values(edges)) {
    if (edge.hexIds.length === 1) {
      edge.isCoastal = true;
      coastalEdges.push(edge);
    }
  }
  coastalEdges.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

  // Compute hex neighbors (share an edge)
  const hexNeighbors: Record<number, number[]> = {};
  for (const h of hexCoords) hexNeighbors[h.id] = [];
  for (const edge of Object.values(edges)) {
    if (edge.hexIds.length === 2) {
      const [h1, h2] = edge.hexIds;
      if (!hexNeighbors[h1].includes(h2)) hexNeighbors[h1].push(h2);
      if (!hexNeighbors[h2].includes(h1)) hexNeighbors[h2].push(h1);
    }
  }

  return { hexCoords, vertices, edges, coastalEdges, hexNeighbors };
}

export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSeed(): number {
  return Math.floor(100000 + Math.random() * 899999);
}

export function buildBoardTopology(
  randomizeHarbors = false,
  rng: () => number = Math.random,
): {
  hexCoords: Array<{ id: number; q: number; r: number; x: number; z: number; vertexIds: string[]; edgeIds: string[] }>;
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  harbors: Harbor[];
  hexNeighbors: Record<number, number[]>;
} {
  const { hexCoords, vertices, edges, coastalEdges, hexNeighbors } = buildBoardTopologyForCoords(ISLAND_AXIAL_COORDS);

  // Place 9 harbors around the 30 coastal edges matching official Catan spacing
  const HARBOR_INDICES = [0, 3, 7, 10, 13, 17, 20, 23, 27];
  const baseHarborTypes: HarborType[] = [
    'generic',
    'wool',
    'generic',
    'brick',
    'wood',
    'generic',
    'grain',
    'ore',
    'generic',
  ];
  const HARBOR_TYPES = randomizeHarbors ? shuffleArray(baseHarborTypes, rng) : baseHarborTypes;

  const harbors: Harbor[] = HARBOR_INDICES.map((edgeIdx, idx) => {
    const edge = coastalEdges[edgeIdx];
    const type = HARBOR_TYPES[idx];
    const hex = hexCoords[edge.hexIds[0]];
    const outwardAngle = Math.atan2(edge.z - hex.z, edge.x - hex.x);

    vertices[edge.v1].harbor = type;
    vertices[edge.v2].harbor = type;

    return {
      id: idx,
      type,
      edgeId: edge.id,
      vertexIds: [edge.v1, edge.v2],
      x: edge.x + Math.cos(outwardAngle) * 1.15,
      z: edge.z + Math.sin(outwardAngle) * 1.15,
      outwardAngle,
    };
  });

  return { hexCoords, vertices, edges, harbors, hexNeighbors };
}

export function createInitialHexTiles(
  mapMode: 'standard' | 'random',
  mapSeed?: number,
): {
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  harbors: Harbor[];
  robberHexId: number;
} {
  const rng = mapSeed !== undefined ? createSeededRng(mapSeed) : Math.random;
  const { hexCoords, vertices, edges, harbors, hexNeighbors } = buildBoardTopology(mapMode === 'random', rng);

  const standardTerrains: TerrainType[] = [
    'mountains', 'pasture', 'forest',
    'fields', 'hills', 'pasture', 'hills',
    'fields', 'forest', 'desert', 'forest', 'mountains',
    'forest', 'mountains', 'fields', 'pasture',
    'hills', 'fields', 'pasture',
  ];

  const standardNumbers: number[] = [
    10, 2, 9,
    12, 6, 4, 10,
    9, 11, 3, 8,
    8, 3, 4, 5,
    5, 6, 11,
  ];

  let terrains: TerrainType[];
  let numbersForHexes: Array<number | null>;

  if (mapMode === 'standard') {
    terrains = [...standardTerrains];
    let nIdx = 0;
    numbersForHexes = terrains.map((t) => (t === 'desert' ? null : standardNumbers[nIdx++]));
  } else {
    terrains = shuffleArray([...standardTerrains], rng);
    const pool = shuffleArray([...standardNumbers], rng);

    let attempts = 0;
    let valid = false;
    numbersForHexes = [];
    while (!valid && attempts < 500) {
      attempts++;
      const shuffledPool = shuffleArray([...pool], rng);
      let pIdx = 0;
      numbersForHexes = terrains.map((t) => (t === 'desert' ? null : shuffledPool[pIdx++]));
      valid = true;
      for (let i = 0; i < 19; i++) {
        const num = numbersForHexes[i];
        if (num === 6 || num === 8) {
          for (const nb of hexNeighbors[i]) {
            const nbNum = numbersForHexes[nb];
            if (nbNum === 6 || nbNum === 8) {
              valid = false;
              break;
            }
          }
        }
        if (!valid) break;
      }
    }
    if (!valid) {
      let nIdx = 0;
      numbersForHexes = terrains.map((t) => (t === 'desert' ? null : standardNumbers[nIdx++]));
    }
  }

  let robberHexId = 9;
  const hexes: HexTile[] = hexCoords.map((hc, i) => {
    if (terrains[i] === 'desert') robberHexId = hc.id;
    return {
      ...hc,
      terrain: terrains[i],
      numberToken: numbersForHexes[i],
      islandGroupId: 0,
      fogged: false,
    };
  });

  return { hexes, vertices, edges, harbors, robberHexId };
}

function assignBalancedNumbers(
  hexIds: number[],
  terrainsByHex: Record<number, TerrainType>,
  hexNeighbors: Record<number, number[]>,
  numberPool: number[],
  rng: () => number = Math.random,
): Record<number, number | null> {
  const result: Record<number, number | null> = {};
  const productive = hexIds.filter((id) => {
    const tr = terrainsByHex[id];
    return tr !== 'sea' && tr !== 'desert';
  });

  for (let attempt = 0; attempt < 300; attempt++) {
    const shuffled = shuffleArray(numberPool, rng);
    let idx = 0;
    for (const id of hexIds) {
      if (productive.includes(id)) {
        result[id] = shuffled[idx % shuffled.length];
        idx++;
      } else {
        result[id] = null;
      }
    }
    let ok = true;
    for (const id of productive) {
      const n = result[id];
      if (n === 6 || n === 8) {
        for (const nb of hexNeighbors[id] || []) {
          if (result[nb] === 6 || result[nb] === 8) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) break;
    }
    if (ok) return result;
  }
  return result;
}

export function createExpandedArchipelagoTiles(
  scenario: ScenarioId,
  mapMode: 'standard' | 'random',
  mapSeed?: number,
): {
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  harbors: Harbor[];
  robberHexId: number;
  pirateHexId: number;
  fogNumberPool: number[];
} {
  const rng = mapSeed !== undefined ? createSeededRng(mapSeed) : Math.random;
  const { hexCoords, vertices, edges, hexNeighbors } = buildBoardTopologyForCoords(EXPANDED_AXIAL_COORDS);
  const coordToId = new Map<string, number>();
  for (const hc of hexCoords) {
    coordToId.set(`${hc.q},${hc.r}`, hc.id);
  }

  const hexCoordById = new Map<number, { q: number; r: number }>();
  for (const hc of hexCoords) {
    hexCoordById.set(hc.id, { q: hc.q, r: hc.r });
  }

  const axialDistance = (q1: number, r1: number, q2: number, r2: number): number =>
    (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;

  const isInteriorHex = (hid: number): boolean => (hexNeighbors[hid]?.length ?? 0) === 6;

  // Procedurally grow a connected island of targetSize inside allowed interior candidate IDs
  const growConnectedIsland = (
    candidates: Array<[number, number]>,
    anchor: [number, number],
    targetSize: number,
    fallback: Array<[number, number]>,
  ): Array<[number, number]> => {
    const candidateIds = new Set<number>();
    for (const [q, r] of candidates) {
      const hid = coordToId.get(`${q},${r}`);
      if (hid !== undefined && isInteriorHex(hid)) candidateIds.add(hid);
    }
    const anchorId = coordToId.get(`${anchor[0]},${anchor[1]}`);
    if (anchorId === undefined || !candidateIds.has(anchorId) || candidateIds.size < targetSize) {
      return fallback;
    }

    const picked = new Set<number>([anchorId]);
    while (picked.size < targetSize) {
      const frontier = new Set<number>();
      for (const hid of picked) {
        for (const nb of hexNeighbors[hid] || []) {
          if (!picked.has(nb) && candidateIds.has(nb)) frontier.add(nb);
        }
      }
      if (frontier.size === 0) break;
      const arr = Array.from(frontier);
      picked.add(arr[Math.floor(rng() * arr.length)]);
    }
    if (picked.size < targetSize) return fallback;

    return Array.from(picked).map((hid) => {
      const c = hexCoordById.get(hid)!;
      return [c.q, c.r] as [number, number];
    });
  };

  const terrainsByHex: Record<number, TerrainType> = {};
  const islandGroupByHex: Record<number, number> = {};
  const foggedByHex: Record<number, boolean> = {};

  for (const hc of hexCoords) {
    terrainsByHex[hc.id] = 'sea';
    islandGroupByHex[hc.id] = -1;
    foggedByHex[hc.id] = false;
  }

  const pendingGroups: Array<{
    coords: Array<[number, number]>;
    groupId: number;
    terrainPool: TerrainType[];
    fog: boolean;
  }> = [];

  const registerGroup = (
    coords: Array<[number, number]>,
    groupId: number,
    terrainPool: TerrainType[],
    fog = false,
  ) => {
    coords.forEach(([q, r]) => {
      const hid = coordToId.get(`${q},${r}`);
      if (hid === undefined) return;
      islandGroupByHex[hid] = groupId;
      foggedByHex[hid] = fog;
    });
    pendingGroups.push({ coords, groupId, terrainPool, fog });
  };

  let fogNumberPool: number[] = [];

  if (scenario === 'new_shores') {
    const defaultMainCoords: Array<[number, number]> = [
      [-2, -2], [-1, -2], [0, -2],
      [-3, -1], [-2, -1], [-1, -1], [0, -1],
      [-3, 0], [-2, 0], [-1, 0], [0, 0],
      [-4, 1], [-3, 1], [-2, 1], [-1, 1],
      [-4, 2], [-3, 2], [-2, 2],
    ];
    const mainZoneCoords: Array<[number, number]> = hexCoords
      .filter((h) => h.r >= -2 && h.r <= 2 && h.q + h.r / 2 <= 0.0 && isInteriorHex(h.id))
      .map((h) => [h.q, h.r]);
    const mainCoords =
      mapMode === 'random'
        ? growConnectedIsland(mainZoneCoords, [-2, 0], 18, defaultMainCoords)
        : defaultMainCoords;

    const mainTerrains: TerrainType[] = [
      'forest', 'fields', 'mountains',
      'hills', 'pasture', 'forest', 'hills',
      'fields', 'desert', 'pasture', 'mountains',
      'forest', 'fields', 'hills', 'pasture',
      'mountains', 'forest', 'fields',
    ];
    registerGroup(mainCoords, 0, mainTerrains);

    // Outer islands: in random mode, pick varied connected positions on the east archipelago
    // keeping >= 2 hexes (dist >= 3) around Gold islands and >= 1 sea hex (dist >= 2) around normal island
    const neGoldFallback: Array<[number, number]> = [[3, -3], [4, -3]];
    const eastNormalFallback: Array<[number, number]> = [[2, 0], [3, 0]];
    const seGoldFallback: Array<[number, number]> = [[0, 3], [1, 3], [2, 3]];

    let neGoldCoords = neGoldFallback;
    let eastNormalCoords = eastNormalFallback;
    let seGoldCoords = seGoldFallback;

    if (mapMode === 'random') {
      const neVariants: Array<Array<[number, number]>> = [
        [[3, -3], [4, -3]],
        [[4, -3], [5, -3]],
        [[3, -3], [4, -2]],
      ];
      const eastVariants: Array<Array<[number, number]>> = [
        [[2, 0], [3, 0]],
        [[2, 0], [2, -1]],
        [[2, 0], [1, 1]],
        [[3, -1], [3, 0]],
      ];
      const seVariants: Array<Array<[number, number]>> = [
        [[0, 3], [1, 3], [2, 3]],
        [[-1, 3], [0, 3], [1, 3]],
        [[0, 3], [1, 2], [2, 2]],
      ];
      const minDistBetween = (a: Array<[number, number]>, b: Array<[number, number]>) => {
        let best = 99;
        for (const [q1, r1] of a) {
          for (const [q2, r2] of b) {
            const d = axialDistance(q1, r1, q2, r2);
            if (d < best) best = d;
          }
        }
        return best;
      };
      const validTriples: Array<{ ne: Array<[number, number]>; east: Array<[number, number]>; se: Array<[number, number]> }> = [];
      for (const ne of neVariants) {
        for (const east of eastVariants) {
          for (const se of seVariants) {
            const ok =
              minDistBetween(east, mainCoords) >= 2 &&
              minDistBetween(ne, mainCoords) >= 3 &&
              minDistBetween(ne, east) >= 3 &&
              minDistBetween(ne, se) >= 3 &&
              minDistBetween(se, mainCoords) >= 3 &&
              minDistBetween(se, east) >= 3;
            if (ok) validTriples.push({ ne, east, se });
          }
        }
      }
      if (validTriples.length > 0) {
        const chosen = validTriples[Math.floor(rng() * validTriples.length)];
        neGoldCoords = chosen.ne;
        eastNormalCoords = chosen.east;
        seGoldCoords = chosen.se;
      }
    }

    registerGroup(neGoldCoords, 1, ['gold', 'mountains']);
    registerGroup(eastNormalCoords, 2, ['pasture', 'forest']);
    registerGroup(seGoldCoords, 3, ['gold', 'fields', 'hills']);
  } else if (scenario === 'four_islands') {
    const defaultNw: Array<[number, number]> = [[-1, -3], [0, -3], [-2, -2], [-1, -2], [-2, -1], [-1, -1]];
    const defaultNe: Array<[number, number]> = [[2, -3], [3, -3], [2, -2], [3, -2], [4, -2], [2, -1]];
    const defaultSw: Array<[number, number]> = [[-3, 1], [-2, 1], [-4, 2], [-3, 2], [-4, 3], [-3, 3]];
    const defaultSe: Array<[number, number]> = [[0, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3]];

    let nwCoords = defaultNw;
    let neCoords = defaultNe;
    let swCoords = defaultSw;
    let seCoords = defaultSe;

    if (mapMode === 'random') {
      const nwZone: Array<[number, number]> = hexCoords
        .filter((h) => h.r >= -3 && h.r <= -1 && h.q + h.r / 2 <= -1.5 && isInteriorHex(h.id))
        .map((h) => [h.q, h.r]);
      const neZone: Array<[number, number]> = hexCoords
        .filter((h) => h.r >= -3 && h.r <= -1 && h.q + h.r / 2 >= 0.5 && isInteriorHex(h.id))
        .map((h) => [h.q, h.r]);
      const swZone: Array<[number, number]> = hexCoords
        .filter((h) => h.r >= 1 && h.r <= 3 && h.q + h.r / 2 <= -1.5 && isInteriorHex(h.id))
        .map((h) => [h.q, h.r]);
      const seZone: Array<[number, number]> = hexCoords
        .filter((h) => h.r >= 1 && h.r <= 3 && h.q + h.r / 2 >= 0.5 && isInteriorHex(h.id))
        .map((h) => [h.q, h.r]);

      nwCoords = growConnectedIsland(nwZone, [-1, -2], 6, defaultNw);
      neCoords = growConnectedIsland(neZone, [3, -2], 6, defaultNe);
      swCoords = growConnectedIsland(swZone, [-3, 2], 6, defaultSw);
      seCoords = growConnectedIsland(seZone, [1, 2], 6, defaultSe);

      // Ensure Gold-bearing islands (NE & SE) still have at least 1 hex with dist >= 3 from all other islands
      const hasSafeGoldHex = (target: Array<[number, number]>, others: Array<Array<[number, number]>>) =>
        target.some(([q1, r1]) =>
          others.every((grp) => grp.every(([q2, r2]) => axialDistance(q1, r1, q2, r2) >= 3)),
        );
      if (!hasSafeGoldHex(neCoords, [nwCoords, swCoords, seCoords])) neCoords = defaultNe;
      if (!hasSafeGoldHex(seCoords, [nwCoords, neCoords, swCoords])) seCoords = defaultSe;
    }

    registerGroup(nwCoords, 0, ['forest', 'hills', 'pasture', 'fields', 'mountains', 'forest']);
    registerGroup(neCoords, 1, ['fields', 'mountains', 'pasture', 'hills', 'gold', 'forest']);
    registerGroup(swCoords, 2, ['mountains', 'pasture', 'forest', 'hills', 'fields', 'desert']);
    registerGroup(seCoords, 3, ['forest', 'hills', 'fields', 'gold', 'pasture', 'mountains']);
  } else {
    // fog_islands: West Island + East Island + Central Uncharted Fog Reef (11 tiles)
    registerGroup(
      [[-1, -2], [-2, -1], [-1, -1], [-3, 0], [-2, 0], [-1, 0], [-3, 1], [-2, 1], [-3, 2]],
      0,
      ['forest', 'hills', 'pasture', 'fields', 'mountains', 'forest', 'fields', 'hills', 'pasture'],
    );
    registerGroup(
      [[3, -2], [2, -1], [3, -1], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [1, 2]],
      1,
      ['mountains', 'pasture', 'forest', 'fields', 'hills', 'desert', 'forest', 'mountains', 'fields'],
    );
    const fogCoords: Array<[number, number]> = [
      [0, -3], [1, -3], [0, -2], [1, -2],
      [0, -1], [1, -1], [0, 0], [-1, 1],
      [0, 1], [-1, 2], [0, 2],
    ];
    // Fog tiles always shuffled secretly
    const fogTerrains = shuffleArray<TerrainType>(
      ['gold', 'gold', 'forest', 'forest', 'hills', 'pasture', 'fields', 'mountains', 'desert', 'sea', 'sea'],
      rng,
    );
    fogCoords.forEach(([q, r], idx) => {
      const hid = coordToId.get(`${q},${r}`);
      if (hid === undefined) return;
      terrainsByHex[hid] = fogTerrains[idx];
      islandGroupByHex[hid] = 2;
      foggedByHex[hid] = true;
    });
    fogNumberPool = shuffleArray([3, 4, 5, 6, 8, 9, 10, 11, 12, 4, 9], rng);
  }

  // Assign terrains to registered islands while guaranteeing Gold Fields stay >= 2 tiles (dist >= 3) from other islands
  for (const grp of pendingGroups) {
    const orderedPool = mapMode === 'random' ? shuffleArray(grp.terrainPool, rng) : [...grp.terrainPool];
    const goldCount = orderedPool.filter((t) => t === 'gold').length;
    if (goldCount === 0) {
      grp.coords.forEach(([q, r], idx) => {
        const hid = coordToId.get(`${q},${r}`);
        if (hid === undefined) return;
        terrainsByHex[hid] = orderedPool[idx % orderedPool.length];
      });
      continue;
    }

    const otherIslandCoords: Array<{ q: number; r: number }> = [];
    for (const [hidStr, gid] of Object.entries(islandGroupByHex)) {
      if (gid >= 0 && gid !== grp.groupId) {
        const c = hexCoordById.get(Number(hidStr));
        if (c) otherIslandCoords.push(c);
      }
    }

    const minDistToOther = (q: number, r: number): number => {
      if (otherIslandCoords.length === 0) return 99;
      let best = 99;
      for (const o of otherIslandCoords) {
        const d = axialDistance(q, r, o.q, o.r);
        if (d < best) best = d;
      }
      return best;
    };

    const coordEntries = grp.coords.map(([q, r], idx) => ({
      q,
      r,
      idx,
      hid: coordToId.get(`${q},${r}`),
      safeForGold: minDistToOther(q, r) >= 3,
    }));

    if (mapMode === 'standard') {
      const assigned = coordEntries.map((_, idx) => orderedPool[idx % orderedPool.length]);
      for (let i = 0; i < coordEntries.length; i++) {
        if (assigned[i] === 'gold' && !coordEntries[i].safeForGold) {
          const safeIdx = coordEntries.findIndex((c, j) => c.safeForGold && assigned[j] !== 'gold');
          if (safeIdx !== -1) {
            [assigned[i], assigned[safeIdx]] = [assigned[safeIdx], assigned[i]];
          }
        }
      }
      coordEntries.forEach((entry, idx) => {
        if (entry.hid !== undefined) terrainsByHex[entry.hid] = assigned[idx];
      });
    } else {
      const safeSlots = shuffleArray(coordEntries.filter((c) => c.safeForGold), rng);
      const remainingSlots = coordEntries.filter(
        (c) => !safeSlots.slice(0, goldCount).some((s) => s.idx === c.idx),
      );
      const nonGoldTerrains = shuffleArray(orderedPool.filter((t) => t !== 'gold'), rng);

      for (let g = 0; g < goldCount && g < safeSlots.length; g++) {
        const slot = safeSlots[g];
        if (slot.hid !== undefined) terrainsByHex[slot.hid] = 'gold';
      }
      remainingSlots.forEach((slot, idx) => {
        if (slot.hid !== undefined) {
          terrainsByHex[slot.hid] = nonGoldTerrains[idx % nonGoldTerrains.length];
        }
      });
    }
  }

  // Assign numbers only to initially visible (non-fogged) productive land hexes
  const visibleIds = hexCoords.map((h) => h.id).filter((id) => !foggedByHex[id]);
  const numberPool = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
    4, 5, 6, 8, 9, 10, 3, 11,
  ];
  const assignedNumbers = assignBalancedNumbers(visibleIds, terrainsByHex, hexNeighbors, numberPool, rng);

  let robberHexId = -1;
  let pirateHexId = -1;
  for (const hc of hexCoords) {
    if (!foggedByHex[hc.id] && terrainsByHex[hc.id] === 'desert' && robberHexId === -1) {
      robberHexId = hc.id;
    }
    if (!foggedByHex[hc.id] && terrainsByHex[hc.id] === 'sea' && pirateHexId === -1) {
      if (Math.abs(hc.q) >= 2 || Math.abs(hc.r) >= 2) {
        pirateHexId = hc.id;
      }
    }
  }
  if (robberHexId === -1) {
    robberHexId = hexCoords.find((h) => !foggedByHex[h.id] && terrainsByHex[h.id] !== 'sea')?.id ?? 0;
  }
  if (pirateHexId === -1) {
    pirateHexId = hexCoords.find((h) => !foggedByHex[h.id] && terrainsByHex[h.id] === 'sea')?.id ?? 0;
  }

  const hexes: HexTile[] = hexCoords.map((hc) => ({
    ...hc,
    terrain: terrainsByHex[hc.id],
    numberToken: foggedByHex[hc.id] ? null : (assignedNumbers[hc.id] ?? null),
    islandGroupId: islandGroupByHex[hc.id],
    fogged: foggedByHex[hc.id],
  }));

  // Place 10 harbors along land-sea coastal edges around visible islands
  const landSeaEdges: Array<{ edge: Edge; landHex: HexTile; seaHex: HexTile }> = [];
  for (const edge of Object.values(edges)) {
    if (edge.hexIds.length !== 2) continue;
    const hA = hexes[edge.hexIds[0]];
    const hB = hexes[edge.hexIds[1]];
    const aLand = !hA.fogged && hA.terrain !== 'sea';
    const bLand = !hB.fogged && hB.terrain !== 'sea';
    const aSea = !hA.fogged && hA.terrain === 'sea';
    const bSea = !hB.fogged && hB.terrain === 'sea';
    if (aLand && bSea) landSeaEdges.push({ edge, landHex: hA, seaHex: hB });
    else if (bLand && aSea) landSeaEdges.push({ edge, landHex: hB, seaHex: hA });
  }
  landSeaEdges.sort((a, b) => Math.atan2(a.edge.z, a.edge.x) - Math.atan2(b.edge.z, b.edge.x));

  const baseExpandedHarborTypes: HarborType[] = [
    'generic', 'wood', 'generic', 'brick', 'wool',
    'generic', 'grain', 'ore', 'generic', 'generic',
  ];
  const EXPANDED_HARBOR_TYPES =
    mapMode === 'random' ? shuffleArray(baseExpandedHarborTypes, rng) : baseExpandedHarborTypes;
  const harbors: Harbor[] = [];
  const usedHarborVertices = new Set<string>();
  const step = Math.max(1, Math.floor(landSeaEdges.length / EXPANDED_HARBOR_TYPES.length));

  let hIdx = 0;
  for (let i = 0; i < landSeaEdges.length && hIdx < EXPANDED_HARBOR_TYPES.length; i += step) {
    const candidate = landSeaEdges[i];
    if (usedHarborVertices.has(candidate.edge.v1) || usedHarborVertices.has(candidate.edge.v2)) continue;
    usedHarborVertices.add(candidate.edge.v1);
    usedHarborVertices.add(candidate.edge.v2);

    const type = EXPANDED_HARBOR_TYPES[hIdx];
    const outwardAngle = Math.atan2(
      candidate.seaHex.z - candidate.landHex.z,
      candidate.seaHex.x - candidate.landHex.x,
    );
    vertices[candidate.edge.v1].harbor = type;
    vertices[candidate.edge.v2].harbor = type;

    harbors.push({
      id: hIdx,
      type,
      edgeId: candidate.edge.id,
      vertexIds: [candidate.edge.v1, candidate.edge.v2],
      x: candidate.edge.x + Math.cos(outwardAngle) * 0.68,
      z: candidate.edge.z + Math.sin(outwardAngle) * 0.68,
      outwardAngle,
    });
    hIdx++;
  }

  return { hexes, vertices, edges, harbors, robberHexId, pirateHexId, fogNumberPool };
}

export function shuffleArray<T>(arr: T[], rng: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
