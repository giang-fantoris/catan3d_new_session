import React, { useState } from 'react';
import {
  Anchor,
  ArrowLeftRight,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  Crown,
  Dices,
  Globe,
  Layers,
  MessageSquare,
  Moon,
  Navigation,
  RotateCcw,
  Send,
  Shield,
  Shuffle,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BUILD_COSTS,
  canAfford,
  canPlayDevCard,
  getHiddenVPCardsCount,
  getMovableShipEdges,
  getValidShipEdges,
  getVisibleVP,
  totalResources,
} from '../game/catanEngine';
import { ALL_RESOURCES } from '../game/hexMath';
import { devCardLabel, playerColorHex, resourceLabel, t } from '../i18n/translations';
import { BuildMode, CameraPreset, GameState, Language, ResourceType, RoomChatMessage } from '../types/catan';
import { RESOURCE_STYLES, ResourceIcon } from './ResourceIcons';
import { SpecialTitleCards } from './SpecialTitleCards';

interface GameHUDProps {
  gameState: GameState;
  lang: Language;
  darkMode: boolean;
  muted: boolean;
  dockCollapsed: boolean;
  buildMode: BuildMode;
  selectedShipEdgeId?: string | null;
  localSeatIndex?: number | null;
  onlineRoomCode?: string | null;
  onlineChat?: RoomChatMessage[];
  onSendChat?: (text: string) => void;
  onToggleDock: () => void;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onToggleMute: () => void;
  onOpenRules: () => void;
  onNewGame: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onRollDice: () => void;
  onSetBuildMode: (mode: BuildMode) => void;
  onBuyDevCard: () => void;
  onOpenTrade: () => void;
  onOpenDevCards: () => void;
  onDismissBoughtCard: () => void;
  onEndTurn: () => void;
  onFinishSpecialBuild?: () => void;
  onRerollMap?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  gameState,
  lang,
  darkMode,
  muted,
  dockCollapsed,
  buildMode,
  selectedShipEdgeId = null,
  localSeatIndex = null,
  onlineRoomCode = null,
  onlineChat = [],
  onSendChat,
  onToggleDock,
  onToggleLang,
  onToggleDark,
  onToggleMute,
  onOpenRules,
  onNewGame,
  onCameraPreset,
  onRollDice,
  onSetBuildMode,
  onBuyDevCard,
  onOpenTrade,
  onOpenDevCards,
  onDismissBoughtCard,
  onEndTurn,
  onFinishSpecialBuild,
  onRerollMap,
}) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const isOnline = localSeatIndex !== null && localSeatIndex !== undefined;
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  // Online: always pin hand to your own private seat; Offline: single human vs AI or hotseat active
  const humanPlayers = gameState.players.filter((p) => !p.isAI);
  const displayHandPlayer = isOnline
    ? gameState.players[localSeatIndex] || activePlayer
    : !activePlayer.isAI
    ? activePlayer
    : humanPlayers.length === 1
    ? humanPlayers[0]
    : activePlayer;

  const isHumanTurn = isOnline
    ? !activePlayer.isAI && activePlayer.id === localSeatIndex
    : !activePlayer.isAI;
  const latestLog = gameState.logs[gameState.logs.length - 1];
  const isExpanded = gameState.gameMode === 'expanded';
  const isBuildPhase = isHumanTurn && (gameState.phase === 'action' || gameState.phase === 'special_build');

  const getPhaseLabel = () => {
    if (isHumanTurn && buildMode === 'move_ship') {
      return t(lang, selectedShipEdgeId ? 'moveShipHintTarget' : 'moveShipHintSelect');
    }
    switch (gameState.phase) {
      case 'setup_settlement':
        return t(lang, 'phaseSetupSettlement', {
          step: gameState.setupStep < gameState.players.length ? 1 : 2,
        });
      case 'setup_road':
        return t(lang, 'phaseSetupRoad');
      case 'roll':
        return t(lang, 'phaseRoll');
      case 'discard':
        return t(lang, 'phaseDiscard', {
          count: Math.floor(totalResources(gameState.players[gameState.discardQueue[0]]?.resources || { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 }) / 2),
        });
      case 'gold_pick':
        return t(lang, 'phaseGoldPick');
      case 'move_robber':
        return t(lang, isExpanded ? 'phaseMoveRobberExpanded' : 'phaseMoveRobber');
      case 'select_disaster_hex':
        return t(lang, 'phaseSelectDisasterHex');
      case 'select_plague_hex':
        return t(lang, 'phaseSelectPlagueHex');
      case 'steal':
        return t(lang, gameState.stealKind === 'pirate' ? 'phaseStealPirate' : 'phaseSteal');
      case 'action':
        return t(lang, 'phaseAction');
      case 'special_build':
        return t(lang, 'phaseSpecialBuild');
      case 'road_building_1':
        return t(lang, 'phaseRoadBuilding1');
      case 'road_building_2':
        return t(lang, 'phaseRoadBuilding2');
      case 'game_over':
        return t(lang, 'phaseGameOver');
      default:
        return '';
    }
  };

  const renderLatestLog = () => {
    if (!latestLog) return '';
    const params = { ...latestLog.params };
    if (params.terrain && typeof params.terrain === 'string') {
      params.terrain = t(lang, params.terrain);
    }
    if (params.res && typeof params.res === 'string') {
      params.res = resourceLabel(lang, params.res as ResourceType);
    }
    return t(lang, latestLog.messageKey, params);
  };

  const canBuyRoad =
    isBuildPhase &&
    activePlayer.roadsLeft > 0 &&
    canAfford(activePlayer.resources, BUILD_COSTS.road);
  const canBuyShip =
    isExpanded &&
    isBuildPhase &&
    activePlayer.shipsLeft > 0 &&
    canAfford(activePlayer.resources, BUILD_COSTS.ship);
  const movableShipsCount =
    isExpanded && isHumanTurn && gameState.phase === 'action' && !gameState.shipMovedThisTurn
      ? getMovableShipEdges(gameState, activePlayer.id).length
      : 0;
  const setupOrRBValidShipsCount =
    isExpanded &&
    isHumanTurn &&
    (gameState.phase === 'setup_road' ||
      gameState.phase === 'road_building_1' ||
      gameState.phase === 'road_building_2')
      ? getValidShipEdges(gameState, activePlayer.id, {
          isSetup: gameState.phase === 'setup_road',
          setupVertexId: gameState.pendingSettlementVertexId,
          freeShip: gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2',
        }).length
      : 0;
  const canBuySettlement =
    isBuildPhase &&
    activePlayer.settlementsLeft > 0 &&
    canAfford(activePlayer.resources, BUILD_COSTS.settlement);
  const canBuyCity =
    isBuildPhase &&
    activePlayer.citiesLeft > 0 &&
    Object.values(gameState.vertices).some((v) => v.ownerId === activePlayer.id && v.building === 'settlement') &&
    canAfford(activePlayer.resources, BUILD_COSTS.city);
  const canBuyDev =
    isBuildPhase &&
    gameState.devDeck.length > 0 &&
    canAfford(activePlayer.resources, BUILD_COSTS.devCard);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* TOP BAR: Player Standings + Utilities */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Players Strip */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {gameState.players.map((p) => {
            const isActive = p.id === gameState.currentPlayerIndex;
            const isLocalMe = isOnline && p.id === localSeatIndex;
            const visibleVP = getVisibleVP(gameState, p.id);
            const hiddenVP = isOnline
              ? isLocalMe
                ? getHiddenVPCardsCount(p)
                : 0
              : !p.isAI && (humanPlayers.length === 1 || isActive)
              ? getHiddenVPCardsCount(p)
              : 0;
            const totalCards = totalResources(p.resources);
            const hasLongest = gameState.longestRoadHolderId === p.id;
            const hasLargest = gameState.largestArmyHolderId === p.id;

            return (
              <div
                key={p.id}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border shadow-md transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 border-blue-600 ring-2 ring-blue-600'
                    : 'bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-slate-900/20 shrink-0"
                  style={{ backgroundColor: playerColorHex(p.color) }}
                />
                <div className="leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate max-w-[82px]">
                      {p.name}
                    </span>
                    {isLocalMe && (
                      <span className="px-1 py-0.5 rounded bg-blue-600 text-white text-[9px] font-extrabold leading-none">
                        {t(lang, 'humanPlayer')}
                      </span>
                    )}
                    {hasLongest && (
                      <span
                        title={t(lang, 'longestRoad')}
                        className="px-1 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold leading-none"
                      >
                        LR
                      </span>
                    )}
                    {hasLargest && (
                      <span
                        title={t(lang, 'largestArmy')}
                        className="px-1 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold leading-none"
                      >
                        LA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums mt-0.5">
                    <span className="inline-flex items-center gap-0.5 text-slate-900 dark:text-white font-bold">
                      <Crown className="w-3 h-3 text-amber-500" />
                      {visibleVP}
                      {hiddenVP > 0 ? `+${hiddenVP}` : ''}
                    </span>
                    <span title={t(lang, 'cards')}>{totalCards}🃏</span>
                    <span title={t(lang, 'knights')} className="inline-flex items-center gap-0.5">
                      <Shield className="w-3 h-3 text-slate-500" />
                      {p.knightsPlayed}
                    </span>
                    <span title={t(lang, 'roadLen')} className="text-slate-500 dark:text-slate-400">
                      {p.longestRoadLength}━
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Top-Right Compact Utility Bar */}
        <div className="flex items-center gap-1.5 pointer-events-auto relative">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md text-xs font-extrabold">
            {isExpanded && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-600 text-white text-[10px]">
                Seafarers
              </span>
            )}
            <span>{t(lang, 'targetVpBadge', { vp: gameState.targetVP })}</span>
          </div>
          {isOnline && onlineRoomCode && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-900 text-white border border-slate-700 shadow-md text-xs font-extrabold">
              <span className="text-orange-400">#{onlineRoomCode}</span>
              <span className="opacity-70">·</span>
              <span>{displayHandPlayer.name}</span>
            </div>
          )}
          {isOnline && onSendChat && (
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              aria-label={t(lang, 'roomChatTitle')}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border shadow-md text-xs font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                chatOpen
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{t(lang, 'roomChatTitle')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenRules}
            aria-label={t(lang, 'rules')}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">{t(lang, 'rules')}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? t(lang, 'soundOff') : t(lang, 'soundOn')}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
          </button>
          <button
            type="button"
            onClick={onToggleLang}
            aria-label="Toggle Language"
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-extrabold cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Globe className="w-4 h-4 text-blue-600" />
            <span>{lang.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={onToggleDark}
            aria-label={darkMode ? t(lang, 'lightMode') : t(lang, 'darkMode')}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
          <button
            type="button"
            onClick={onNewGame}
            aria-label={t(lang, 'newGame')}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Compact Online Chat Drawer */}
          {isOnline && chatOpen && onSendChat && (
            <div className="absolute right-0 top-12 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 z-30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {t(lang, 'roomChatTitle')} (#{onlineRoomCode})
                </span>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  aria-label={t(lang, 'close')}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="h-44 overflow-y-auto space-y-1.5 mb-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                {onlineChat.map((m) => (
                  <div key={m.id}>
                    <span className="font-extrabold text-slate-900 dark:text-white">{m.senderName}: </span>
                    <span className="text-slate-700 dark:text-slate-300">{m.text}</span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim()) return;
                  onSendChat(chatInput);
                  setChatInput('');
                }}
                className="flex gap-1.5"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t(lang, 'chatPlaceholder')}
                  maxLength={200}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  aria-label={t(lang, 'sendChat')}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE RAIL ROW: Left Special Titles + Right Vertical Cards/Dice/Actions Rail (leaves center 3D map unobstructed) */}
      <div className="flex-1 flex items-start sm:items-center justify-between gap-2 py-2 min-h-0 overflow-hidden">
        {/* Left Edge: Longest Road & Largest Army Cards */}
        <div className="pointer-events-none max-h-full overflow-y-auto pr-1">
          <SpecialTitleCards
            gameState={gameState}
            lang={lang}
            localSeatIndex={localSeatIndex}
          />
        </div>

        {/* Right Edge: Vertical Player Cards, Dice & Actions Sidebar */}
        <aside
          aria-label={t(lang, 'cards')}
          className="flex flex-col items-end gap-1.5 max-h-full pointer-events-none shrink-0"
        >
          {/* Collapse / Expand Toggle */}
          <button
            type="button"
            onClick={onToggleDock}
            aria-label={dockCollapsed ? t(lang, 'showControls') : t(lang, 'hideControls')}
            className="pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-xs font-bold shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors"
          >
            {dockCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{dockCollapsed ? t(lang, 'showControls') : t(lang, 'hideControls')}</span>
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-[196px] sm:w-[244px] max-h-[calc(100vh-148px)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2.5 sm:p-3 flex flex-col gap-2.5">
              {/* Section 1: Active Turn & Phase */}
              <div className="pb-2 border-b border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded-md text-[11px] font-extrabold truncate"
                    style={{
                      backgroundColor: playerColorHex(activePlayer.color),
                      color: activePlayer.color === 'white' ? '#0F172A' : '#FFFFFF',
                    }}
                  >
                    {activePlayer.name}
                  </span>
                  {isOnline && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                        isHumanTurn ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isHumanTurn ? t(lang, 'yourTurnBadge') : t(lang, 'youAreBadge')}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {activePlayer.isAI
                    ? t(lang, 'aiThinking', { name: activePlayer.name })
                    : isOnline && !isHumanTurn
                    ? t(lang, 'waitingTurnBadge', { name: activePlayer.name })
                    : getPhaseLabel()}
                </p>
              </div>

              {/* Section 2: Dice Readout + Roll Dice CTA + Dev Deck Count */}
              <div className="space-y-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-extrabold tabular-nums">
                    <Dices className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span>{gameState.dice[0]}</span>
                    <span>+</span>
                    <span>{gameState.dice[1]}</span>
                    <span>=</span>
                    <span className={gameState.dice[0] + gameState.dice[1] === 7 ? 'text-red-600' : 'text-blue-600'}>
                      {gameState.dice[0] + gameState.dice[1]}
                    </span>
                  </div>
                  <div
                    title={t(lang, 'deck')}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold tabular-nums"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{gameState.devDeck.length}</span>
                  </div>
                </div>

                {isHumanTurn && gameState.phase === 'roll' && (
                  <button
                    type="button"
                    onClick={onRollDice}
                    className="w-full py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-orange-500 transition-colors"
                  >
                    <Dices className="w-4 h-4 shrink-0" />
                    <span>{t(lang, 'rollDice')}</span>
                  </button>
                )}

                {!isOnline &&
                  gameState.phase === 'setup_settlement' &&
                  gameState.setupStep === 0 &&
                  onRerollMap && (
                    <button
                      type="button"
                      onClick={onRerollMap}
                      className="w-full py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 transition-colors"
                    >
                      <Shuffle className="w-3.5 h-3.5 shrink-0" />
                      <span>{t(lang, 'rerollMapBtn')}</span>
                    </button>
                  )}
              </div>

              {/* Section 3: Player Resource Cards & Dev Cards (Vertical Layout) */}
              <div className="space-y-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>{t(lang, 'cards')}</span>
                  <span className="tabular-nums text-slate-700 dark:text-slate-200">
                    {totalResources(displayHandPlayer.resources)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {ALL_RESOURCES.map((res) => {
                    const style = RESOURCE_STYLES[res];
                    return (
                      <div
                        key={res}
                        title={`${resourceLabel(lang, res)} (${t(lang, 'bank')}: ${gameState.bank[res]})`}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg ${style.bg} ${style.text} shadow-sm`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ResourceIcon type={res} className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold truncate">{resourceLabel(lang, res)}</span>
                        </div>
                        <span className="text-sm font-extrabold tabular-nums shrink-0">
                          {displayHandPlayer.resources[res]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Dev Cards Hand Button */}
                <button
                  type="button"
                  onClick={onOpenDevCards}
                  className={`w-full mt-1 px-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 transition-colors ${
                    displayHandPlayer.devCards.some((c) => canPlayDevCard(gameState, displayHandPlayer.id, c.id))
                      ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white ring-2 ring-indigo-300'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 dark:active:bg-slate-600 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t(lang, 'devCards')}</span>
                  </span>
                  <span className="font-extrabold tabular-nums shrink-0">
                    {displayHandPlayer.devCards.filter((c) => !c.played).length}
                  </span>
                </button>
              </div>

              {/* Special Building Phase Note */}
              {isHumanTurn && gameState.phase === 'special_build' && (
                <div className="px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 text-[11px] font-bold leading-snug">
                  {t(lang, 'specialBuildNote')}
                </div>
              )}

              {/* Coastal piece toggle during Setup Road or Road Building */}
              {setupOrRBValidShipsCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSetBuildMode(buildMode === 'ship' ? 'none' : 'ship')}
                  className={`w-full px-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-500 transition-colors ${
                    buildMode === 'ship'
                      ? 'bg-cyan-600 text-white ring-2 ring-cyan-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Anchor className="w-3.5 h-3.5" />
                  <span>{t(lang, 'buildShip')}</span>
                </button>
              )}

              {/* Section 4: Build, Trade & Turn Controls */}
              {isBuildPhase && (
                <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={!canBuyRoad && buildMode !== 'road'}
                      onClick={() => onSetBuildMode(buildMode === 'road' ? 'none' : 'road')}
                      title={`${t(lang, 'buildRoad')}: 1 ${t(lang, 'wood')} + 1 ${t(lang, 'brick')} (${activePlayer.roadsLeft})`}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        buildMode === 'road'
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t(lang, 'buildRoad')} ({activePlayer.roadsLeft})
                    </button>

                    {isExpanded && (
                      <button
                        type="button"
                        disabled={!canBuyShip && buildMode !== 'ship'}
                        onClick={() => onSetBuildMode(buildMode === 'ship' ? 'none' : 'ship')}
                        title={`${t(lang, 'buildShip')}: 1 ${t(lang, 'wood')} + 1 ${t(lang, 'wool')} (${activePlayer.shipsLeft})`}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-cyan-500 ${
                          buildMode === 'ship'
                            ? 'bg-cyan-600 text-white ring-2 ring-cyan-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Anchor className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {t(lang, 'buildShip')} ({activePlayer.shipsLeft})
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!canBuySettlement && buildMode !== 'settlement'}
                      onClick={() => onSetBuildMode(buildMode === 'settlement' ? 'none' : 'settlement')}
                      title={`${t(lang, 'buildSettlement')}: 1 ${t(lang, 'wood')}+1 ${t(lang, 'brick')}+1 ${t(lang, 'wool')}+1 ${t(lang, 'grain')} (${activePlayer.settlementsLeft})`}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                        buildMode === 'settlement'
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t(lang, 'buildSettlement')} ({activePlayer.settlementsLeft})
                    </button>

                    <button
                      type="button"
                      disabled={!canBuyCity && buildMode !== 'city'}
                      onClick={() => onSetBuildMode(buildMode === 'city' ? 'none' : 'city')}
                      title={`${t(lang, 'buildCity')}: 2 ${t(lang, 'grain')} + 3 ${t(lang, 'ore')} (${activePlayer.citiesLeft})`}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-amber-500 ${
                        buildMode === 'city'
                          ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t(lang, 'buildCity')} ({activePlayer.citiesLeft})
                    </button>
                  </div>

                  {isExpanded && gameState.phase === 'action' && (
                    <button
                      type="button"
                      disabled={movableShipsCount === 0 && buildMode !== 'move_ship'}
                      onClick={() => onSetBuildMode(buildMode === 'move_ship' ? 'none' : 'move_ship')}
                      title={t(lang, 'moveShipHintSelect')}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-amber-500 ${
                        buildMode === 'move_ship'
                          ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Navigation className="w-3.5 h-3.5 shrink-0" />
                      <span>{t(lang, 'moveShip')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!canBuyDev}
                    onClick={onBuyDevCard}
                    title={`${t(lang, 'buyDevCard')}: 1 ${t(lang, 'wool')} + 1 ${t(lang, 'grain')} + 1 ${t(lang, 'ore')}`}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
                  >
                    +{t(lang, 'buyDevCard')}
                  </button>

                  {gameState.phase === 'action' ? (
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={onOpenTrade}
                        className="px-2.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 transition-colors"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t(lang, 'trade')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={onEndTurn}
                        className="px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 transition-colors truncate"
                      >
                        {t(lang, 'endTurn')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onFinishSpecialBuild || onEndTurn}
                      className="w-full px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-extrabold cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors"
                    >
                      {t(lang, 'doneBuilding')}
                    </button>
                  )}
                </div>
              )}

              {/* Section 5: Camera Angle Presets */}
              <div className="flex items-center justify-between gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <Camera className="w-3.5 h-3.5 text-slate-500 mx-1 shrink-0" />
                <div className="grid grid-cols-3 gap-1 flex-1">
                  {(['isometric', 'top', 'low'] as CameraPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onCameraPreset(preset)}
                      className="px-1.5 py-1 rounded-md text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 active:bg-slate-200 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      {t(lang, preset === 'isometric' ? 'cameraIso' : preset === 'top' ? 'cameraTop' : 'cameraLow')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* SLIM BOTTOM EDGE BAR: Latest Log & Newly Bought Dev Card Notification */}
      <div className="flex flex-col items-center w-full gap-1.5 pointer-events-none">
        {gameState.lastBoughtDevCard &&
          gameState.lastBoughtDevCard.playerId === displayHandPlayer.id &&
          !displayHandPlayer.isAI && (
            <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-xl bg-indigo-600 text-white shadow-xl border border-indigo-400 max-w-[90vw]">
              <Layers className="w-4 h-4 shrink-0" />
              <div className="text-xs leading-snug">
                <span className="font-semibold opacity-90">{t(lang, 'justBoughtDevCard')} </span>
                <span className="font-extrabold underline decoration-amber-300 underline-offset-2">
                  {devCardLabel(lang, gameState.lastBoughtDevCard.type)}
                </span>
                <span className="hidden sm:inline opacity-90">
                  {' — '}
                  {t(lang, `${gameState.lastBoughtDevCard.type}Desc`)}
                </span>
              </div>
              <button
                type="button"
                onClick={onDismissBoughtCard}
                aria-label={t(lang, 'close')}
                className="p-1 rounded-lg hover:bg-indigo-700 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

        {latestLog && (
          <div className="pointer-events-auto px-3 py-1 rounded-lg bg-slate-900/90 text-slate-100 text-xs font-medium shadow max-w-[85vw] truncate">
            {renderLatestLog()}
          </div>
        )}
      </div>
    </div>
  );
};
