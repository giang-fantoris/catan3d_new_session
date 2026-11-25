import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { soundEngine } from './audio/soundEngine';
import { GameHUD } from './components/GameHUD';
import { RoomLobbyOverlay } from './components/LobbyAndAuth';
import {
  DevCardsModal,
  DiscardModal,
  GoldPickModal,
  IncomingTradeModal,
  RulesModal,
  StealModal,
  TradeModal,
  VictoryModal,
} from './components/Modals';
import { TitleScreen } from './components/TitleScreen';
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
  getMovableShipEdges,
  getValidRoadEdges,
  getValidShipEdges,
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
} from './game/catanEngine';
import { generateRandomSeed } from './game/hexMath';
import { t } from './i18n/translations';
import { CatanScene } from './three/CatanScene';
import {
  BuildMode,
  CameraPreset,
  GameConfig,
  GameState,
  Language,
  ResourceType,
  RoomInfo,
  RoomSummary,
  TradeOffer,
  UserAccount,
} from './types/catan';

function makeDefaultConfig(lang: Language): GameConfig {
  return {
    gameMode: 'basic',
    scenario: 'new_shores',
    playerCount: 4,
    humanCount: 1,
    mapMode: 'standard',
    playerNames: [
      t(lang, 'humanPlayer'),
      `${t(lang, 'botPrefix')} 1`,
      `${t(lang, 'botPrefix')} 2`,
      `${t(lang, 'botPrefix')} 3`,
    ],
  };
}

