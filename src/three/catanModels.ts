import * as THREE from 'three';
import { HEX_HEIGHT, HEX_RADIUS } from '../game/hexMath';
import { Harbor, HexTile, TerrainType } from '../types/catan';
import {
  createDieFaceTexture,
  createFogTileTexture,
  createHarborBadgeTexture,
  createNumberTokenTexture,
  createTerrainTexture,
} from './proceduralTextures';

function createHexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = ((i * 60 - 90) * Math.PI) / 180;
    const sx = radius * Math.cos(angle);
    const sy = -radius * Math.sin(angle); // Maps cleanly to world +Z after -PI/2 X rotation
    if (i === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  }
  shape.closePath();
  return shape;
}

export interface ModelCache {
  terrainTextures: Record<TerrainType, THREE.CanvasTexture>;
  fogTexture: THREE.CanvasTexture;
  numberTextures: Record<number, THREE.CanvasTexture>;
  dieFaceMaterials: THREE.MeshStandardMaterial[];
  baseHexGeo: THREE.ExtrudeGeometry;
  topCapGeo: THREE.CylinderGeometry;
}

export function createModelCache(maxAnisotropy: number): ModelCache {
  const terrains: TerrainType[] = [
    'forest',
    'hills',
    'pasture',
    'fields',
    'mountains',
    'desert',
    'sea',
    'gold',
  ];
  const terrainTextures = {} as Record<TerrainType, THREE.CanvasTexture>;
  for (const t of terrains) {
    terrainTextures[t] = createTerrainTexture(t, maxAnisotropy);
  }
  const fogTexture = createFogTileTexture(maxAnisotropy);

  const numberTextures: Record<number, THREE.CanvasTexture> = {};
  for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
    numberTextures[n] = createNumberTokenTexture(n, maxAnisotropy);
  }

  // Die face order in Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  // Standard opposite faces sum to 7: 3(+X), 4(-X), 1(+Y), 6(-Y), 2(+Z), 5(-Z)
  const faceValues = [3, 4, 1, 6, 2, 5];
  const dieFaceMaterials = faceValues.map(
    (val) =>
      new THREE.MeshStandardMaterial({
        map: createDieFaceTexture(val, maxAnisotropy),
        roughness: 0.35,
        metalness: 0.05,
      }),
  );

  const hexShape = createHexShape(HEX_RADIUS * 0.96);
  const baseHexGeo = new THREE.ExtrudeGeometry(hexShape, {
    depth: HEX_HEIGHT,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  baseHexGeo.rotateX(-Math.PI / 2);

  // CylinderGeometry with 6 sides rotated 30 deg matches pointy-top hex top cap
  const topCapGeo = new THREE.CylinderGeometry(HEX_RADIUS * 0.91, HEX_RADIUS * 0.91, 0.03, 6);

  return {
    terrainTextures,
    fogTexture,
    numberTextures,
    dieFaceMaterials,
    baseHexGeo,
    topCapGeo,
  };
}

export const TERRAIN_TOP_Y = HEX_HEIGHT + 0.07;

function addPineTree(group: THREE.Group, x: number, z: number, scale: number) {
  const tree = new THREE.Group();
  tree.position.set(x, TERRAIN_TOP_Y, z);
  tree.scale.setScalar(scale);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.075, 0.24, 7),
    new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9, metalness: 0 }),
  );
  trunk.position.y = 0.12;
  trunk.castShadow = true;
  tree.add(trunk);

  const foliageColors = [0x1e5128, 0x2a6f37, 0x388e3c];
  [0.24, 0.42, 0.58].forEach((y, idx) => {
    const r = 0.26 - idx * 0.06;
    const h = 0.3 - idx * 0.04;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshStandardMaterial({ color: foliageColors[idx], roughness: 0.8, metalness: 0 }),
    );
    cone.position.y = y + h * 0.4;
    cone.castShadow = true;
    tree.add(cone);
  });

  group.add(tree);
}

