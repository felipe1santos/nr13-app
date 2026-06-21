import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface Props {
  tipo: string;
  subtipo: string;
  diametro: number;
  altura: number;
  onCaptura: (base64: string) => void;
}

const W = 480;
const H = 560;

// ── 2D helpers ────────────────────────────────────────────────────────────────

function toScreen(vec: THREE.Vector3, camera: THREE.Camera): [number, number] {
  const v = vec.clone().project(camera);
  return [(v.x + 1) / 2 * W, (-v.y + 1) / 2 * H];
}

function setaCanvas(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, tam = 7) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - tam * Math.cos(ang - 0.42), y2 - tam * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - tam * Math.cos(ang + 0.42), y2 - tam * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
}

function cotaV(ctx: CanvasRenderingContext2D, pt1: [number, number], pt2: [number, number], texto: string, offset: number) {
  const x = Math.min(pt1[0], pt2[0]) - offset;
  const y1 = pt1[1], y2 = pt2[1];
  ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  setaCanvas(ctx, x, y2, x, y1); setaCanvas(ctx, x, y1, x, y2);
  ctx.setLineDash([4, 3]); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(Math.min(pt1[0], pt2[0]) - 4, y1); ctx.lineTo(x + 2, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Math.min(pt1[0], pt2[0]) - 4, y2); ctx.lineTo(x + 2, y2); ctx.stroke();
  ctx.setLineDash([]);
  const midY = (y1 + y2) / 2;
  ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(texto).width;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - tw / 2 - 3, midY - 8, tw + 6, 16);
  ctx.fillStyle = '#1a1a1a'; ctx.fillText(texto, x, midY);
}

function cotaH(ctx: CanvasRenderingContext2D, pt1: [number, number], pt2: [number, number], texto: string, offset: number) {
  const y = Math.max(pt1[1], pt2[1]) + offset;
  const x1 = pt1[0], x2 = pt2[0];
  ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  setaCanvas(ctx, x2, y, x1, y); setaCanvas(ctx, x1, y, x2, y);
  ctx.setLineDash([4, 3]); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x1, Math.max(pt1[1], pt2[1]) + 4); ctx.lineTo(x1, y - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, Math.max(pt1[1], pt2[1]) + 4); ctx.lineTo(x2, y - 2); ctx.stroke();
  ctx.setLineDash([]);
  const midX = (x1 + x2) / 2;
  ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(texto).width;
  ctx.fillStyle = '#fff'; ctx.fillRect(midX - tw / 2 - 3, y - 8, tw + 6, 16);
  ctx.fillStyle = '#1a1a1a'; ctx.fillText(texto, midX, y);
}

// ── Scene helpers ─────────────────────────────────────────────────────────────

function criarCena() {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas: off, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setSize(W, H); renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  return { renderer, scene };
}

function criarCamera(px: number, py: number, pz: number, fov = 30): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100);
  cam.position.set(px, py, pz);
  cam.lookAt(0, 0, 0);
  return cam;
}

function luzesCena(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const front = new THREE.DirectionalLight(0xffffff, 0.65);
  front.position.set(3, 1.5, 3); scene.add(front);
  const top = new THREE.DirectionalLight(0xffffff, 0.4);
  top.position.set(0, 8, 2); scene.add(top);
  const fill = new THREE.DirectionalLight(0xffffff, 0.15);
  fill.position.set(-4, -2, -4); scene.add(fill);
}

function compositar(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): CanvasRenderingContext2D {
  renderer.render(scene, camera);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(renderer.domElement, 0, 0);
  return ctx;
}

function mat(color: number, shininess = 60) {
  return new THREE.MeshPhongMaterial({ color, shininess });
}

// ── Render: Vaso de Pressão (vertical, tampos elipsoidais) ───────────────────

