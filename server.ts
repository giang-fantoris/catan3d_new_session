import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  applyDisasterHex,
  applyPlagueHex,
  buildCity,
  buildRoad,
  buildSettlement,
  buildShip,
  buyDevCard,
  createNewGame,
  discardCards,
  endTurn,
  evaluateAIDomesticTrade,
  executeDomesticTrade,
  executeMaritimeTrade,
  executeSteal,
  finishSpecialBuildTurn,
  isValidDomesticTrade,
  moveRobber,
  moveShip,
  pickGoldResources,
  placeSetupRoad,
  placeSetupSettlement,
  playDisasterCard,
  playKnightCard,
  playMonopolyCard,
  playPlagueCard,
  playRoadBuildingCard,
  playYearOfPlentyCard,
  rollDice,
  runAIStep,
  sanitizeGameStateForViewer,
} from './src/game/catanEngine.ts';
import { ALL_RESOURCES, generateRandomSeed } from './src/game/hexMath.ts';
import {
  GameMode,
  GameState,
  MapMode,
  PlayerColor,
  PlayerCount,
  ResourceType,
  RoomChatMessage,
  RoomInfo,
  RoomSeat,
  RoomSummary,
  ScenarioId,
  TradeOffer,
  UserAccount,
} from './src/types/catan.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Ephemeral fallback secret stays strictly in process memory if SESSION_SECRET is unset
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEAT_COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'white', 'brown', 'green'];
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

// =========================================================================
// SQLITE PERSISTENT ACCOUNT STORE
// =========================================================================
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'catan.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  wins: number;
  games_played: number;
}

const stmtFindUserByUsername = db.prepare(
  'SELECT id, username, display_name, password_hash, password_salt, wins, games_played FROM users WHERE username = ?',
);
const stmtFindUserById = db.prepare(
  'SELECT id, username, display_name, wins, games_played FROM users WHERE id = ?',
);
const stmtInsertUser = db.prepare(
  'INSERT INTO users (id, username, display_name, password_hash, password_salt, wins, games_played, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
);
const stmtIncPlayed = db.prepare('UPDATE users SET games_played = games_played + 1 WHERE id = ?');
const stmtIncWin = db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?');

function rowToAccount(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'wins' | 'games_played'>): UserAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    wins: row.wins,
    gamesPlayed: row.games_played,
  };
}

function hashPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
  const actualBuf = Buffer.from(hashPassword(password, saltHex), 'hex');
  const expectedBuf = Buffer.from(expectedHashHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
}

function getAuthedUser(req: express.Request): UserAccount | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const uid = verifyToken(header.slice(7).trim());
  if (!uid) return null;
  const row = stmtFindUserById.get(uid) as Pick<UserRow, 'id' | 'username' | 'display_name' | 'wins' | 'games_played'> | undefined;
  return row ? rowToAccount(row) : null;
}

// =========================================================================
// MULTIPLAYER ROOMS & AUTHORITATIVE GAME ENGINE
// =========================================================================
interface ServerRoom {
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
  seats: RoomSeat[];
  chat: RoomChatMessage[];
  gameState: GameState | null;
  aiTimer: NodeJS.Timeout | null;
  statsRecorded: boolean;
  createdAt: number;
}

interface AuthedSocket extends WebSocket {
  userId?: string;
  roomCode?: string;
  isAlive?: boolean;
}

const rooms = new Map<string, ServerRoom>();
const roomSockets = new Map<string, Set<AuthedSocket>>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function toRoomSummary(room: ServerRoom): RoomSummary {
  const humanSeats = room.seats.filter((s) => !s.isAI && s.userId !== null);
  return {
    code: room.code,
    name: room.name,
    hostUserId: room.hostUserId,
    hostName: room.hostName,
    gameMode: room.gameMode,
    scenario: room.scenario,
    maxPlayers: room.maxPlayers,
    mapMode: room.mapMode,
    mapSeed: room.mapSeed,
    fillWithAI: room.fillWithAI,
    status: room.status,
    humanCount: humanSeats.length,
    connectedCount: humanSeats.filter((s) => s.connected).length,
  };
}

function toRoomInfoForUser(room: ServerRoom, userId: string): RoomInfo {
  const seat = room.seats.find((s) => s.userId === userId);
  const mySeatIndex = seat ? seat.seatIndex : null;
  return {
    ...toRoomSummary(room),
    seats: room.seats,
    chat: room.chat,
    mySeatIndex,
    gameState: room.gameState ? sanitizeGameStateForViewer(room.gameState, mySeatIndex) : null,
  };
}

