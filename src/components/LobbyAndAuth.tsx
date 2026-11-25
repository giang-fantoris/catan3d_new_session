import React, { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  DoorOpen,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shuffle,
  UserPlus,
  Users,
} from 'lucide-react';
import { generateRandomSeed } from '../game/hexMath';
import { playerColorHex, t } from '../i18n/translations';
import { GameMode, Language, MapMode, PlayerCount, RoomInfo, RoomSummary, ScenarioId, UserAccount } from '../types/catan';

interface AuthPanelProps {
  lang: Language;
  onAuthSuccess: (token: string, user: UserAccount) => void;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ lang, onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mapError = (code: string) => {
    switch (code) {
      case 'invalidUsername':
        return t(lang, 'authInvalidUsername');
      case 'invalidPassword':
        return t(lang, 'authInvalidPassword');
      case 'usernameTaken':
        return t(lang, 'authUsernameTaken');
      case 'invalidCredentials':
        return t(lang, 'authInvalidCredentials');
      default:
        return code;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body =
        mode === 'register'
          ? { username, displayName, password }
          : { username, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(mapError(data.error || 'Error'));
        return;
      }
      onAuthSuccess(data.token, data.user);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
            mode === 'register'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>{t(lang, 'register')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
            mode === 'login'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>{t(lang, 'login')}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
            {t(lang, 'usernameLabel')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t(lang, 'usernameHint')}
            autoComplete="username"
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
          />
        </div>

        {mode === 'register' && (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              {t(lang, 'displayNameLabel')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t(lang, 'humanPlayer')}
              maxLength={24}
              className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
            {t(lang, 'passwordLabel')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(lang, 'passwordHint')}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-bold">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-sm cursor-pointer"
        >
          {mode === 'register' ? t(lang, 'register') : t(lang, 'login')}
        </button>
      </form>
    </div>
  );
};

interface OnlineRoomsPanelProps {
  lang: Language;
  user: UserAccount;
  token: string;
  rooms: RoomSummary[];
  onRefreshRooms: () => void;
  onEnterRoom: (room: RoomInfo) => void;
  onLogout: () => void;
}

export const OnlineRoomsPanel: React.FC<OnlineRoomsPanelProps> = ({
  lang,
  user,
  token,
  rooms,
  onRefreshRooms,
  onEnterRoom,
  onLogout,
}) => {
  const [roomName, setRoomName] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('basic');
  const [scenario, setScenario] = useState<ScenarioId>('new_shores');
  const [maxPlayers, setMaxPlayers] = useState<PlayerCount>(4);
  const [mapMode, setMapMode] = useState<MapMode>('standard');
  const [mapSeed, setMapSeed] = useState<number>(() => generateRandomSeed());
  const [fillWithAI, setFillWithAI] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleGameModeChange = (nextMode: GameMode) => {
    setGameMode(nextMode);
    if (nextMode === 'basic' && maxPlayers > 4) {
      setMaxPlayers(4);
    }
  };

  const mapRoomError = (err: string) => {
    if (err === 'roomNotFound') return t(lang, 'roomNotFound');
    if (err === 'roomAlreadyStarted') return t(lang, 'roomAlreadyStarted');
    if (err === 'roomFull') return t(lang, 'roomFull');
    return err;
  };

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: roomName,
          gameMode,
          scenario,
          maxPlayers,
          mapMode,
          mapSeed: mapMode === 'random' ? mapSeed : undefined,
          fillWithAI,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(mapRoomError(data.error || 'Error'));
        return;
      }
      onEnterRoom(data.room);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (codeToJoin: string) => {
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(clean)}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(mapRoomError(data.error || 'Error'));
        return;
      }
      onEnterRoom(data.room);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Signed-in User Banner */}
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
            {user.displayName}{' '}
            <span className="font-semibold text-slate-500 dark:text-slate-400">@{user.username}</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {t(lang, 'accountStats', { wins: user.wins, games: user.gamesPlayed })}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          aria-label={t(lang, 'logout')}
          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t(lang, 'logout')}</span>
        </button>
      </div>