function renderVaso(canvas: HTMLCanvasElement, diametro: number, altura: number) {
  const D = diametro > 0 ? diametro : 1000;
  const H3 = altura > 0 ? altura : 1500;
  const R = 0.5;
  const Hb = H3 / D;
  const capS = 0.45;
  const capH = R * capS;

  const { renderer, scene } = criarCena();
  const camera = criarCamera(2.8, 0.8, 2.8);
  luzesCena(scene);

  const steelMat = mat(0x7090b0, 80);
  const capMat = mat(0x4a6a8a, 80);

  scene.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hb, 64, 1, true), steelMat));

  const topCap = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  topCap.scale.set(1, capS, 1); topCap.position.y = Hb / 2; scene.add(topCap);

  const botCap = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  botCap.scale.set(1, -capS, 1); botCap.position.y = -Hb / 2; scene.add(botCap);

  const topD = new THREE.Mesh(new THREE.CircleGeometry(R, 64), capMat);
  topD.rotation.x = -Math.PI / 2; topD.position.y = Hb / 2; scene.add(topD);
  const botD = new THREE.Mesh(new THREE.CircleGeometry(R, 64), capMat);
  botD.rotation.x = Math.PI / 2; botD.position.y = -Hb / 2; scene.add(botD);

  const ctx = compositar(canvas, renderer, scene, camera);

  const ang = Math.atan2(2.8, 2.8) + Math.PI / 2;
  const lx = R * Math.cos(ang), lz = R * Math.sin(ang);
  const rx = -lx, rz = -lz;
  const totalH = Hb / 2 + capH;

  cotaV(ctx, toScreen(new THREE.Vector3(lx, totalH, lz), camera), toScreen(new THREE.Vector3(lx, -totalH, lz), camera), `H = ${H3} mm`, 44);
  cotaH(ctx, toScreen(new THREE.Vector3(lx, -totalH, lz), camera), toScreen(new THREE.Vector3(rx, -totalH, rz), camera), `Ø ${D} mm`, 38);

  renderer.dispose();
}

// ── Render: Autoclave Cilíndrica (tampa parafusada no topo) ──────────────────

function renderAutoClaveVertical(canvas: HTMLCanvasElement, diametro: number, altura: number) {
  const D = diametro > 0 ? diametro : 600;
  const H3 = altura > 0 ? altura : 900;
  const R = 0.5;
  const Hb = H3 / D;

  const { renderer, scene } = criarCena();
  const camera = criarCamera(2.4, 1.6, 2.4, 28);
  luzesCena(scene);

  // Body (stainless steel)
  scene.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hb, 64, 1, true), mat(0xb8c4cc, 60)));

  // Bottom: shallow ellipsoidal cap
  const botCap = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa8b4bc, 60));
  botCap.scale.set(1, -0.28, 1); botCap.position.y = -Hb / 2; scene.add(botCap);
  const botD = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat(0xa8b4bc, 60));
  botD.rotation.x = Math.PI / 2; botD.position.y = -Hb / 2; scene.add(botD);

  // Flange ring at top of body
  scene.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.045, 12, 64), mat(0x999999, 40)), { position: new THREE.Vector3(0, Hb / 2, 0) }));

  // Lid (flat cylinder, brass/gold)
  const lidH = 0.07;
  const lidR = R + 0.06;
  scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(lidR, lidR, lidH, 64), mat(0xc8922a, 90)), { position: new THREE.Vector3(0, Hb / 2 + lidH / 2, 0) }));
  const lidTop = new THREE.Mesh(new THREE.CircleGeometry(lidR, 64), mat(0xc8922a, 90));
  lidTop.rotation.x = -Math.PI / 2; lidTop.position.y = Hb / 2 + lidH; scene.add(lidTop);

  // Bolts (10 studs around lid perimeter)
  const boltR = lidR + 0.06;
  const boltH = 0.13;
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, boltH, 8), mat(0x777777, 50));
    bolt.position.set(boltR * Math.cos(ang), Hb / 2 + boltH / 2, boltR * Math.sin(ang));
    scene.add(bolt);
  }

  // Pressure gauge pipe + head
  const gaugeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 12), mat(0x888888, 50));
  gaugeBase.position.set(0.12, Hb / 2 + lidH + 0.09, 0.12); scene.add(gaugeBase);
  const gaugeHead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), mat(0x222222, 80));
  gaugeHead.position.set(0.12, Hb / 2 + lidH + 0.2, 0.12); scene.add(gaugeHead);

  // Safety valve on lid
  const svPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10), mat(0xaa3333, 60));
  svPipe.position.set(-0.15, Hb / 2 + lidH + 0.07, 0); scene.add(svPipe);
  const svHead = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), mat(0xaa3333, 60));
  svHead.position.set(-0.15, Hb / 2 + lidH + 0.17, 0); scene.add(svHead);

  const ctx = compositar(canvas, renderer, scene, camera);

  const angCam = Math.atan2(2.4, 2.4) + Math.PI / 2;
  const lx = R * Math.cos(angCam), lz = R * Math.sin(angCam);
  const rx = -lx, rz = -lz;
  const topY = Hb / 2 + lidH + 0.04;
  const botY = -(Hb / 2 + 0.02);

  cotaV(ctx, toScreen(new THREE.Vector3(lx, topY, lz), camera), toScreen(new THREE.Vector3(lx, botY, lz), camera), `B = ${H3} mm`, 52);
  cotaH(ctx, toScreen(new THREE.Vector3(lx, botY, lz), camera), toScreen(new THREE.Vector3(rx, botY, rz), camera), `A = ${D} mm`, 40);

  renderer.dispose();
}