function broadcastRoom(room: ServerRoom, extraEvent?: { type: string; payload?: unknown }) {
  const clients = roomSockets.get(room.code);
  if (!clients) return;
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN || !ws.userId) continue;
    ws.send(
      JSON.stringify({
        type: 'room:state',
        room: toRoomInfoForUser(room, ws.userId),
      }),
    );
    if (extraEvent) {
      ws.send(JSON.stringify(extraEvent));
    }
  }
}

function recordMatchStatsIfNeeded(room: ServerRoom) {
  if (!room.gameState || room.gameState.phase !== 'game_over' || room.statsRecorded) return;
  room.statsRecorded = true;
  room.status = 'finished';
  for (const seat of room.seats) {
    if (!seat.isAI && seat.userId) {
      stmtIncPlayed.run(seat.userId);
      if (room.gameState.winnerId === seat.seatIndex) {
        stmtIncWin.run(seat.userId);
      }
    }
  }
}

function clearRoomAITimer(room: ServerRoom) {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = null;
  }
}

function scheduleRoomAI(room: ServerRoom) {
  clearRoomAITimer(room);
  const state = room.gameState;
  if (!state || state.phase === 'title' || state.phase === 'game_over') return;

  const isDiscardAI =
    state.phase === 'discard' &&
    state.discardQueue.length > 0 &&
    state.players[state.discardQueue[0]]?.isAI;
  const isGoldPickAI =
    state.phase === 'gold_pick' &&
    state.pendingGoldPicks.length > 0 &&
    state.players[state.pendingGoldPicks[0].playerId]?.isAI;
  const activeAI = state.players[state.currentPlayerIndex]?.isAI;

  if (!isDiscardAI && !isGoldPickAI && !activeAI) return;

  const delay = state.phase === 'roll' ? 680 : 520;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (!room.gameState || room.gameState.phase === 'game_over') return;
    room.gameState = runAIStep(room.gameState);
    recordMatchStatsIfNeeded(room);
    broadcastRoom(room);
    scheduleRoomAI(room);
  }, delay);
}

function addSystemChat(room: ServerRoom, text: string) {
  room.chat = [
    ...room.chat.slice(-59),
    {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderName: 'System',
      text,
      timestamp: Date.now(),
    },
  ];
}

function isValidResource(val: unknown): val is ResourceType {
  return typeof val === 'string' && (ALL_RESOURCES as string[]).includes(val);
}

