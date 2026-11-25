import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  getMovableShipEdges,
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
  getValidShipEdges,
  getValidShipMoveTargets,
} from '../game/catanEngine';
import { HEX_HEIGHT, HEX_RADIUS } from '../game/hexMath';
import { playerColorThree } from '../i18n/translations';
import { BuildMode, CameraPreset, GameState } from '../types/catan';
import {
  ModelCache,
  TERRAIN_TOP_Y,
  createCityModel,
  createDieModel,
  createHarborModel,
  createHexTileGroup,
  createModelCache,
  createPirateModel,
  createRoadModel,
  createRobberModel,
  createSettlementModel,
  createShipModel,
} from './catanModels';
import { createOceanBumpTexture } from './proceduralTextures';

interface CatanSceneProps {
  gameState: GameState;
  buildMode: BuildMode;
  selectedShipEdgeId?: string | null;
  cameraPreset: CameraPreset;
  cameraTrigger: number;
  darkMode: boolean;
  localSeatIndex?: number | null;
  onVertexClick: (vertexId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onHexClick: (hexId: number) => void;
}

// Pre-allocated scratch objects for zero-GC render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

function getDieTargetEuler(value: number): [number, number, number] {
  // Face layout: +X=3, -X=4, +Y=1, -Y=6, +Z=2, -Z=5
  switch (value) {
    case 1:
      return [0, 0, 0];
    case 6:
      return [Math.PI, 0, 0];
    case 2:
      return [-Math.PI / 2, 0, 0];
    case 5:
      return [Math.PI / 2, 0, 0];
    case 3:
      return [0, 0, Math.PI / 2];
    case 4:
      return [0, 0, -Math.PI / 2];
    default:
      return [0, 0, 0];
  }
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  isometric: { pos: [0, 12.5, 11.8], target: [0, 0, 0.4] },
  top: { pos: [0, 18.2, 1.2], target: [0, 0, 0] },
  low: { pos: [7.8, 5.4, 9.6], target: [0, 0.4, 0] },
  overview: { pos: [-9.5, 11.5, 10.5], target: [0, 0, 0.2] },
};

const EXPANDED_CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  isometric: { pos: [0, 21.5, 20.5], target: [0, 0, 0.4] },
  top: { pos: [0, 31.0, 1.6], target: [0, 0, 0] },
  low: { pos: [13.5, 8.2, 16.2], target: [0, 0.4, 0] },
  overview: { pos: [-15.5, 19.0, 18.0], target: [0, 0, 0.2] },
};