// ── Render: Autoclave Retangular ─────────────────────────────────────────────

function renderAutoClaveRetangular(canvas: HTMLCanvasElement, largura: number, altura: number) {
  const W3 = largura > 0 ? largura : 600;
  const H3 = altura > 0 ? altura : 500;
  const Wn = 1.0;
  const Hn = H3 / W3;
  const Dn = Wn * 1.3;

  const { renderer, scene } = criarCena();
  const camera = criarCamera(2.8, 1.4, 2.8, 30);
  luzesCena(scene);

  // Main chamber
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(Wn, Hn, Dn), mat(0x7a8fa0, 40)));

  // Front door (slightly protruding on +Z face)
  const doorW = Wn * 0.72, doorH = Hn * 0.82;
  scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.045), mat(0x5a7090, 60)), { position: new THREE.Vector3(0, 0, Dn / 2 + 0.02) }));

  // Door frame (thin border around door)
  for (const [dx, dy, dw, dh] of [
    [0, doorH / 2 + 0.012, doorW + 0.06, 0.024] as const,
    [0, -doorH / 2 - 0.012, doorW + 0.06, 0.024] as const,
    [-doorW / 2 - 0.012, 0, 0.024, doorH + 0.06] as const,
    [doorW / 2 + 0.012, 0, 0.024, doorH + 0.06] as const,
  ]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.02), mat(0x8899aa, 50));
    frame.position.set(dx, dy, Dn / 2 + 0.045); scene.add(frame);
  }

  // Handle bar
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, doorW * 0.38, 12), mat(0x333344, 90));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(doorW * 0.28, 0, Dn / 2 + 0.085); scene.add(handle);

  // Hinge cylinders on left side of door
  for (const hy of [-doorH * 0.3, doorH * 0.3]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 10), mat(0x888899, 60));
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(-doorW / 2 - 0.01, hy, Dn / 2 + 0.065); scene.add(hinge);
  }

  // 4 legs
  const legH = Hn * 0.14;
  for (const [px, pz] of [[-Wn * 0.38, -Dn * 0.38], [Wn * 0.38, -Dn * 0.38], [-Wn * 0.38, Dn * 0.38], [Wn * 0.38, Dn * 0.38]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, legH, 0.05), mat(0x445566, 20));
    leg.position.set(px, -Hn / 2 - legH / 2, pz); scene.add(leg);
  }

  // Control panel on right side
  const panel = new THREE.Mesh(new THREE.BoxGeometry(Wn * 0.25, Hn * 0.45, 0.03), mat(0x334455, 30));
  panel.position.set(Wn * 0.38, -Hn * 0.12, Dn / 2 + 0.015); scene.add(panel);

  const ctx = compositar(canvas, renderer, scene, camera);

  const botFrontL = toScreen(new THREE.Vector3(-Wn / 2, -Hn / 2, Dn / 2), camera);
  const botFrontR = toScreen(new THREE.Vector3(Wn / 2, -Hn / 2, Dn / 2), camera);
  const topBL = toScreen(new THREE.Vector3(-Wn / 2, Hn / 2, -Dn / 2), camera);
  const botBL = toScreen(new THREE.Vector3(-Wn / 2, -Hn / 2, -Dn / 2), camera);

  cotaH(ctx, botFrontL, botFrontR, `L = ${W3} mm`, 40);
  cotaV(ctx, topBL, botBL, `H = ${H3} mm`, 48);

  renderer.dispose();
}

// ── Render: Caldeira Flamotubular (horizontal) ────────────────────────────────

