import React, { useEffect, useState } from 'react';
import { Globe, Map as MapIcon, Moon, Play, Shuffle, Sun, Users, Wifi } from 'lucide-react';
import { generateRandomSeed } from '../game/hexMath';
import { t } from '../i18n/translations';
import { GameConfig, GameMode, Language, MapMode, PlayerCount, RoomInfo, RoomSummary, ScenarioId, UserAccount } from '../types/catan';
import { AuthPanel, OnlineRoomsPanel } from './LobbyAndAuth';

interface TitleScreenProps {
  lang: Language;
  darkMode: boolean;
  config: GameConfig;
  authUser: UserAccount | null;
  authToken: string | null;
  openRooms: RoomSummary[];
  onAuthSuccess: (token: string, user: UserAccount) => void;
  onLogout: () => void;
  onRefreshRooms: () => void;
  onEnterRoom: (room: RoomInfo) => void;
  onChangeConfig: (cfg: GameConfig) => void;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  lang,
  darkMode,
  config,
  authUser,
  authToken,
  openRooms,
  onAuthSuccess,
  onLogout,
  onRefreshRooms,
  onEnterRoom,
  onChangeConfig,
  onToggleLang,
  onToggleDark,
  onStart,
}) => {
  const [tab, setTab] = useState<'online' | 'offline'>('online');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (tab === 'offline' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart, tab]);

  const buildNames = (playerCount: PlayerCount, vsAI: boolean) =>
    Array.from({ length: playerCount }, (_, i) =>
      vsAI
        ? i === 0
          ? t(lang, 'humanPlayer')
          : `${t(lang, 'botPrefix')} ${i}`
        : `${lang === 'vi' ? 'Người chơi' : 'Player'} ${i + 1}`,
    );

  const setGameMode = (gameMode: GameMode) => {
    const playerCount: PlayerCount =
      gameMode === 'basic' && config.playerCount > 4 ? 4 : config.playerCount;
    const vsAI = config.humanCount === 1;
    const humanCount = (vsAI ? 1 : playerCount) as 1 | 2 | 3 | 4 | 5 | 6;
    onChangeConfig({
      ...config,
      gameMode,
      playerCount,
      humanCount,
      playerNames: buildNames(playerCount, vsAI),
    });
  };

  const setScenario = (scenario: ScenarioId) => {
    onChangeConfig({ ...config, scenario });
  };

  const setPlayers = (playerCount: PlayerCount) => {
    const vsAI = config.humanCount === 1;
    const humanCount = (vsAI ? 1 : playerCount) as 1 | 2 | 3 | 4 | 5 | 6;
    onChangeConfig({
      ...config,
      playerCount,
      humanCount,
      playerNames: buildNames(playerCount, vsAI),
    });
  };

  const setMode = (vsAI: boolean) => {
    const humanCount = (vsAI ? 1 : config.playerCount) as 1 | 2 | 3 | 4 | 5 | 6;
    onChangeConfig({
      ...config,
      humanCount,
      playerNames: buildNames(config.playerCount, vsAI),
    });
  };

  const setMapMode = (mapMode: MapMode) => {
    onChangeConfig({
      ...config,
      mapMode,
      mapSeed: mapMode === 'random' ? (config.mapSeed ?? generateRandomSeed()) : undefined,
    });
  };

  const handleGenerateRandomMap = () => {
    onChangeConfig({
      ...config,
      mapMode: 'random',
      mapSeed: generateRandomSeed(),
    });
  };

  const handleSeedInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    const parsed = Number(digits);
    if (Number.isFinite(parsed) && parsed > 0) {
      onChangeConfig({
        ...config,
        mapMode: 'random',
        mapSeed: parsed,
      });
    }
  };

  const playerCountOptions: PlayerCount[] =
    config.gameMode === 'expanded' ? [3, 4, 5, 6] : [3, 4];

  const scenarioOptions: Array<{ id: ScenarioId; key: string }> = [
    { id: 'new_shores', key: 'scenarioNewShores' },
    { id: 'four_islands', key: 'scenarioFourIslands' },
    { id: 'fog_islands', key: 'scenarioFogIslands' },
  ];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top right utility buttons */}
      <div className="flex justify-end gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleLang}
          aria-label="Toggle Language"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors cursor-pointer"
        >
          <Globe className="w-4 h-4 text-blue-600" />
          <span>{lang === 'vi' ? 'VI' : 'EN'}</span>
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-label={darkMode ? t(lang, 'lightMode') : t(lang, 'darkMode')}
          className="p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors cursor-pointer"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-700" />}
        </button>
      </div>

      {/* Left-aligned Setup Card leaving live 3D island clearly visible on right/center */}
      <div className="my-auto max-w-md w-full bg-white/95 dark:bg-slate-900/95 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 pointer-events-auto max-h-[82vh] overflow-y-auto">
        {/* Bespoke inline SVG Catan Emblem + Title Lockup */}
        <div className="flex items-center gap-4 mb-5">
          <svg viewBox="0 0 64 64" className="w-12 h-12 shrink-0" aria-hidden="true">
            <polygon
              points="32,3 58,18 58,46 32,61 6,46 6,18"
              fill="#EA580C"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            <polygon points="32,12 46,28 18,28" fill="#FEF3C7" />
            <rect x="22" y="28" width="20" height="16" fill="#FFFFFF" />
            <rect x="29" y="34" width="6" height="10" fill="#9A3412" />
            <path d="M12,48 Q32,42 52,48" stroke="#FDE68A" strokeWidth="3" fill="none" />
          </svg>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
              {t(lang, 'appTitle')}
            </h1>
            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
              {t(lang, 'appSubtitle')}
            </p>
          </div>
        </div>

        {/* Mode Switcher: Online Rooms vs Offline Solo */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('online')}
            className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'online'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>{t(lang, 'playOnline')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('offline')}
            className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'offline'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t(lang, 'playOffline')}</span>
          </button>
        </div>

        {tab === 'online' ? (
          authUser && authToken ? (
            <OnlineRoomsPanel
              lang={lang}
              user={authUser}
              token={authToken}
              rooms={openRooms}
              onRefreshRooms={onRefreshRooms}
              onEnterRoom={onEnterRoom}
              onLogout={onLogout}
            />
          ) : (
            <div className="space-y-3">
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 text-xs font-semibold">
                {t(lang, 'authRequired')}
              </div>
              <AuthPanel lang={lang} onAuthSuccess={onAuthSuccess} />
            </div>
          )
        ) : (
          /* Offline Configuration Controls */
          <div className="space-y-3.5">
            {/* Rule Set: Basic vs Expanded Mode */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                {t(lang, 'ruleSetLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['basic', 'expanded'] as const).map((gm) => (
                  <button
                    key={gm}
                    type="button"
                    onClick={() => setGameMode(gm)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      config.gameMode === gm
                        ? gm === 'expanded'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t(lang, gm === 'basic' ? 'basicMode' : 'expandedMode')}
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario selector (Expanded Mode only) */}
            {config.gameMode === 'expanded' && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                  {t(lang, 'scenarioLabel')}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {scenarioOptions.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setScenario(sc.id)}
                      className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-600 ${
                        config.scenario === sc.id
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t(lang, sc.key)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player count */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                <Users className="w-3.5 h-3.5" />
                {t(lang, 'playersLabel')}
              </label>
              <div className={`grid gap-2 ${playerCountOptions.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {playerCountOptions.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setPlayers(cnt)}
                    className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      config.playerCount === cnt
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t(lang, `players${cnt}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                {t(lang, 'modeLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode(true)}
                  className={`py-2.5 px-3 rounded-lg text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    config.humanCount === 1
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {t(lang, 'vsAI')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(false)}
                  className={`py-2.5 px-3 rounded-lg text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    config.humanCount > 1
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {t(lang, 'hotseat')}
                </button>
              </div>
            </div>

            {/* Map Layout */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                <MapIcon className="w-3.5 h-3.5" />
                {t(lang, 'mapLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'random'] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => setMapMode(mm)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      config.mapMode === mm
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t(lang, mm === 'standard' ? 'mapStandard' : 'mapRandom')}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateRandomMap}
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500"
                >
                  <Shuffle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(lang, 'generateRandomMap')}</span>
                </button>
                {config.mapMode === 'random' && (
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">#</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={t(lang, 'mapSeedLabel')}
                      value={config.mapSeed ?? ''}
                      onChange={(e) => handleSeedInput(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      className="w-14 bg-transparent text-xs font-extrabold tabular-nums text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Primary Start CTA */}
            <button
              type="button"
              onClick={onStart}
              className="w-full mt-2 py-3.5 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{t(lang, 'startGame')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Single flat control hint line */}
      <div className="flex justify-center">
        <div className="px-4 py-1.5 rounded-lg bg-slate-900/85 text-slate-100 text-xs font-medium tracking-wide shadow">
          {t(lang, 'controlHint')}
        </div>
      </div>
    </div>
  );
};