function addSheep(group: THREE.Group, x: number, z: number, rotY: number) {
  const sheep = new THREE.Group();
  sheep.position.set(x, TERRAIN_TOP_Y, z);
  sheep.rotation.y = rotY;

  const woolMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.92, metalness: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), woolMat);
  body.scale.set(1.3, 0.9, 0.95);
  body.position.y = 0.16;
  body.castShadow = true;
  sheep.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), darkMat);
  head.position.set(0.17, 0.2, 0);
  head.castShadow = true;
  sheep.add(head);

  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6);
  [
    [-0.08, -0.06],
    [-0.08, 0.06],
    [0.08, -0.06],
    [0.08, 0.06],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(lx, 0.05, lz);
    sheep.add(leg);
  });

  group.add(sheep);
}

function addWindmillAndBales(group: THREE.Group) {
  const mill = new THREE.Group();
  mill.position.set(-0.55, TERRAIN_TOP_Y, -0.45);

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.44, 8),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 }),
  );
  tower.position.y = 0.22;
  tower.castShadow = true;
  mill.add(tower);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 }),
  );
  roof.position.y = 0.5;
  roof.castShadow = true;
  mill.add(roof);

  const bladesGroup = new THREE.Group();
  bladesGroup.position.set(0, 0.4, 0.15);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.015), bladeMat);
    const angle = (i * Math.PI) / 2 + 0.35;
    blade.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, 0);
    blade.rotation.z = angle - Math.PI / 2;
    bladesGroup.add(blade);
  }
  mill.add(bladesGroup);
  group.add(mill);

  // Golden hay bales
  const baleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 });
  [
    [0.62, 0.42, 0.3],
    [0.78, 0.18, -0.4],
  ].forEach(([bx, bz, rot]) => {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 10), baleMat);
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = rot;
    bale.position.set(bx, TERRAIN_TOP_Y + 0.10, bz);
    bale.castShadow = true;
    group.add(bale);
  });
}

function addClayHills(group: THREE.Group) {
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xb84a27, roughness: 0.85, metalness: 0.05 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0xdc5f36, roughness: 0.6, metalness: 0.05 });

  [
    [-0.55, -0.4, 0.44, 0.32],
    [0.58, -0.32, 0.38, 0.26],
    [-0.4, 0.55, 0.34, 0.22],
  ].forEach(([x, z, r, h]) => {
    const mound = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), clayMat);
    mound.position.set(x, HEX_HEIGHT + h * 0.45, z);
    mound.castShadow = true;
    group.add(mound);
  });

  // Stacked brick blocks
  for (let i = 0; i < 3; i++) {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.11), brickMat);
    brick.position.set(0.55 + (i % 2) * 0.06, TERRAIN_TOP_Y + 0.04 + i * 0.085, 0.45);
    brick.rotation.y = 0.25 * i;
    brick.castShadow = true;
    group.add(brick);
  }
}

function addMountains(group: THREE.Group) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x525866, roughness: 0.78, metalness: 0.12 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.05 });
  const oreMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });

  [
    [-0.58, -0.35, 0.46, 0.78],
    [0.62, -0.25, 0.4, 0.64],
    [0.05, 0.62, 0.36, 0.54],
  ].forEach(([x, z, r, h]) => {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), rockMat);
    peak.position.set(x, HEX_HEIGHT + h * 0.48, z);
    peak.castShadow = true;
    group.add(peak);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.34, 6), snowMat);
    cap.position.set(x, HEX_HEIGHT + h * 0.78, z);
    group.add(cap);
  });

  // Metallic ore crystals at base
  for (let i = 0; i < 3; i++) {
    const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), oreMat);
    ore.position.set(-0.2 + i * 0.28, TERRAIN_TOP_Y + 0.10, -0.62 + (i % 2) * 0.15);
    ore.rotation.set(i, i * 0.7, 0);
    ore.castShadow = true;
    group.add(ore);
  }
}

function addDesertProps(group: THREE.Group) {
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xd9b976, roughness: 0.95 });
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2f7a44, roughness: 0.75 });

  const dune = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), duneMat);
  dune.scale.set(1.4, 0.28, 0.9);
  dune.position.set(-0.3, TERRAIN_TOP_Y + 0.02, -0.35);
  group.add(dune);

  // Saguaro cactus (trunk + 2 arms)
  const cactus = new THREE.Group();
  cactus.position.set(0.58, TERRAIN_TOP_Y, 0.35);
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), cactusMat);
  stem.position.y = 0.19;
  stem.castShadow = true;
  cactus.add(stem);

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), cactusMat);
  armL.position.set(-0.08, 0.22, 0);
  armL.rotation.z = 0.55;
  cactus.add(armL);

  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), cactusMat);
  armR.position.set(0.08, 0.17, 0);
  armR.rotation.z = -0.55;
  cactus.add(armR);

  group.add(cactus);
}

