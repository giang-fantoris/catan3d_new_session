import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Route, Sparkles, Swords, Trophy } from 'lucide-react';
import { playerColorHex, t } from '../i18n/translations';
import { GameState, Language } from '../types/catan';

interface SpecialTitleCardsProps {
  gameState: GameState;
  lang: Language;
  localSeatIndex?: number | null;
}

interface TitleFlashState {
  mode: 'claimed' | 'stolen';
  burstKey: number;
}

export const SpecialTitleCards: React.FC<SpecialTitleCardsProps> = ({
  gameState,
  lang,
  localSeatIndex = null,
}) => {
  const [expandedCard, setExpandedCard] = useState<'longest' | 'largest' | null>(null);
  const [longestFlash, setLongestFlash] = useState<TitleFlashState | null>(null);
  const [largestFlash, setLargestFlash] = useState<TitleFlashState | null>(null);

  const prevLongestRef = useRef<number | null | undefined>(undefined);
  const prevLargestRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevLongestRef.current;
    const curr = gameState.longestRoadHolderId;
    if (prev !== undefined && curr !== null && curr !== prev) {
      setLongestFlash({
        mode: prev === null ? 'claimed' : 'stolen',
        burstKey: Date.now(),
      });
    }
    prevLongestRef.current = curr;
  }, [gameState.longestRoadHolderId]);

  useEffect(() => {
    const prev = prevLargestRef.current;
    const curr = gameState.largestArmyHolderId;
    if (prev !== undefined && curr !== null && curr !== prev) {
      setLargestFlash({
        mode: prev === null ? 'claimed' : 'stolen',
        burstKey: Date.now(),
      });
    }
    prevLargestRef.current = curr;
  }, [gameState.largestArmyHolderId]);

  useEffect(() => {
    if (!longestFlash) return;
    const timer = window.setTimeout(() => setLongestFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [longestFlash]);

  useEffect(() => {
    if (!largestFlash) return;
    const timer = window.setTimeout(() => setLargestFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [largestFlash]);

  const longestHolder =
    gameState.longestRoadHolderId !== null ? gameState.players[gameState.longestRoadHolderId] ?? null : null;
  const largestHolder =
    gameState.largestArmyHolderId !== null ? gameState.players[gameState.largestArmyHolderId] ?? null : null;

  // Best contender when unclaimed
  const topRoadPlayer = [...gameState.players].sort((a, b) => b.longestRoadLength - a.longestRoadLength)[0];
  const topKnightPlayer = [...gameState.players].sort((a, b) => b.knightsPlayed - a.knightsPlayed)[0];

  const isLongestExpanded = expandedCard === 'longest';
  const isLargestExpanded = expandedCard === 'largest';

  return (
    <div
      aria-label={t(lang, 'specialTitles')}
      className="flex flex-col gap-2 pointer-events-auto max-w-full"
    >
      {/* 1. Longest Road Card */}
      <motion.div
        layout
        animate={
          longestFlash
            ? { scale: [1, 1.07, 1], rotate: [0, -1.5, 1.5, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-[144px] sm:w-[192px] rounded-xl border shadow-lg overflow-hidden transition-colors ${
          longestHolder
            ? 'bg-white dark:bg-slate-900 border-amber-500 ring-2 ring-amber-500/40'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700'
        }`}
      >
        {/* Single-shot ring burst on claim/steal */}
        <AnimatePresence>
          {longestFlash && (
            <motion.div
              key={`lr-ring-${longestFlash.burstKey}`}
              initial={{ opacity: 0.9, scale: 0.96 }}
              animate={{ opacity: 0, scale: 1.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 rounded-xl border-2 border-amber-400 z-20"
            />
          )}
        </AnimatePresence>

        {/* Card Header */}
        <button
          type="button"
          onClick={() => setExpandedCard(isLongestExpanded ? null : 'longest')}
          className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors ${
            longestHolder
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Route className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-extrabold truncate">{t(lang, 'longestRoad')}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none ${
                longestHolder
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              +2 {t(lang, 'vp')}
            </span>
            {isLongestExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </span>
        </button>

        {/* Holder Body */}
        <div className="px-2.5 py-2">
          <AnimatePresence mode="wait">
            {longestHolder ? (
              <motion.div
                key={`lr-holder-${longestHolder.id}`}
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-slate-900/20 shrink-0"
                    style={{ backgroundColor: playerColorHex(longestHolder.color) }}
                  />
                  <div className="min-w-0 leading-tight">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {longestHolder.name}
                      </span>
                      {localSeatIndex === longestHolder.id && (
                        <span className="px-1 py-0.5 rounded bg-blue-600 text-white text-[9px] font-extrabold leading-none shrink-0">
                          {t(lang, 'humanPlayer')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                      {t(lang, 'roadsCount', { count: longestHolder.longestRoadLength })}
                    </div>
                  </div>
                </div>
                <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              </motion.div>
            ) : (
              <motion.div
                key="lr-unclaimed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="leading-tight space-y-0.5"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span>{t(lang, 'unclaimedTitle')}</span>
                  <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                    {t(lang, 'needRoadsShort')}
                  </span>
                </div>
                {topRoadPlayer && topRoadPlayer.longestRoadLength > 0 && (
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate tabular-nums">
                    {t(lang, 'currentLeaderShort', {
                      name: topRoadPlayer.name,
                      val: `${topRoadPlayer.longestRoadLength}/5`,
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Newly Claimed / Stolen Tag */}
          <AnimatePresence>
            {longestFlash && (
              <motion.div
                key={`lr-tag-${longestFlash.burstKey}`}
                initial={{ opacity: 0, y: 6, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold"
              >
                <Sparkles className="w-3 h-3" />
                <span>{t(lang, longestFlash.mode === 'stolen' ? 'titleStolen' : 'titleClaimed')}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expandable Standings */}
          <AnimatePresence>
            {isLongestExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  {gameState.players.map((p) => {
                    const isHolder = p.id === gameState.longestRoadHolderId;
                    const pct = Math.min(100, Math.round((p.longestRoadLength / Math.max(5, longestHolder?.longestRoadLength ?? 5)) * 100));
                    return (
                      <div key={p.id} className="text-[10px] font-bold">
                        <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-1 truncate">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: playerColorHex(p.color) }}
                            />
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className={`tabular-nums ${isHolder ? 'text-amber-600 dark:text-amber-400 font-extrabold' : ''}`}>
                            {p.longestRoadLength}
                          </span>
                        </div>
                        <div className="h-1 mt-0.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isHolder ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 2. Largest Army Card */}
      <motion.div
        layout
        animate={
          largestFlash
            ? { scale: [1, 1.07, 1], rotate: [0, 1.5, -1.5, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-[144px] sm:w-[192px] rounded-xl border shadow-lg overflow-hidden transition-colors ${
          largestHolder
            ? 'bg-white dark:bg-slate-900 border-red-600 ring-2 ring-red-600/35'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700'
        }`}
      >
        <AnimatePresence>
          {largestFlash && (
            <motion.div
              key={`la-ring-${largestFlash.burstKey}`}
              initial={{ opacity: 0.9, scale: 0.96 }}
              animate={{ opacity: 0, scale: 1.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 rounded-xl border-2 border-red-500 z-20"
            />
          )}
        </AnimatePresence>

        {/* Card Header */}
        <button
          type="button"
          onClick={() => setExpandedCard(isLargestExpanded ? null : 'largest')}
          className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-red-600 transition-colors ${
            largestHolder
              ? 'bg-red-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Swords className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-extrabold truncate">{t(lang, 'largestArmy')}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none ${
                largestHolder
                  ? 'bg-slate-950 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              +2 {t(lang, 'vp')}
            </span>
            {isLargestExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </span>
        </button>

        {/* Holder Body */}
        <div className="px-2.5 py-2">
          <AnimatePresence mode="wait">
            {largestHolder ? (
              <motion.div
                key={`la-holder-${largestHolder.id}`}
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-slate-900/20 shrink-0"
                    style={{ backgroundColor: playerColorHex(largestHolder.color) }}
                  />
                  <div className="min-w-0 leading-tight">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {largestHolder.name}
                      </span>
                      {localSeatIndex === largestHolder.id && (
                        <span className="px-1 py-0.5 rounded bg-blue-600 text-white text-[9px] font-extrabold leading-none shrink-0">
                          {t(lang, 'humanPlayer')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                      {t(lang, 'knightsCount', { count: largestHolder.knightsPlayed })}
                    </div>
                  </div>
                </div>
                <Trophy className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              </motion.div>
            ) : (
              <motion.div
                key="la-unclaimed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="leading-tight space-y-0.5"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span>{t(lang, 'unclaimedTitle')}</span>
                  <span className="text-[10px] font-extrabold text-red-600 dark:text-red-400">
                    {t(lang, 'needKnightsShort')}
                  </span>
                </div>
                {topKnightPlayer && topKnightPlayer.knightsPlayed > 0 && (
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate tabular-nums">
                    {t(lang, 'currentLeaderShort', {
                      name: topKnightPlayer.name,
                      val: `${topKnightPlayer.knightsPlayed}/3`,
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {largestFlash && (
              <motion.div
                key={`la-tag-${largestFlash.burstKey}`}
                initial={{ opacity: 0, y: 6, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold"
              >
                <Sparkles className="w-3 h-3" />
                <span>{t(lang, largestFlash.mode === 'stolen' ? 'titleStolen' : 'titleClaimed')}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isLargestExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  {gameState.players.map((p) => {
                    const isHolder = p.id === gameState.largestArmyHolderId;
                    const pct = Math.min(100, Math.round((p.knightsPlayed / Math.max(3, largestHolder?.knightsPlayed ?? 3)) * 100));
                    return (
                      <div key={p.id} className="text-[10px] font-bold">
                        <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-1 truncate">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: playerColorHex(p.color) }}
                            />
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className={`tabular-nums ${isHolder ? 'text-red-600 dark:text-red-400 font-extrabold' : ''}`}>
                            {p.knightsPlayed}
                          </span>
                        </div>
                        <div className="h-1 mt-0.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isHolder ? 'bg-red-600' : 'bg-slate-400 dark:bg-slate-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