function renderCaldeiraFlamotubular(canvas: HTMLCanvasElement, diametro: number, comprimento: number) {
  const D = diametro > 0 ? diametro : 1200;
  const L = comprimento > 0 ? comprimento : 3000;
  const R = 0.5;
  const Ln = L / D;

  const { renderer, scene } = criarCena();
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  cam.position.set(Ln * 0.45 + 1.0, 1.6, Ln * 0.5 + 1.8);
  cam.lookAt(0, 0, 0);
  luzesCena(scene);

  const shellMat = mat(0x8899aa, 60);
  const capMat = mat(0x667788, 60);
  const legMat = mat(0x445566, 20);

  // Horizontal shell (Y → X via rotation.z = π/2)
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Ln, 64, 1, true), shellMat);
  shell.rotation.z = Math.PI / 2; scene.add(shell);

  // Left cap (ellipsoidal, dome faces -X)
  const leftCap = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  leftCap.scale.set(1, 0.38, 1);
  leftCap.rotation.z = -Math.PI / 2;
  leftCap.position.x = -Ln / 2; scene.add(leftCap);
  const leftD = new THREE.Mesh(new THREE.CircleGeometry(R, 64), capMat);
  leftD.rotation.y = -Math.PI / 2; leftD.position.x = -Ln / 2; scene.add(leftD);

  // Right cap (dome faces +X)
  const rightCap = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  rightCap.scale.set(1, 0.38, 1);
  rightCap.rotation.z = Math.PI / 2;
  rightCap.position.x = Ln / 2; scene.add(rightCap);
  const rightD = new THREE.Mesh(new THREE.CircleGeometry(R, 64), capMat);
  rightD.rotation.y = Math.PI / 2; rightD.position.x = Ln / 2; scene.add(rightD);

  // Burner nozzle at right end (darker cylinder)
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 32), mat(0x334455, 80));
  burner.rotation.z = Math.PI / 2; burner.position.x = Ln / 2 + 0.22; scene.add(burner);

  // Two saddle supports along length
  for (const lx of [-Ln * 0.28, Ln * 0.28]) {
    for (const lz of [-R * 0.6, R * 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), legMat);
      leg.position.set(lx, -R - 0.28, lz); scene.add(leg);
    }
    // Saddle crossbar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, R * 1.4), legMat);
    bar.position.set(lx, -R - 0.02, 0); scene.add(bar);
  }

  // Steam outlet pipe on top
  const steamPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 16), mat(0x667788, 50));
  steamPipe.position.set(0, R + 0.15, 0); scene.add(steamPipe);
  scene.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16), mat(0x556677, 40)), { position: new THREE.Vector3(0, R + 0.3, 0) }));

  renderer.render(scene, cam);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(renderer.domElement, 0, 0);

  // Dimension lines
  cotaH(ctx, toScreen(new THREE.Vector3(-Ln / 2, -R, 0), cam), toScreen(new THREE.Vector3(Ln / 2, -R, 0), cam), `L = ${L} mm`, 44);
  cotaV(ctx, toScreen(new THREE.Vector3(-Ln / 2, R, 0), cam), toScreen(new THREE.Vector3(-Ln / 2, -R, 0), cam), `Ø ${D} mm`, 50);

  renderer.dispose();
}

// ── Render: Caldeira Aquatubular (2 tubulões + feixe de tubos) ───────────────