function addGoldFieldProps(group: THREE.Group) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78, metalness: 0.1 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.2, metalness: 0.88 });

  [
    [-0.58, -0.45, 0.28, 0.3],
    [0.58, 0.42, 0.26, 0.24],
  ].forEach(([x, z, r, h]) => {
    const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    mound.scale.set(1.2, h / r, 1);
    mound.position.set(x, TERRAIN_TOP_Y + 0.05, z);
    mound.castShadow = true;
    group.add(mound);
  });

  [
    [-0.45, -0.22],
    [-0.65, 0.42],
    [0.55, -0.48],
    [0.44, 0.56],
  ].forEach(([gx, gz], idx) => {
    const nugget = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
    nugget.position.set(gx, TERRAIN_TOP_Y + 0.09, gz);
    nugget.rotation.set(idx * 0.5, idx * 0.9, 0.3);
    nugget.castShadow = true;
    group.add(nugget);
  });
}

export function createHexTileGroup(hex: HexTile, cache: ModelCache): {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.position.set(hex.x, 0, hex.z);

  if (hex.fogged) {
    const fogSlab = new THREE.Mesh(
      cache.baseHexGeo,
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8, metalness: 0.15 }),
    );
    fogSlab.receiveShadow = true;
    group.add(fogSlab);

    const fogCap = new THREE.Mesh(
      cache.topCapGeo,
      new THREE.MeshStandardMaterial({
        map: cache.fogTexture,
        roughness: 0.65,
        metalness: 0.1,
      }),
    );
    fogCap.position.y = HEX_HEIGHT + 0.055;
    fogCap.receiveShadow = true;
    fogCap.userData = { type: 'hex', hexId: hex.id };
    group.add(fogCap);
    return { group, hitMesh: fogCap };
  }

  if (hex.terrain === 'sea') {
    const seaMat = new THREE.MeshStandardMaterial({
      map: cache.terrainTextures.sea,
      color: 0x0e7490,
      roughness: 0.25,
      metalness: 0.18,
    });
    const seaCap = new THREE.Mesh(cache.topCapGeo, seaMat);
    seaCap.position.y = 0.04;
    seaCap.receiveShadow = true;
    seaCap.userData = { type: 'hex', hexId: hex.id };
    group.add(seaCap);

    const seaRim = new THREE.Mesh(
      new THREE.CylinderGeometry(HEX_RADIUS * 0.94, HEX_RADIUS * 0.96, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x155e75, roughness: 0.55, metalness: 0.08 }),
    );
    seaRim.position.y = 0.01;
    seaRim.receiveShadow = true;
    group.add(seaRim);

    return { group, hitMesh: seaCap };
  }

  // Wooden/earth beveled slab
  const slabMat = new THREE.MeshStandardMaterial({
    color: hex.terrain === 'gold' ? 0x92652a : 0x8b6f47,
    roughness: 0.85,
    metalness: 0.05,
  });
  const slab = new THREE.Mesh(cache.baseHexGeo, slabMat);
  slab.receiveShadow = true;
  slab.castShadow = true;
  group.add(slab);

  // Textured terrain top cap
  const topMat = new THREE.MeshStandardMaterial({
    map: cache.terrainTextures[hex.terrain],
    roughness: hex.terrain === 'mountains' ? 0.72 : 0.88,
    metalness: 0.04,
  });
  const topCap = new THREE.Mesh(cache.topCapGeo, topMat);
  topCap.position.y = HEX_HEIGHT + 0.055;
  topCap.receiveShadow = true;
  topCap.userData = { type: 'hex', hexId: hex.id };
  group.add(topCap);

  // Terrain-specific 3D diorama models
  if (hex.terrain === 'forest') {
    addPineTree(group, -0.62, -0.42, 0.92);
    addPineTree(group, 0.58, -0.45, 0.82);
    addPineTree(group, -0.52, 0.54, 0.78);
    addPineTree(group, 0.65, 0.42, 0.88);
    addPineTree(group, 0.02, -0.78, 0.74);
  } else if (hex.terrain === 'pasture') {
    addSheep(group, -0.52, -0.38, 0.5);
    addSheep(group, 0.58, 0.35, -1.2);
    addSheep(group, -0.38, 0.56, 2.1);
  } else if (hex.terrain === 'fields') {
    addWindmillAndBales(group);
  } else if (hex.terrain === 'hills') {
    addClayHills(group);
  } else if (hex.terrain === 'mountains') {
    addMountains(group);
  } else if (hex.terrain === 'desert') {
    addDesertProps(group);
  } else if (hex.terrain === 'gold') {
    addGoldFieldProps(group);
  }

  // Number Token Disc (placed cleanly at center-front)
  if (hex.numberToken !== null) {
    const tokenGroup = new THREE.Group();
    tokenGroup.position.set(0, TERRAIN_TOP_Y + 0.018, 0.04);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.48, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0xd6c49a, roughness: 0.65, metalness: 0.08 }),
    );
    rim.castShadow = true;
    rim.receiveShadow = true;
    tokenGroup.add(rim);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.43, 24),
      new THREE.MeshStandardMaterial({
        map: cache.numberTextures[hex.numberToken],
        roughness: 0.5,
        metalness: 0.02,
      }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.028;
    face.receiveShadow = true;
    tokenGroup.add(face);

    group.add(tokenGroup);
  }

  return { group, hitMesh: topCap };
}

