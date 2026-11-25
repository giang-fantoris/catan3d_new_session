import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Anchor, ArrowLeft, ArrowLeftRight, ArrowRight, Award, Check, CloudLightning, Coins, Compass, Crown, Landmark, Layers, Shield, Skull, Sparkles, Users, Waves, X } from 'lucide-react';
import {
  BUILD_COSTS,
  canAfford,
  canPlayDevCard,
  createEmptyResources,
  getHiddenVPCardsCount,
  getMaritimeTradeRate,
  getTotalVP,
  getVisibleVP,
  isValidDomesticTrade,
  totalResources,
} from '../game/catanEngine';
import { ALL_RESOURCES } from '../game/hexMath';
import { devCardLabel, harborLabel, playerColorHex, resourceLabel, t } from '../i18n/translations';
import { DevCardType, GameState, HarborType, Language, ResourceType, TradeOffer } from '../types/catan';
import { RESOURCE_STYLES, ResourceIcon } from './ResourceIcons';

// 1. Discard >7 Cards Modal
export const DiscardModal: React.FC<{
  gameState: GameState;
  lang: Language;
  onConfirm: (playerId: number, selected: Partial<Record<ResourceType, number>>) => void;
}> = ({ gameState, lang, onConfirm }) => {
  const pid = gameState.discardQueue[0];
  const player = gameState.players[pid];
  const [selected, setSelected] = useState<Record<ResourceType, number>>(createEmptyResources());

  if (!player) return null;
  const total = totalResources(player.resources);
  const need = Math.floor(total / 2);
  const currentSelected = totalResources(selected);

  const adjust = (res: ResourceType, delta: number) => {
    const nextVal = selected[res] + delta;
    if (nextVal < 0 || nextVal > player.resources[res]) return;
    if (delta > 0 && currentSelected >= need) return;
    setSelected({ ...selected, [res]: nextVal });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'discardTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {t(lang, 'discardSubtitle', { name: player.name, total, need })}
        </p>

        <div className="mt-4 space-y-2.5">
          {ALL_RESOURCES.map((res) => (
            <div
              key={res}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              <div className="flex items-center gap-2.5">
                <span className={`p-2 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                  <ResourceIcon type={res} className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {resourceLabel(lang, res)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {player.resources[res]}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjust(res, -1)}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  -
                </button>
                <span className="w-6 text-center font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {selected[res]}
                </span>
                <button
                  type="button"
                  onClick={() => adjust(res, 1)}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {t(lang, 'discardSelected', { selected: currentSelected, need })}
          </span>
          <button
            type="button"
            disabled={currentSelected !== need}
            onClick={() => onConfirm(pid, selected)}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {t(lang, 'confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 1b. Gold River Resource Picker Modal
export const GoldPickModal: React.FC<{
  gameState: GameState;
  lang: Language;
  onConfirm: (playerId: number, picks: Partial<Record<ResourceType, number>>) => void;
}> = ({ gameState, lang, onConfirm }) => {
  const item = gameState.pendingGoldPicks[0];
  const player = item ? gameState.players[item.playerId] : null;
  const [selected, setSelected] = useState<Record<ResourceType, number>>(createEmptyResources());

  if (!item || !player) return null;
  const bankTotal = totalResources(gameState.bank);
  const need = Math.min(item.count, bankTotal);
  const currentSelected = totalResources(selected);

  const adjust = (res: ResourceType, delta: number) => {
    const nextVal = selected[res] + delta;
    if (nextVal < 0 || nextVal > gameState.bank[res]) return;
    if (delta > 0 && currentSelected >= need) return;
    setSelected({ ...selected, [res]: nextVal });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-500">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'goldPickTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {t(lang, 'goldPickSubtitle', { name: player.name, count: need })}
        </p>

        <div className="mt-4 space-y-2.5">
          {ALL_RESOURCES.map((res) => (
            <div
              key={res}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              <div className="flex items-center gap-2.5">
                <span className={`p-2 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                  <ResourceIcon type={res} className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {resourceLabel(lang, res)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {t(lang, 'bank')}: {gameState.bank[res]}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjust(res, -1)}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  -
                </button>
                <span className="w-6 text-center font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {selected[res]}
                </span>
                <button
                  type="button"
                  onClick={() => adjust(res, 1)}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {t(lang, 'goldPickSelected', { selected: currentSelected, need })}
          </span>
          <button
            type="button"
            disabled={currentSelected !== need}
            onClick={() => onConfirm(item.playerId, selected)}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {t(lang, 'confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. Steal Target Modal
export const StealModal: React.FC<{
  gameState: GameState;
  lang: Language;
  onSelectVictim: (victimId: number) => void;
}> = ({ gameState, lang, onSelectVictim }) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'stealTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {gameState.stealKind === 'pirate' ? t(lang, 'phaseStealPirate') : t(lang, 'stealSubtitle')}
        </p>
        <div className="mt-4 space-y-2">
          {gameState.stealCandidates.map((vid) => {
            const p = gameState.players[vid];
            const count = totalResources(p.resources);
            return (
              <button
                key={vid}
                type="button"
                onClick={() => onSelectVictim(vid)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-900 dark:text-white font-bold transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-sm"
                    style={{ backgroundColor: playerColorHex(p.color) }}
                  />
                  <span>{p.name}</span>
                </span>
                <span className="text-xs tabular-nums">
                  {count} {t(lang, 'cards')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Helper types & sub-components for smooth Trade card animations
interface TradeCardToken {
  key: string;
  res: ResourceType;
  index: number;
}

interface ExchangeBurst {
  id: number;
  mode: 'maritime' | 'domestic';
  give: Partial<Record<ResourceType, number>>;
  receive: Partial<Record<ResourceType, number>>;
  partnerName: string;
}

function expandCardTokens(
  counts: Partial<Record<ResourceType, number>>,
  prefix: string,
): { tokens: TradeCardToken[]; total: number; overflow: number } {
  const all: TradeCardToken[] = [];
  for (const res of ALL_RESOURCES) {
    const qty = Math.max(0, counts[res] || 0);
    for (let i = 0; i < qty; i++) {
      all.push({ key: `${prefix}-${res}-${i}`, res, index: all.length });
    }
  }
  const maxVisible = 5;
  return {
    tokens: all.slice(0, maxVisible),
    total: all.length,
    overflow: Math.max(0, all.length - maxVisible),
  };
}

const MiniTradeCard: React.FC<{
  res: ResourceType;
  lang: Language;
  compact?: boolean;
}> = ({ res, lang, compact = false }) => {
  const style = RESOURCE_STYLES[res];
  return (
    <div
      title={resourceLabel(lang, res)}
      className={`${
        compact ? 'w-8 h-10' : 'w-9 h-12'
      } rounded-lg border-2 ${style.bg} ${style.text} ${style.border} shadow-sm flex flex-col items-center justify-center shrink-0 select-none`}
    >
      <ResourceIcon type={res} className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span className="text-[8px] font-extrabold uppercase tracking-tight leading-none mt-0.5 truncate max-w-[90%]">
        {resourceLabel(lang, res).slice(0, 4)}
      </span>
    </div>
  );
};

const TradeExchangeStage: React.FC<{
  lang: Language;
  leftName: string;
  leftColor: string;
  rightName: string;
  rightColor?: string;
  isBank?: boolean;
  give: Partial<Record<ResourceType, number>>;
  receive: Partial<Record<ResourceType, number>>;
  burst: ExchangeBurst | null;
  rateLabelText?: string;
}> = ({
  lang,
  leftName,
  leftColor,
  rightName,
  rightColor,
  isBank = false,
  give,
  receive,
  burst,
  rateLabelText,
}) => {
  const giveExpanded = expandCardTokens(give, 'give');
  const recvExpanded = expandCardTokens(receive, 'recv');
  const burstGive = burst ? expandCardTokens(burst.give, `bgive-${burst.id}`) : null;
  const burstRecv = burst ? expandCardTokens(burst.receive, `brecv-${burst.id}`) : null;

  return (
    <div className="relative rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t(lang, 'exchangePreview')}
        </span>
        {rateLabelText && (
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-blue-600 text-white tabular-nums">
            {rateLabelText}
          </span>
        )}
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-[68px]">
        {/* Left Side: Active Player */}
        <div className="flex flex-col items-start gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-full">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: leftColor }} />
            <span className="truncate">{leftName}</span>
          </div>
          <div className="flex items-center -space-x-1.5 min-h-[44px]">
            <AnimatePresence mode="popLayout">
              {giveExpanded.tokens.length === 0 ? (
                <motion.span
                  key="empty-give"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] font-medium text-slate-400 dark:text-slate-500 italic"
                >
                  —
                </motion.span>
              ) : (
                giveExpanded.tokens.map((tok, i) => (
                  <motion.div
                    key={tok.key}
                    layout
                    initial={{ scale: 0.45, opacity: 0, y: 10, rotate: -8 }}
                    animate={{ scale: 1, opacity: 1, y: 0, rotate: (i - (giveExpanded.tokens.length - 1) / 2) * 3 }}
                    exit={{ scale: 0.4, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  >
                    <MiniTradeCard res={tok.res} lang={lang} compact />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
            {giveExpanded.overflow > 0 && (
              <motion.span
                layout
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="ml-2 px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-extrabold tabular-nums z-10"
              >
                +{giveExpanded.overflow}
              </motion.span>
            )}
          </div>
        </div>

        {/* Center Exchange Indicator */}
        <div className="flex flex-col items-center justify-center px-1 text-slate-500 dark:text-slate-400">
          <motion.div
            animate={
              burst
                ? { scale: [1, 1.25, 1], rotate: [0, 180, 360] }
                : giveExpanded.total > 0 && recvExpanded.total > 0
                  ? { x: [0, 3, -3, 0] }
                  : { x: 0 }
            }
            transition={{ duration: burst ? 0.55 : 0.45, ease: 'easeInOut' }}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              burst
                ? 'bg-emerald-600 text-white'
                : giveExpanded.total > 0 && recvExpanded.total > 0
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </motion.div>
        </div>

        {/* Right Side: Bank or Trade Partner */}
        <div className="flex flex-col items-end gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-full">
            <span className="truncate">{rightName}</span>
            {isBank ? (
              <Landmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            ) : (
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: rightColor || '#64748B' }}
              />
            )}
          </div>
          <div className="flex items-center justify-end -space-x-1.5 min-h-[44px]">
            {recvExpanded.overflow > 0 && (
              <motion.span
                layout
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mr-2 px-1.5 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-extrabold tabular-nums z-10"
              >
                +{recvExpanded.overflow}
              </motion.span>
            )}
            <AnimatePresence mode="popLayout">
              {recvExpanded.tokens.length === 0 ? (
                <motion.span
                  key="empty-recv"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] font-medium text-slate-400 dark:text-slate-500 italic"
                >
                  —
                </motion.span>
              ) : (
                recvExpanded.tokens.map((tok, i) => (
                  <motion.div
                    key={tok.key}
                    layout
                    initial={{ scale: 0.45, opacity: 0, y: 10, rotate: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0, rotate: (i - (recvExpanded.tokens.length - 1) / 2) * 3 }}
                    exit={{ scale: 0.4, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  >
                    <MiniTradeCard res={tok.res} lang={lang} compact />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Cross-flight Animated Cards Layer when Trade Executes */}
        <AnimatePresence>
          {burst && burstGive && burstRecv && (
            <motion.div
              key={`burst-overlay-${burst.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-100/90 dark:bg-slate-800/90 rounded-lg"
            >
              {/* Outgoing Cards Flying Left -> Right */}
              <div className="absolute left-4 flex items-center -space-x-2">
                {burstGive.tokens.map((tok, idx) => (
                  <motion.div
                    key={tok.key}
                    initial={{ x: 0, y: 0, scale: 1, rotate: -6, opacity: 1 }}
                    animate={{
                      x: [0, 72, 160],
                      y: [0, -18, -2],
                      scale: [1, 1.12, 0.72],
                      rotate: [-6, 4, 12],
                      opacity: [1, 1, 0],
                    }}
                    transition={{
                      duration: 0.64,
                      delay: idx * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <MiniTradeCard res={tok.res} lang={lang} compact />
                  </motion.div>
                ))}
              </div>

              {/* Incoming Cards Flying Right -> Left */}
              <div className="absolute right-4 flex items-center -space-x-2">
                {burstRecv.tokens.map((tok, idx) => (
                  <motion.div
                    key={tok.key}
                    initial={{ x: 0, y: 0, scale: 0.9, rotate: 6, opacity: 0 }}
                    animate={{
                      x: [0, -72, -160],
                      y: [0, 18, 2],
                      scale: [0.9, 1.16, 0.85],
                      rotate: [6, -4, -10],
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      duration: 0.68,
                      delay: 0.08 + idx * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <MiniTradeCard res={tok.res} lang={lang} compact />
                  </motion.div>
                ))}
              </div>

              {/* Crisp Solid Completion Badge */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ delay: 0.42, type: 'spring', stiffness: 420, damping: 24 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-extrabold shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'tradeSuccessAnim')}</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// 3. Trade Modal (Maritime + Domestic)
export const TradeModal: React.FC<{
  gameState: GameState;
  lang: Language;
  localSeatIndex?: number | null;
  onClose: () => void;
  onMaritimeTrade: (give: ResourceType, receive: ResourceType) => void;
  onDomesticTrade: (offer: TradeOffer) => { accepted: boolean; pending?: boolean };
  onCancelPendingTrade?: () => void;
}> = ({ gameState, lang, localSeatIndex = null, onClose, onMaritimeTrade, onDomesticTrade, onCancelPendingTrade }) => {
  const player = gameState.players[gameState.currentPlayerIndex];
  const isOnline = localSeatIndex !== null && localSeatIndex !== undefined;
  const [tab, setTab] = useState<'maritime' | 'domestic'>('maritime');

  // Maritime state
  const [mGive, setMGive] = useState<ResourceType>('wood');
  const [mRecv, setMRecv] = useState<ResourceType>('brick');
  const rate = getMaritimeTradeRate(gameState, player.id, mGive);
  const canMaritime =
    mGive !== mRecv && player.resources[mGive] >= rate && gameState.bank[mRecv] >= 1;

  // Domestic state
  const others = gameState.players.filter((p) => p.id !== player.id);
  const [targetId, setTargetId] = useState<number>(others[0]?.id ?? 0);
  const [giveMap, setGiveMap] = useState<Record<ResourceType, number>>(createEmptyResources());
  const [wantMap, setWantMap] = useState<Record<ResourceType, number>>(createEmptyResources());
  const [feedback, setFeedback] = useState<{ text: string; tone: 'success' | 'error' | 'info' } | null>(null);

  // Smooth exchange animation burst state
  const burstCounterRef = useRef(0);
  const [burst, setBurst] = useState<ExchangeBurst | null>(null);
  const prevPendingRef = useRef<TradeOffer | null>(gameState.pendingTradeOffer ?? null);
  const prevResourcesRef = useRef<Record<ResourceType, number>>(player.resources);

  const triggerBurst = (nextBurst: Omit<ExchangeBurst, 'id'>) => {
    burstCounterRef.current += 1;
    setBurst({ ...nextBurst, id: burstCounterRef.current });
  };

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => {
      setBurst((curr) => (curr && curr.id === burst.id ? null : curr));
    }, 1150);
    return () => window.clearTimeout(timer);
  }, [burst]);

  // Detect asynchronous online trade acceptance when pendingTradeOffer resolves
  useEffect(() => {
    const prevOffer = prevPendingRef.current;
    const prevRes = prevResourcesRef.current;
    const currOffer = gameState.pendingTradeOffer ?? null;

    if (prevOffer && prevOffer.fromPlayerId === player.id && !currOffer) {
      const gainedWanted = ALL_RESOURCES.some(
        (r) => (prevOffer.want[r] || 0) > 0 && player.resources[r] >= (prevRes[r] || 0) + (prevOffer.want[r] || 0),
      );
      const partnerName = gameState.players[prevOffer.toPlayerId]?.name || '';
      if (gainedWanted) {
        triggerBurst({
          mode: 'domestic',
          give: prevOffer.give,
          receive: prevOffer.want,
          partnerName,
        });
        setFeedback({ text: t(lang, 'tradeAccepted', { name: partnerName }), tone: 'success' });
        setGiveMap(createEmptyResources());
        setWantMap(createEmptyResources());
      } else {
        setFeedback({ text: t(lang, 'tradeRejected', { name: partnerName }), tone: 'error' });
      }
    }

    prevPendingRef.current = currOffer;
    prevResourcesRef.current = player.resources;
  }, [gameState.pendingTradeOffer, gameState.players, lang, player.id, player.resources]);

  const offer: TradeOffer = {
    fromPlayerId: player.id,
    toPlayerId: targetId,
    give: giveMap,
    want: wantMap,
  };
  const targetPlayer = gameState.players[targetId];
  const isTargetMasked = Boolean(targetPlayer?.isMasked);
  const hasAnyGive = ALL_RESOURCES.some((r) => (giveMap[r] || 0) > 0 && (giveMap[r] || 0) <= player.resources[r]);
  const hasAnyWant = ALL_RESOURCES.some((r) => (wantMap[r] || 0) > 0);
  const noOverlap = ALL_RESOURCES.every((r) => !((giveMap[r] || 0) > 0 && (wantMap[r] || 0) > 0));
  const validDomestic = isTargetMasked ? hasAnyGive && hasAnyWant && noOverlap : isValidDomesticTrade(gameState, offer);

  const handleMaritimeClick = () => {
    if (!canMaritime) return;
    triggerBurst({
      mode: 'maritime',
      give: { [mGive]: rate },
      receive: { [mRecv]: 1 },
      partnerName: t(lang, 'bank'),
    });
    onMaritimeTrade(mGive, mRecv);
  };

  const handlePropose = () => {
    if (!validDomestic) {
      setFeedback({ text: t(lang, 'tradeInvalid'), tone: 'error' });
      return;
    }
    const res = onDomesticTrade(offer);
    const partnerName = gameState.players[targetId].name;
    if (res.pending) {
      setFeedback({ text: t(lang, 'tradeSentPending', { name: partnerName }), tone: 'info' });
      return;
    }
    if (res.accepted) {
      triggerBurst({
        mode: 'domestic',
        give: { ...giveMap },
        receive: { ...wantMap },
        partnerName,
      });
      setFeedback({ text: t(lang, 'tradeAccepted', { name: partnerName }), tone: 'success' });
      setGiveMap(createEmptyResources());
      setWantMap(createEmptyResources());
    } else {
      setFeedback({ text: t(lang, 'tradeRejected', { name: partnerName }), tone: 'error' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'trade')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'close')}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('maritime')}
            className={`relative py-2 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              tab === 'maritime'
                ? 'text-white'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab === 'maritime' && (
              <motion.span
                layoutId="tradeActiveTabBg"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-blue-600"
              />
            )}
            <span className="relative z-10">{t(lang, 'maritimeTrade')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('domestic')}
            className={`relative py-2 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              tab === 'domestic'
                ? 'text-white'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab === 'domestic' && (
              <motion.span
                layoutId="tradeActiveTabBg"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-blue-600"
              />
            )}
            <span className="relative z-10">{t(lang, 'domesticTrade')}</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'maritime' ? (
            <motion.div
              key="maritime-tab"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Active Harbors Summary */}
              <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400 mr-1">
                  {t(lang, 'activeHarbors')}:
                </span>
                {(() => {
                  const ownedHarbors = Array.from(
                    new Set(
                      Object.values(gameState.vertices)
                        .filter((v) => v.ownerId === player.id && v.harbor !== null)
                        .map((v) => v.harbor as HarborType),
                    ),
                  );
                  if (ownedHarbors.length === 0) {
                    return <span className="font-semibold text-slate-600 dark:text-slate-300">{t(lang, 'noHarborsYet')}</span>;
                  }
                  return ownedHarbors.map((h) => (
                    <span
                      key={h}
                      className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-bold text-[11px]"
                    >
                      {harborLabel(lang, h)}
                    </span>
                  ));
                })()}
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                  {t(lang, 'youGive')}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {ALL_RESOURCES.map((res) => {
                    const rRate = getMaritimeTradeRate(gameState, player.id, res);
                    const active = mGive === res;
                    return (
                      <motion.button
                        key={res}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMGive(res)}
                        className={`p-2 rounded-xl flex flex-col items-center gap-1 border-2 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                          active
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                            : 'border-transparent bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                          <ResourceIcon type={res} className="w-4 h-4" />
                        </span>
                        <motion.span
                          key={`${res}-${player.resources[res]}`}
                          initial={{ scale: 1.25 }}
                          animate={{ scale: 1 }}
                          className="text-[11px] font-bold text-slate-900 dark:text-white tabular-nums"
                        >
                          {player.resources[res]} ({rRate}:1)
                        </motion.span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                  {t(lang, 'youReceive')}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {ALL_RESOURCES.map((res) => {
                    const active = mRecv === res;
                    return (
                      <motion.button
                        key={res}
                        type="button"
                        disabled={res === mGive}
                        whileHover={res === mGive ? undefined : { y: -2 }}
                        whileTap={res === mGive ? undefined : { scale: 0.95 }}
                        onClick={() => setMRecv(res)}
                        className={`p-2 rounded-xl flex flex-col items-center gap-1 border-2 cursor-pointer disabled:opacity-35 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950'
                            : 'border-transparent bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                          <ResourceIcon type={res} className="w-4 h-4" />
                        </span>
                        <motion.span
                          key={`bank-${res}-${gameState.bank[res]}`}
                          initial={{ scale: 1.2 }}
                          animate={{ scale: 1 }}
                          className="text-[11px] font-bold text-slate-900 dark:text-white tabular-nums"
                        >
                          {t(lang, 'bank')}: {gameState.bank[res]}
                        </motion.span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Maritime Visual Card Exchange Stage */}
              <TradeExchangeStage
                lang={lang}
                leftName={player.name}
                leftColor={playerColorHex(player.color)}
                rightName={t(lang, 'bank')}
                isBank
                give={{ [mGive]: rate }}
                receive={mGive !== mRecv ? { [mRecv]: 1 } : {}}
                burst={burst && burst.mode === 'maritime' ? burst : null}
                rateLabelText={`${rate} : 1`}
              />

              <div className="flex items-center justify-between pt-1">
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  {t(lang, 'rateLabel')}: <span className="text-blue-600">{rate} : 1</span>
                </div>
                <motion.button
                  type="button"
                  disabled={!canMaritime}
                  whileHover={canMaritime ? { scale: 1.02 } : undefined}
                  whileTap={canMaritime ? { scale: 0.96 } : undefined}
                  onClick={handleMaritimeClick}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600"
                >
                  {t(lang, 'executeTrade')}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="domestic-tab"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Partner Selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                  {t(lang, 'tradeWith')}:
                </span>
                {others.map((op) => (
                  <motion.button
                    key={op.id}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setTargetId(op.id);
                      setFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      targetId === op.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: playerColorHex(op.color) }}
                    />
                    <span>{op.name}</span>
                    <span className="opacity-75 tabular-nums">({totalResources(op.resources)})</span>
                  </motion.button>
                ))}
              </div>

              {/* Give vs Want Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-2">
                  <div className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-orange-600" />
                    <span>{t(lang, 'youGive')}</span>
                  </div>
                  {ALL_RESOURCES.map((res) => (
                    <div key={res} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                        <span className={`p-1 rounded ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                          <ResourceIcon type={res} className="w-3.5 h-3.5" />
                        </span>
                        {resourceLabel(lang, res)} ({player.resources[res]})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.88 }}
                          onClick={() => setGiveMap({ ...giveMap, [res]: Math.max(0, giveMap[res] - 1) })}
                          className="w-6 h-6 rounded bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold cursor-pointer transition-colors"
                        >
                          -
                        </motion.button>
                        <motion.span
                          key={`give-${res}-${giveMap[res]}`}
                          initial={{ scale: 1.35 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                          className="w-4 text-center font-extrabold tabular-nums text-slate-900 dark:text-white"
                        >
                          {giveMap[res]}
                        </motion.span>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.88 }}
                          onClick={() =>
                            setGiveMap({
                              ...giveMap,
                              [res]: Math.min(player.resources[res], giveMap[res] + 1),
                            })
                          }
                          className="w-6 h-6 rounded bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold cursor-pointer transition-colors"
                        >
                          +
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-2">
                  <div className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t(lang, 'youReceive')}</span>
                  </div>
                  {ALL_RESOURCES.map((res) => {
                    const targetStock = gameState.players[targetId]?.resources[res] ?? 0;
                    const maxWant = isTargetMasked ? 19 : targetStock;
                    return (
                      <div key={res} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                          <span className={`p-1 rounded ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                            <ResourceIcon type={res} className="w-3.5 h-3.5" />
                          </span>
                          {resourceLabel(lang, res)} {!isTargetMasked ? `(${targetStock})` : ''}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            onClick={() => setWantMap({ ...wantMap, [res]: Math.max(0, wantMap[res] - 1) })}
                            className="w-6 h-6 rounded bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold cursor-pointer transition-colors"
                          >
                            -
                          </motion.button>
                          <motion.span
                            key={`want-${res}-${wantMap[res]}`}
                            initial={{ scale: 1.35 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                            className="w-4 text-center font-extrabold tabular-nums text-slate-900 dark:text-white"
                          >
                            {wantMap[res]}
                          </motion.span>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            onClick={() =>
                              setWantMap({
                                ...wantMap,
                                [res]: Math.min(maxWant, wantMap[res] + 1),
                              })
                            }
                            className="w-6 h-6 rounded bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold cursor-pointer transition-colors"
                          >
                            +
                          </motion.button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Domestic Live Card Exchange Preview & Cross-Flight Animation */}
              <TradeExchangeStage
                lang={lang}
                leftName={player.name}
                leftColor={playerColorHex(player.color)}
                rightName={targetPlayer?.name || ''}
                rightColor={targetPlayer ? playerColorHex(targetPlayer.color) : '#64748B'}
                give={giveMap}
                receive={wantMap}
                burst={burst && burst.mode === 'domestic' ? burst : null}
              />

              {isOnline && isTargetMasked && (
                <div className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200">
                  {t(lang, 'onlineTradeNote')}
                </div>
              )}

              <AnimatePresence>
                {gameState.pendingTradeOffer && gameState.pendingTradeOffer.fromPlayerId === player.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-xs font-bold"
                  >
                    <span>
                      {t(lang, 'tradeSentPending', {
                        name: gameState.players[gameState.pendingTradeOffer.toPlayerId]?.name || '',
                      })}
                    </span>
                    {onCancelPendingTrade && (
                      <button
                        type="button"
                        onClick={onCancelPendingTrade}
                        className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] font-extrabold cursor-pointer"
                      >
                        {t(lang, 'cancelTrade')}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {feedback && (
                  <motion.div
                    key={feedback.text}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={`text-xs font-bold px-3 py-2 rounded-lg ${
                      feedback.tone === 'success'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200'
                        : feedback.tone === 'error'
                          ? 'bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    }`}
                  >
                    {feedback.text}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-end">
                <motion.button
                  type="button"
                  disabled={!validDomestic || Boolean(gameState.pendingTradeOffer)}
                  whileHover={validDomestic && !gameState.pendingTradeOffer ? { scale: 1.02 } : undefined}
                  whileTap={validDomestic && !gameState.pendingTradeOffer ? { scale: 0.96 } : undefined}
                  onClick={handlePropose}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-orange-600"
                >
                  {t(lang, 'proposeTrade')}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

// 4. Dev Cards Modal (plus Year of Plenty & Monopoly sub-pickers)
export const DevCardsModal: React.FC<{
  gameState: GameState;
  lang: Language;
  localSeatIndex?: number | null;
  onClose: () => void;
  onBuyDevCard: () => void;
  onPlayKnight: (cardId: string) => void;
  onPlayRoadBuilding: (cardId: string) => void;
  onPlayYearOfPlenty: (cardId: string, r1: ResourceType, r2: ResourceType) => void;
  onPlayMonopoly: (cardId: string, res: ResourceType) => void;
  onPlayDisaster: (cardId: string) => void;
  onPlayPlague: (cardId: string) => void;
}> = ({
  gameState,
  lang,
  localSeatIndex = null,
  onClose,
  onBuyDevCard,
  onPlayKnight,
  onPlayRoadBuilding,
  onPlayYearOfPlenty,
  onPlayMonopoly,
  onPlayDisaster,
  onPlayPlague,
}) => {
  const active = gameState.players[gameState.currentPlayerIndex];
  const humanPlayers = gameState.players.filter((p) => !p.isAI);
  const isOnline = localSeatIndex !== null && localSeatIndex !== undefined;
  const player = isOnline
    ? gameState.players[localSeatIndex] || active
    : !active.isAI
    ? active
    : humanPlayers.length === 1
    ? humanPlayers[0]
    : active;
  const isPlayersTurn = active.id === player.id && !player.isAI;
  const canBuyNow =
    isPlayersTurn &&
    (gameState.phase === 'action' || gameState.phase === 'special_build') &&
    gameState.devDeck.length > 0 &&
    canAfford(player.resources, BUILD_COSTS.devCard);
  const unplayed = player.devCards.filter((c) => !c.played);
  const played = player.devCards.filter((c) => c.played);
  const [pickingYopId, setPickingYopId] = useState<string | null>(null);
  const [yop1, setYop1] = useState<ResourceType>('wood');
  const [yop2, setYop2] = useState<ResourceType>('brick');
  const [pickingMonoId, setPickingMonoId] = useState<string | null>(null);

  const getCardMeta = (type: DevCardType) => {
    if (type === 'knight') {
      return {
        badge: t(lang, 'knightCategory'),
        badgeCls: 'bg-red-600 text-white',
        icon: <Shield className="w-4 h-4 text-red-600" />,
      };
    }
    if (type === 'victoryPoint') {
      return {
        badge: t(lang, 'vpCategory'),
        badgeCls: 'bg-amber-500 text-slate-950',
        icon: <Crown className="w-4 h-4 text-amber-500" />,
      };
    }
    if (type === 'disaster') {
      return {
        badge: t(lang, 'hazardCategory'),
        badgeCls: 'bg-orange-600 text-white',
        icon: <CloudLightning className="w-4 h-4 text-orange-600" />,
      };
    }
    if (type === 'plague') {
      return {
        badge: t(lang, 'hazardCategory'),
        badgeCls: 'bg-lime-700 text-white',
        icon: <Skull className="w-4 h-4 text-lime-700" />,
      };
    }
    return {
      badge: t(lang, 'progressCategory'),
      badgeCls: 'bg-emerald-600 text-white',
      icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
    };
  };

  const totalDeckSize = gameState.gameMode === 'expanded' && gameState.players.length >= 5 ? 36 : 27;

  if (pickingYopId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t(lang, 'yearOfPlentyTitle')}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {t(lang, 'yearOfPlentySubtitle')}
          </p>
          <div className="mt-4 space-y-3">
            {[yop1, yop2].map((val, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-2">
                {ALL_RESOURCES.map((res) => {
                  const bankEmpty = gameState.bank[res] <= 0;
                  return (
                    <button
                      key={res}
                      type="button"
                      disabled={bankEmpty}
                      onClick={() => (idx === 0 ? setYop1(res) : setYop2(res))}
                      className={`p-2 rounded-xl flex flex-col items-center gap-1 border-2 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                        val === res
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                          : 'border-transparent bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      <span className={`p-1.5 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                        <ResourceIcon type={res} className="w-4 h-4" />
                      </span>
                      <span className="text-[10px] font-bold text-slate-900 dark:text-white">
                        {resourceLabel(lang, res)} ({gameState.bank[res]})
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPickingYopId(null)}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onPlayYearOfPlenty(pickingYopId, yop1, yop2);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm cursor-pointer"
            >
              {t(lang, 'confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pickingMonoId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t(lang, 'monopolyTitle')}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {t(lang, 'monopolySubtitle')}
          </p>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {ALL_RESOURCES.map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => {
                  onPlayMonopoly(pickingMonoId, res);
                  onClose();
                }}
                className="p-2.5 rounded-xl flex flex-col items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
              >
                <span className={`p-1.5 rounded-lg ${RESOURCE_STYLES[res].bg} ${RESOURCE_STYLES[res].text}`}>
                  <ResourceIcon type={res} className="w-4 h-4" />
                </span>
                <span className="text-[11px] font-bold">{resourceLabel(lang, res)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setPickingMonoId(null)}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-sm cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {t(lang, 'devCards')} — {player.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'close')}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Buy New Development Card & Deck Status Bar */}
        <div className="mb-4 p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
              {t(lang, 'devDeckRemaining', { count: gameState.devDeck.length, total: totalDeckSize })}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              <span>{t(lang, 'devCardCostLabel')}:</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-lime-600 text-white font-bold">
                1 {t(lang, 'wool')}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold">
                1 {t(lang, 'grain')}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-600 text-white font-bold">
                1 {t(lang, 'ore')}
              </span>
            </div>
            {!canBuyNow && gameState.devDeck.length > 0 && (
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {!isPlayersTurn
                  ? t(lang, 'waitYourTurn')
                  : gameState.phase !== 'action' && gameState.phase !== 'special_build'
                  ? t(lang, 'needActionPhase')
                  : t(lang, 'notEnoughRes')}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!canBuyNow}
            onClick={onBuyDevCard}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            +{t(lang, 'buyDevCardBtn')}
          </button>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="font-extrabold text-base text-slate-900 dark:text-white tabular-nums">
              {unplayed.length}
            </div>
            <div className="text-slate-500 dark:text-slate-400 font-semibold">{t(lang, 'devCards')}</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="font-extrabold text-base text-red-600 tabular-nums">{player.knightsPlayed}</div>
            <div className="text-slate-500 dark:text-slate-400 font-semibold">{t(lang, 'knights')}</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="font-extrabold text-base text-amber-500 tabular-nums">
              {getHiddenVPCardsCount(player)}
            </div>
            <div className="text-slate-500 dark:text-slate-400 font-semibold">{t(lang, 'vp')}</div>
          </div>
        </div>

        {gameState.devCardPlayedThisTurn && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-xs font-bold">
            {t(lang, 'alreadyPlayedDev')}
          </div>
        )}

        {unplayed.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400 py-4 px-3 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            {t(lang, 'noDevCards')}
          </p>
        ) : (
          <div className="space-y-2.5">
            {unplayed.map((card) => {
              const playable = canPlayDevCard(gameState, player.id, card.id);
              const boughtNow = card.boughtOnTurn === gameState.turnNumber;
              const meta = getCardMeta(card.type);
              return (
                <div
                  key={card.id}
                  className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {meta.icon}
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {devCardLabel(lang, card.type)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${meta.badgeCls}`}>
                        {meta.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {t(lang, `${card.type}Desc`)}
                    </p>
                    {card.type === 'victoryPoint' ? (
                      <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        {t(lang, 'vpAutoHint')}
                      </div>
                    ) : (
                      <div
                        className={`text-[11px] font-bold ${
                          playable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : boughtNow
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {playable
                          ? t(lang, 'readyToPlay')
                          : boughtNow
                          ? t(lang, 'boughtThisTurn')
                          : !isPlayersTurn
                          ? t(lang, 'waitYourTurn')
                          : gameState.devCardPlayedThisTurn
                          ? t(lang, 'alreadyPlayedDev')
                          : ''}
                      </div>
                    )}
                  </div>
                  {card.type !== 'victoryPoint' && (
                    <button
                      type="button"
                      disabled={!playable}
                      onClick={() => {
                        if (card.type === 'knight') {
                          onPlayKnight(card.id);
                          onClose();
                        } else if (card.type === 'roadBuilding') {
                          onPlayRoadBuilding(card.id);
                          onClose();
                        } else if (card.type === 'yearOfPlenty') {
                          setPickingYopId(card.id);
                        } else if (card.type === 'monopoly') {
                          setPickingMonoId(card.id);
                        } else if (card.type === 'disaster') {
                          onPlayDisaster(card.id);
                          onClose();
                        } else if (card.type === 'plague') {
                          onPlayPlague(card.id);
                          onClose();
                        }
                      }}
                      className="shrink-0 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed"
                    >
                      {t(lang, 'playCard')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {played.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {t(lang, 'playedCardsTitle')} ({played.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {played.map((card) => (
                <span
                  key={card.id}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  {devCardLabel(lang, card.type)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 27-Card or 36-Card Deck Reference */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
            {t(lang, 'devCardGuideTitle', { total: totalDeckSize })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {(
              gameState.gameMode === 'expanded' && gameState.players.length >= 5
                ? ([
                    ['knight', 20],
                    ['roadBuilding', 3],
                    ['yearOfPlenty', 3],
                    ['monopoly', 3],
                    ['victoryPoint', 5],
                    ['disaster', 1],
                    ['plague', 1],
                  ] as Array<[DevCardType, number]>)
                : ([
                    ['knight', 14],
                    ['roadBuilding', 2],
                    ['yearOfPlenty', 2],
                    ['monopoly', 2],
                    ['victoryPoint', 5],
                    ['disaster', 1],
                    ['plague', 1],
                  ] as Array<[DevCardType, number]>)
            ).map(([cardType, count]) => {
              const meta = getCardMeta(cardType);
              return (
                <div
                  key={cardType}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white">
                      {meta.icon}
                      {devCardLabel(lang, cardType)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-extrabold text-[10px] tabular-nums">
                      ×{count}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    {t(lang, `${cardType}Desc`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. Rules & Cost Table Modal
export const RulesModal: React.FC<{ lang: Language; onClose: () => void }> = ({ lang, onClose }) => {
  const expandedSectionRef = useRef<HTMLElement | null>(null);

  const scrollToExpanded = () => {
    expandedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[88vh] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'rulesTitle')}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={scrollToExpanded}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-extrabold cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-500 transition-colors"
            >
              {t(lang, 'jumpToExpandedRules')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t(lang, 'close')}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
          {t(lang, 'costTableTitle')}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 mb-5">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <tr>
                <th className="p-2.5 font-bold">{t(lang, 'costItem')}</th>
                <th className="p-2.5 font-bold">{t(lang, 'costResources')}</th>
                <th className="p-2.5 font-bold">{t(lang, 'costVP')}</th>
                <th className="p-2.5 font-bold">{t(lang, 'costRule')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{t(lang, 'buildRoad')}</td>
                <td className="p-2.5">1 {t(lang, 'wood')} + 1 {t(lang, 'brick')}</td>
                <td className="p-2.5 font-bold">0 VP</td>
                <td className="p-2.5">{t(lang, 'ruleRoad')}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{t(lang, 'buildShip')}</td>
                <td className="p-2.5">1 {t(lang, 'wood')} + 1 {t(lang, 'wool')}</td>
                <td className="p-2.5 font-bold">0 VP</td>
                <td className="p-2.5">{t(lang, 'shipsRule')}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{t(lang, 'buildSettlement')}</td>
                <td className="p-2.5">
                  1 {t(lang, 'wood')} + 1 {t(lang, 'brick')} + 1 {t(lang, 'wool')} + 1 {t(lang, 'grain')}
                </td>
                <td className="p-2.5 font-bold">1 VP</td>
                <td className="p-2.5">{t(lang, 'ruleSettlement')}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{t(lang, 'buildCity')}</td>
                <td className="p-2.5">2 {t(lang, 'grain')} + 3 {t(lang, 'ore')}</td>
                <td className="p-2.5 font-bold">2 VP</td>
                <td className="p-2.5">{t(lang, 'ruleCity')}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-slate-900 dark:text-white">{t(lang, 'devCards')}</td>
                <td className="p-2.5">1 {t(lang, 'wool')} + 1 {t(lang, 'grain')} + 1 {t(lang, 'ore')}</td>
                <td className="p-2.5 font-bold">0–1 VP</td>
                <td className="p-2.5">{t(lang, 'ruleDev')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="font-extrabold text-slate-900 dark:text-white mb-1">{t(lang, 'ruleRobberTitle')}</div>
            <p>{t(lang, 'ruleRobberBody')}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="font-extrabold text-slate-900 dark:text-white mb-1">{t(lang, 'ruleTitlesTitle')}</div>
            <p>{t(lang, 'ruleTitlesBody')}</p>
          </div>
        </div>

        {/* Dedicated Expanded Rules Section */}
        <section
          ref={expandedSectionRef}
          aria-labelledby="expanded-rules-heading"
          className="mt-6 pt-5 border-t-2 border-slate-200 dark:border-slate-800 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Anchor className="w-5 h-5 text-cyan-600 shrink-0" />
              <h3
                id="expanded-rules-heading"
                className="text-base font-extrabold text-slate-900 dark:text-white"
              >
                {t(lang, 'expandedRulesSectionTitle')}
              </h3>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-600 text-white text-[11px] font-extrabold">
              {t(lang, 'expandedRulesBadge')}
            </span>
          </div>

          {/* 1. Specialized Buildings & Maritime Routes */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              <Waves className="w-4 h-4" />
              <span>{t(lang, 'expandedBuildingsTitle')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedShipSpecName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedShipSpecDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedBridgeRuleName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedBridgeRuleDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedMoveShipSpecName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedMoveShipSpecDetail')}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Resource & Terrain Variations */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Coins className="w-4 h-4" />
              <span>{t(lang, 'expandedResourcesTitle')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="font-extrabold text-amber-900 dark:text-amber-200 mb-1">
                  {t(lang, 'expandedGoldName')}
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedGoldDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedSeaWoolName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedSeaWoolDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedBankScaleName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedBankScaleDetail')}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Core Mechanics, Scenarios & 5–6 Player Rules */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Compass className="w-4 h-4" />
              <span>{t(lang, 'expandedMechanicsTitle')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedPirateName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedPirateDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedFogName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedFogDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedIslandBonusName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedIslandBonusDetail')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-slate-900 dark:text-white mb-1">
                  {t(lang, 'expandedScenariosName')}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(lang, 'expandedScenariosDetail')}
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-indigo-900 dark:text-indigo-200 mb-1">
                <Users className="w-4 h-4" />
                <span>{t(lang, 'expandedFiveSixName')}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {t(lang, 'expandedFiveSixDetail')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

// 6. Victory Modal
export const VictoryModal: React.FC<{
  gameState: GameState;
  lang: Language;
  onPlayAgain: () => void;
}> = ({ gameState, lang, onPlayAgain }) => {
  if (gameState.winnerId === null) return null;
  const winner = gameState.players[gameState.winnerId];
  const winnerTotalVP = getTotalVP(gameState, winner.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-7 shadow-2xl border-2 border-amber-500 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 mx-auto flex items-center justify-center mb-4">
          <Award className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'victoryTitle')}</h2>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">
          {t(lang, 'victorySubtitle', { name: winner.name, vp: winnerTotalVP })}
        </p>

        <div className="mt-5 p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-left space-y-2 text-xs">
          <div className="font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t(lang, 'vpBreakdown')}
          </div>
          {gameState.players.map((p) => {
            const total = getTotalVP(gameState, p.id);
            const vis = getVisibleVP(gameState, p.id);
            const hidden = getHiddenVPCardsCount(p);
            return (
              <div key={p.id} className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: playerColorHex(p.color) }} />
                  <span>{p.name}</span>
                  {p.id === winner.id && <Check className="w-4 h-4 text-emerald-600" />}
                </span>
                <span className="tabular-nums">
                  {total} VP ({vis} + {hidden} {t(lang, 'vp')}
                  {p.bonusVP > 0 ? ` · +${p.bonusVP} bonus` : ''})
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="mt-6 w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-sm cursor-pointer"
        >
          {t(lang, 'playAgain')}
        </button>
      </div>
    </div>
  );
};

// 7. Incoming Live Trade Offer Modal (shown ONLY on the target player's separate screen)
export const IncomingTradeModal: React.FC<{
  gameState: GameState;
  lang: Language;
  localSeatIndex: number;
  onRespond: (accept: boolean) => void;
}> = ({ gameState, lang, localSeatIndex, onRespond }) => {
  const offer = gameState.pendingTradeOffer;
  if (!offer || offer.toPlayerId !== localSeatIndex) return null;

  const fromPlayer = gameState.players[offer.fromPlayerId];
  const myPlayer = gameState.players[localSeatIndex];
  const canAffordWant = ALL_RESOURCES.every((r) => myPlayer.resources[r] >= (offer.want[r] || 0));
  const receiveTokens = expandCardTokens(offer.give, 'inc-recv');
  const giveTokens = expandCardTokens(offer.want, 'inc-give');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-blue-600"
      >
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t(lang, 'incomingTradeTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {t(lang, 'incomingTradeBody', { name: fromPlayer.name })}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="font-extrabold uppercase text-emerald-700 dark:text-emerald-300">
              {t(lang, 'youReceive')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {receiveTokens.tokens.map((tok, i) => (
                <motion.div
                  key={tok.key}
                  initial={{ opacity: 0, x: -16, scale: 0.75 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 380, damping: 24 }}
                >
                  <MiniTradeCard res={tok.res} lang={lang} compact />
                </motion.div>
              ))}
              {receiveTokens.overflow > 0 && (
                <span className="self-center px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-extrabold tabular-nums">
                  +{receiveTokens.overflow}
                </span>
              )}
            </div>
            {ALL_RESOURCES.filter((r) => (offer.give[r] || 0) > 0).map((r) => (
              <div key={r} className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                <span>{resourceLabel(lang, r)}</span>
                <span className="tabular-nums">+{offer.give[r]}</span>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 space-y-2">
            <div className="font-extrabold uppercase text-orange-700 dark:text-orange-300">
              {t(lang, 'youGive')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {giveTokens.tokens.map((tok, i) => (
                <motion.div
                  key={tok.key}
                  initial={{ opacity: 0, x: 16, scale: 0.75 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 380, damping: 24 }}
                >
                  <MiniTradeCard res={tok.res} lang={lang} compact />
                </motion.div>
              ))}
              {giveTokens.overflow > 0 && (
                <span className="self-center px-1.5 py-0.5 rounded bg-orange-700 text-white text-[10px] font-extrabold tabular-nums">
                  +{giveTokens.overflow}
                </span>
              )}
            </div>
            {ALL_RESOURCES.filter((r) => (offer.want[r] || 0) > 0).map((r) => (
              <div key={r} className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                <span>{resourceLabel(lang, r)}</span>
                <span className="tabular-nums">-{offer.want[r]}</span>
              </div>
            ))}
          </div>
        </div>

        {!canAffordWant && (
          <div className="mt-3 text-xs font-bold text-red-600 dark:text-red-400">
            {t(lang, 'notEnoughRes')}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onRespond(false)}
            className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-sm cursor-pointer transition-colors"
          >
            {t(lang, 'declineTrade')}
          </motion.button>
          <motion.button
            type="button"
            disabled={!canAffordWant}
            whileHover={canAffordWant ? { scale: 1.02 } : undefined}
            whileTap={canAffordWant ? { scale: 0.96 } : undefined}
            onClick={() => onRespond(true)}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-sm cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            {t(lang, 'acceptTrade')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};