function handleGameAction(room: ServerRoom, userId: string, action: string, payload: Record<string, unknown>) {
  const state = room.gameState;
  if (!state || state.phase === 'game_over') return;

  const seat = room.seats.find((s) => s.userId === userId);
  if (!seat) return;
  const pid = seat.seatIndex;

  // Special non-active-turn actions: Discard queue, Gold pick queue & Domestic Trade response
  if (action === 'discard') {
    if (state.phase !== 'discard' || state.discardQueue[0] !== pid) return;
    const raw = (payload.selected || {}) as Record<string, unknown>;
    const clean: Partial<Record<ResourceType, number>> = {};
    for (const r of ALL_RESOURCES) {
      const n = Number(raw[r] ?? 0);
      if (Number.isInteger(n) && n >= 0) clean[r] = n;
    }
    const next = discardCards(state, pid, clean);
    if (next !== state) {
      room.gameState = next;
      broadcastRoom(room);
      scheduleRoomAI(room);
    }
    return;
  }

  if (action === 'pick_gold') {
    if (state.phase !== 'gold_pick' || state.pendingGoldPicks[0]?.playerId !== pid) return;
    const raw = (payload.selected || {}) as Record<string, unknown>;
    const clean: Partial<Record<ResourceType, number>> = {};
    for (const r of ALL_RESOURCES) {
      const n = Number(raw[r] ?? 0);
      if (Number.isInteger(n) && n >= 0) clean[r] = n;
    }
    const next = pickGoldResources(state, pid, clean);
    if (next !== state) {
      room.gameState = next;
      recordMatchStatsIfNeeded(room);
      broadcastRoom(room);
      scheduleRoomAI(room);
    }
    return;
  }

  if (action === 'respond_trade') {
    const pending = state.pendingTradeOffer;
    if (!pending || pending.toPlayerId !== pid) return;
    const accept = Boolean(payload.accept);
    if (accept && isValidDomesticTrade(state, pending)) {
      const next = executeDomesticTrade(state, pending);
      room.gameState = { ...next, pendingTradeOffer: null };
      addSystemChat(
        room,
        `${state.players[pending.toPlayerId].name} ⇄ ${state.players[pending.fromPlayerId].name}`,
      );
      broadcastRoom(room, { type: 'trade:notice', payload: { accepted: true, by: seat.displayName } });
    } else {
      room.gameState = { ...state, pendingTradeOffer: null };
      broadcastRoom(room, { type: 'trade:notice', payload: { accepted: false, by: seat.displayName } });
    }
    return;
  }

  if (action === 'cancel_trade') {
    const pending = state.pendingTradeOffer;
    if (!pending || pending.fromPlayerId !== pid) return;
    room.gameState = { ...state, pendingTradeOffer: null };
    broadcastRoom(room);
    return;
  }

  // All remaining actions require it to be this player's active turn
  if (state.currentPlayerIndex !== pid) return;

  let next = state;
  switch (action) {
    case 'setup_settlement': {
      if (typeof payload.vertexId === 'string') next = placeSetupSettlement(state, payload.vertexId);
      break;
    }
    case 'setup_road': {
      if (typeof payload.edgeId === 'string') {
        const pref =
          payload.preferredPieceType === 'ship'
            ? 'ship'
            : payload.preferredPieceType === 'road'
            ? 'road'
            : undefined;
        next = placeSetupRoad(state, payload.edgeId, pref);
      }
      break;
    }
    case 'roll': {
      next = rollDice(state);
      break;
    }
    case 'move_robber': {
      if (typeof payload.hexId === 'number' && Number.isInteger(payload.hexId)) {
        next = moveRobber(state, payload.hexId);
      }
      break;
    }
    case 'steal': {
      if (typeof payload.victimId === 'number' && Number.isInteger(payload.victimId)) {
        next = executeSteal(state, payload.victimId);
      }
      break;
    }
    case 'build_road': {
      if (typeof payload.edgeId === 'string') {
        const isFree = state.phase === 'road_building_1' || state.phase === 'road_building_2';
        next = buildRoad(state, payload.edgeId, isFree);
      }
      break;
    }
    case 'build_ship': {
      if (typeof payload.edgeId === 'string') {
        const isFree = state.phase === 'road_building_1' || state.phase === 'road_building_2';
        next = buildShip(state, payload.edgeId, isFree);
      }
      break;
    }
    case 'move_ship': {
      if (typeof payload.fromEdgeId === 'string' && typeof payload.toEdgeId === 'string') {
        next = moveShip(state, payload.fromEdgeId, payload.toEdgeId);
      }
      break;
    }
    case 'build_settlement': {
      if (typeof payload.vertexId === 'string') next = buildSettlement(state, payload.vertexId);
      break;
    }
    case 'build_city': {
      if (typeof payload.vertexId === 'string') next = buildCity(state, payload.vertexId);
      break;
    }
    case 'buy_dev': {
      next = buyDevCard(state);
      break;
    }
    case 'play_knight': {
      if (typeof payload.cardId === 'string') next = playKnightCard(state, payload.cardId);
      break;
    }
    case 'play_road_building': {
      if (typeof payload.cardId === 'string') next = playRoadBuildingCard(state, payload.cardId);
      break;
    }
    case 'play_year_of_plenty': {
      if (typeof payload.cardId === 'string' && isValidResource(payload.r1) && isValidResource(payload.r2)) {
        next = playYearOfPlentyCard(state, payload.cardId, payload.r1, payload.r2);
      }
      break;
    }
    case 'play_monopoly': {
      if (typeof payload.cardId === 'string' && isValidResource(payload.res)) {
        next = playMonopolyCard(state, payload.cardId, payload.res);
      }
      break;
    }
    case 'play_disaster': {
      if (typeof payload.cardId === 'string') {
        next = playDisasterCard(state, payload.cardId);
      }
      break;
    }
    case 'select_disaster_hex': {
      if (typeof payload.hexId === 'number' && Number.isInteger(payload.hexId)) {
        next = applyDisasterHex(state, payload.hexId);
      }
      break;
    }
    case 'play_plague': {
      if (typeof payload.cardId === 'string') {
        next = playPlagueCard(state, payload.cardId);
      }
      break;
    }
    case 'select_plague_hex': {
      if (typeof payload.hexId === 'number' && Number.isInteger(payload.hexId)) {
        next = applyPlagueHex(state, payload.hexId);
      }
      break;
    }
    case 'maritime_trade': {
      if (isValidResource(payload.give) && isValidResource(payload.receive)) {
        next = executeMaritimeTrade(state, payload.give, payload.receive);
      }
      break;
    }
    case 'propose_trade': {
      if (state.phase !== 'action') return;
      const toPlayerId = Number(payload.toPlayerId);
      if (!Number.isInteger(toPlayerId) || toPlayerId === pid || !state.players[toPlayerId]) return;
      const rawGive = (payload.give || {}) as Record<string, unknown>;
      const rawWant = (payload.want || {}) as Record<string, unknown>;
      const give: Partial<Record<ResourceType, number>> = {};
      const want: Partial<Record<ResourceType, number>> = {};
      for (const r of ALL_RESOURCES) {
        const g = Number(rawGive[r] ?? 0);
        const w = Number(rawWant[r] ?? 0);
        if (!Number.isInteger(g) || g < 0 || !Number.isInteger(w) || w < 0) return;
        if (g > 0) give[r] = g;
        if (w > 0) want[r] = w;
      }
      const offer: TradeOffer = { fromPlayerId: pid, toPlayerId, give, want };
      if (!isValidDomesticTrade(state, offer)) {
        broadcastRoom(room, { type: 'trade:notice', payload: { accepted: false, by: state.players[toPlayerId].name } });
        return;
      }
      if (state.players[toPlayerId].isAI) {
        const accepted = evaluateAIDomesticTrade(state, offer);
        if (accepted) {
          next = executeDomesticTrade(state, offer);
          room.gameState = next;
          broadcastRoom(room, { type: 'trade:notice', payload: { accepted: true, by: state.players[toPlayerId].name } });
        } else {
          broadcastRoom(room, { type: 'trade:notice', payload: { accepted: false, by: state.players[toPlayerId].name } });
        }
        return;
      }
      // Human target: set live pending trade offer so target player sees it on their own screen
      room.gameState = { ...state, pendingTradeOffer: offer };
      broadcastRoom(room);
      return;
    }
    case 'finish_special_build': {
      next = finishSpecialBuildTurn(state);
      break;
    }
    case 'end_turn': {
      next = endTurn(state);
      break;
    }
    default:
      return;
  }

  if (next !== state) {
    room.gameState = next;
    recordMatchStatsIfNeeded(room);
    broadcastRoom(room);
    scheduleRoomAI(room);
  }
}