// Composite 4-part Settlement (bottom-center pivot y=0)
export function createSettlementModel(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.05 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.52, metalness: 0.08 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex).multiplyScalar(0.75),
    roughness: 0.35,
    metalness: 0.15,
  });

  // 1. Stone foundation plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.32), stoneMat);
  plinth.position.y = 0.03;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Main cabin body
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), bodyMat);
  cabin.position.y = 0.16;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  // 3. Pitched gable roof
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.18, 0);
  roofShape.lineTo(0.18, 0);
  roofShape.lineTo(0, 0.17);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.3,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
  });
  roofGeo.translate(0, 0, -0.15);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.26;
  roof.castShadow = true;
  group.add(roof);

  // 4. Chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), stoneMat);
  chimney.position.set(0.08, 0.36, -0.06);
  chimney.castShadow = true;
  group.add(chimney);

  return group;
}

// Composite 6-part Fortified City (bottom-center pivot y=0)
export function createCityModel(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.08 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.12 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex).multiplyScalar(0.72),
    roughness: 0.32,
    metalness: 0.2,
  });
  const finialMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.85 });

  // 1. Wide stone base
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.38), stoneMat);
  base.position.y = 0.035;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Main hall
  const hall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.3), bodyMat);
  hall.position.set(-0.07, 0.19, 0);
  hall.castShadow = true;
  group.add(hall);

  // 3. Hall roof
  const hallRoof = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), roofMat);
  hallRoof.rotation.y = Math.PI / 4;
  hallRoof.position.set(-0.07, 0.4, 0);
  hallRoof.castShadow = true;
  group.add(hallRoof);

  // 4. Watchtower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.48, 8), bodyMat);
  tower.position.set(0.14, 0.31, 0);
  tower.castShadow = true;
  group.add(tower);

  // 5. Spire roof
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 8), roofMat);
  spire.position.set(0.14, 0.67, 0);
  spire.castShadow = true;
  group.add(spire);

  // 6. Metallic golden finial
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), finialMat);
  finial.position.set(0.14, 0.8, 0);
  group.add(finial);

  return group;
}

// Composite 3-part Road causeway
export function createRoadModel(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const bedMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88, metalness: 0.05 });
  const plankMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.12 });

  // 1. Stone roadbed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.22), bedMat);
  bed.position.y = 0.03;
  bed.castShadow = true;
  bed.receiveShadow = true;
  group.add(bed);

  // 2. Main colored deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.07, 0.15), plankMat);
  deck.position.y = 0.075;
  deck.castShadow = true;
  group.add(deck);

  // 3. Center ridge accent
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.06), bedMat);
  ridge.position.y = 0.115;
  group.add(ridge);

  return group;
}

