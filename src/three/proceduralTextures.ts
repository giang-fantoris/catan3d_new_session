import * as THREE from 'three';
import { getProbabilityDots } from '../game/hexMath';
import { HarborType, ResourceType, TerrainType } from '../types/catan';

function applyTextureQuality(tex: THREE.CanvasTexture, maxAnisotropy: number, isColor = true) {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrainTexture(terrain: TerrainType, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseColors: Record<TerrainType, string> = {
    forest: '#2D5A36',
    pasture: '#7BB642',
    fields: '#E2B43B',
    hills: '#B85432',
    mountains: '#6B7280',
    desert: '#DFC58B',
    sea: '#0E7490',
    gold: '#C48A2A',
  };

  ctx.fillStyle = baseColors[terrain];
  ctx.fillRect(0, 0, size, size);

  // Subtle organic grain & pattern per terrain
  if (terrain === 'sea') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
    ctx.lineWidth = 3;
    for (let y = 16; y < size; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.25, y - 6, size * 0.75, y + 6, size, y);
      ctx.stroke();
    }
  } else if (terrain === 'gold') {
    // Winding river across golden banks
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 32;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, size * 0.28);
    ctx.bezierCurveTo(size * 0.38, size * 0.12, size * 0.62, size * 0.88, size, size * 0.72);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.55)';
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#FDE047' : '#F59E0B';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (terrain === 'fields') {
    // Tilled golden wheat rows
    ctx.strokeStyle = 'rgba(180, 118, 22, 0.38)';
    ctx.lineWidth = 4;
    for (let y = 8; y < size; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + 6);
      ctx.stroke();
    }
  } else if (terrain === 'hills') {
    // Terracotta clay strata
    ctx.strokeStyle = 'rgba(120, 42, 18, 0.32)';
    ctx.lineWidth = 6;
    for (let y = 14; y < size; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.33, y - 10, size * 0.66, y + 10, size, y);
      ctx.stroke();
    }
  } else if (terrain === 'desert') {
    // Sand ripples
    ctx.strokeStyle = 'rgba(176, 142, 82, 0.35)';
    ctx.lineWidth = 3;
    for (let y = 12; y < size; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(size * 0.5, y + 10, size, y);
      ctx.stroke();
    }
  } else {
    // Organic speckles for forest, pasture, mountains
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1 + Math.random() * 4;
      ctx.fillStyle =
        terrain === 'forest'
          ? i % 2 === 0
            ? 'rgba(20, 52, 26, 0.35)'
            : 'rgba(72, 128, 66, 0.25)'
          : terrain === 'pasture'
          ? i % 2 === 0
            ? 'rgba(160, 212, 92, 0.35)'
            : 'rgba(84, 138, 42, 0.25)'
          : i % 2 === 0
          ? 'rgba(55, 65, 81, 0.35)'
          : 'rgba(156, 163, 175, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return applyTextureQuality(new THREE.CanvasTexture(canvas), maxAnisotropy, true);
}

export function createFogTileTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 54, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#FBBF24';
  ctx.font = '800 84px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', size / 2, size / 2 + 4);

  return applyTextureQuality(new THREE.CanvasTexture(canvas), maxAnisotropy, true);
}

export function createNumberTokenTexture(num: number, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Parchment ivory circle
  ctx.fillStyle = '#FBF6E9';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#C8B892';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
  ctx.stroke();

  const isRed = num === 6 || num === 8;
  ctx.fillStyle = isRed ? '#DC2626' : '#1E293B';
  ctx.font = '800 108px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), size / 2, size / 2 - 14);

  // Probability dots
  const dots = getProbabilityDots(num);
  const dotRadius = 8;
  const spacing = 22;
  const startX = size / 2 - ((dots - 1) * spacing) / 2;
  const dotY = size / 2 + 58;
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  return applyTextureQuality(new THREE.CanvasTexture(canvas), maxAnisotropy, true);
}

const HARBOR_COLORS: Record<HarborType, string> = {
  generic: '#334155',
  wood: '#166534',
  brick: '#B91C1C',
  wool: '#65A30D',
  grain: '#CA8A04',
  ore: '#475569',
};

const HARBOR_TEXT: Record<HarborType, string> = {
  generic: '?',
  wood: 'WOOD',
  brick: 'BRICK',
  wool: 'WOOL',
  grain: 'GRAIN',
  ore: 'ORE',
};

export function createHarborBadgeTexture(harbor: HarborType, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = HARBOR_COLORS[harbor];
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = HARBOR_COLORS[harbor];
  ctx.font = '800 66px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(harbor === 'generic' ? '3:1' : '2:1', size / 2, size / 2 - 22);

  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(HARBOR_TEXT[harbor], size / 2, size / 2 + 44);

  return applyTextureQuality(new THREE.CanvasTexture(canvas), maxAnisotropy, true);
}

export function createDieFaceTexture(value: number, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FAF7F0';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#D6CFC0';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  const pipPositions: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [
      [0.28, 0.28],
      [0.72, 0.72],
    ],
    3: [
      [0.28, 0.28],
      [0.5, 0.5],
      [0.72, 0.72],
    ],
    4: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    5: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.5, 0.5],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    6: [
      [0.28, 0.24],
      [0.72, 0.24],
      [0.28, 0.5],
      [0.72, 0.5],
      [0.28, 0.76],
      [0.72, 0.76],
    ],
  };

  ctx.fillStyle = value === 1 ? '#DC2626' : '#0F172A';
  for (const [px, py] of pipPositions[value] || []) {
    ctx.beginPath();
    ctx.arc(px * size, py * size, value === 1 ? 15 : 11, 0, Math.PI * 2);
    ctx.fill();
  }

  return applyTextureQuality(new THREE.CanvasTexture(canvas), maxAnisotropy, true);
}

export function createOceanBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 18 + Math.random() * 44;
    const h = 4 + Math.random() * 8;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(220,220,220,0.22)' : 'rgba(50,50,50,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return applyTextureQuality(tex, maxAnisotropy, false);
}

export const RESOURCE_HEX_COLORS: Record<ResourceType, string> = {
  wood: '#15803D',
  brick: '#C2410C',
  wool: '#65A30D',
  grain: '#CA8A04',
  ore: '#475569',
};