      {/* Create Room Box */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
        <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {t(lang, 'createRoom')}
        </div>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder={`${t(lang, 'roomNameLabel')}...`}
          maxLength={32}
          className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
        />
        <div className="grid grid-cols-2 gap-1.5">
          {(['basic', 'expanded'] as const).map((gm) => (
            <button
              key={gm}
              type="button"
              onClick={() => handleGameModeChange(gm)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                gameMode === gm
                  ? gm === 'expanded'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              {t(lang, gm === 'basic' ? 'basicMode' : 'expandedMode')}
            </button>
          ))}
        </div>
        {gameMode === 'expanded' && (
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ['new_shores', 'scenarioNewShores'],
                ['four_islands', 'scenarioFourIslands'],
                ['fog_islands', 'scenarioFogIslands'],
              ] as const
            ).map(([scId, scKey]) => (
              <button
                key={scId}
                type="button"
                onClick={() => setScenario(scId)}
                className={`py-1 px-1 rounded-lg text-[10px] font-bold cursor-pointer truncate ${
                  scenario === scId
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {t(lang, scKey)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <div className={`grid gap-1 ${gameMode === 'expanded' ? 'grid-cols-4' : 'grid-cols-2'}`}>
            {(gameMode === 'expanded' ? ([3, 4, 5, 6] as const) : ([3, 4] as const)).map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setMaxPlayers(cnt)}
                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                  maxPlayers === cnt
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {cnt}P
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(['standard', 'random'] as const).map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => setMapMode(mm)}
                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer truncate px-1 ${
                  mapMode === mm
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {mm === 'standard' ? (lang === 'vi' ? 'Chuẩn' : 'Standard') : (lang === 'vi' ? 'Ngẫu nhiên' : 'Random')}
              </button>
            ))}
          </div>
        </div>
        {mapMode === 'random' && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {t(lang, 'mapSeedLabel')}: <span className="text-slate-900 dark:text-white">#{mapSeed}</span>
            </span>
            <button
              type="button"
              onClick={() => setMapSeed(generateRandomSeed())}
              className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <Shuffle className="w-3 h-3" />
              <span>{t(lang, 'rerollMapBtn')}</span>
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={fillWithAI}
            onChange={(e) => setFillWithAI(e.target.checked)}
            className="w-4 h-4 accent-blue-600 rounded"
          />
          <span>{t(lang, 'fillWithAILabel')}</span>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={handleCreate}
          className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'createRoom')}</span>
        </button>
      </div>

      {/* Join by Code */}
      <div className="flex gap-2">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder={t(lang, 'roomCodePlaceholder')}
          maxLength={6}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
        />
        <button
          type="button"
          disabled={busy || joinCode.trim().length < 4}
          onClick={() => handleJoin(joinCode)}
          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
        >
          <DoorOpen className="w-3.5 h-3.5" />
          <span>{t(lang, 'joinRoom')}</span>
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Open Rooms List */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t(lang, 'openRoomsTitle')}
          </span>
          <button
            type="button"
            onClick={onRefreshRooms}
            className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t(lang, 'refreshRooms')}</span>
          </button>
        </div>
        <div className="max-h-36 overflow-y-auto space-y-1.5">
          {rooms.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center bg-slate-100 dark:bg-slate-800/60 rounded-lg">
              {t(lang, 'noOpenRooms')}
            </div>
          ) : (
            rooms.map((r) => (
              <div
                key={r.code}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 dark:text-white truncate">{r.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span>#{r.code}</span>
                    <span>·</span>
                    <span>
                      {r.humanCount}/{r.maxPlayers} <Users className="w-3 h-3 inline" />
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                        r.gameMode === 'expanded'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {r.gameMode === 'expanded' ? 'Expanded' : 'Basic'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleJoin(r.code)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shrink-0"
                >
                  {t(lang, 'joinRoom')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface RoomLobbyModalProps {
  lang: Language;
  room: RoomInfo;
  user: UserAccount;
  onToggleReady: () => void;
  onRerollMap?: () => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
}

export const RoomLobbyOverlay: React.FC<RoomLobbyModalProps> = ({
  lang,
  room,
  user,
  onToggleReady,
  onRerollMap,
  onStartMatch,
  onLeaveRoom,
  onSendChat,
}) => {
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState('');
  const isHost = room.hostUserId === user.id;
  const mySeat = room.seats.find((s) => s.userId === user.id);
  const allReady = room.seats.every((s) => s.userId === room.hostUserId || s.ready);
  const enoughPlayers = room.fillWithAI ? room.seats.length >= 1 : room.seats.length >= 3;
  const canStart = isHost && allReady && enoughPlayers;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText);
    setChatText('');
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[90vh] overflow-y-auto">
        {/* Left: Room Info & Seats */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{room.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {t(lang, 'roomCodeLabel')}:
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-orange-600 text-white font-extrabold text-xs tracking-widest">
                  {room.code}
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? t(lang, 'copied') : t(lang, 'copyCode')}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                    room.gameMode === 'expanded'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {t(lang, room.gameMode === 'expanded' ? 'expandedMode' : 'basicMode')}
                </span>
                {room.gameMode === 'expanded' && (
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                    {t(
                      lang,
                      room.scenario === 'four_islands'
                        ? 'scenarioFourIslands'
                        : room.scenario === 'fog_islands'
                        ? 'scenarioFogIslands'
                        : 'scenarioNewShores',
                    )}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold tabular-nums">
                  {room.mapMode === 'random'
                    ? `${lang === 'vi' ? 'Ngẫu nhiên' : 'Random'}${room.mapSeed ? ` #${room.mapSeed}` : ''}`
                    : lang === 'vi'
                    ? 'Bản đồ chuẩn'
                    : 'Standard'}
                </span>
                {isHost && onRerollMap && (
                  <button
                    type="button"
                    onClick={onRerollMap}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>{t(lang, 'generateRandomMap')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: room.maxPlayers }, (_, idx) => {
              const seat = room.seats[idx];
              if (!seat) {
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-400 flex items-center justify-between"
                  >
                    <span>Seat {idx + 1}</span>
                    <span>{room.fillWithAI ? t(lang, 'botSeat') : '—'}</span>
                  </div>
                );
              }
              const seatIsHost = seat.userId === room.hostUserId;
              return (
                <div
                  key={seat.seatIndex}
                  className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded-sm border border-slate-900/20 shrink-0"
                      style={{ backgroundColor: playerColorHex(seat.color) }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                        <span>{seat.displayName}</span>
                        {seatIsHost && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                      {seat.username && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">@{seat.username}</div>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      seat.ready
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {seatIsHost ? t(lang, 'hostBadge') : seat.ready ? t(lang, 'ready') : t(lang, 'notReady')}
                  </span>
                </div>
              );
            })}
          </div>

          {!enoughPlayers && (
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {t(lang, 'needMorePlayers')}
            </div>
          )}
          {enoughPlayers && !allReady && (
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {t(lang, 'waitingAllReady')}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {isHost ? (
              <button
                type="button"
                disabled={!canStart}
                onClick={onStartMatch}
                className="flex-1 py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-extrabold text-sm cursor-pointer disabled:cursor-not-allowed"
              >
                {t(lang, 'startRoomMatch')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleReady}
                className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-sm cursor-pointer ${
                  mySeat?.ready
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {mySeat?.ready ? t(lang, 'unreadyBtn') : t(lang, 'toggleReady')}
              </button>
            )}
            <button
              type="button"
              onClick={onLeaveRoom}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-600 hover:text-white text-slate-800 dark:text-slate-200 font-bold text-sm cursor-pointer"
            >
              {t(lang, 'leaveRoom')}
            </button>
          </div>
        </div>

        {/* Right: Room Live Chat */}
        <div className="flex flex-col h-72 md:h-auto bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t(lang, 'roomChatTitle')}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-2 pr-1">
            {room.chat.map((m) => (
              <div key={m.id} className="text-xs leading-snug">
                <span className="font-extrabold text-slate-900 dark:text-white">{m.senderName}: </span>
                <span className="text-slate-700 dark:text-slate-300">{m.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleChatSubmit} className="flex gap-1.5">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={t(lang, 'chatPlaceholder')}
              maxLength={200}
              className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-2 focus:outline-blue-600"
            />
            <button
              type="submit"
              aria-label={t(lang, 'sendChat')}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