// =========================================================================
// EXPRESS APP & REST API
// =========================================================================
const app = express();
app.use(express.json({ limit: '64kb' }));

app.post('/api/auth/register', (req, res) => {
  const { username, displayName, password } = (req.body || {}) as Record<string, unknown>;
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
    res.status(400).json({ error: 'invalidUsername' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    res.status(400).json({ error: 'invalidPassword' });
    return;
  }
  const cleanUsername = username.trim().toLowerCase();
  const cleanDisplay =
    typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim().slice(0, 24)
      : username.trim();

  const existing = stmtFindUserByUsername.get(cleanUsername) as UserRow | undefined;
  if (existing) {
    res.status(409).json({ error: 'usernameTaken' });
    return;
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  stmtInsertUser.run(id, cleanUsername, cleanDisplay, hash, salt, Date.now());

  const user: UserAccount = {
    id,
    username: cleanUsername,
    displayName: cleanDisplay,
    wins: 0,
    gamesPlayed: 0,
  };
  res.status(201).json({ token: signToken(id), user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = (req.body || {}) as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'invalidCredentials' });
    return;
  }
  const cleanUsername = username.trim().toLowerCase();
  const row = stmtFindUserByUsername.get(cleanUsername) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    res.status(401).json({ error: 'invalidCredentials' });
    return;
  }
  res.json({ token: signToken(row.id), user: rowToAccount(row) });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ user });
});

app.get('/api/rooms', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const list: RoomSummary[] = [];
  for (const room of rooms.values()) {
    const alreadySeated = room.seats.some((s) => s.userId === user.id);
    if (room.status === 'lobby' || alreadySeated) {
      list.push(toRoomSummary(room));
    }
  }
  list.sort((a, b) => (a.status === 'lobby' ? -1 : 1) - (b.status === 'lobby' ? -1 : 1));
  res.json({ rooms: list });
});