export const CatanScene: React.FC<CatanSceneProps> = ({
  gameState,
  buildMode,
  selectedShipEdgeId = null,
  cameraPreset,
  cameraTrigger,
  darkMode,
  localSeatIndex = null,
  onVertexClick,
  onEdgeClick,
  onHexClick,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Latest props & callbacks in refs so WebGL scene never tears down on React updates
  const callbacksRef = useRef({ onVertexClick, onEdgeClick, onHexClick });
  callbacksRef.current = { onVertexClick, onEdgeClick, onHexClick };

  const stateRef = useRef({ gameState, buildMode, darkMode });
  stateRef.current = { gameState, buildMode, darkMode };

  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    cache: ModelCache;
    frameRing: THREE.Mesh;
    boardGroup: THREE.Group;
    piecesGroup: THREE.Group;
    markersGroup: THREE.Group;
    robberGroup: THREE.Group;
    pirateGroup: THREE.Group;
    diceGroup: THREE.Group;
    die1: THREE.Mesh;
    die2: THREE.Mesh;
    oceanMat: THREE.MeshStandardMaterial;
    oceanBump: THREE.CanvasTexture;
    interactiveMeshes: THREE.Object3D[];
    hoveredMarker: THREE.Object3D | null;
    diceAnimTime: number;
    lastDiceCount: number;
    lastBoardSignature: string;
    lastPiecesSignature: string;
    lastMarkersSignature: string;
    cameraAnim: { active: boolean; pos: THREE.Vector3; target: THREE.Vector3 };
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialBg = stateRef.current.darkMode ? 0x0b1c2c : 0xbae6fd;
    scene.background = new THREE.Color(initialBg);
    scene.fog = new THREE.FogExp2(initialBg, 0.014);

    // Mandatory studio environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const initialPresets =
      stateRef.current.gameState.gameMode === 'expanded' ? EXPANDED_CAMERA_PRESETS : CAMERA_PRESETS;
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 130);
    camera.position.set(...initialPresets.isometric.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...initialPresets.isometric.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 6.5;
    controls.maxDistance = 48;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI / 2.25;
    controls.enablePan = true;

    // Warm/cool 3-point lighting rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e3a5f, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4d6, 1.85);
    keyLight.position.set(12, 20, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 56;
    const d = 20;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    rimLight.position.set(-12, 10, -12);
    scene.add(rimLight);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const cache = createModelCache(maxAnisotropy);
    const oceanBump = createOceanBumpTexture(maxAnisotropy);

    // Endless Ocean Floor
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0e7490,
      roughness: 0.28,
      metalness: 0.12,
      bumpMap: oceanBump,
      bumpScale: 0.08,
    });
    const oceanMesh = new THREE.Mesh(new THREE.CircleGeometry(90, 64), oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -0.04;
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    // Subtle Sea Frame coastal shelf beneath the basic 19-hex island and harbors
    const frameRing = new THREE.Mesh(
      new THREE.RingGeometry(HEX_RADIUS * 4.3, HEX_RADIUS * 5.35, 36),
      new THREE.MeshStandardMaterial({ color: 0x164e63, roughness: 0.72, metalness: 0.08 }),
    );
    frameRing.rotation.x = -Math.PI / 2;
    frameRing.position.y = -0.015;
    frameRing.receiveShadow = true;
    scene.add(frameRing);

    const boardGroup = new THREE.Group();
    const piecesGroup = new THREE.Group();
    const markersGroup = new THREE.Group();
    const robberGroup = createRobberModel();
    const pirateGroup = createPirateModel();
    pirateGroup.visible = false;
    const diceGroup = new THREE.Group();
    diceGroup.position.set(7.8, 0, 5.8);

    // Wooden dice tray barge floating gently on sea
    const tray = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.45, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.78 }),
    );
    tray.position.y = 0.07;
    tray.receiveShadow = true;
    tray.castShadow = true;
    diceGroup.add(tray);

    const trayFelt = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.18, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95 }),
    );
    trayFelt.position.y = 0.145;
    trayFelt.receiveShadow = true;
    diceGroup.add(trayFelt);

    const die1 = createDieModel(cache);
    die1.rotation.order = 'YXZ';
    die1.position.set(-0.42, 0.43, -0.1);
    const die2 = createDieModel(cache);
    die2.rotation.order = 'YXZ';
    die2.position.set(0.42, 0.43, 0.12);
    diceGroup.add(die1, die2);

    scene.add(boardGroup, piecesGroup, markersGroup, robberGroup, pirateGroup, diceGroup);

    const sceneData = {
      scene,
      camera,
      renderer,
      controls,
      cache,
      frameRing,
      boardGroup,
      piecesGroup,
      markersGroup,
      robberGroup,
      pirateGroup,
      diceGroup,
      die1,
      die2,
      oceanMat,
      oceanBump,
      interactiveMeshes: [] as THREE.Object3D[],
      hoveredMarker: null as THREE.Object3D | null,
      diceAnimTime: 0,
      lastDiceCount: -1,
      lastBoardSignature: '',
      lastPiecesSignature: '',
      lastMarkersSignature: '',
      cameraAnim: {
        active: false,
        pos: new THREE.Vector3(...CAMERA_PRESETS.isometric.pos),
        target: new THREE.Vector3(...CAMERA_PRESETS.isometric.target),
      },
      isSoftwareGl,
    };
    sceneObjectsRef.current = sceneData;

    // Cancel scripted camera animation if user manually drags/zooms
    const onControlStart = () => {
      sceneData.cameraAnim.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // Pointer interaction (hover & click with drag threshold)
    let downX = 0;
    let downY = 0;
    let lastHoverTime = 0;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 40) return;
      lastHoverTime = now;

      if (sceneData.interactiveMeshes.length === 0) {
        if (sceneData.hoveredMarker) {
          sceneData.hoveredMarker.scale.setScalar(1);
          sceneData.hoveredMarker = null;
        }
        renderer.domElement.style.cursor = 'grab';
        return;
      }

      updatePointer(ev);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(sceneData.interactiveMeshes, false);

      if (sceneData.hoveredMarker) {
        sceneData.hoveredMarker.scale.setScalar(1);
        sceneData.hoveredMarker = null;
      }

      if (hits.length > 0) {
        const obj = hits[0].object;
        sceneData.hoveredMarker = obj;
        obj.scale.setScalar(1.22);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (dist > 7) return; // Was a camera drag, not a click

      if (sceneData.interactiveMeshes.length === 0) return;
      updatePointer(ev);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(sceneData.interactiveMeshes, false);
      if (hits.length > 0) {
        const data = hits[0].object.userData;
        if (data.kind === 'vertex' && data.vertexId) {
          callbacksRef.current.onVertexClick(data.vertexId);
        } else if (data.kind === 'edge' && data.edgeId) {
          callbacksRef.current.onEdgeClick(data.edgeId);
        } else if (data.kind === 'hex' && typeof data.hexId === 'number') {
          callbacksRef.current.onHexClick(data.hexId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Animation loop with THREE.Timer and software WebGL afterDraw pacing
    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick(timestamp?: number) {
      if (disposed) return;
      timer.update(timestamp);
      const rawDt = timer.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = timer.getElapsed();

      // Gentle ocean ripple drift
      oceanBump.offset.x = (elapsed * 0.015) % 1;
      oceanBump.offset.y = (elapsed * 0.01) % 1;

      // Title screen slow orbit
      const currentState = stateRef.current.gameState;
      controls.autoRotate = !isSoftwareGl && currentState.phase === 'title';
      controls.autoRotateSpeed = 0.65;

      // Smooth damped camera preset transition
      if (sceneData.cameraAnim.active) {
        const alpha = 1 - Math.exp(-6.5 * dt);
        camera.position.lerp(sceneData.cameraAnim.pos, alpha);
        controls.target.lerp(sceneData.cameraAnim.target, alpha);
        if (
          camera.position.distanceTo(sceneData.cameraAnim.pos) < 0.05 &&
          controls.target.distanceTo(sceneData.cameraAnim.target) < 0.05
        ) {
          sceneData.cameraAnim.active = false;
        }
      }

      // Smooth robber & pirate movement toward active hexes
      const robberHex = currentState.hexes[currentState.robberHexId];
      if (robberHex) {
        _vec3A.set(robberHex.x + 0.48, TERRAIN_TOP_Y, robberHex.z - 0.36);
        const lerpF = 1 - Math.exp(-8 * dt);
        robberGroup.position.lerp(_vec3A, lerpF);
      }

      if (currentState.gameMode === 'expanded' && currentState.pirateHexId !== null) {
        pirateGroup.visible = true;
        const pirateHex = currentState.hexes[currentState.pirateHexId];
        if (pirateHex) {
          _vec3B.set(pirateHex.x, 0.06, pirateHex.z);
          const lerpF = 1 - Math.exp(-7 * dt);
          pirateGroup.position.lerp(_vec3B, lerpF);
          pirateGroup.rotation.y = Math.sin(elapsed * 0.8) * 0.12 + 0.35;
        }
      } else {
        pirateGroup.visible = false;
      }

      // Dice tumble animation
      if (sceneData.diceAnimTime > 0) {
        sceneData.diceAnimTime = Math.max(0, sceneData.diceAnimTime - dt);
        const progress = 1 - sceneData.diceAnimTime / 0.75;
        const bounce = Math.abs(Math.sin(progress * Math.PI * 2)) * (1 - progress) * 0.85;
        die1.position.y = 0.43 + bounce;
        die2.position.y = 0.43 + bounce * 0.9;
        if (sceneData.diceAnimTime > 0.05) {
          die1.rotation.x = (die1.rotation.x + dt * 14) % (Math.PI * 2);
          die1.rotation.y = (die1.rotation.y + dt * 11) % (Math.PI * 2);
          die2.rotation.x = (die2.rotation.x + dt * 12) % (Math.PI * 2);
          die2.rotation.z = (die2.rotation.z + dt * 15) % (Math.PI * 2);
        }
      } else {
        const [e1x, e1y, e1z] = getDieTargetEuler(currentState.dice[0]);
        const [e2x, e2y, e2z] = getDieTargetEuler(currentState.dice[1]);
        const rotAlpha = 1 - Math.exp(-12 * dt);
        die1.position.y = THREE.MathUtils.lerp(die1.position.y, 0.43, rotAlpha);
        die2.position.y = THREE.MathUtils.lerp(die2.position.y, 0.43, rotAlpha);
        die1.rotation.x = THREE.MathUtils.lerp(die1.rotation.x, e1x, rotAlpha);
        die1.rotation.y = THREE.MathUtils.lerp(die1.rotation.y, e1y + 0.15, rotAlpha);
        die1.rotation.z = THREE.MathUtils.lerp(die1.rotation.z, e1z, rotAlpha);
        die2.rotation.x = THREE.MathUtils.lerp(die2.rotation.x, e2x, rotAlpha);
        die2.rotation.y = THREE.MathUtils.lerp(die2.rotation.y, e2y - 0.25, rotAlpha);
        die2.rotation.z = THREE.MathUtils.lerp(die2.rotation.z, e2z, rotAlpha);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      timer.dispose();
      envRT.dispose();
      oceanBump.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync Sky/Ocean/Fog with Dark/Light mode
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;
    const bgHex = darkMode ? 0x0b1c2c : 0xbae6fd;
    (obj.scene.background as THREE.Color).setHex(bgHex);
    if (obj.scene.fog instanceof THREE.FogExp2) {
      obj.scene.fog.color.setHex(bgHex);
    }
    obj.oceanMat.color.setHex(darkMode ? 0x0c4a6e : 0x0284c7);
  }, [darkMode]);

  // Sync Camera Presets
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj || cameraTrigger === 0) return;
    const presetMap = gameState.gameMode === 'expanded' ? EXPANDED_CAMERA_PRESETS : CAMERA_PRESETS;
    const preset = presetMap[cameraPreset];
    obj.cameraAnim.pos.set(...preset.pos);
    obj.cameraAnim.target.set(...preset.target);
    obj.cameraAnim.active = true;
  }, [cameraPreset, cameraTrigger, gameState.gameMode]);

  // Sync Board Terrain, Harbors, Pieces, Dice, and Interactive Markers
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;

    const isExpanded = gameState.gameMode === 'expanded';
    obj.frameRing.visible = !isExpanded;
    obj.diceGroup.position.set(isExpanded ? 15.2 : 7.8, 0, isExpanded ? 11.4 : 5.8);

    // 1. Dice trigger
    if (obj.lastDiceCount !== gameState.diceRollCount) {
      if (obj.lastDiceCount !== -1 && gameState.diceRollCount > 0) {
        obj.diceAnimTime = 0.75;
      }
      obj.lastDiceCount = gameState.diceRollCount;
    }

    // 2. Rebuild Hexes & Harbors only when board layout or fog reveal changes
    const boardSig =
      gameState.gameMode +
      '|' +
      gameState.hexes.map((h) => `${h.terrain}:${h.numberToken}:${h.fogged ? 1 : 0}`).join('|') +
      '|' +
      gameState.harbors.map((hb) => `${hb.edgeId}:${hb.type}`).join(',');
    if (obj.lastBoardSignature !== boardSig) {
      obj.lastBoardSignature = boardSig;
      while (obj.boardGroup.children.length > 0) {
        obj.boardGroup.remove(obj.boardGroup.children[0]);
      }
      for (const hex of gameState.hexes) {
        const { group } = createHexTileGroup(hex, obj.cache);
        obj.boardGroup.add(group);
      }
      const maxAniso = obj.renderer.capabilities.getMaxAnisotropy();
      for (const harbor of gameState.harbors) {
        obj.boardGroup.add(createHarborModel(harbor, maxAniso));
      }
      const startHex = gameState.hexes[gameState.robberHexId];
      if (startHex) {
        obj.robberGroup.position.set(startHex.x + 0.48, TERRAIN_TOP_Y, startHex.z - 0.36);
      }
      if (isExpanded && gameState.pirateHexId !== null) {
        const pHex = gameState.hexes[gameState.pirateHexId];
        if (pHex) {
          obj.pirateGroup.position.set(pHex.x, 0.06, pHex.z);
        }
      }
    }

    // 3. Rebuild Settlements, Cities, Roads & Ships when placed pieces change
    const piecesSig =
      Object.values(gameState.vertices)
        .filter((v) => v.ownerId !== null)
        .map((v) => `${v.id}:${v.ownerId}:${v.building}`)
        .join(',') +
      '|' +
      Object.values(gameState.edges)
        .filter((e) => e.ownerId !== null)
        .map((e) => `${e.id}:${e.ownerId}:${e.pieceType ?? 'road'}`)
        .join(',');

    if (obj.lastPiecesSignature !== piecesSig) {
      obj.lastPiecesSignature = piecesSig;
      while (obj.piecesGroup.children.length > 0) {
        obj.piecesGroup.remove(obj.piecesGroup.children[0]);
      }

      for (const v of Object.values(gameState.vertices)) {
        if (v.ownerId === null || v.building === null) continue;
        const pColor = playerColorThree(gameState.players[v.ownerId].color);
        const mesh = v.building === 'city' ? createCityModel(pColor) : createSettlementModel(pColor);
        mesh.position.set(v.x, TERRAIN_TOP_Y, v.z);
        obj.piecesGroup.add(mesh);
      }

      for (const e of Object.values(gameState.edges)) {
        if (e.ownerId === null) continue;
        const pColor = playerColorThree(gameState.players[e.ownerId].color);
        if (e.pieceType === 'ship') {
          const ship = createShipModel(pColor);
          ship.position.set(e.x, 0.08, e.z);
          ship.rotation.y = -e.angle;
          obj.piecesGroup.add(ship);
        } else {
          const road = createRoadModel(pColor);
          road.position.set(e.x, TERRAIN_TOP_Y, e.z);
          road.rotation.y = -e.angle;
          obj.piecesGroup.add(road);
        }
      }
    }

    // 4. Rebuild Interactive Markers for Human Player (scoped to localSeatIndex in online mode)
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const isHumanTurn =
      activePlayer &&
      !activePlayer.isAI &&
      (localSeatIndex === null || localSeatIndex === undefined || activePlayer.id === localSeatIndex);
    const markersSig = `${gameState.phase}:${gameState.currentPlayerIndex}:${buildMode}:${selectedShipEdgeId ?? ''}:${piecesSig}:${gameState.robberHexId}:${gameState.pirateHexId ?? ''}:${gameState.shipMovedThisTurn}:${isHumanTurn}:${localSeatIndex ?? 'local'}`;

    if (obj.lastMarkersSignature !== markersSig) {
      obj.lastMarkersSignature = markersSig;
      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      while (obj.markersGroup.children.length > 0) {
        const child = obj.markersGroup.children[0];
        if (child instanceof THREE.Mesh) {
          if (child.geometry && !disposedGeos.has(child.geometry)) {
            disposedGeos.add(child.geometry);
            child.geometry.dispose();
          }
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => {
              if (!disposedMats.has(m)) {
                disposedMats.add(m);
                m.dispose();
              }
            });
          } else if (mat && !disposedMats.has(mat)) {
            disposedMats.add(mat);
            mat.dispose();
          }
        }
        obj.markersGroup.remove(child);
      }
      obj.interactiveMeshes = [];
      obj.hoveredMarker = null;

      if (!isHumanTurn) return;

      const pid = activePlayer.id;
      const isBuildPhase = gameState.phase === 'action' || gameState.phase === 'special_build';

      // Settlement markers
      if (
        gameState.phase === 'setup_settlement' ||
        (isBuildPhase && buildMode === 'settlement')
      ) {
        const validV = getValidSettlementVertices(gameState, pid, gameState.phase === 'setup_settlement');
        const markerGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16);
        const markerMat = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x16a34a,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        });
        for (const vid of validV) {
          const v = gameState.vertices[vid];
          const m = new THREE.Mesh(markerGeo, markerMat);
          m.position.set(v.x, TERRAIN_TOP_Y + 0.08, v.z);
          m.userData = { kind: 'vertex', vertexId: vid };
          obj.markersGroup.add(m);
          obj.interactiveMeshes.push(m);
        }
      }

      // City upgrade markers
      if (isBuildPhase && buildMode === 'city') {
        const validC = getValidCityVertices(gameState, pid);
        const ringGeo = new THREE.TorusGeometry(0.32, 0.055, 8, 20);
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.75,
          roughness: 0.25,
        });
        for (const vid of validC) {
          const v = gameState.vertices[vid];
          const m = new THREE.Mesh(ringGeo, ringMat);
          m.rotation.x = Math.PI / 2;
          m.position.set(v.x, TERRAIN_TOP_Y + 0.1, v.z);
          m.userData = { kind: 'vertex', vertexId: vid };
          obj.markersGroup.add(m);
          obj.interactiveMeshes.push(m);
        }
      }

      // Road markers (Setup, Road Building, or Road buildMode)
      if (
        (gameState.phase === 'setup_road' && buildMode !== 'ship') ||
        ((gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2') && buildMode !== 'ship') ||
        (isBuildPhase && buildMode === 'road')
      ) {
        const validE = getValidRoadEdges(gameState, pid, {
          isSetup: gameState.phase === 'setup_road',
          setupVertexId: gameState.pendingSettlementVertexId,
          freeRoad: gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2',
        });
        const barGeo = new THREE.BoxGeometry(0.92, 0.14, 0.22);
        const barMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        });
        for (const eid of validE) {
          const e = gameState.edges[eid];
          const m = new THREE.Mesh(barGeo, barMat);
          m.position.set(e.x, TERRAIN_TOP_Y + 0.08, e.z);
          m.rotation.y = -e.angle;
          m.userData = { kind: 'edge', edgeId: eid };
          obj.markersGroup.add(m);
          obj.interactiveMeshes.push(m);
        }

        // In setup_road or road_building, also show cyan Ship markers on sea-only edges (not already in validE)
        if (
          isExpanded &&
          (gameState.phase === 'setup_road' ||
            gameState.phase === 'road_building_1' ||
            gameState.phase === 'road_building_2')
        ) {
          const roadSet = new Set(validE);
          const validShips = getValidShipEdges(gameState, pid, {
            isSetup: gameState.phase === 'setup_road',
            setupVertexId: gameState.pendingSettlementVertexId,
            freeShip: gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2',
          }).filter((eid) => !roadSet.has(eid));

          if (validShips.length > 0) {
            const shipBarGeo = new THREE.BoxGeometry(0.9, 0.14, 0.22);
            const shipBarMat = new THREE.MeshStandardMaterial({
              color: 0x06b6d4,
              emissive: 0x0e7490,
              emissiveIntensity: 0.75,
              roughness: 0.28,
            });
            for (const eid of validShips) {
              const e = gameState.edges[eid];
              const m = new THREE.Mesh(shipBarGeo, shipBarMat);
              m.position.set(e.x, 0.15, e.z);
              m.rotation.y = -e.angle;
              m.userData = { kind: 'edge', edgeId: eid };
              obj.markersGroup.add(m);
              obj.interactiveMeshes.push(m);
            }
          }
        }
      }

      // Explicit Ship build markers (Action, Special Build, or Setup/RoadBuilding with ship mode selected)
      if (
        isExpanded &&
        buildMode === 'ship' &&
        (isBuildPhase ||
          gameState.phase === 'setup_road' ||
          gameState.phase === 'road_building_1' ||
          gameState.phase === 'road_building_2')
      ) {
        const validShips = getValidShipEdges(gameState, pid, {
          isSetup: gameState.phase === 'setup_road',
          setupVertexId: gameState.pendingSettlementVertexId,
          freeShip: gameState.phase === 'road_building_1' || gameState.phase === 'road_building_2',
        });
        const shipBarGeo = new THREE.BoxGeometry(0.92, 0.14, 0.24);
        const shipBarMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0891b2,
          emissiveIntensity: 0.75,
          roughness: 0.25,
        });
        for (const eid of validShips) {
          const e = gameState.edges[eid];
          const m = new THREE.Mesh(shipBarGeo, shipBarMat);
          m.position.set(e.x, 0.16, e.z);
          m.rotation.y = -e.angle;
          m.userData = { kind: 'edge', edgeId: eid };
          obj.markersGroup.add(m);
          obj.interactiveMeshes.push(m);
        }
      }

      // Move Ship markers (Step 1: pick movable ship; Step 2: pick destination edge)
      if (isExpanded && gameState.phase === 'action' && buildMode === 'move_ship') {
        if (!selectedShipEdgeId) {
          const movable = getMovableShipEdges(gameState, pid);
          const pickGeo = new THREE.BoxGeometry(0.96, 0.22, 0.3);
          const pickMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.8,
            roughness: 0.25,
          });
          for (const eid of movable) {
            const e = gameState.edges[eid];
            const m = new THREE.Mesh(pickGeo, pickMat);
            m.position.set(e.x, 0.22, e.z);
            m.rotation.y = -e.angle;
            m.userData = { kind: 'edge', edgeId: eid };
            obj.markersGroup.add(m);
            obj.interactiveMeshes.push(m);
          }
        } else {
          // Highlight selected ship to allow deselecting, plus emerald targets
          const selEdge = gameState.edges[selectedShipEdgeId];
          if (selEdge) {
            const selGeo = new THREE.BoxGeometry(1.0, 0.25, 0.32);
            const selMat = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: 0xf59e0b,
              emissiveIntensity: 0.85,
            });
            const selM = new THREE.Mesh(selGeo, selMat);
            selM.position.set(selEdge.x, 0.24, selEdge.z);
            selM.rotation.y = -selEdge.angle;
            selM.userData = { kind: 'edge', edgeId: selectedShipEdgeId };
            obj.markersGroup.add(selM);
            obj.interactiveMeshes.push(selM);
          }

          const targets = getValidShipMoveTargets(gameState, pid, selectedShipEdgeId);
          const targetGeo = new THREE.BoxGeometry(0.92, 0.16, 0.24);
          const targetMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.8,
            roughness: 0.25,
          });
          for (const eid of targets) {
            const e = gameState.edges[eid];
            const m = new THREE.Mesh(targetGeo, targetMat);
            m.position.set(e.x, 0.16, e.z);
            m.rotation.y = -e.angle;
            m.userData = { kind: 'edge', edgeId: eid };
            obj.markersGroup.add(m);
            obj.interactiveMeshes.push(m);
          }
        }
      }

      // Robber (land) & Pirate (sea) move hex markers
      if (gameState.phase === 'move_robber') {
        const hexMarkerGeo = new THREE.RingGeometry(0.55, 0.76, 6);
        const landMarkerMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 0.7,
          side: THREE.DoubleSide,
          roughness: 0.35,
        });
        const seaMarkerMat = new THREE.MeshStandardMaterial({
          color: 0xa855f7,
          emissive: 0x7e22ce,
          emissiveIntensity: 0.75,
          side: THREE.DoubleSide,
          roughness: 0.35,
        });
        for (const hex of gameState.hexes) {
          if (hex.fogged) continue;
          if (hex.terrain === 'sea') {
            if (!isExpanded || hex.id === gameState.pirateHexId) continue;
            const m = new THREE.Mesh(hexMarkerGeo, seaMarkerMat);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = Math.PI / 6;
            m.position.set(hex.x, 0.08, hex.z);
            m.userData = { kind: 'hex', hexId: hex.id };
            obj.markersGroup.add(m);
            obj.interactiveMeshes.push(m);
          } else {
            if (hex.id === gameState.robberHexId) continue;
            const m = new THREE.Mesh(hexMarkerGeo, landMarkerMat);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = Math.PI / 6;
            m.position.set(hex.x, TERRAIN_TOP_Y + 0.04, hex.z);
            m.userData = { kind: 'hex', hexId: hex.id };
            obj.markersGroup.add(m);
            obj.interactiveMeshes.push(m);
          }
        }
      }

      // Natural Disaster / Plague land hex target markers
      if (gameState.phase === 'select_disaster_hex' || gameState.phase === 'select_plague_hex') {
        const isDisaster = gameState.phase === 'select_disaster_hex';
        const hexMarkerGeo = new THREE.RingGeometry(0.55, 0.78, 6);
        const targetMat = new THREE.MeshStandardMaterial({
          color: isDisaster ? 0xf97316 : 0x84cc16,
          emissive: isDisaster ? 0xea580c : 0x65a30d,
          emissiveIntensity: 0.78,
          side: THREE.DoubleSide,
          roughness: 0.3,
        });
        for (const hex of gameState.hexes) {
          if (hex.fogged || hex.terrain === 'sea') continue;
          const m = new THREE.Mesh(hexMarkerGeo, targetMat);
          m.rotation.x = -Math.PI / 2;
          m.rotation.z = Math.PI / 6;
          m.position.set(hex.x, TERRAIN_TOP_Y + 0.05, hex.z);
          m.userData = { kind: 'hex', hexId: hex.id };
          obj.markersGroup.add(m);
          obj.interactiveMeshes.push(m);
        }
      }
    }
  }, [gameState, buildMode, selectedShipEdgeId, localSeatIndex]);

  return <div ref={mountRef} className="w-full h-full" aria-label="3D Catan Board" />;
};
