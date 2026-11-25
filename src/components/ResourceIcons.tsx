import React from 'react';
import { ResourceType } from '../types/catan';

export const RESOURCE_STYLES: Record<
  ResourceType,
  { bg: string; text: string; border: string; accent: string }
> = {
  wood: {
    bg: 'bg-emerald-700',
    text: 'text-white',
    border: 'border-emerald-800',
    accent: '#15803D',
  },
  brick: {
    bg: 'bg-orange-700',
    text: 'text-white',
    border: 'border-orange-800',
    accent: '#C2410C',
  },
  wool: {
    bg: 'bg-lime-600',
    text: 'text-white',
    border: 'border-lime-700',
    accent: '#65A30D',
  },
  grain: {
    bg: 'bg-amber-500',
    text: 'text-slate-950',
    border: 'border-amber-600',
    accent: '#D97706',
  },
  ore: {
    bg: 'bg-slate-600',
    text: 'text-white',
    border: 'border-slate-700',
    accent: '#475569',
  },
};

export const ResourceIcon: React.FC<{ type: ResourceType; className?: string }> = ({
  type,
  className = 'w-4 h-4',
}) => {
  switch (type) {
    case 'wood':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3L5 12h4l-3 6h12l-3-6h4L12 3z" fill="currentColor" />
          <rect x="10.5" y="18" width="3" height="4" fill="currentColor" />
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="5" width="8" height="5" rx="1" fill="currentColor" />
          <rect x="13" y="5" width="8" height="5" rx="1" fill="currentColor" />
          <rect x="7" y="12" width="10" height="5" rx="1" fill="currentColor" />
          <rect x="3" y="12" width="2.5" height="5" rx="0.5" fill="currentColor" />
          <rect x="18.5" y="12" width="2.5" height="5" rx="0.5" fill="currentColor" />
        </svg>
      );
    case 'wool':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="9" cy="10" r="4.5" fill="currentColor" />
          <circle cx="15" cy="10" r="4.5" fill="currentColor" />
          <circle cx="12" cy="14" r="4.5" fill="currentColor" />
          <circle cx="12" cy="7.5" r="3.5" fill="currentColor" />
        </svg>
      );
    case 'grain':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 2v20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="8.5" cy="7" rx="2.5" ry="1.4" transform="rotate(-35 8.5 7)" fill="currentColor" />
          <ellipse cx="15.5" cy="7" rx="2.5" ry="1.4" transform="rotate(35 15.5 7)" fill="currentColor" />
          <ellipse cx="8.5" cy="12" rx="2.5" ry="1.4" transform="rotate(-35 8.5 12)" fill="currentColor" />
          <ellipse cx="15.5" cy="12" rx="2.5" ry="1.4" transform="rotate(35 15.5 12)" fill="currentColor" />
        </svg>
      );
    case 'ore':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <polygon points="12,3 20,9 17,20 7,20 4,9" fill="currentColor" />
          <polygon points="12,3 15,10 12,20 9,10" fill="rgba(255,255,255,0.28)" />
        </svg>
      );
  }
};