app.post('/api/rooms', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const body = (req.body || {}) as Record<string, unknown>;
  const gameMode: GameMode = body.gameMode === 'expanded' ? 'expanded' : 'basic';
  const scenario: ScenarioId =
    body.scenario === 'four_islands' || body.scenario === 'fog_islands' || body.scenario === 'new_shores'
      ? body.scenario
      : 'new_shores';
  const rawCount = Number(body.maxPlayers);
  const maxPlayers: PlayerCount =
    gameMode === 'expanded'
      ? ([3, 4, 5, 6].includes(rawCount) ? (rawCount as PlayerCount) : 4)
      : rawCount === 3
      ? 3
      : 4;
  const mapMode: MapMode = body.mapMode === 'random' ? 'random' : 'standard';
  const rawSeed = Number(body.mapSeed);
  const mapSeed =
    mapMode === 'random'
      ? Number.isFinite(rawSeed) && rawSeed > 0
        ? Math.floor(rawSeed)
        : generateRandomSeed()
      : undefined;
  const fillWithAI = body.fillWithAI !== false;
  const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 32) : '';
  const name = rawName || `${user.displayName}'s Island`;

  const code = generateRoomCode();
  const room: ServerRoom = {
    code,
    name,
    hostUserId: user.id,
    hostName: user.displayName,
    gameMode,
    scenario,
    maxPlayers,
    mapMode,
    mapSeed,
    fillWithAI,
    status: 'lobby',
    seats: [
      {
        seatIndex: 0,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        color: SEAT_COLORS[0],
        ready: true,
        connected: false,
        isAI: false,
      },
    ],
    chat: [],
    gameState: null,
    aiTimer: null,
    statsRecorded: false,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  res.status(201).json({ room: toRoomInfoForUser(room, user.id) });
});

app.post('/api/rooms/:code/join', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!ROOM_CODE_RE.test(code)) {
    res.status(400).json({ error: 'roomNotFound' });
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ error: 'roomNotFound' });
    return;
  }

  const existing = room.seats.find((s) => s.userId === user.id);
  if (existing) {
    res.json({ room: toRoomInfoForUser(room, user.id) });
    return;
  }

  if (room.status !== 'lobby') {
    res.status(409).json({ error: 'roomAlreadyStarted' });
    return;
  }
  if (room.seats.length >= room.maxPlayers) {
    res.status(409).json({ error: 'roomFull' });
    return;
  }

  const idx = room.seats.length;
  room.seats.push({
    seatIndex: idx,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    color: SEAT_COLORS[idx],
    ready: false,
    connected: false,
    isAI: false,
  });
  addSystemChat(room, `${user.displayName} joined.`);
  broadcastRoom(room);
  res.json({ room: toRoomInfoForUser(room, user.id) });
});

// =========================================================================
// HTTP + WEBSOCKET SERVER + VITE MIDDLEWARE
// =========================================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return;
  }
  const protocol = req.headers['sec-websocket-protocol'];
  if (!IS_PROD && (protocol === 'vite-hmr' || protocol === 'vite-ping')) {
    return;
  }
  socket.destroy();
});

function detachSocketFromRoom(ws: AuthedSocket) {
  if (!ws.roomCode) return;
  const code = ws.roomCode;
  ws.roomCode = undefined;
  const set = roomSockets.get(code);
  if (set) {
    set.delete(ws);
    if (set.size === 0) roomSockets.delete(code);
  }
  const room = rooms.get(code);
  if (!room || !ws.userId) return;
  const stillConnected = Array.from(set || []).some((c) => c.userId === ws.userId);
  const seat = room.seats.find((s) => s.userId === ws.userId);
  if (seat && !stillConnected) {
    seat.connected = false;
    broadcastRoom(room);
  }
}