// Seafarers Ship piece (sailing vessel along sea or coastal edge)
export function createShipModel(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.48, metalness: 0.1 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });

  // Boat hull oriented along X axis (matching edge angle)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.24), hullMat);
  hull.position.y = 0.06;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Bow & stern taper cones
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 4), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.position.set(0.54, 0.07, 0);
  bow.castShadow = true;
  group.add(bow);

  // Mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.58, 6), timberMat);
  mast.position.y = 0.36;
  mast.castShadow = true;
  group.add(mast);

  // Billowing square sail
  const sail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.38), sailMat);
  sail.position.set(0.03, 0.38, 0);
  sail.castShadow = true;
  group.add(sail);

  // Colored pennant flag at top of mast
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.025), hullMat);
  flag.position.set(-0.08, 0.62, 0);
  group.add(flag);

  return group;
}

// Seafarers Black Pirate Galleon pawn
export function createPirateModel(): THREE.Group {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.3 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4, metalness: 0.2 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.42), hullMat);
  hull.position.y = 0.11;
  hull.castShadow = true;
  group.add(hull);

  const deckTrim = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.36), trimMat);
  deckTrim.position.y = 0.24;
  group.add(deckTrim);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.92, 8), mastMat);
  mast.position.y = 0.64;
  mast.castShadow = true;
  group.add(mast);

  const mainSail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.56), sailMat);
  mainSail.position.set(0.04, 0.66, 0);
  mainSail.castShadow = true;
  group.add(mainSail);

  const redEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.18), trimMat);
  redEmblem.position.set(0.045, 0.66, 0);
  group.add(redEmblem);

  return group;
}

// Composite 5-part Robber pawn (bottom-center pivot y=0)
export function createRobberModel(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.45 });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.2 });
  const staffMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7, metalness: 0.1 });

  // 1. Weighted stone base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.09, 16), bodyMat);
  base.position.y = 0.045;
  base.castShadow = true;
  group.add(base);

  // 2. LatheGeometry cloaked torso
  const pts = [
    new THREE.Vector2(0.22, 0.09),
    new THREE.Vector2(0.19, 0.28),
    new THREE.Vector2(0.14, 0.48),
    new THREE.Vector2(0.18, 0.6),
    new THREE.Vector2(0.06, 0.66),
  ];
  const cloak = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), bodyMat);
  cloak.castShadow = true;
  group.add(cloak);

  // 3. Crimson waist sash
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.028, 8, 16), sashMat);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.38;
  group.add(sash);

  // 4. Hooded head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), bodyMat);
  head.position.y = 0.74;
  head.castShadow = true;
  group.add(head);

  // 5. Bandit staff
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.86, 8), staffMat);
  staff.position.set(0.22, 0.44, 0.08);
  staff.rotation.z = -0.08;
  staff.castShadow = true;
  group.add(staff);

  return group;
}

// Harbor pier + miniature sailboat + floating sign
export function createHarborModel(harbor: Harbor, maxAnisotropy: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(harbor.x, 0.05, harbor.z);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5, side: THREE.DoubleSide });

  // Pier plank facing inward toward island
  const pier = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.34), woodMat);
  pier.rotation.y = -harbor.outwardAngle;
  pier.position.set(-Math.cos(harbor.outwardAngle) * 0.45, 0.06, -Math.sin(harbor.outwardAngle) * 0.45);
  pier.castShadow = true;
  group.add(pier);

  // Miniature sailboat
  const boat = new THREE.Group();
  boat.position.set(Math.cos(harbor.outwardAngle) * 0.15, 0.04, Math.sin(harbor.outwardAngle) * 0.15);
  boat.rotation.y = -harbor.outwardAngle + Math.PI / 2;

  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 5), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.5);
  hull.castShadow = true;
  boat.add(hull);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.52, 6), woodMat);
  mast.position.y = 0.28;
  boat.add(mast);

  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0.08);
  sailShape.lineTo(0.24, 0.1);
  sailShape.lineTo(0, 0.5);
  sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
  sail.castShadow = true;
  boat.add(sail);

  group.add(boat);

  // Harbor badge disc tilted slightly toward camera
  const badgeTex = createHarborBadgeTexture(harbor.type, maxAnisotropy);
  const badge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.05, 24),
    [
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }),
    ],
  );
  badge.position.set(Math.cos(harbor.outwardAngle) * 0.25, 0.58, Math.sin(harbor.outwardAngle) * 0.25);
  badge.rotation.x = 0.25;
  badge.castShadow = true;
  group.add(badge);

  return group;
}

export function createDieModel(cache: ModelCache): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const mesh = new THREE.Mesh(geo, cache.dieFaceMaterials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