function renderCaldeiraAquatubular(canvas: HTMLCanvasElement, diametro: number, altura: number) {
  const D = diametro > 0 ? diametro : 600;
  const H3 = altura > 0 ? altura : 1800;
  const R = 0.5;
  const drumL = 1.6;
  const Hn = (H3 / D) * (R * 2);

  const { renderer, scene } = criarCena();
  const camera = criarCamera(2.8, 0.6, 3.2, 28);
  luzesCena(scene);

  function addHDrum(yPos: number, radius: number, length: number, color: number) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 48, 1, true), mat(color, 60));
    cyl.rotation.z = Math.PI / 2; cyl.position.y = yPos; scene.add(cyl);
    for (const side of [-1, 1] as const) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat(color - 0x111111, 60));
      c.scale.set(1, 0.32, 1);
      c.rotation.z = side === -1 ? -Math.PI / 2 : Math.PI / 2;
      c.position.set(side * length / 2, yPos, 0); scene.add(c);
      const d = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat(color - 0x111111, 60));
      d.rotation.y = side === -1 ? -Math.PI / 2 : Math.PI / 2;
      d.position.set(side * length / 2, yPos, 0); scene.add(d);
    }
  }

  addHDrum(Hn / 2, R, drumL, 0x7a8fa0);          // steam drum (top)
  addHDrum(-Hn / 2, R * 0.65, drumL, 0x6a7f90);  // mud drum (bottom, smaller)

  // Tube bank between drums
  const tubeH = Hn - R - R * 0.65 - 0.04;
  const cols = 6;
  for (let c = 0; c < cols; c++) {
    const tx = (c - (cols - 1) / 2) * (drumL / (cols + 1));
    for (const tz of [-0.18, 0, 0.18]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, tubeH, 10), mat(0x556677, 40));
      tube.position.set(tx, 0, tz); scene.add(tube);
    }
  }

  // Support frame
  for (const side of [-1, 1] as const) {
    for (const fz of [-0.45, 0.45]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, Hn + R * 2.2, 0.05), mat(0x445566, 20));
      col.position.set(side * (drumL / 2 + 0.12), 0, fz); scene.add(col);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.0), mat(0x445566, 20));
    base.position.set(side * (drumL / 2 + 0.12), -Hn / 2 - R * 0.65 - 0.05, 0); scene.add(base);
  }

  // Steam pipe on top
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 14), mat(0x667788, 50));
  sp.position.set(0, Hn / 2 + R + 0.14, 0); scene.add(sp);

  const ctx = compositar(canvas, renderer, scene, camera);

  const angCam = Math.atan2(2.8, 3.2) + Math.PI / 2;
  const lx = R * Math.cos(angCam), lz = R * Math.sin(angCam);
  const rx = -lx, rz = -lz;

  cotaV(ctx,
    toScreen(new THREE.Vector3(lx, Hn / 2 + R, lz), camera),
    toScreen(new THREE.Vector3(lx, -Hn / 2 - R * 0.65, lz), camera),
    `H = ${H3} mm`, 52,
  );
  cotaH(ctx,
    toScreen(new THREE.Vector3(lx, -Hn / 2 - R * 0.65, lz), camera),
    toScreen(new THREE.Vector3(rx, -Hn / 2 - R * 0.65, rz), camera),
    `Ø ${D} mm`, 40,
  );

  renderer.dispose();
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

function renderEquipamento(canvas: HTMLCanvasElement, tipo: string, subtipo: string, diametro: number, altura: number) {
  if (tipo === 'autoclave') {
    if (subtipo === 'retangular') return renderAutoClaveRetangular(canvas, diametro, altura);
    return renderAutoClaveVertical(canvas, diametro, altura);
  }
  if (tipo === 'caldeira') {
    if (subtipo === 'aquatubular') return renderCaldeiraAquatubular(canvas, diametro, altura);
    return renderCaldeiraFlamotubular(canvas, diametro, altura);
  }
  return renderVaso(canvas, diametro, altura);
}

function getLabelsCroqui(tipo: string, subtipo: string): { dim1: string; dim2: string } {
  if (tipo === 'caldeira' && subtipo !== 'aquatubular') return { dim1: 'Diâmetro (mm)', dim2: 'Comprimento (mm)' };
  if (tipo === 'autoclave' && subtipo === 'retangular') return { dim1: 'Largura (mm)', dim2: 'Altura (mm)' };
  if (tipo === 'autoclave') return { dim1: 'Diâmetro A (mm)', dim2: 'Altura B (mm)' };
  return { dim1: 'Diâmetro Interno (mm)', dim2: 'Altura do Corpo (mm)' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CroquiVaso3D({ tipo, subtipo, diametro, altura, onCaptura }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [d, setD] = useState(diametro || 1000);
  const [h, setH] = useState(altura || 1500);

  useEffect(() => {
    if (canvasRef.current) renderEquipamento(canvasRef.current, tipo, subtipo, d, h);
  }, [tipo, subtipo, d, h]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza dimensões do croqui com as props
    if (diametro > 0) setD(diametro);
    if (altura > 0) setH(altura);
  }, [diametro, altura]);

  function capturar() {
    if (!canvasRef.current) return;
    onCaptura(canvasRef.current.toDataURL('image/png'));
  }

  const labels = getLabelsCroqui(tipo, subtipo);

  return (
    <div className="croqui3d-wrapper">
      <div className="croqui3d-controles">
        <div className="croqui3d-campo">
          <label>{labels.dim1}</label>
          <input type="number" value={d} onChange={(e) => setD(Number(e.target.value))} />
        </div>
        <div className="croqui3d-campo">
          <label>{labels.dim2}</label>
          <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ border: '1px solid #ddd', borderRadius: 6, maxWidth: '100%', display: 'block', margin: '0 auto' }}
      />
      <button type="button" className="btn-primario" style={{ marginTop: 12 }} onClick={capturar}>
        ✓ Usar este Croqui no Prontuário
      </button>
    </div>
  );
}
