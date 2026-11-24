import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { Volume2, VolumeX, FastForward } from 'lucide-react';
import { AWAKENING_TIMINGS_MS, type AwakeningPhase } from '../lib/kuroganeLogic';
import { soundEngine } from '../lib/soundEngine';

interface AwakeningSceneProps {
  initialSoundPref: boolean | null;
  onSoundPrefChange: (enabled: boolean) => void;
  onComplete: () => void;
}

const SANCTUM_FALLBACK_IMG = '/src/assets/images/kurogane_obsidian_sanctum_1795519142364.jpg';

// Pre-allocated scratch vectors for zero-GC render loop
const _lookCurrent = new THREE.Vector3(0, -0.5, 0);
const _lookTarget = new THREE.Vector3(0, -0.5, 0);

function drawFiveLeafClover(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  strokeColor = '#ff263f',
  fillColor = 'rgba(24, 16, 20, 0.92)',
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Curved gothic stem descending between lower leaves
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(2.5, radius * 0.068);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.14);
  ctx.quadraticCurveTo(radius * 0.1, radius * 0.62, -radius * 0.14, radius * 0.98);
  ctx.stroke();

  // Sharp, pointed gothic Five-Leaf Clover petals (top + 2 upper sides + 2 lower splayed leaves)
  const leafAngles = [
    -Math.PI / 2,
    -Math.PI / 2 + (Math.PI * 2) / 5,
    -Math.PI / 2 + ((Math.PI * 2) / 5) * 2,
    -Math.PI / 2 + ((Math.PI * 2) / 5) * 3,
    -Math.PI / 2 + ((Math.PI * 2) / 5) * 4,
  ];
  for (let i = 0; i < leafAngles.length; i++) {
    const angle = leafAngles[i];
    ctx.save();
    ctx.rotate(angle);

    // Classic sharp pointed clover heart-spade leaf silhouette
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.06);
    ctx.bezierCurveTo(
      -radius * 0.38,
      -radius * 0.18,
      -radius * 0.44,
      -radius * 0.68,
      -radius * 0.14,
      -radius * 0.78,
    );
    ctx.quadraticCurveTo(-radius * 0.04, -radius * 0.88, 0, -radius * 0.96);
    ctx.quadraticCurveTo(radius * 0.04, -radius * 0.88, radius * 0.14, -radius * 0.78);
    ctx.bezierCurveTo(
      radius * 0.44,
      -radius * 0.68,
      radius * 0.38,
      -radius * 0.18,
      0,
      -radius * 0.06,
    );
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.048);
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    // Inner vein crack
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.16);
    ctx.lineTo(0, -radius * 0.72);
    ctx.lineWidth = Math.max(1.2, radius * 0.025);
    ctx.strokeStyle = 'rgba(255, 65, 88, 0.55)';
    ctx.stroke();

    ctx.restore();
  }

  // Dark core node
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.095, 0, Math.PI * 2);
  ctx.fillStyle = strokeColor;
  ctx.fill();

  ctx.restore();
}

function createFiveLeafEmblemTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(cx, cy, 18, cx, cy, 224);
  glow.addColorStop(0, 'rgba(255, 38, 63, 0.48)');
  glow.addColorStop(0.55, 'rgba(130, 0, 20, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255, 38, 63, 0.75)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 202, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([7, 9]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 184, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  drawFiveLeafClover(ctx, cx, cy, 146, '#ff263f', 'rgba(18, 12, 16, 0.88)');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrimoireCoverTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Charred soot-black worn leather gradient (Asta's weathered grimoire aesthetic)
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.48, 30, w * 0.5, h * 0.5, h * 0.7);
  bg.addColorStop(0, '#1e1d22');
  bg.addColorStop(0.55, '#121116');
  bg.addColorStop(1, '#070709');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Leather grain cracks, ash smudges, & battle scars
  for (let i = 0; i < 420; i++) {
    const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * w;
    const y = (Math.cos(i * 31.7) * 0.5 + 0.5) * h;
    const r = 4 + (i % 16);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(65, 62, 70, 0.08)' : 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diagonal wear scratches & soot fissures
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) {
    const sx = ((i * 73) % (w - 80)) + 40;
    const sy = ((i * 119) % (h - 100)) + 50;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + ((i % 2 === 0 ? 1 : -1) * (35 + (i % 40))), sy + 28 + (i % 35));
    ctx.stroke();
  }

  // Worn tarnished border frame inset
  ctx.strokeStyle = '#34323b';
  ctx.lineWidth = 5;
  ctx.strokeRect(26, 26, w - 52, h - 52);
  ctx.strokeStyle = 'rgba(164, 0, 25, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(38, 38, w - 76, h - 76);

  // Subtle crimson anti-magic hairline cracks radiating from center seal
  ctx.strokeStyle = 'rgba(255, 38, 63, 0.38)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(w / 2 + Math.cos(a) * 60, h * 0.49 + Math.sin(a) * 60);
    ctx.lineTo(w / 2 + Math.cos(a + 0.12) * 145, h * 0.49 + Math.sin(a + 0.12) * 145);
    ctx.lineTo(w / 2 + Math.cos(a - 0.08) * 198, h * 0.49 + Math.sin(a - 0.08) * 198);
    ctx.stroke();
  }

  // Embossed matte-black Five-Leaf Clover centered on the front cover
  drawFiveLeafClover(ctx, w / 2, h * 0.49, 132, 'rgba(205, 42, 62, 0.72)', '#09090c');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrimoirePageScriptTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Aged weathered parchment darkened & scorched around edges
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 45, w * 0.5, h * 0.5, h * 0.62);
  grad.addColorStop(0, '#c2b59b');
  grad.addColorStop(0.68, '#8d7d66');
  grad.addColorStop(0.9, '#3e332b');
  grad.addColorStop(1, '#1a1514');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Organic feathered scorch & soot vignette along tattered parchment margins
  const leftScorch = ctx.createLinearGradient(0, 0, 72, 0);
  leftScorch.addColorStop(0, 'rgba(14, 10, 10, 0.72)');
  leftScorch.addColorStop(0.55, 'rgba(32, 22, 18, 0.28)');
  leftScorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftScorch;
  ctx.fillRect(0, 0, 72, h);

  const rightScorch = ctx.createLinearGradient(w, 0, w - 72, 0);
  rightScorch.addColorStop(0, 'rgba(14, 10, 10, 0.72)');
  rightScorch.addColorStop(0.55, 'rgba(32, 22, 18, 0.28)');
  rightScorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rightScorch;
  ctx.fillRect(w - 72, 0, 72, h);

  const topScorch = ctx.createLinearGradient(0, 0, 0, 58);
  topScorch.addColorStop(0, 'rgba(14, 10, 10, 0.65)');
  topScorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topScorch;
  ctx.fillRect(0, 0, w, 58);

  const botScorch = ctx.createLinearGradient(0, h, 0, h - 58);
  botScorch.addColorStop(0, 'rgba(14, 10, 10, 0.65)');
  botScorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = botScorch;
  ctx.fillRect(0, h - 58, w, 58);

  // Delicate burnt edge fissures
  ctx.strokeStyle = 'rgba(20, 14, 14, 0.42)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 18; i++) {
    const sy = 36 + i * 39;
    const side = i % 2 === 0 ? 0 : w;
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(side, sy);
    ctx.lineTo(side + dir * (14 + (i % 18)), sy + ((i % 3) - 1) * 8);
    ctx.stroke();
  }

  // Ancient black-ink calligraphy blocks & arcane script lines
  ctx.strokeStyle = 'rgba(22, 18, 18, 0.72)';
  ctx.lineWidth = 3;
  for (let y = 78; y < h - 78; y += 26) {
    if (y > h * 0.38 && y < h * 0.62) continue;
    ctx.beginPath();
    ctx.moveTo(54, y);
    for (let x = 68; x < w - 58 - ((y * 5) % 64); x += 18) {
      ctx.lineTo(x, y + Math.sin(x * 0.25 + y) * 3.5);
    }
    ctx.stroke();
  }

  // Center glowing dark-crimson anti-magic spell diagram on parchment
  ctx.strokeStyle = 'rgba(164, 0, 25, 0.78)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 54, 0, Math.PI * 2);
  ctx.stroke();
  drawFiveLeafClover(ctx, w / 2, h / 2, 42, '#a40019', 'rgba(28, 10, 14, 0.85)');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrimoireCircleTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ff263f';
  ctx.fillStyle = '#ff263f';

  [470, 446, 360, 342, 220, 152].forEach((r, idx) => {
    ctx.save();
    ctx.globalAlpha = idx % 2 === 0 ? 0.75 : 0.38;
    ctx.lineWidth = idx === 0 || idx === 2 ? 3 : 1.5;
    if (idx === 1 || idx === 3) ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // 5-pointed star seal matching the 5-leaf grimoire
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const angle = (i * 2 * Math.PI * 2) / 5 - Math.PI / 2;
    const x = cx + Math.cos(angle) * 342;
    const y = cy + Math.sin(angle) * 342;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Five-leaf emblem etched in the center of the circle
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawFiveLeafClover(ctx, cx, cy, 118, '#ff263f', 'rgba(80, 0, 14, 0.55)');
  ctx.restore();

  const glyphs = ['ᛟ', 'ᚦ', 'ᛉ', 'ᚲ', 'ᛏ', 'ᛊ', 'ᛗ', 'ᛞ', 'ᛝ', 'ᛇ', '', 'ᛃ'];
  ctx.save();
  ctx.font = 'bold 26px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.78;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 402;
    const ry = cy + Math.sin(a) * 402;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(glyphs[i % glyphs.length], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBladeRuneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#ff263f';
  ctx.fillStyle = '#ff263f';
  ctx.lineWidth = 4;

  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.moveTo(64, 70);
  ctx.lineTo(64, 960);
  ctx.stroke();

  for (let y = 110; y < 930; y += 72) {
    ctx.beginPath();
    ctx.moveTo(64, y - 16);
    ctx.lineTo(86, y);
    ctx.lineTo(64, y + 16);
    ctx.lineTo(42, y);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(32, y - 28);
    ctx.lineTo(48, y - 18);
    ctx.moveTo(96, y - 28);
    ctx.lineTo(80, y - 18);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const AwakeningScene: React.FC<AwakeningSceneProps> = ({
  initialSoundPref,
  onSoundPrefChange,
  onComplete,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const subtitleRef = useRef<HTMLParagraphElement | null>(null);

  const [phase, setPhase] = useState<AwakeningPhase>('silence');
  const phaseRef = useRef<AwakeningPhase>('silence');
  const slashStartRef = useRef<number>(0);
  const grimoireManifestStartRef = useRef<number>(0);
  const swordEmergeStartRef = useRef<number>(0);
  const angleGrimoireStartRef = useRef<number>(0);
  const revealImpactStartRef = useRef<number>(0);
  const phaseTimersRef = useRef<number[]>([]);
  const slashTimersRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(performance.now());
  const [soundChosen, setSoundChosen] = useState<'pending' | 'sound' | 'silent'>(
    initialSoundPref === null ? 'pending' : initialSoundPref ? 'sound' : 'silent',
  );
  const soundChosenRef = useRef<'pending' | 'sound' | 'silent'>(soundChosen);
  const [slashCleaveActive, setSlashCleaveActive] = useState(false);
  const [slashParting, setSlashParting] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  const setPhaseBoth = (next: AwakeningPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    soundChosenRef.current = soundChosen;
  }, [soundChosen]);

  // Start or unlock theme music on mount/first gesture unless user explicitly chose silent
  useEffect(() => {
    if (initialSoundPref === false) return;
    let unlocked = false;
    const tryUnlock = async (e?: Event) => {
      const target = e?.target as HTMLElement | null;
      if (target?.closest?.('[data-silent-action="true"]')) return;
      if (unlocked || soundChosenRef.current === 'silent') return;
      const ok = await soundEngine.enable();
      if (ok && (soundChosenRef.current as string) !== 'silent') {
        unlocked = true;
        soundChosenRef.current = 'sound';
        setSoundChosen('sound');
        onSoundPrefChange(true);
        const elapsedSec = (performance.now() - startTimeRef.current) / 1000;
        if (phaseRef.current === 'slashing') {
          soundEngine.playSwordSlashTransition();
        } else {
          soundEngine.playAwakeningSequence(elapsedSec);
        }
        window.removeEventListener('pointerdown', tryUnlock);
        window.removeEventListener('keydown', tryUnlock);
      }
    };
    if (initialSoundPref === true) {
      void tryUnlock();
    }
    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
    };
  }, [initialSoundPref, onSoundPrefChange]);

  // Extended ~17.5s Five-Leaf Grimoire + Flip + Multi-Angle Sword Showcase Choreography
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setPhaseBoth('ready');
      return;
    }

    const t1 = window.setTimeout(() => {
      if (phaseRef.current === 'slashing') return;
      grimoireManifestStartRef.current = performance.now();
      setPhaseBoth('grimoire_manifest');
    }, AWAKENING_TIMINGS_MS.GRIMOIRE_MANIFEST);
    const t2 = window.setTimeout(() => {
      if (phaseRef.current === 'slashing') return;
      swordEmergeStartRef.current = performance.now();
      setPhaseBoth('sword_emerge');
    }, AWAKENING_TIMINGS_MS.SWORD_EMERGE);
    const t3 = window.setTimeout(() => {
      if (phaseRef.current === 'slashing') return;
      angleGrimoireStartRef.current = performance.now();
      setPhaseBoth('angle_grimoire');
    }, AWAKENING_TIMINGS_MS.ANGLE_GRIMOIRE);
    const t4 = window.setTimeout(() => {
      if (phaseRef.current === 'slashing') return;
      revealImpactStartRef.current = performance.now();
      setPhaseBoth('reveal');
    }, AWAKENING_TIMINGS_MS.REVEAL);
    const t5 = window.setTimeout(() => {
      if (phaseRef.current === 'slashing') return;
      setPhaseBoth('ready');
    }, AWAKENING_TIMINGS_MS.READY);

    phaseTimersRef.current = [t1, t2, t3, t4, t5];

    return () => {
      for (const id of phaseTimersRef.current) {
        window.clearTimeout(id);
      }
      phaseTimersRef.current = [];
      for (const id of slashTimersRef.current) {
        window.clearTimeout(id);
      }
      slashTimersRef.current = [];
      soundEngine.clearSequence();
    };
  }, []);

  // GSAP letter reveal when entering 'reveal'
  useEffect(() => {
    if (phase === 'reveal' && titleRef.current) {
      const letters = titleRef.current.querySelectorAll('.kuro-letter');
      gsap.fromTo(
        letters,
        { opacity: 0, y: 18, scale: 0.92, filter: 'blur(6px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.9,
          stagger: 0.08,
          ease: 'power3.out',
        },
      );
      if (subtitleRef.current) {
        gsap.fromTo(
          subtitleRef.current,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.9, delay: 0.75, ease: 'power2.out' },
        );
      }
    }
  }, [phase]);

  // Mount Three.js 3D Five-Leaf Grimoire + Emerging Black Sword + Screen-Slice Slash
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const canvas = renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.065);

    let envTarget: THREE.WebGLRenderTarget | null = null;
    if (!isSoftwareGl) {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envTarget.texture;
      pmremGenerator.dispose();
    }

    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      60,
    );
    camera.position.set(0, -0.4, 7.6);
    _lookCurrent.set(0, -0.7, 0);

    // 3-Point Studio + Crimson Arcane Lighting
    const hemiLight = new THREE.HemisphereLight(0x8890aa, 0x07070a, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xeef2ff, 2.5);
    keyLight.position.set(4.5, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc9c9d1, 2.2);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    const steelFillLight = new THREE.DirectionalLight(0xb8c2d8, 1.45);
    steelFillLight.position.set(-3.2, 2.4, 6.2);
    scene.add(steelFillLight);

    const crimsonLight = new THREE.PointLight(0xff263f, 0, 16, 1.4);
    crimsonLight.position.set(0, -0.4, 2.2);
    scene.add(crimsonLight);

    // =========================================================================
    // 1. 3D CHARRED FIVE-LEAF DARK GRIMOIRE (Asta-inspired weathered tome)
    // =========================================================================
    const grimoireBookGroup = new THREE.Group();
    grimoireBookGroup.position.set(0, -1.35, 0.15);
    grimoireBookGroup.rotation.x = 0.12;
    grimoireBookGroup.rotation.y = Math.PI; // Starts facing viewer showing charred 5-leaf cover before flipping open
    scene.add(grimoireBookGroup);

    const coverTex = createGrimoireCoverTexture();
    coverTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const grimoireSpineGeo = new THREE.BoxGeometry(0.38, 2.22, 0.28);
    const grimoireSpineMat = new THREE.MeshStandardMaterial({
      color: 0x0b0a0e,
      metalness: 0.45,
      roughness: 0.68,
    });
    const spineBookMesh = new THREE.Mesh(grimoireSpineGeo, grimoireSpineMat);
    grimoireBookGroup.add(spineBookMesh);

    // 4 raised metallic spine ribs
    const spineBandGeo = new THREE.BoxGeometry(0.4, 0.08, 0.295);
    const claspMat = new THREE.MeshStandardMaterial({
      color: 0x2b2b34,
      metalness: 0.85,
      roughness: 0.38,
    });
    [-0.74, -0.25, 0.25, 0.74].forEach((by) => {
      const band = new THREE.Mesh(spineBandGeo, claspMat);
      band.position.set(0, by, 0);
      grimoireBookGroup.add(band);
    });

    const grimoireCoverGeo = new THREE.BoxGeometry(1.52, 2.18, 0.085);
    const grimoireCoverMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: coverTex,
      emissive: 0x3b000a,
      emissiveIntensity: 0.25,
      metalness: 0.28,
      roughness: 0.76,
    });
    const grimoirePagesGeo = new THREE.BoxGeometry(1.4, 2.0, 0.16);
    const pageScriptTex = createGrimoirePageScriptTexture();
    pageScriptTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const grimoirePagesMat = new THREE.MeshStandardMaterial({
      color: 0xd8ccb4,
      map: pageScriptTex,
      emissive: 0x2e0008,
      emissiveIntensity: 0.22,
      roughness: 0.88,
      metalness: 0.04,
    });
    const claspGeo = new THREE.BoxGeometry(0.16, 0.08, 0.095);
    const cornerGeo = new THREE.BoxGeometry(0.18, 0.18, 0.092);

    const fiveLeafTex = createFiveLeafEmblemTexture();
    fiveLeafTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const fiveLeafSealGeo = new THREE.PlaneGeometry(1.22, 1.22);
    const fiveLeafSealMat = new THREE.MeshStandardMaterial({
      map: fiveLeafTex,
      emissiveMap: fiveLeafTex,
      emissive: new THREE.Color(0xff263f),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      roughness: 0.3,
      metalness: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Left Wing hinged at x = -0.15
    const leftWingPivot = new THREE.Group();
    leftWingPivot.position.set(-0.15, 0, 0);
    grimoireBookGroup.add(leftWingPivot);

    const leftCover = new THREE.Mesh(grimoireCoverGeo, grimoireCoverMat);
    leftCover.position.set(-0.76, 0, -0.045);
    const leftPages = new THREE.Mesh(grimoirePagesGeo, grimoirePagesMat);
    leftPages.position.set(-0.73, 0, 0.075);
    const leftClaspTop = new THREE.Mesh(claspGeo, claspMat);
    leftClaspTop.position.set(-1.44, 0.72, 0.02);
    const leftClaspBot = new THREE.Mesh(claspGeo, claspMat);
    leftClaspBot.position.set(-1.44, -0.72, 0.02);
    const leftCornerTop = new THREE.Mesh(cornerGeo, claspMat);
    leftCornerTop.position.set(-1.42, 0.99, -0.045);
    const leftCornerBot = new THREE.Mesh(cornerGeo, claspMat);
    leftCornerBot.position.set(-1.42, -0.99, -0.045);
    // Outer cover five-leaf crest relief (facing viewer when book starts closed)
    const outerCoverCrest = new THREE.Mesh(fiveLeafSealGeo, fiveLeafSealMat);
    outerCoverCrest.position.set(-0.76, 0, -0.095);
    outerCoverCrest.rotation.y = Math.PI;
    leftWingPivot.add(
      leftCover,
      leftPages,
      leftClaspTop,
      leftClaspBot,
      leftCornerTop,
      leftCornerBot,
      outerCoverCrest,
    );

    // Right Wing hinged at x = +0.15
    const rightWingPivot = new THREE.Group();
    rightWingPivot.position.set(0.15, 0, 0);
    grimoireBookGroup.add(rightWingPivot);

    const rightCover = new THREE.Mesh(grimoireCoverGeo, grimoireCoverMat);
    rightCover.position.set(0.76, 0, -0.045);
    const rightPages = new THREE.Mesh(grimoirePagesGeo, grimoirePagesMat);
    rightPages.position.set(0.73, 0, 0.075);
    const rightClaspTop = new THREE.Mesh(claspGeo, claspMat);
    rightClaspTop.position.set(1.44, 0.72, 0.02);
    const rightClaspBot = new THREE.Mesh(claspGeo, claspMat);
    rightClaspBot.position.set(1.44, -0.72, 0.02);
    const rightCornerTop = new THREE.Mesh(cornerGeo, claspMat);
    rightCornerTop.position.set(1.42, 0.99, -0.045);
    const rightCornerBot = new THREE.Mesh(cornerGeo, claspMat);
    rightCornerBot.position.set(1.42, -0.99, -0.045);
    const rightOuterCrest = new THREE.Mesh(fiveLeafSealGeo, fiveLeafSealMat);
    rightOuterCrest.position.set(0.76, 0, -0.095);
    rightOuterCrest.rotation.y = Math.PI;
    rightWingPivot.add(
      rightCover,
      rightPages,
      rightClaspTop,
      rightClaspBot,
      rightCornerTop,
      rightCornerBot,
      rightOuterCrest,
    );

    // 7 Articulated 3D turning parchment pages hinged at spine (flip rapidly as sword unleashes)
    const flipPageGeo = new THREE.PlaneGeometry(1.36, 1.96);
    const flipPageMat = new THREE.MeshStandardMaterial({
      color: 0xd9cdb6,
      map: pageScriptTex,
      emissive: 0x3b000a,
      emissiveIntensity: 0.28,
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const flipPagePivots: THREE.Group[] = [];
    for (let i = 0; i < 7; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, 0.17 + i * 0.008);
      const sheet = new THREE.Mesh(flipPageGeo, flipPageMat);
      sheet.position.set(0.69, 0, 0);
      pivot.add(sheet);
      grimoireBookGroup.add(pivot);
      flipPagePivots.push(pivot);
    }

    // Crimson Anti-Magic Summoning Rift rising cleanly from the open spine crease
    const portalSealGeo = new THREE.PlaneGeometry(2.15, 2.15);
    const portalSealMat = new THREE.MeshBasicMaterial({
      map: fiveLeafTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const portalSealMesh = new THREE.Mesh(portalSealGeo, portalSealMat);
    portalSealMesh.position.set(0, 0.12, 0.44);
    portalSealMesh.rotation.x = -0.35;
    grimoireBookGroup.add(portalSealMesh);

    // =========================================================================
    // 2. COMPOSITE 8-PART BLACK SWORD GROUP (Emerges from the Five-Leaf Grimoire)
    // =========================================================================
    const swordGroup = new THREE.Group();
    scene.add(swordGroup);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 2.85);
    bladeShape.lineTo(0.28, 2.1);
    bladeShape.lineTo(0.32, -1.05);
    bladeShape.lineTo(-0.32, -1.05);
    bladeShape.lineTo(-0.28, 2.1);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      steps: 1,
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    bladeGeo.center();
    const bladeMat = new THREE.MeshPhysicalMaterial({
      color: 0x22222c,
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.position.set(0, 0.95, 0);
    swordGroup.add(bladeMesh);

    const spineGeo = new THREE.BoxGeometry(0.11, 3.05, 0.155);
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0x09090d,
      metalness: 0.72,
      roughness: 0.56,
    });
    const spineMesh = new THREE.Mesh(spineGeo, spineMat);
    spineMesh.position.set(0, 0.85, 0);
    swordGroup.add(spineMesh);

    const runeTexture = createBladeRuneTexture();
    runeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const runeGeo = new THREE.PlaneGeometry(0.24, 2.85);
    const runeMat = new THREE.MeshStandardMaterial({
      map: runeTexture,
      emissiveMap: runeTexture,
      emissive: new THREE.Color(0xff263f),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.92,
      roughness: 0.3,
      metalness: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const runeFront = new THREE.Mesh(runeGeo, runeMat);
    runeFront.position.set(0, 0.92, 0.082);
    const runeBack = new THREE.Mesh(runeGeo, runeMat);
    runeBack.position.set(0, 0.92, -0.082);
    runeBack.rotation.y = Math.PI;
    swordGroup.add(runeFront, runeBack);

    const guardShape = new THREE.Shape();
    guardShape.moveTo(-1.18, 0.24);
    guardShape.quadraticCurveTo(-0.55, -0.04, 0, -0.14);
    guardShape.quadraticCurveTo(0.55, -0.04, 1.18, 0.24);
    guardShape.lineTo(0.95, -0.12);
    guardShape.quadraticCurveTo(0.45, -0.28, 0, -0.34);
    guardShape.quadraticCurveTo(-0.45, -0.28, -0.95, -0.12);
    guardShape.closePath();

    const guardGeo = new THREE.ExtrudeGeometry(guardShape, {
      steps: 1,
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.025,
      bevelSegments: 2,
    });
    guardGeo.center();
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x202028,
      metalness: 0.9,
      roughness: 0.28,
    });
    const guardMesh = new THREE.Mesh(guardGeo, guardMat);
    guardMesh.position.set(0, -0.95, 0);
    swordGroup.add(guardMesh);

    const coreGeo = new THREE.OctahedronGeometry(0.14, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xa40019,
      emissive: 0xff263f,
      emissiveIntensity: 1.4,
      metalness: 0.3,
      roughness: 0.15,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, -0.98, 0.04);
    coreMesh.scale.set(0.85, 1.25, 0.7);
    swordGroup.add(coreMesh);

    const gripPoints = [
      new THREE.Vector2(0.08, 0),
      new THREE.Vector2(0.095, 0.15),
      new THREE.Vector2(0.082, 0.35),
      new THREE.Vector2(0.095, 0.55),
      new THREE.Vector2(0.082, 0.75),
      new THREE.Vector2(0.105, 0.95),
    ];
    const gripGeo = new THREE.LatheGeometry(gripPoints, 20);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x101014,
      roughness: 0.78,
      metalness: 0.22,
    });
    const gripMesh = new THREE.Mesh(gripGeo, gripMat);
    gripMesh.position.set(0, -2.02, 0);
    swordGroup.add(gripMesh);

    const pommelPoints = [
      new THREE.Vector2(0.01, -0.28),
      new THREE.Vector2(0.19, -0.1),
      new THREE.Vector2(0.16, 0.08),
      new THREE.Vector2(0.09, 0.14),
    ];
    const pommelGeo = new THREE.LatheGeometry(pommelPoints, 8);
    const pommelMat = new THREE.MeshStandardMaterial({
      color: 0x262630,
      metalness: 0.92,
      roughness: 0.24,
    });
    const pommelMesh = new THREE.Mesh(pommelGeo, pommelMat);
    pommelMesh.position.set(0, -2.14, 0);
    swordGroup.add(pommelMesh);

    // 3D Crimson-Silver Slash Arc Trail & Diagonal Screen-Crossing Beam (visible during screen slice)
    const slashArcGeo = new THREE.RingGeometry(2.6, 4.4, 48, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const slashArcMat = new THREE.MeshBasicMaterial({
      color: 0xff263f,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const slashArc = new THREE.Mesh(slashArcGeo, slashArcMat);
    slashArc.rotation.z = Math.PI * 0.25;
    slashArc.position.set(0, 0.1, 2.45);
    scene.add(slashArc);

    const slashBeamGeo = new THREE.PlaneGeometry(16, 0.26);
    const slashBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffdfe4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const slashBeam3D = new THREE.Mesh(slashBeamGeo, slashBeamMat);
    slashBeam3D.rotation.z = 0.54; // ~31 deg diagonal from top-right to bottom-left
    slashBeam3D.position.set(0, 0, 2.95);
    scene.add(slashBeam3D);

    // =========================================================================
    // 3. DUAL ROTATING FIVE-LEAF ARCANE CIRCLES + FLOATING GRIMOIRE PAGES
    // =========================================================================
    const grimoireTexture = createGrimoireCircleTexture();
    grimoireTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const grimoireGroup = new THREE.Group();
    grimoireGroup.position.set(0, 0.35, -1.25);
    scene.add(grimoireGroup);

    const outerCircleGeo = new THREE.PlaneGeometry(5.8, 5.8);
    const outerCircleMat = new THREE.MeshBasicMaterial({
      map: grimoireTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerCircle = new THREE.Mesh(outerCircleGeo, outerCircleMat);
    grimoireGroup.add(outerCircle);

    const innerCircleGeo = new THREE.PlaneGeometry(3.5, 3.5);
    const innerCircleMat = new THREE.MeshBasicMaterial({
      map: grimoireTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerCircle = new THREE.Mesh(innerCircleGeo, innerCircleMat);
    innerCircle.position.z = 0.2;
    grimoireGroup.add(innerCircle);

    const pagesGroup = new THREE.Group();
    scene.add(pagesGroup);
    const pageGeo = new THREE.PlaneGeometry(0.42, 0.58);
    const pageMat = new THREE.MeshStandardMaterial({
      color: 0x1a161c,
      emissive: 0x52000e,
      emissiveIntensity: 0.45,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const pageSpecs: Array<{
      mesh: THREE.Mesh;
      radius: number;
      angle: number;
      y: number;
      speed: number;
    }> = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(pageGeo, pageMat);
      const angle = (i / 6) * Math.PI * 2;
      const radius = 2.25 + (i % 2) * 0.45;
      const y = -0.9 + (i % 3) * 0.85;
      mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius * 0.5 - 0.4);
      mesh.rotation.set(0.26, angle, 0.16);
      pagesGroup.add(mesh);
      pageSpecs.push({ mesh, radius, angle, y, speed: 0.16 + (i % 3) * 0.05 });
    }

    // Floating Ash & Crimson Ember Particle Field
    const particleCount = 480;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 9.5;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6.0;

      velocities[i * 3] = (Math.random() - 0.5) * 0.16;
      velocities[i * 3 + 1] = 0.25 + Math.random() * 0.65;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.16;

      const roll = Math.random();
      if (roll < 0.48) {
        // Deep crimson
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.14;
        colors[i * 3 + 2] = 0.24;
      } else if (roll < 0.78) {
        // Hellfire ember orange-gold
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.42 + Math.random() * 0.25;
        colors[i * 3 + 2] = 0.08;
      } else {
        // Silver ash
        colors[i * 3] = 0.78;
        colors[i * 3 + 1] = 0.78;
        colors[i * 3 + 2] = 0.84;
      }
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleTexture = createParticleTexture();
    const particleMat = new THREE.PointsMaterial({
      size: 0.115,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 3D Slash Fire & Ember Burst (ignites along the -31deg diagonal cleave)
    const slashFlameCount = 220;
    const slashFlamePos = new Float32Array(slashFlameCount * 3);
    const slashFlameCol = new Float32Array(slashFlameCount * 3);
    const slashFlameVel = new Float32Array(slashFlameCount * 3);
    const slashSlope = Math.tan(0.54); // ~31 deg diagonal
    for (let i = 0; i < slashFlameCount; i++) {
      const tPos = (Math.random() - 0.5) * 10.5;
      slashFlamePos[i * 3] = tPos;
      slashFlamePos[i * 3 + 1] = tPos * slashSlope + (Math.random() - 0.5) * 0.45;
      slashFlamePos[i * 3 + 2] = 2.7 + (Math.random() - 0.5) * 0.5;

      // Turbulent upward & outward flame drift
      slashFlameVel[i * 3] = (Math.random() - 0.5) * 2.2 - 1.2;
      slashFlameVel[i * 3 + 1] = 1.1 + Math.random() * 2.6;
      slashFlameVel[i * 3 + 2] = (Math.random() - 0.5) * 1.4;

      const heat = Math.random();
      slashFlameCol[i * 3] = 1.0;
      slashFlameCol[i * 3 + 1] = heat < 0.35 ? 0.82 : heat < 0.72 ? 0.38 : 0.12;
      slashFlameCol[i * 3 + 2] = heat < 0.35 ? 0.32 : 0.06;
    }
    const slashFlameGeo = new THREE.BufferGeometry();
    slashFlameGeo.setAttribute('position', new THREE.BufferAttribute(slashFlamePos, 3));
    slashFlameGeo.setAttribute('color', new THREE.BufferAttribute(slashFlameCol, 3));
    const slashFlameMat = new THREE.PointsMaterial({
      size: 0.24,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slashFlamePoints = new THREE.Points(slashFlameGeo, slashFlameMat);
    scene.add(slashFlamePoints);

    // Sword starts hidden inside the closed five-leaf grimoire
    swordGroup.visible = false;
    swordGroup.position.set(0, -3.3, 0.12);
    swordGroup.scale.setScalar(0.86);
    grimoireBookGroup.visible = false;

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

    let disposed = false;
    let frameId = 0;
    const startMs = performance.now();
    let prevMs = startMs;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state =
          sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 35);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = (nowMs - prevMs) / 1000;
      const dt = Math.min(rawDt, isSoftwareGl ? 0.45 : 0.1);
      const pDt = Math.min(rawDt, 0.08);
      prevMs = nowMs;
      const elapsed = (nowMs - startMs) / 1000;
      const curPhase = phaseRef.current;

      // Multi-angle camera choreography + subtle damped camera shake on slash/reveal impact
      let camTargetX = 0;
      let camTargetY = -0.35;
      let camTargetZ = 7.6;
      let camDamp = 3.0;

      if (curPhase === 'silence') {
        camTargetX = 0;
        camTargetY = -0.4;
        camTargetZ = 7.6;
        _lookTarget.set(0, -0.7, 0);
      } else if (curPhase === 'grimoire_manifest') {
        // Framed low-angle showcase of Asta's charred Five-Leaf Grimoire opening in darkness
        camTargetX = -0.65;
        camTargetY = -0.15;
        camTargetZ = 4.95;
        camDamp = 4.2;
        _lookTarget.set(0, -1.18, 0.1);
      } else if (curPhase === 'sword_emerge') {
        // Sweeping low oblique upward pan watching the black sword rise & spin out of the flipped Grimoire
        const emergeElapsed =
          swordEmergeStartRef.current > 0 ? (nowMs - swordEmergeStartRef.current) / 1000 : 1.5;
        const emergeProgress = THREE.MathUtils.clamp(emergeElapsed / 4.2, 0, 1);
        camTargetX = THREE.MathUtils.lerp(-2.55, -0.85, emergeProgress);
        camTargetY = THREE.MathUtils.lerp(-0.55, 0.35, emergeProgress);
        camTargetZ = THREE.MathUtils.lerp(5.05, 5.85, emergeProgress);
        camDamp = 3.8;
        _lookTarget.set(0, THREE.MathUtils.lerp(-0.15, 0.38, emergeProgress), 0.05);
      } else if (curPhase === 'angle_grimoire') {
        // Wide dynamic 3/4 orbital sweep around the floating blade & spinning grimoire rings
        const orbitElapsed =
          angleGrimoireStartRef.current > 0 ? (nowMs - angleGrimoireStartRef.current) / 1000 : 1.5;
        const orbitProgress = THREE.MathUtils.clamp(orbitElapsed / 4.6, 0, 1);
        const orbitAngle = THREE.MathUtils.lerp(0.62, -0.38, orbitProgress);
        camTargetX = Math.sin(orbitAngle) * 5.2 + 1.1;
        camTargetY = THREE.MathUtils.lerp(1.75, 0.45, orbitProgress);
        camTargetZ = Math.cos(orbitAngle) * 6.5;
        camDamp = 3.4;
        _lookTarget.set(0, 0.2, -0.1);
      } else if (curPhase === 'reveal' || curPhase === 'ready') {
        // Hero front framing with sword cleanly lifted above bottom typography
        camTargetX = 0;
        camTargetY = 0.2;
        camTargetZ = 8.4;
        camDamp = 3.6;
        _lookTarget.set(0, 0.18, 0);
      } else if (curPhase === 'slashing') {
        camTargetX = 0;
        camTargetY = 0;
        camTargetZ = 6.2;
        camDamp = 5.5;
        _lookTarget.set(0, 0, 0);
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetX, camDamp, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetY, camDamp, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, camTargetZ, camDamp, dt);

      _lookCurrent.x = THREE.MathUtils.damp(_lookCurrent.x, _lookTarget.x, camDamp, dt);
      _lookCurrent.y = THREE.MathUtils.damp(_lookCurrent.y, _lookTarget.y, camDamp, dt);
      _lookCurrent.z = THREE.MathUtils.damp(_lookCurrent.z, _lookTarget.z, camDamp, dt);

      // Subtle camera-shake impact during sword slice & initial hero reveal surge
      let shakeX = 0;
      let shakeY = 0;
      let shakeZ = 0;

      if (curPhase === 'slashing' && slashStartRef.current > 0) {
        const slashElapsed = (nowMs - slashStartRef.current) / 1000;
        if (slashElapsed >= 0.44) {
          const afterApex = slashElapsed - 0.44;
          const decay = Math.exp(-afterApex * 3.8);
          const amp = 0.22 * decay;
          shakeX = (Math.sin(afterApex * 66) + 0.5 * Math.cos(afterApex * 109)) * amp;
          shakeY = (Math.cos(afterApex * 58) + 0.48 * Math.sin(afterApex * 94)) * amp;
          shakeZ = Math.sin(afterApex * 80) * amp * 0.45;
        }
      } else if (curPhase === 'reveal' && revealImpactStartRef.current > 0) {
        const revealElapsed = (nowMs - revealImpactStartRef.current) / 1000;
        if (revealElapsed < 0.75) {
          const decay = Math.exp(-revealElapsed * 6.0);
          const amp = 0.055 * decay;
          shakeX = Math.sin(revealElapsed * 58) * amp;
          shakeY = Math.cos(revealElapsed * 49) * amp;
        }
      }

      camera.position.x += shakeX;
      camera.position.y += shakeY;
      camera.position.z += shakeZ;
      camera.lookAt(_lookCurrent.x + shakeX * 0.45, _lookCurrent.y + shakeY * 0.45, _lookCurrent.z);

      // Five-Leaf Grimoire flip animation:
      // 1. Shows closed charred Five-Leaf front cover -> 2. Flips 180° & opens wide -> 3. 7 pages flutter rapidly -> 4. Portal aura
      const showBook = curPhase !== 'silence';
      grimoireBookGroup.visible = showBook;

      const manifestElapsed =
        curPhase === 'silence'
          ? 0
          : grimoireManifestStartRef.current > 0
            ? (nowMs - grimoireManifestStartRef.current) / 1000
            : 3.5;
      const flipProgress = THREE.MathUtils.clamp((manifestElapsed - 1.05) / 1.3, 0, 1);
      const flipEase =
        flipProgress < 0.5
          ? 4 * flipProgress * flipProgress * flipProgress
          : 1 - Math.pow(-2 * flipProgress + 2, 3) / 2;

      const targetBookOpen =
        curPhase === 'silence'
          ? 0.04
          : curPhase === 'grimoire_manifest'
            ? THREE.MathUtils.lerp(0.05, 0.5, flipEase)
            : curPhase === 'slashing'
              ? 0.68
              : 0.48;
      const targetBookRotX =
        curPhase === 'silence'
          ? 0.12
          : curPhase === 'grimoire_manifest'
            ? THREE.MathUtils.lerp(0.12, -0.88, flipEase)
            : curPhase === 'slashing'
              ? -1.25
              : -0.9;
      const targetBookRotY =
        curPhase === 'silence'
          ? Math.PI
          : curPhase === 'grimoire_manifest'
            ? THREE.MathUtils.lerp(Math.PI, 0, flipEase)
            : curPhase === 'angle_grimoire'
              ? 0.24
              : 0;
      const targetBookY =
        curPhase === 'grimoire_manifest'
          ? THREE.MathUtils.lerp(-1.05, -1.35, flipEase)
          : curPhase === 'sword_emerge'
            ? -1.48
            : curPhase === 'reveal' || curPhase === 'ready'
              ? -1.95
              : curPhase === 'slashing'
                ? -2.95
                : -1.55;
      const targetBookScale =
        curPhase === 'reveal' || curPhase === 'ready' ? 0.76 : 1.08;
      const targetFiveLeafOpacity =
        curPhase === 'silence'
          ? 0
          : curPhase === 'grimoire_manifest'
            ? 0.98
            : curPhase === 'sword_emerge'
              ? 0.85
              : curPhase === 'slashing'
                ? 0.12
                : 0.58;
      const targetPortalOpacity =
        curPhase === 'grimoire_manifest'
          ? flipEase * 0.48
          : curPhase === 'sword_emerge'
            ? 0.65
            : curPhase === 'angle_grimoire'
              ? 0.36
              : curPhase === 'reveal' || curPhase === 'ready'
                ? 0.22
                : 0;

      leftWingPivot.rotation.y = THREE.MathUtils.damp(
        leftWingPivot.rotation.y,
        targetBookOpen,
        4.4,
        dt,
      );
      rightWingPivot.rotation.y = THREE.MathUtils.damp(
        rightWingPivot.rotation.y,
        -targetBookOpen,
        4.4,
        dt,
      );
      grimoireBookGroup.position.y = THREE.MathUtils.damp(
        grimoireBookGroup.position.y,
        targetBookY,
        3.6,
        dt,
      );
      const nextBookScale = THREE.MathUtils.damp(
        grimoireBookGroup.scale.x,
        targetBookScale,
        3.2,
        dt,
      );
      grimoireBookGroup.scale.setScalar(nextBookScale);
      grimoireBookGroup.rotation.x = THREE.MathUtils.damp(
        grimoireBookGroup.rotation.x,
        targetBookRotX,
        4.2,
        dt,
      );
      grimoireBookGroup.rotation.y = THREE.MathUtils.damp(
        grimoireBookGroup.rotation.y,
        targetBookRotY,
        4.2,
        dt,
      );

      // 7 Articulated turning pages flip rapidly across the spine and settle flush on the left stack
      flipPagePivots.forEach((pivot, idx) => {
        const pageStart = 1.35 + idx * 0.22;
        const pTurn = THREE.MathUtils.clamp((manifestElapsed - pageStart) / 0.36, 0, 1);
        const turnAngle = THREE.MathUtils.lerp(-0.46, -Math.PI + 0.46, pTurn);
        pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, turnAngle, 9.0, dt);
      });

      fiveLeafSealMat.opacity = THREE.MathUtils.damp(
        fiveLeafSealMat.opacity,
        targetFiveLeafOpacity,
        3.6,
        dt,
      );
      fiveLeafSealMat.emissiveIntensity =
        curPhase === 'grimoire_manifest' || curPhase === 'sword_emerge' ? 1.8 : 1.1;
      portalSealMat.opacity = THREE.MathUtils.damp(
        portalSealMat.opacity,
        targetPortalOpacity,
        3.8,
        dt,
      );
      portalSealMesh.rotation.z += dt * 0.65;

      // Sword emergence & kinematics
      const targetRuneGlow =
        curPhase === 'silence' || curPhase === 'grimoire_manifest'
          ? 0
          : curPhase === 'sword_emerge'
            ? 1.75
            : curPhase === 'angle_grimoire'
              ? 1.95
              : curPhase === 'slashing'
                ? 3.6
                : 1.55 + Math.sin(elapsed * 2.3) * 0.25;

      const targetGrimoireAlpha =
        curPhase === 'silence'
          ? 0
          : curPhase === 'grimoire_manifest'
            ? 0.28
            : curPhase === 'sword_emerge'
              ? 0.45
              : curPhase === 'angle_grimoire'
                ? 0.72
                : curPhase === 'slashing'
                  ? 0.12
                  : 0.44;

      const targetParticleAlpha =
        curPhase === 'silence' ? Math.min(0.45, Math.max(0, (elapsed - 0.6) * 0.5)) : 0.9;

      if (curPhase === 'silence' || curPhase === 'grimoire_manifest') {
        swordGroup.visible = false;
        swordGroup.position.set(0, -2.65, 0.12);
      } else if (curPhase !== 'slashing') {
        swordGroup.visible = true;
        const emergeElapsed =
          swordEmergeStartRef.current > 0 ? (nowMs - swordEmergeStartRef.current) / 1000 : 1.5;
        const orbitElapsed =
          angleGrimoireStartRef.current > 0 ? (nowMs - angleGrimoireStartRef.current) / 1000 : 1.5;

        const targetSwordY =
          curPhase === 'sword_emerge'
            ? THREE.MathUtils.lerp(-0.35, 0.42, THREE.MathUtils.clamp(emergeElapsed / 2.2, 0, 1))
            : curPhase === 'angle_grimoire'
              ? 0.48 + Math.sin(orbitElapsed * 1.6) * 0.14
              : 0.88;
        const targetSwordScale = curPhase === 'reveal' || curPhase === 'ready' ? 0.82 : 0.94;
        const targetRotY =
          curPhase === 'sword_emerge'
            ? -0.45 + THREE.MathUtils.clamp((emergeElapsed - 1.1) / 2.8, 0, 1) * Math.PI * 2
            : curPhase === 'angle_grimoire'
              ? 0.48 + Math.sin(orbitElapsed * 1.15) * 0.65
              : Math.sin(elapsed * 0.45) * 0.16;
        const targetRotZ =
          curPhase === 'angle_grimoire'
            ? Math.sin(orbitElapsed * 1.2) * 0.24
            : 0;
        const targetRotX =
          curPhase === 'sword_emerge'
            ? Math.sin(THREE.MathUtils.clamp(emergeElapsed / 3.8, 0, 1) * Math.PI) * 0.16
            : curPhase === 'angle_grimoire'
              ? 0.12
              : 0;

        swordGroup.position.x = THREE.MathUtils.damp(swordGroup.position.x, 0, 4.0, dt);
        swordGroup.position.y = THREE.MathUtils.damp(
          swordGroup.position.y,
          targetSwordY,
          curPhase === 'sword_emerge' ? 2.4 : 3.6,
          dt,
        );
        swordGroup.position.z = THREE.MathUtils.damp(swordGroup.position.z, 0, 3.6, dt);
        swordGroup.rotation.x = THREE.MathUtils.damp(swordGroup.rotation.x, targetRotX, 3.6, dt);
        swordGroup.rotation.y = THREE.MathUtils.damp(swordGroup.rotation.y, targetRotY, 3.8, dt);
        swordGroup.rotation.z = THREE.MathUtils.damp(swordGroup.rotation.z, targetRotZ, 3.6, dt);
        const nextScale = THREE.MathUtils.damp(swordGroup.scale.x, targetSwordScale, 3.4, dt);
        swordGroup.scale.setScalar(nextScale);
        grimoireGroup.position.y = THREE.MathUtils.damp(
          grimoireGroup.position.y,
          targetSwordY + 0.1,
          3.6,
          dt,
        );
      } else {
        // Charged anime wind-up (0.44s) -> full diagonal screen-crossing cleave (upper-right -> lower-left along -31deg!)
        swordGroup.visible = true;
        const slashElapsed = (nowMs - slashStartRef.current) / 1000;
        if (slashElapsed < 0.44) {
          const p = slashElapsed / 0.44;
          const easeIn = p * p;
          swordGroup.position.x = THREE.MathUtils.lerp(0, 4.45, easeIn);
          swordGroup.position.y = THREE.MathUtils.lerp(0.88, 2.75, easeIn);
          swordGroup.position.z = THREE.MathUtils.lerp(0, 2.45, easeIn);
          swordGroup.rotation.z = THREE.MathUtils.lerp(0, -0.58, easeIn);
          swordGroup.rotation.x = THREE.MathUtils.lerp(0, 0.22, easeIn);
          swordGroup.rotation.y = THREE.MathUtils.lerp(0, -0.28, easeIn);
          swordGroup.scale.setScalar(THREE.MathUtils.lerp(0.82, 1.26, easeIn));
          slashBeamMat.opacity = 0;
        } else {
          // Explosive diagonal cleave whipping from upper-right to lower-left with blade tip leading down-left along -31deg
          const p = Math.min(1, (slashElapsed - 0.44) / 0.56);
          const ease = 1 - Math.pow(1 - p, 2.5);
          swordGroup.position.x = THREE.MathUtils.lerp(4.65, -5.85, ease);
          swordGroup.position.y = THREE.MathUtils.lerp(2.8, -3.45, ease);
          swordGroup.position.z = THREE.MathUtils.lerp(2.45, 2.95, ease);
          swordGroup.rotation.z = THREE.MathUtils.lerp(-0.58, 2.1, ease);
          swordGroup.rotation.x = THREE.MathUtils.lerp(0.22, -0.24, ease);
          swordGroup.rotation.y = THREE.MathUtils.lerp(-0.28, 0.35, ease);
          swordGroup.scale.setScalar(1.34);

          slashArcMat.opacity = Math.sin(p * Math.PI) * 0.98;
          slashArc.rotation.z = THREE.MathUtils.lerp(-0.4, 1.35, ease);
          slashArc.scale.setScalar(1.0 + ease * 1.15);

          slashBeamMat.opacity = p < 0.78 ? Math.sin((p / 0.78) * Math.PI) * 0.96 : 0;
          slashBeam3D.scale.x = 0.25 + ease * 1.15;
        }
      }

      runeMat.emissiveIntensity = THREE.MathUtils.damp(
        runeMat.emissiveIntensity,
        targetRuneGlow,
        3.2,
        dt,
      );
      crimsonLight.intensity = THREE.MathUtils.damp(
        crimsonLight.intensity,
        curPhase === 'grimoire_manifest' ? 2.4 : targetRuneGlow * 1.5,
        3.2,
        dt,
      );
      outerCircleMat.opacity = THREE.MathUtils.damp(
        outerCircleMat.opacity,
        targetGrimoireAlpha,
        2.8,
        dt,
      );
      innerCircleMat.opacity = THREE.MathUtils.damp(
        innerCircleMat.opacity,
        targetGrimoireAlpha * 0.85,
        2.8,
        dt,
      );
      pageMat.opacity = THREE.MathUtils.damp(
        pageMat.opacity,
        curPhase === 'grimoire_manifest' ? 0.65 : targetGrimoireAlpha * 1.2,
        2.6,
        dt,
      );
      particleMat.opacity = THREE.MathUtils.damp(particleMat.opacity, targetParticleAlpha, 2.5, dt);

      outerCircle.rotation.z += dt * 0.1;
      innerCircle.rotation.z -= dt * 0.18;

      for (const spec of pageSpecs) {
        spec.angle += dt * spec.speed;
        spec.mesh.position.x = Math.cos(spec.angle) * spec.radius;
        spec.mesh.position.z = Math.sin(spec.angle) * spec.radius * 0.45 - 0.4;
        spec.mesh.position.y = spec.y + Math.sin(elapsed * 1.3 + spec.angle) * 0.12;
        spec.mesh.rotation.x = 0.26;
        spec.mesh.rotation.y = -spec.angle + Math.PI / 2;
        spec.mesh.rotation.z = 0.16;
      }

      // Particle kinematics
      const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      if (curPhase === 'slashing') {
        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3;
          arr[ix] += (arr[ix] * 1.8 - 1.5) * pDt;
          arr[ix + 1] += (arr[ix + 1] * 1.6 - 0.8) * pDt;
          arr[ix + 2] += 3.2 * pDt;
        }
        const slashElapsed = slashStartRef.current > 0 ? (nowMs - slashStartRef.current) / 1000 : 0;
        if (slashElapsed >= 0.44) {
          const fireLife = slashElapsed - 0.44;
          slashFlameMat.opacity = Math.max(0, Math.min(0.95, 1.05 - fireLife * 0.85));
          const fAttr = slashFlameGeo.getAttribute('position') as THREE.BufferAttribute;
          const fArr = fAttr.array as Float32Array;
          for (let i = 0; i < slashFlameCount; i++) {
            const ix = i * 3;
            fArr[ix] += slashFlameVel[ix] * pDt;
            fArr[ix + 1] += slashFlameVel[ix + 1] * pDt;
            fArr[ix + 2] += slashFlameVel[ix + 2] * pDt;
          }
          fAttr.needsUpdate = true;
        }
      } else {
        slashFlameMat.opacity = 0;
        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3;
          arr[ix] += velocities[ix] * pDt;
          arr[ix + 1] += velocities[ix + 1] * pDt;
          arr[ix + 2] += velocities[ix + 2] * pDt;
          if (arr[ix + 1] > 4.2) {
            arr[ix] = (Math.random() - 0.5) * 8.5;
            arr[ix + 1] = -4.2;
            arr[ix + 2] = (Math.random() - 0.5) * 5.0;
          }
        }
      }
      posAttr.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);

      coverTex.dispose();
      grimoireSpineGeo.dispose();
      grimoireSpineMat.dispose();
      spineBandGeo.dispose();
      grimoireCoverGeo.dispose();
      grimoireCoverMat.dispose();
      pageScriptTex.dispose();
      grimoirePagesGeo.dispose();
      grimoirePagesMat.dispose();
      flipPageGeo.dispose();
      flipPageMat.dispose();
      claspGeo.dispose();
      cornerGeo.dispose();
      claspMat.dispose();
      fiveLeafTex.dispose();
      fiveLeafSealGeo.dispose();
      fiveLeafSealMat.dispose();
      portalSealGeo.dispose();
      portalSealMat.dispose();

      bladeGeo.dispose();
      bladeMat.dispose();
      spineGeo.dispose();
      spineMat.dispose();
      runeTexture.dispose();
      runeGeo.dispose();
      runeMat.dispose();
      guardGeo.dispose();
      guardMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      gripGeo.dispose();
      gripMat.dispose();
      pommelGeo.dispose();
      pommelMat.dispose();
      slashArcGeo.dispose();
      slashArcMat.dispose();
      slashBeamGeo.dispose();
      slashBeamMat.dispose();
      grimoireTexture.dispose();
      outerCircleGeo.dispose();
      outerCircleMat.dispose();
      innerCircleGeo.dispose();
      innerCircleMat.dispose();
      pageGeo.dispose();
      pageMat.dispose();
      particleTexture.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      slashFlameGeo.dispose();
      slashFlameMat.dispose();
      envTarget?.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  const handleChooseSoundAtStart = async (withSound: boolean) => {
    const elapsedSec = (performance.now() - startTimeRef.current) / 1000;
    onSoundPrefChange(withSound);
    if (withSound) {
      soundChosenRef.current = 'sound';
      setSoundChosen('sound');
      const ok = await soundEngine.enable();
      if (ok && phaseRef.current !== 'slashing') {
        soundEngine.playAwakeningSequence(elapsedSec);
      }
    } else {
      soundChosenRef.current = 'silent';
      setSoundChosen('silent');
      soundEngine.disable();
    }
  };

  const triggerSlashTransformation = async (withSound: boolean) => {
    if (phaseRef.current === 'slashing') return;
    // Cancel pending intro choreography timers so REVEAL/READY can never override SLASHING
    for (const id of phaseTimersRef.current) {
      window.clearTimeout(id);
    }
    phaseTimersRef.current = [];
    slashStartRef.current = performance.now();
    setPhaseBoth('slashing');

    onSoundPrefChange(withSound);
    if (withSound) {
      setSoundChosen('sound');
      soundChosenRef.current = 'sound';
      const ok = await soundEngine.enable();
      if (ok) soundEngine.playSwordSlashTransition();
    } else {
      setSoundChosen('silent');
      soundChosenRef.current = 'silent';
      soundEngine.disable();
    }

    // Stage 1 (+440ms): Animated diagonal blade streak rockets across entire screen (synced with camera shake & true steel slash SFX)
    const tCleave = window.setTimeout(() => {
      setSlashCleaveActive(true);
    }, 440);

    // Stage 2 (+1380ms): Split diagonal dark curtains shear and part before fading in main app
    const tPart = window.setTimeout(() => {
      setSlashParting(true);
    }, 1380);

    // Stage 3 (+2080ms): Trigger main interface fade-in while AwakeningScene crossfades out
    const tDone = window.setTimeout(() => {
      onComplete();
    }, 2080);

    slashTimersRef.current.push(tCleave, tPart, tDone);
  };

  const showStageCaption =
    phase === 'grimoire_manifest' || phase === 'sword_emerge' || phase === 'angle_grimoire';
  const showReveal = phase === 'reveal' || phase === 'ready';
  const showEntryControls = phase === 'ready';

  const stageCaption =
    phase === 'grimoire_manifest'
      ? 'THE FIVE-LEAF GRIMOIRE UNFOLDS'
      : phase === 'sword_emerge'
        ? 'THE BLACK BLADE UNLEASHES'
        : 'AN ANCIENT POWER AWAKENS';

  return (
    <div
      data-phase={phase}
      className="relative h-screen w-screen overflow-hidden bg-[#050505] select-none"
    >
      {/* Dedicated WebGL Mount Container */}
      {!webglFailed ? (
        <div ref={mountRef} data-testid="awakening-canvas" className="absolute inset-0 z-0" />
      ) : (
        <div
          data-testid="awakening-fallback"
          className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
        >
          <img
            src={SANCTUM_FALLBACK_IMG}
            alt="Obsidian Sanctum"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-black/40 to-[#050505]" />
          <div className="animate-grimoire-slow absolute h-[420px] w-[420px] rounded-full border border-[#FF263F]/30" />
        </div>
      )}

      {/* Subtle Vignette Scrim */}
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-radial from-transparent via-[#050505]/30 to-[#050505]/90"
        aria-hidden="true"
      />

      {/* Full Screen-Crossing Diagonal Razor Slash & Split-Veil Animation into the Website */}
      {slashCleaveActive && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
          {/* Upper-left and lower-right diagonal parted dark veils that shear along the slash line */}
          <div
            style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
            className={`absolute inset-0 bg-[#050505]/80 transition-all duration-500 ease-out ${
              slashParting ? '-translate-x-16 -translate-y-12 opacity-0' : '-translate-x-1 -translate-y-0.5 opacity-100'
            }`}
          />
          <div
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
            className={`absolute inset-0 bg-[#050505]/80 transition-all duration-500 ease-out ${
              slashParting ? 'translate-x-16 translate-y-12 opacity-0' : 'translate-x-1 translate-y-0.5 opacity-100'
            }`}
          />

          {/* Crimson-amber fire impact shock flash */}
          <div className="animate-kuro-slash-flash absolute inset-0 bg-radial from-[#ff6b1a]/45 via-[#FF263F]/25 to-transparent" />

          {/* Blazing crimson-amber fire trail enveloping the diagonal slash */}
          <div className="animate-kuro-slash-fire absolute left-1/2 top-1/2 h-11 w-[260vw] -translate-x-1/2 -translate-y-1/2 -rotate-[31deg] bg-gradient-to-r from-transparent via-[#ff5514]/85 to-transparent blur-md shadow-[0_0_54px_18px_rgba(255,82,20,0.88)]" />

          {/* Sweeping white-hot razor blade streak cutting top-right -> bottom-left across the entire screen */}
          <div className="animate-kuro-slash-cross absolute left-1/2 top-1/2 h-3.5 w-[260vw] -translate-x-1/2 -translate-y-1/2 -rotate-[31deg] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_64px_20px_rgba(255,38,63,0.98)]" />

          {/* Lingering crimson-orange dimensional scar along the exact diagonal cut */}
          <div className="animate-kuro-slash-scar absolute left-1/2 top-1/2 h-1.5 w-[240vw] bg-gradient-to-r from-transparent via-[#ff7b29] to-transparent shadow-[0_0_32px_10px_rgba(255,58,28,0.88)]" />

          {/* Scattered fiery ember sparks bursting off the diagonal cleave */}
          <div className="animate-kuro-slash-spark absolute left-[74%] top-[24%] h-2.5 w-2.5 rounded-full bg-[#ffd27d] shadow-[0_0_16px_6px_rgba(255,95,25,0.95)]" />
          <div className="animate-kuro-slash-spark absolute left-[62%] top-[34%] h-2 w-2 rounded-full bg-[#ff7a24] shadow-[0_0_14px_5px_rgba(255,55,20,0.95)] delay-75" />
          <div className="animate-kuro-slash-spark absolute left-[52%] top-[46%] h-3 w-3 rounded-full bg-[#ffe19c] shadow-[0_0_18px_6px_rgba(255,105,28,0.98)] delay-100" />
          <div className="animate-kuro-slash-spark absolute left-[41%] top-[56%] h-2.5 w-2.5 rounded-full bg-[#ff5e1a] shadow-[0_0_16px_5px_rgba(255,48,24,0.95)] delay-150" />
          <div className="animate-kuro-slash-spark absolute left-[28%] top-[69%] h-2 w-2 rounded-full bg-[#ffd27d] shadow-[0_0_14px_5px_rgba(255,92,24,0.95)] delay-200" />
        </div>
      )}

      {/* Top Sound & Skip Bar (hidden during final cleave slash) */}
      {phase !== 'slashing' && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-silent-action={soundChosen === 'sound' ? 'true' : undefined}
              onClick={() => handleChooseSoundAtStart(soundChosen !== 'sound')}
              aria-label={soundChosen === 'sound' ? 'Mute cinematic audio' : 'Enable cinematic audio'}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0b0b0e]/90 px-3.5 py-2 text-xs font-medium tracking-wider text-[#C9C9D1] transition-colors hover:border-[#FF263F]/50 hover:text-white whitespace-nowrap shrink-0"
            >
              {soundChosen === 'sound' ? (
                <Volume2 className="h-3.5 w-3.5 text-[#FF263F]" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-[#777780]" />
              )}
              <span>{soundChosen === 'sound' ? 'Sound On' : 'Sound Off'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => triggerSlashTransformation(soundChosen !== 'silent')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0b0b0e]/85 px-3.5 py-2 text-xs font-medium tracking-wider text-[#9c9ca6] transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
          >
            <span>Skip Intro</span>
            <FastForward className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Gradient Scrim for Typography Legibility */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent"
        aria-hidden="true"
      />

      {/* Initial Sound Preference Choice (available right from Scene 1) */}
      {soundChosen === 'pending' && phase !== 'ready' && phase !== 'slashing' && (
        <div className="absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2.5 px-4 text-center">
          <p className="text-[11px] tracking-[0.22em] text-[#9c9ca6] uppercase">
            Audio Experience
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleChooseSoundAtStart(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#A40019] bg-[#A40019]/30 px-5 py-2 text-xs font-semibold tracking-widest text-white uppercase transition-all hover:bg-[#A40019]/50 hover:shadow-[0_0_24px_rgba(255,38,63,0.35)] whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-4 w-4 text-[#FF263F]" />
              <span>Continue with Sound</span>
            </button>
            <button
              type="button"
              data-silent-action="true"
              onClick={() => handleChooseSoundAtStart(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#111115]/95 px-5 py-2 text-xs font-semibold tracking-widest text-[#C9C9D1] uppercase transition-colors hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
            >
              <VolumeX className="h-4 w-4 text-[#777780]" />
              <span>Continue Silently</span>
            </button>
          </div>
        </div>
      )}

      {/* Center Stage Typography Overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-end pb-28 sm:pb-24 px-6 text-center">
        {showStageCaption && (
          <p className="mb-10 font-display text-sm sm:text-base tracking-[0.34em] text-[#FF263F] uppercase">
            {stageCaption}
          </p>
        )}

        {showReveal && (
          <div className="flex max-w-2xl flex-col items-center">
            <h1
              ref={titleRef}
              className="font-display text-4xl sm:text-6xl font-bold tracking-[0.3em] sm:tracking-[0.42em] pl-[0.3em]"
            >
              {'KUROGANE'.split('').map((ch, idx) => (
                <span key={idx} className="kuro-letter kurogane-forged-text inline-block">
                  {ch}
                </span>
              ))}
            </h1>
            <div ref={subtitleRef} className="mt-3.5 space-y-1.5">
              <p className="font-display text-xs sm:text-sm tracking-[0.28em] text-[#e5e5ed] uppercase">
                THE BLACK BLADE HAS AWAKENED.
              </p>
              <p className="text-sm text-[#9a9aa6]">
                An intelligence beyond the ordinary.
              </p>
            </div>
          </div>
        )}

        {/* Final Entry Controls */}
        {showEntryControls && (
          <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => triggerSlashTransformation(true)}
              className="rounded-lg border border-[#FF263F]/75 bg-[#A40019] px-7 py-3 font-display text-xs sm:text-sm font-semibold tracking-[0.2em] text-white uppercase shadow-[0_0_28px_rgba(164,0,25,0.55)] transition-all hover:bg-[#c0001e] hover:shadow-[0_0_36px_rgba(255,38,63,0.65)] whitespace-nowrap shrink-0"
            >
              AWAKEN KUROGANE
            </button>
            <button
              type="button"
              data-silent-action="true"
              onClick={() => triggerSlashTransformation(false)}
              className="rounded-lg border border-white/20 bg-[#111115]/95 px-6 py-3 font-display text-xs sm:text-sm font-semibold tracking-[0.2em] text-[#C9C9D1] uppercase transition-colors hover:border-white/45 hover:text-white whitespace-nowrap shrink-0"
            >
              ENTER SILENTLY
            </button>
          </div>
        )}

        {phase === 'slashing' && (
          <p className="font-display text-sm tracking-[0.34em] text-white uppercase">
            CLEAVING THE VEIL
          </p>
        )}
      </div>
    </div>
  );
};