wss.on('connection', (ws: AuthedSocket) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg: { type?: string; token?: string; code?: string; text?: string; action?: string; payload?: Record<string, unknown> };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === 'auth') {
      const uid = verifyToken(msg.token);
      if (!uid) {
        ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
        ws.close();
        return;
      }
      ws.userId = uid;
      ws.send(JSON.stringify({ type: 'authed', userId: uid }));
      return;
    }

    if (!ws.userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
      return;
    }

    if (msg.type === 'room:join' && typeof msg.code === 'string') {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', error: 'roomNotFound' }));
        return;
      }
      const seat = room.seats.find((s) => s.userId === ws.userId);
      if (!seat) {
        ws.send(JSON.stringify({ type: 'error', error: 'notInRoom' }));
        return;
      }
      detachSocketFromRoom(ws);
      ws.roomCode = code;
      if (!roomSockets.has(code)) roomSockets.set(code, new Set());
      roomSockets.get(code)!.add(ws);
      seat.connected = true;
      broadcastRoom(room);
      return;
    }

    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    if (msg.type === 'room:toggle_ready') {
      if (room.status !== 'lobby') return;
      const seat = room.seats.find((s) => s.userId === ws.userId);
      if (!seat || seat.userId === room.hostUserId) return;
      seat.ready = !seat.ready;
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'room:reroll_map') {
      if (room.status !== 'lobby' || room.hostUserId !== ws.userId) return;
      room.mapMode = 'random';
      room.mapSeed = generateRandomSeed();
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'room:start') {
      if (room.status !== 'lobby' || room.hostUserId !== ws.userId) return;
      const humanCount = room.seats.length;
      const allReady = room.seats.every((s) => s.userId === room.hostUserId || s.ready);
      if (!allReady) return;
      if (!room.fillWithAI && humanCount < 3) return;
      if (room.fillWithAI && humanCount < 1) return;

      // Fill empty seats with AI bots if enabled
      const targetTotal: PlayerCount = room.fillWithAI
        ? room.maxPlayers
        : (Math.max(3, Math.min(room.maxPlayers, humanCount)) as PlayerCount);
      while (room.seats.length < targetTotal) {
        const idx = room.seats.length;
        room.seats.push({
          seatIndex: idx,
          userId: null,
          username: null,
          displayName: `Bot ${idx}`,
          color: SEAT_COLORS[idx],
          ready: true,
          connected: true,
          isAI: true,
        });
      }

      const state = createNewGame({
        gameMode: room.gameMode,
        scenario: room.scenario,
        playerCount: targetTotal,
        humanCount: humanCount as 1 | 2 | 3 | 4 | 5 | 6,
        mapMode: room.mapMode,
        mapSeed: room.mapSeed,
        playerNames: room.seats.map((s) => s.displayName),
      });
      // Ensure seats map accurately to players[i].isAI
      state.players = state.players.map((p, i) => ({
        ...p,
        name: room.seats[i].displayName,
        isAI: room.seats[i].isAI,
      }));

      room.gameState = state;
      room.status = 'playing';
      room.statsRecorded = false;
      broadcastRoom(room);
      scheduleRoomAI(room);
      return;
    }

    if (msg.type === 'room:leave') {
      const code = room.code;
      const leavingSeatIdx = room.seats.findIndex((s) => s.userId === ws.userId);
      const leavingName = leavingSeatIdx >= 0 ? room.seats[leavingSeatIdx].displayName : '';
      detachSocketFromRoom(ws);

      if (room.status === 'lobby' && leavingSeatIdx >= 0) {
        room.seats.splice(leavingSeatIdx, 1);
        room.seats.forEach((s, i) => {
          s.seatIndex = i;
          s.color = SEAT_COLORS[i];
        });
        if (room.seats.length === 0) {
          clearRoomAITimer(room);
          rooms.delete(code);
          return;
        }
        if (room.hostUserId === ws.userId) {
          const nextHost = room.seats[0];
          room.hostUserId = nextHost.userId || '';
          room.hostName = nextHost.displayName;
          nextHost.ready = true;
        }
        addSystemChat(room, `${leavingName} left.`);
        broadcastRoom(room);
      }
      return;
    }

    if (msg.type === 'room:chat' && typeof msg.text === 'string') {
      const cleanText = msg.text.trim().slice(0, 200);
      if (!cleanText) return;
      const seat = room.seats.find((s) => s.userId === ws.userId);
      if (!seat) return;
      room.chat = [
        ...room.chat.slice(-59),
        {
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderName: seat.displayName,
          senderColor: seat.color,
          text: cleanText,
          timestamp: Date.now(),
        },
      ];
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'game:action' && typeof msg.action === 'string') {
      handleGameAction(room, ws.userId, msg.action, msg.payload || {});
    }
  });

  ws.on('close', () => {
    detachSocketFromRoom(ws);
  });
});

// Heartbeat to prune dead sockets cleanly
const heartbeatInterval = setInterval(() => {
  for (const client of wss.clients as Set<AuthedSocket>) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

// Prune stale empty rooms older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    const anyConnected = room.seats.some((s) => !s.isAI && s.connected);
    if (!anyConnected && room.createdAt < cutoff) {
      clearRoomAITimer(room);
      rooms.delete(code);
    }
  }
}, 15 * 60 * 1000);

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Catan 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