export default function App() {
  const [lang, setLang] = useState<Language>('vi');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [buildMode, setBuildMode] = useState<BuildMode>('none');
  const [selectedShipEdgeId, setSelectedShipEdgeId] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [cameraTrigger, setCameraTrigger] = useState<number>(0);

  // Account & Multiplayer Room State (token kept strictly in JS memory)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<UserAccount | null>(null);
  const [openRooms, setOpenRooms] = useState<RoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomCodeRef = useRef<string | null>(null);
  activeRoomCodeRef.current = activeRoom?.code ?? null;

  const [config, setConfig] = useState<GameConfig>(() => makeDefaultConfig('vi'));
  const [localGameState, setLocalGameState] = useState<GameState>(() => ({
    ...createNewGame(makeDefaultConfig('vi')),
    phase: 'title',
  }));
  const [localBoughtDismissed, setLocalBoughtDismissed] = useState(false);

  const [showTrade, setShowTrade] = useState(false);
  const [showDevCards, setShowDevCards] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const isOnlineMatch = Boolean(activeRoom && activeRoom.status !== 'lobby' && activeRoom.gameState);
  const gameState = isOnlineMatch && activeRoom?.gameState ? activeRoom.gameState : localGameState;
  const localSeatIndex = isOnlineMatch && activeRoom ? activeRoom.mySeatIndex : null;

  useEffect(() => {
    if (buildMode !== 'move_ship' || gameState.phase !== 'action') {
      setSelectedShipEdgeId(null);
    }
  }, [buildMode, gameState.phase]);

  // Sync Tailwind dark class on root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Sync sound mute state
  useEffect(() => {
    soundEngine.muted = muted;
  }, [muted]);

  const refreshRooms = useCallback(async (tokenOverride?: string | null) => {
    const tk = tokenOverride ?? authToken;
    if (!tk) return;
    try {
      const res = await fetch('/api/rooms', {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOpenRooms(data.rooms || []);
      }
    } catch {
      // Ignore transient refresh errors
    }
  }, [authToken]);

  const refreshProfile = useCallback(async (tokenOverride?: string | null) => {
    const tk = tokenOverride ?? authToken;
    if (!tk) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) setAuthUser(data.user);
      }
    } catch {
      // Ignore transient errors
    }
  }, [authToken]);

  // Maintain authenticated WebSocket connection when logged in
  useEffect(() => {
    if (!authToken) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let closed = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: authToken }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === 'authed' && activeRoomCodeRef.current) {
            ws.send(JSON.stringify({ type: 'room:join', code: activeRoomCodeRef.current }));
          } else if (msg.type === 'room:state' && msg.room) {
            const incomingRoom = msg.room as RoomInfo;
            setActiveRoom((prev) => {
              const prevGs = prev?.gameState;
              const nextGs = incomingRoom.gameState;
              if (prevGs && nextGs) {
                if (nextGs.diceRollCount !== prevGs.diceRollCount) {
                  soundEngine.playDiceRoll();
                  if (nextGs.dice[0] + nextGs.dice[1] === 7) soundEngine.playRobberAlert();
                  else soundEngine.playResourceChime();
                } else if (nextGs.phase === 'game_over' && prevGs.phase !== 'game_over') {
                  soundEngine.playVictory();
                }
              }
              return incomingRoom;
            });
            setLocalBoughtDismissed(false);
          } else if (msg.type === 'trade:notice' && msg.payload) {
            if (msg.payload.accepted) soundEngine.playTrade();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [authToken]);

  const wsSend = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendGameAction = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      wsSend({ type: 'game:action', action, payload });
    },
    [wsSend],
  );

  const handleAuthSuccess = useCallback(
    (token: string, user: UserAccount) => {
      setAuthToken(token);
      setAuthUser(user);
      refreshRooms(token);
    },
    [refreshRooms],
  );

  const handleLogout = useCallback(() => {
    if (activeRoom) {
      wsSend({ type: 'room:leave' });
      setActiveRoom(null);
    }
    setAuthToken(null);
    setAuthUser(null);
    setOpenRooms([]);
  }, [activeRoom, wsSend]);

  const handleEnterRoom = useCallback(
    (room: RoomInfo) => {
      setActiveRoom(room);
      setBuildMode('none');
      setShowTrade(false);
      setShowDevCards(false);
      wsSend({ type: 'room:join', code: room.code });
    },
    [wsSend],
  );

  const handleLeaveRoom = useCallback(() => {
    wsSend({ type: 'room:leave' });
    setActiveRoom(null);
    setBuildMode('none');
    setShowTrade(false);
    setShowDevCards(false);
    refreshRooms();
    refreshProfile();
  }, [wsSend, refreshRooms, refreshProfile]);

  const handleToggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'vi' ? 'en' : 'vi';
      setConfig((c) => ({
        ...c,
        playerNames: c.playerNames.map((_, i) =>
          c.humanCount > 1
            ? `${next === 'vi' ? 'Người chơi' : 'Player'} ${i + 1}`
            : i === 0
            ? t(next, 'humanPlayer')
            : `${t(next, 'botPrefix')} ${i}`,
        ),
      }));
      return next;
    });
  }, []);

  const handleChangeConfig = useCallback(
    (nextCfg: GameConfig) => {
      const modeChanged = nextCfg.gameMode !== config.gameMode;
      const mapChanged =
        modeChanged ||
        nextCfg.scenario !== config.scenario ||
        nextCfg.mapMode !== config.mapMode ||
        nextCfg.mapSeed !== config.mapSeed;
      setConfig(nextCfg);
      if (localGameState.phase === 'title' && mapChanged) {
        setLocalGameState({
          ...createNewGame(nextCfg),
          phase: 'title',
        });
        if (modeChanged) {
          setCameraPreset('isometric');
          setCameraTrigger((n) => n + 1);
        }
      }
    },
    [config.gameMode, config.scenario, config.mapMode, config.mapSeed, localGameState.phase],
  );

  const handleRerollOfflineMap = useCallback(() => {
    const nextCfg: GameConfig = {
      ...config,
      mapMode: 'random',
      mapSeed: generateRandomSeed(),
    };
    soundEngine.playBuild(false);
    setConfig(nextCfg);
    setBuildMode('none');
    setLocalGameState(createNewGame(nextCfg));
  }, [config]);

  const handleStartOfflineGame = useCallback(() => {
    soundEngine.playBuild(false);
    setBuildMode('none');
    setShowTrade(false);
    setShowDevCards(false);
    setLocalGameState(createNewGame(config));
    setCameraPreset('isometric');
    setCameraTrigger((n) => n + 1);
  }, [config]);

  const handleNewGame = useCallback(() => {
    if (activeRoom) {
      handleLeaveRoom();
      return;
    }
    setBuildMode('none');
    setShowTrade(false);
    setShowDevCards(false);
    setLocalGameState({
      ...createNewGame(config),
      phase: 'title',
    });
  }, [activeRoom, handleLeaveRoom, config]);

  const handleRollDice = useCallback(() => {
    setBuildMode('none');
    if (isOnlineMatch) {
      soundEngine.playDiceRoll();
      sendGameAction('roll');
      return;
    }
    soundEngine.playDiceRoll();
    setLocalGameState((prev) => {
      const next = rollDice(prev);
      if (next.dice[0] + next.dice[1] === 7) soundEngine.playRobberAlert();
      else soundEngine.playResourceChime();
      return next;
    });
  }, [isOnlineMatch, sendGameAction]);

  // Offline AI Turn Stepper (Online AI turns run authoritatively on server)
  useEffect(() => {
    if (isOnlineMatch) return;
    if (localGameState.phase === 'title' || localGameState.phase === 'game_over') return;

    const isDiscardAI =
      localGameState.phase === 'discard' &&
      localGameState.discardQueue.length > 0 &&
      localGameState.players[localGameState.discardQueue[0]]?.isAI;
    const isGoldPickAI =
      localGameState.phase === 'gold_pick' &&
      localGameState.pendingGoldPicks.length > 0 &&
      localGameState.players[localGameState.pendingGoldPicks[0].playerId]?.isAI;
    const activeAI = localGameState.players[localGameState.currentPlayerIndex]?.isAI;

    if (!isDiscardAI && !isGoldPickAI && !activeAI) return;

    const delay = localGameState.phase === 'roll' ? 680 : 520;
    const timer = window.setTimeout(() => {
      setLocalGameState((prev) => {
        const next = runAIStep(prev);
        if (next.phase === 'game_over') soundEngine.playVictory();
        else if (next.diceRollCount !== prev.diceRollCount) {
          soundEngine.playDiceRoll();
          if (next.dice[0] + next.dice[1] === 7) soundEngine.playRobberAlert();
        }
        return next;
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isOnlineMatch, localGameState]);

  // Keyboard shortcuts (ignore while typing in inputs/textareas)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (gameState.phase === 'title') return;
      const myTurnOfflineOrOnline =
        !gameState.players[gameState.currentPlayerIndex]?.isAI &&
        (localSeatIndex === null || gameState.currentPlayerIndex === localSeatIndex);

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((v) => !v);
      } else if (e.key === 'Escape') {
        if (showTrade) setShowTrade(false);
        else if (showDevCards) setShowDevCards(false);
        else if (showRules) setShowRules(false);
        else setBuildMode('none');
      } else if (
        (e.key === ' ' || e.key === 'r' || e.key === 'R') &&
        gameState.phase === 'roll' &&
        myTurnOfflineOrOnline &&
        !showTrade &&
        !showDevCards &&
        !showRules
      ) {
        e.preventDefault();
        handleRollDice();
      } else if (e.key === '1') {
        setCameraPreset('isometric');
        setCameraTrigger((n) => n + 1);
      } else if (e.key === '2') {
        setCameraPreset('top');
        setCameraTrigger((n) => n + 1);
      } else if (e.key === '3') {
        setCameraPreset('low');
        setCameraTrigger((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState.phase, gameState.currentPlayerIndex, gameState.players, localSeatIndex, showTrade, showDevCards, showRules, handleRollDice]);

  // 3D Board Interaction Handlers
  const handleVertexClick = useCallback(
    (vertexId: string) => {
      const isBuild = gameState.phase === 'action' || gameState.phase === 'special_build';
      if (isOnlineMatch) {
        if (gameState.phase === 'setup_settlement') {
          soundEngine.playBuild(false);
          sendGameAction('setup_settlement', { vertexId });
        } else if (isBuild && buildMode === 'settlement') {
          soundEngine.playBuild(false);
          sendGameAction('build_settlement', { vertexId });
          setBuildMode('none');
        } else if (isBuild && buildMode === 'city') {
          soundEngine.playBuild(true);
          sendGameAction('build_city', { vertexId });
          setBuildMode('none');
        }
        return;
      }

      setLocalGameState((prev) => {
        const prevBuild = prev.phase === 'action' || prev.phase === 'special_build';
        if (prev.phase === 'setup_settlement') {
          soundEngine.playBuild(false);
          return placeSetupSettlement(prev, vertexId);
        }
        if (prevBuild && buildMode === 'settlement') {
          const next = buildSettlement(prev, vertexId);
          if (next !== prev) {
            soundEngine.playBuild(false);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setBuildMode('none');
          }
          return next;
        }
        if (prevBuild && buildMode === 'city') {
          const next = buildCity(prev, vertexId);
          if (next !== prev) {
            soundEngine.playBuild(true);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setBuildMode('none');
          }
          return next;
        }
        return prev;
      });
    },
    [isOnlineMatch, gameState.phase, buildMode, sendGameAction],
  );

  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      const isBuild = gameState.phase === 'action' || gameState.phase === 'special_build';
      const isRB = gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2';

      if (isOnlineMatch) {
        if (gameState.phase === 'setup_road') {
          soundEngine.playBuild(false);
          sendGameAction('setup_road', {
            edgeId,
            preferredPieceType: buildMode === 'ship' ? 'ship' : undefined,
          });
          setBuildMode('none');
        } else if (isRB) {
          const pid = gameState.currentPlayerIndex;
          const validRoads = getValidRoadEdges(gameState, pid, { freeRoad: true });
          const validShips = getValidShipEdges(gameState, pid, { freeShip: true });
          const useShip =
            buildMode === 'ship'
              ? validShips.includes(edgeId)
              : !validRoads.includes(edgeId) && validShips.includes(edgeId);
          soundEngine.playBuild(false);
          sendGameAction(useShip ? 'build_ship' : 'build_road', { edgeId });
          setBuildMode('none');
        } else if (isBuild && buildMode === 'road') {
          soundEngine.playBuild(false);
          sendGameAction('build_road', { edgeId });
          setBuildMode('none');
        } else if (isBuild && buildMode === 'ship') {
          soundEngine.playBuild(false);
          sendGameAction('build_ship', { edgeId });
          setBuildMode('none');
        } else if (gameState.phase === 'action' && buildMode === 'move_ship') {
          const pid = gameState.currentPlayerIndex;
          if (!selectedShipEdgeId) {
            if (getMovableShipEdges(gameState, pid).includes(edgeId)) {
              setSelectedShipEdgeId(edgeId);
            }
          } else if (edgeId === selectedShipEdgeId) {
            setSelectedShipEdgeId(null);
          } else {
            soundEngine.playBuild(false);
            sendGameAction('move_ship', { fromEdgeId: selectedShipEdgeId, toEdgeId: edgeId });
            setSelectedShipEdgeId(null);
            setBuildMode('none');
          }
        }
        return;
      }

      if (gameState.phase === 'action' && buildMode === 'move_ship') {
        const pid = gameState.currentPlayerIndex;
        if (!selectedShipEdgeId) {
          if (getMovableShipEdges(gameState, pid).includes(edgeId)) {
            setSelectedShipEdgeId(edgeId);
          }
          return;
        }
        if (edgeId === selectedShipEdgeId) {
          setSelectedShipEdgeId(null);
          return;
        }
        const shipToMove = selectedShipEdgeId;
        setLocalGameState((prev) => {
          const next = moveShip(prev, shipToMove, edgeId);
          if (next !== prev) {
            soundEngine.playBuild(false);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setSelectedShipEdgeId(null);
            setBuildMode('none');
          }
          return next;
        });
        return;
      }

      setLocalGameState((prev) => {
        const prevBuild = prev.phase === 'action' || prev.phase === 'special_build';
        if (prev.phase === 'setup_road') {
          const next = placeSetupRoad(prev, edgeId, buildMode === 'ship' ? 'ship' : undefined);
          if (next !== prev) {
            soundEngine.playBuild(false);
            setBuildMode('none');
          }
          return next;
        }
        if (prev.phase === 'road_building_1' || prev.phase === 'road_building_2') {
          const pid = prev.currentPlayerIndex;
          const validRoads = getValidRoadEdges(prev, pid, { freeRoad: true });
          const validShips = getValidShipEdges(prev, pid, { freeShip: true });
          const useShip =
            buildMode === 'ship'
              ? validShips.includes(edgeId)
              : !validRoads.includes(edgeId) && validShips.includes(edgeId);
          const next = useShip ? buildShip(prev, edgeId, true) : buildRoad(prev, edgeId, true);
          if (next !== prev) {
            soundEngine.playBuild(false);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setBuildMode('none');
          }
          return next;
        }
        if (prevBuild && buildMode === 'road') {
          const next = buildRoad(prev, edgeId, false);
          if (next !== prev) {
            soundEngine.playBuild(false);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setBuildMode('none');
          }
          return next;
        }
        if (prevBuild && buildMode === 'ship') {
          const next = buildShip(prev, edgeId, false);
          if (next !== prev) {
            soundEngine.playBuild(false);
            if (next.phase === 'game_over') soundEngine.playVictory();
            setBuildMode('none');
          }
          return next;
        }
        return prev;
      });
    },
    [isOnlineMatch, gameState, buildMode, selectedShipEdgeId, sendGameAction],
  );

  const handleHexClick = useCallback(
    (hexId: number) => {
      if (isOnlineMatch) {
        if (gameState.phase === 'move_robber') {
          soundEngine.playRobberAlert();
          sendGameAction('move_robber', { hexId });
        } else if (gameState.phase === 'select_disaster_hex') {
          soundEngine.playRobberAlert();
          sendGameAction('select_disaster_hex', { hexId });
        } else if (gameState.phase === 'select_plague_hex') {
          soundEngine.playRobberAlert();
          sendGameAction('select_plague_hex', { hexId });
        }
        return;
      }
      setLocalGameState((prev) => {
        if (prev.phase === 'move_robber') {
          soundEngine.playRobberAlert();
          return moveRobber(prev, hexId);
        }
        if (prev.phase === 'select_disaster_hex') {
          const next = applyDisasterHex(prev, hexId);
          if (next !== prev) {
            soundEngine.playRobberAlert();
            if (next.phase === 'game_over') soundEngine.playVictory();
          }
          return next;
        }
        if (prev.phase === 'select_plague_hex') {
          const next = applyPlagueHex(prev, hexId);
          if (next !== prev) {
            soundEngine.playRobberAlert();
            if (next.phase === 'game_over') soundEngine.playVictory();
          }
          return next;
        }
        return prev;
      });
    },
    [isOnlineMatch, gameState.phase, sendGameAction],
  );

  const handleDiscardConfirm = (playerId: number, selected: Partial<Record<ResourceType, number>>) => {
    soundEngine.playBuild(false);
    if (isOnlineMatch) {
      sendGameAction('discard', { selected });
      return;
    }
    setLocalGameState((prev) => discardCards(prev, playerId, selected));
  };

  const handleGoldPickConfirm = (playerId: number, picks: Partial<Record<ResourceType, number>>) => {
    soundEngine.playResourceChime();
    if (isOnlineMatch) {
      sendGameAction('pick_gold', { selected: picks });
      return;
    }
    setLocalGameState((prev) => pickGoldResources(prev, playerId, picks));
  };

  const handleStealVictim = (victimId: number) => {
    soundEngine.playTrade();
    if (isOnlineMatch) {
      sendGameAction('steal', { victimId });
      return;
    }
    setLocalGameState((prev) => executeSteal(prev, victimId));
  };

  const handleBuyDevCard = () => {
    soundEngine.playResourceChime();
    setBuildMode('none');
    setLocalBoughtDismissed(false);
    if (isOnlineMatch) {
      sendGameAction('buy_dev');
      return;
    }
    setLocalGameState((prev) => {
      const next = buyDevCard(prev);
      if (next.phase === 'game_over') soundEngine.playVictory();
      return next;
    });
  };

  const handleEndTurn = () => {
    setBuildMode('none');
    if (isOnlineMatch) {
      sendGameAction('end_turn');
      return;
    }
    setLocalGameState((prev) => {
      const next = endTurn(prev);
      if (next.phase === 'game_over') soundEngine.playVictory();
      return next;
    });
  };

  const handleFinishSpecialBuild = () => {
    setBuildMode('none');
    if (isOnlineMatch) {
      sendGameAction('finish_special_build');
      return;
    }
    setLocalGameState((prev) => {
      const next = finishSpecialBuildTurn(prev);
      if (next.phase === 'game_over') soundEngine.playVictory();
      return next;
    });
  };

  const handleMaritimeTrade = (give: ResourceType, receive: ResourceType) => {
    soundEngine.playTrade();
    if (isOnlineMatch) {
      sendGameAction('maritime_trade', { give, receive });
      return;
    }
    setLocalGameState((prev) => executeMaritimeTrade(prev, give, receive));
  };

  const handleDomesticTrade = (offer: TradeOffer): { accepted: boolean; pending?: boolean } => {
    if (isOnlineMatch) {
      sendGameAction('propose_trade', {
        toPlayerId: offer.toPlayerId,
        give: offer.give,
        want: offer.want,
      });
      const partner = gameState.players[offer.toPlayerId];
      if (partner?.isAI) {
        return { accepted: evaluateAIDomesticTrade(gameState, offer) };
      }
      return { accepted: false, pending: true };
    }

    const partner = localGameState.players[offer.toPlayerId];
    if (partner.isAI) {
      const ok = evaluateAIDomesticTrade(localGameState, offer);
      if (!ok) return { accepted: false };
    }
    soundEngine.playTrade();
    setLocalGameState((prev) => executeDomesticTrade(prev, offer));
    return { accepted: true };
  };

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const needsHumanDiscard = isOnlineMatch
    ? gameState.phase === 'discard' &&
      gameState.discardQueue.length > 0 &&
      gameState.discardQueue[0] === localSeatIndex
    : gameState.phase === 'discard' &&
      gameState.discardQueue.length > 0 &&
      !gameState.players[gameState.discardQueue[0]]?.isAI;
  const needsHumanGoldPick = isOnlineMatch
    ? gameState.phase === 'gold_pick' &&
      gameState.pendingGoldPicks.length > 0 &&
      gameState.pendingGoldPicks[0].playerId === localSeatIndex
    : gameState.phase === 'gold_pick' &&
      gameState.pendingGoldPicks.length > 0 &&
      !gameState.players[gameState.pendingGoldPicks[0].playerId]?.isAI;
  const needsHumanSteal = isOnlineMatch
    ? gameState.phase === 'steal' && gameState.currentPlayerIndex === localSeatIndex
    : gameState.phase === 'steal' && activePlayer && !activePlayer.isAI;

  const effectiveHudState = localBoughtDismissed
    ? { ...gameState, lastBoughtDevCard: null }
    : gameState;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-sky-200 dark:bg-slate-950">
      {/* Isolated Full-Viewport 3D Three.js Canvas */}
      <CatanScene
        gameState={gameState}
        buildMode={buildMode}
        selectedShipEdgeId={selectedShipEdgeId}
        cameraPreset={cameraPreset}
        cameraTrigger={cameraTrigger}
        darkMode={darkMode}
        localSeatIndex={localSeatIndex}
        onVertexClick={handleVertexClick}
        onEdgeClick={handleEdgeClick}
        onHexClick={handleHexClick}
      />

      {activeRoom && activeRoom.status === 'lobby' && authUser ? (
        <RoomLobbyOverlay
          lang={lang}
          room={activeRoom}
          user={authUser}
          onToggleReady={() => wsSend({ type: 'room:toggle_ready' })}
          onRerollMap={() => wsSend({ type: 'room:reroll_map' })}
          onStartMatch={() => wsSend({ type: 'room:start' })}
          onLeaveRoom={handleLeaveRoom}
          onSendChat={(text) => wsSend({ type: 'room:chat', text })}
        />
      ) : gameState.phase === 'title' ? (
        <TitleScreen
          lang={lang}
          darkMode={darkMode}
          config={config}
          authUser={authUser}
          authToken={authToken}
          openRooms={openRooms}
          onAuthSuccess={handleAuthSuccess}
          onLogout={handleLogout}
          onRefreshRooms={() => refreshRooms()}
          onEnterRoom={handleEnterRoom}
          onChangeConfig={handleChangeConfig}
          onToggleLang={handleToggleLang}
          onToggleDark={() => setDarkMode((d) => !d)}
          onStart={handleStartOfflineGame}
        />
      ) : (
        <GameHUD
          gameState={effectiveHudState}
          lang={lang}
          darkMode={darkMode}
          muted={muted}
          dockCollapsed={dockCollapsed}
          buildMode={buildMode}
          selectedShipEdgeId={selectedShipEdgeId}
          localSeatIndex={localSeatIndex}
          onlineRoomCode={isOnlineMatch ? activeRoom?.code : null}
          onlineChat={isOnlineMatch ? activeRoom?.chat : undefined}
          onSendChat={isOnlineMatch ? (text) => wsSend({ type: 'room:chat', text }) : undefined}
          onToggleDock={() => setDockCollapsed((v) => !v)}
          onToggleLang={handleToggleLang}
          onToggleDark={() => setDarkMode((d) => !d)}
          onToggleMute={() => setMuted((m) => !m)}
          onOpenRules={() => setShowRules(true)}
          onNewGame={handleNewGame}
          onCameraPreset={(p) => {
            setCameraPreset(p);
            setCameraTrigger((n) => n + 1);
          }}
          onRollDice={handleRollDice}
          onSetBuildMode={setBuildMode}
          onBuyDevCard={handleBuyDevCard}
          onOpenTrade={() => {
            setBuildMode('none');
            setShowTrade(true);
          }}
          onOpenDevCards={() => {
            setBuildMode('none');
            setShowDevCards(true);
          }}
          onDismissBoughtCard={() => {
            if (isOnlineMatch) setLocalBoughtDismissed(true);
            else setLocalGameState((prev) => ({ ...prev, lastBoughtDevCard: null }));
          }}
          onEndTurn={handleEndTurn}
          onFinishSpecialBuild={handleFinishSpecialBuild}
          onRerollMap={handleRerollOfflineMap}
        />
      )}

      {/* Contextual Game Modals */}
      {needsHumanDiscard && (
        <DiscardModal
          key={`discard-${gameState.discardQueue[0]}-${gameState.diceRollCount}`}
          gameState={gameState}
          lang={lang}
          onConfirm={handleDiscardConfirm}
        />
      )}

      {needsHumanGoldPick && (
        <GoldPickModal
          key={`gold-${gameState.pendingGoldPicks[0]?.playerId}-${gameState.turnNumber}-${gameState.diceRollCount}-${gameState.pendingGoldPicks.length}`}
          gameState={gameState}
          lang={lang}
          onConfirm={handleGoldPickConfirm}
        />
      )}

      {needsHumanSteal && (
        <StealModal gameState={gameState} lang={lang} onSelectVictim={handleStealVictim} />
      )}

      <AnimatePresence>
        {isOnlineMatch && localSeatIndex !== null && gameState.pendingTradeOffer?.toPlayerId === localSeatIndex && (
          <IncomingTradeModal
            key="incoming-trade-modal"
            gameState={gameState}
            lang={lang}
            localSeatIndex={localSeatIndex}
            onRespond={(accept) => sendGameAction('respond_trade', { accept })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrade && (
          <TradeModal
            key="trade-modal"
            gameState={gameState}
            lang={lang}
            localSeatIndex={localSeatIndex}
            onClose={() => setShowTrade(false)}
            onMaritimeTrade={handleMaritimeTrade}
            onDomesticTrade={handleDomesticTrade}
            onCancelPendingTrade={isOnlineMatch ? () => sendGameAction('cancel_trade') : undefined}
          />
        )}
      </AnimatePresence>

      {showDevCards && (
        <DevCardsModal
          gameState={gameState}
          lang={lang}
          localSeatIndex={localSeatIndex}
          onClose={() => setShowDevCards(false)}
          onBuyDevCard={handleBuyDevCard}
          onPlayKnight={(cardId) => {
            soundEngine.playRobberAlert();
            if (isOnlineMatch) {
              sendGameAction('play_knight', { cardId });
              return;
            }
            setLocalGameState((prev) => {
              const next = playKnightCard(prev, cardId);
              if (next.phase === 'game_over') soundEngine.playVictory();
              return next;
            });
          }}
          onPlayRoadBuilding={(cardId) => {
            soundEngine.playBuild(false);
            if (isOnlineMatch) {
              sendGameAction('play_road_building', { cardId });
              return;
            }
            setLocalGameState((prev) => playRoadBuildingCard(prev, cardId));
          }}
          onPlayYearOfPlenty={(cardId, r1, r2) => {
            soundEngine.playResourceChime();
            if (isOnlineMatch) {
              sendGameAction('play_year_of_plenty', { cardId, r1, r2 });
              return;
            }
            setLocalGameState((prev) => playYearOfPlentyCard(prev, cardId, r1, r2));
          }}
          onPlayMonopoly={(cardId, res) => {
            soundEngine.playTrade();
            if (isOnlineMatch) {
              sendGameAction('play_monopoly', { cardId, res });
              return;
            }
            setLocalGameState((prev) => playMonopolyCard(prev, cardId, res));
          }}
          onPlayDisaster={(cardId) => {
            soundEngine.playRobberAlert();
            if (isOnlineMatch) {
              sendGameAction('play_disaster', { cardId });
              return;
            }
            setLocalGameState((prev) => playDisasterCard(prev, cardId));
          }}
          onPlayPlague={(cardId) => {
            soundEngine.playRobberAlert();
            if (isOnlineMatch) {
              sendGameAction('play_plague', { cardId });
              return;
            }
            setLocalGameState((prev) => playPlagueCard(prev, cardId));
          }}
        />
      )}

      {showRules && <RulesModal lang={lang} onClose={() => setShowRules(false)} />}

      {gameState.phase === 'game_over' && (
        <VictoryModal gameState={gameState} lang={lang} onPlayAgain={handleNewGame} />
      )}
    </main>
  );
}
