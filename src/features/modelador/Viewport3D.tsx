// Viewport 3D interativo do Modelador de Vaso (fase 2): orbit/zoom/pan (OrbitControls), modo
// translúcido (enxergar bocais/casco por dentro), cotas em 3D (Ø interno e comprimento total) e
// captura PNG (fundo branco) para uso no croqui do prontuário/relatório.
//
// Arquitetura: o renderer/cena/câmera/controles/loop de animação são criados UMA VEZ (persistem
// entre edições de campo). Um único `THREE.Group` (a malha do vaso) é descartado e recriado
// sempre que `modelo`/`translucido`/`mostrarCotas` mudam (dispose de geometrias/materiais do
// grupo antigo antes de adicionar o novo) — ver `src/features/prontuarios/CroquiVaso3D.tsx` para
// os padrões de cena/luzes/material que este componente porta para um contexto interativo
// (canvas ao vivo + requestAnimationFrame, não um canvas offscreen recompósito por frame).
//
// Convenção geométrica compartilhada com `croqui2dService.ts` (mesmo modelo, duas vistas):
// - Eixo do vaso = Y local (tampo1 na extremidade +Y, tampo2 na extremidade -Y); orientação
//   'horizontal' gira o GRUPO INTEIRO 90° em Z (eixo Y local → eixo X do mundo).
// - Raio de casco/tampos = D/2 (diâmetro interno; espessura do casco não altera a geometria 3D,
//   só entra nos cálculos de peso/folha de dados — mesma simplificação visual do brief).
// - Bocal em 'casco': `posicaoAxial` em mm a partir do início do cilindro (lado do tampo1),
//   crescendo em direção ao tampo2; `angulo` em graus com a MESMA fórmula do croqui2dService
//   (`rad = (angulo-90)·π/180`, 0°="topo"/referência, sentido horário); bocal aponta radialmente
//   para fora, na superfície do casco.
// - Bocal em 'tampo1'/'tampo2': NÃO depende de `posicaoAxial` (mesma regra do croqui2dService —
//   um bocal de tampo não tem posição ao longo do comprimento); fica a 0,8×raio do centro do
//   tampo, na direção do ângulo, apontando axialmente para fora do vaso.
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { comprimentoTotalMm, dimensoesTampo, num } from './geometriaVaso';
import type { BocalModelo, ModeloVaso, SuporteModelo, TampoModelo } from './tiposModelador';

interface Props {
  modelo: ModeloVaso;
  translucido: boolean;
  mostrarCotas: boolean;
  capturaRef: MutableRefObject<(() => string | null) | null>;
}

// Unidade da cena = metro; o modelo guarda tudo em mm.
const MM_POR_UNIDADE = 1000;
function mm(v: number): number {
  return v / MM_POR_UNIDADE;
}

const COR_ACO = 0x8a94a3;
const COR_FUNDO = '#f4f6f8';
const COR_COTA = 0x1a1a1a;
const ESPESSURA_PADRAO_MM = 6; // aproximação visual quando espessura (tampo/bocal) não foi informada

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function materialAco(translucido: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COR_ACO,
    metalness: 0.55,
    roughness: 0.45,
    transparent: translucido,
    opacity: translucido ? 0.45 : 1,
    side: translucido ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !translucido,
  });
}

// ─────────────────────────────────── Descarte (dispose) ───────────────────────────────────

// Sprite.geometry é um BufferGeometry ÚNICO compartilhado por TODOS os sprites do three.js
// (module-level singleton) — nunca descartar. Só o material (e o mapa/textura) do sprite é seu.
function descartarObjeto3D(objeto: THREE.Object3D): void {
  if (objeto instanceof THREE.Sprite) {
    objeto.material.map?.dispose();
    objeto.material.dispose();
    return;
  }
  const comGeometria = objeto as THREE.Object3D & { geometry?: THREE.BufferGeometry };
  comGeometria.geometry?.dispose();
  const comMaterial = objeto as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
  if (Array.isArray(comMaterial.material)) {
    comMaterial.material.forEach((m) => m.dispose());
  } else {
    comMaterial.material?.dispose();
  }
}

function descartarGrupo(raiz: THREE.Object3D): void {
  raiz.traverse(descartarObjeto3D);
}

// ─────────────────────────────────── Tampos ───────────────────────────────────

/**
 * Meia-esfera (SphereGeometry) escalada no eixo Y para simular a profundidade do tampo — mesma
 * técnica para elíptico e hemisférico. Para o toriesférico é uma APROXIMAÇÃO VISUAL: a forma real
 * (Klopper) é composta de coroa esférica + toro de canto; aqui reaproveitamos a mesma meia-esfera
 * escalada com a profundidade calculada (`dimensoesTampo`), suficiente para o viewport 3D — o
 * cálculo de espessura/PMTA de verdade continua em `geometriaVaso.ts`/memorial.
 */
function construirTampoDome(r: number, profundidade: number, sentido: 1 | -1, translucido: boolean): THREE.Mesh {
  const geometria = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const malha = new THREE.Mesh(geometria, materialAco(translucido));
  malha.scale.set(1, (sentido * profundidade) / r, 1);
  return malha;
}

function construirTampoPlano(r: number, translucido: boolean): THREE.Mesh {
  return new THREE.Mesh(new THREE.CircleGeometry(r, 32), materialAco(translucido));
}

/** Adiciona o tampo ao grupo do vaso; retorna a profundidade (unidade de cena) para o chamador
 * posicionar bocais/suporte/cotas em relação à ponta do tampo. */
function adicionarTampo(
  grupo: THREE.Group,
  tampo: TampoModelo,
  D: number,
  r: number,
  yBase: number,
  sentido: 1 | -1,
  translucido: boolean,
): number {
  const t = num(tampo.espessura) ?? ESPESSURA_PADRAO_MM;
  const { profundidade } = dimensoesTampo(tampo.tipo, D, t);
  const profundidadeCena = mm(profundidade);

  let malha: THREE.Mesh;
  if (tampo.tipo === 'plano') {
    malha = construirTampoPlano(r, translucido);
    malha.rotation.x = sentido > 0 ? -Math.PI / 2 : Math.PI / 2;
  } else {
    malha = construirTampoDome(r, profundidadeCena, sentido, translucido);
  }
  malha.position.y = yBase;
  grupo.add(malha);
  return profundidadeCena;
}

// ─────────────────────────────────── Bocais ───────────────────────────────────

interface ContextoBocal {
  rCasco: number; // raio do casco, unidade de cena (m)
  metadeComprimento: number; // L/2, unidade de cena (m)
  profundidade1: number; // profundidade do tampo1, unidade de cena (m)
  profundidade2: number; // profundidade do tampo2, unidade de cena (m)
}

function construirBocal(bocal: BocalModelo, ctx: ContextoBocal, translucido: boolean): THREE.Object3D | null {
  const d = num(bocal.diametro);
  const proj = num(bocal.projecao);
  if (d === null || d <= 0 || proj === null || proj <= 0) return null;

  const espessura = num(bocal.espessura);
  const rBocal = mm(d) / 2;
  const projCena = mm(proj);
  const espCena = espessura !== null && espessura > 0 ? mm(espessura) : mm(ESPESSURA_PADRAO_MM);

  const angulo = num(bocal.angulo) ?? 0;
  // Mesma convenção do croqui2dService: 0° = referência "topo", sentido horário.
  const rad = ((angulo - 90) * Math.PI) / 180;

  // Corpo local aponta ao longo de +X (base em x=0, ponta em x=projCena) + flange na ponta.
  // A reorientação para "radial" (bocal de casco) ou "axial" (bocal de tampo) acontece a seguir,
  // rotacionando o grupo `montagem` inteiro — geometria e posição viajam juntas.
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(rBocal, rBocal, projCena, 20, 1, true), materialAco(translucido));
  corpo.rotation.z = -Math.PI / 2;
  corpo.position.x = projCena / 2;
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(rBocal * 1.6, rBocal * 1.6, espCena, 20), materialAco(translucido));
  flange.rotation.z = -Math.PI / 2;
  flange.position.x = projCena + espCena / 2;

  const montagem = new THREE.Group();
  montagem.add(corpo, flange);

  if (bocal.local === 'casco') {
    const posAxial = num(bocal.posicaoAxial);
    if (posAxial === null) return null; // sem posição ao longo do casco não há onde desenhar (mesma regra do croqui2dService)
    // 0 = início do cilindro (lado do tampo1, y=+metadeComprimento), crescendo em direção ao tampo2.
    const yLocal = clamp(ctx.metadeComprimento - mm(Math.max(0, posAxial)), -ctx.metadeComprimento, ctx.metadeComprimento);
    montagem.position.set(ctx.rCasco, yLocal, 0);
  } else {
    const sentido = bocal.local === 'tampo1' ? 1 : -1;
    const profundidade = bocal.local === 'tampo1' ? ctx.profundidade1 : ctx.profundidade2;
    const yPolo = sentido * (ctx.metadeComprimento + profundidade);
    // Reorienta de "+X radial" para "±Y axial" (aponta para fora do tampo correspondente).
    montagem.rotation.z = sentido > 0 ? Math.PI / 2 : -Math.PI / 2;
    montagem.position.set(ctx.rCasco * 0.8, yPolo, 0);
  }

  const pivot = new THREE.Group();
  pivot.rotation.y = rad;
  pivot.add(montagem);
  return pivot;
}

// ─────────────────────────────────── Suporte ───────────────────────────────────

function construirSuporte(
  suporte: SuporteModelo,
  rCasco: number,
  metadeComprimento: number,
  profundidade2: number,
  translucido: boolean,
): THREE.Group | null {
  if (suporte.tipo === 'nenhum') return null;
  const altura = num(suporte.altura);
  if (altura === null || altura <= 0) return null;
  const alturaCena = mm(altura);
  const grupo = new THREE.Group();

  if (suporte.tipo === 'saia') {
    // Cilindro aberto abaixo do tampo inferior (tampo2), com a altura do suporte.
    const yTopo = -(metadeComprimento + profundidade2);
    const saia = new THREE.Mesh(new THREE.CylinderGeometry(rCasco * 0.95, rCasco * 0.95, alturaCena, 32, 1, true), materialAco(translucido));
    saia.position.y = yTopo - alturaCena / 2;
    grupo.add(saia);
  } else if (suporte.tipo === 'pes') {
    const qtd = Math.round(clamp(num(suporte.quantidade) ?? 4, 2, 4));
    const yTopo = -(metadeComprimento + profundidade2 * 0.3);
    const lado = rCasco * 0.12;
    for (let i = 0; i < qtd; i++) {
      const ang = (i / qtd) * Math.PI * 2 + Math.PI / qtd;
      const pe = new THREE.Mesh(new THREE.BoxGeometry(lado, alturaCena, lado), materialAco(translucido));
      pe.position.set(rCasco * 0.75 * Math.cos(ang), yTopo - alturaCena / 2, rCasco * 0.75 * Math.sin(ang));
      grupo.add(pe);
    }
  } else if (suporte.tipo === 'selas') {
    // 2 caixas de apoio na horizontal, sob o casco: direção local -X (que, na orientação
    // 'horizontal', vira "embaixo" no mundo após o grupo de orientação girar 90° em Z).
    const largura = clamp(metadeComprimento * 0.36, rCasco * 0.3, rCasco * 2.2);
    for (const sinal of [-1, 1] as const) {
      const sela = new THREE.Mesh(new THREE.BoxGeometry(alturaCena, largura, rCasco * 1.3), materialAco(translucido));
      sela.position.set(-(rCasco + alturaCena / 2), sinal * metadeComprimento * 0.5, 0);
      grupo.add(sela);
    }
  }

  return grupo;
}

// ─────────────────────────────────── Cotas ───────────────────────────────────

function criarTextoSprite(texto: string, escala: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Sem contexto 2D disponível (ambiente atípico): sprite sólida sem texto, não quebra o desenho.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: COR_COTA }));
    sprite.scale.set(escala, escala, 1);
    return sprite;
  }

  const fonteTamanho = 56;
  ctx.font = `bold ${fonteTamanho}px Arial`;
  const larguraTexto = Math.ceil(ctx.measureText(texto).width) + 32;
  const alturaTexto = fonteTamanho + 28;
  // Redimensionar o canvas reseta o contexto 2D — a fonte precisa ser redefinida depois.
  canvas.width = larguraTexto;
  canvas.height = alturaTexto;
  ctx.font = `bold ${fonteTamanho}px Arial`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, larguraTexto, alturaTexto);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, larguraTexto / 2, alturaTexto / 2);

  const textura = new THREE.CanvasTexture(canvas);
  textura.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: textura, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((larguraTexto / alturaTexto) * escala, escala, 1);
  return sprite;
}

function criarSeta(ponta: THREE.Vector3, direcao: THREE.Vector3, tamanho: number): THREE.Mesh {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(tamanho * 0.4, tamanho, 10), new THREE.MeshBasicMaterial({ color: COR_COTA }));
  cone.position.copy(ponta).addScaledVector(direcao, -tamanho / 2);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao);
  return cone;
}

function criarCota(pontoA: THREE.Vector3, pontoB: THREE.Vector3, texto: string, escalaTexto: number): THREE.Group {
  const grupo = new THREE.Group();
  const geometria = new THREE.BufferGeometry().setFromPoints([pontoA, pontoB]);
  grupo.add(new THREE.Line(geometria, new THREE.LineBasicMaterial({ color: COR_COTA })));

  const direcao = new THREE.Vector3().subVectors(pontoB, pontoA).normalize();
  const tamanhoSeta = clamp(escalaTexto * 0.55, 0.015, 0.2);
  grupo.add(criarSeta(pontoA, direcao.clone().negate(), tamanhoSeta));
  grupo.add(criarSeta(pontoB, direcao, tamanhoSeta));

  const meio = new THREE.Vector3().addVectors(pontoA, pontoB).multiplyScalar(0.5);
  const sprite = criarTextoSprite(texto, escalaTexto);
  sprite.position.copy(meio);
  grupo.add(sprite);

  return grupo;
}

/** Cotas do viewport: Ø interno e comprimento total (valores do "motor" — `geometriaVaso.ts`).
 * Sem dado (D ou comprimento total indisponível) → sem a cota correspondente. */
function adicionarCotas(grupo: THREE.Group, modelo: ModeloVaso, ctx: ContextoBocal): void {
  const D = num(modelo.diametroInterno);
  const totalMm = comprimentoTotalMm(modelo);
  const tamanhoGeral = Math.max(ctx.rCasco, ctx.metadeComprimento) * 2;
  const escalaTexto = clamp(tamanhoGeral * 0.045, 0.05, 0.32);

  if (D !== null) {
    const z = ctx.rCasco * 1.35;
    const y = -(ctx.metadeComprimento + ctx.profundidade2);
    const p1 = new THREE.Vector3(-ctx.rCasco, y, z);
    const p2 = new THREE.Vector3(ctx.rCasco, y, z);
    grupo.add(criarCota(p1, p2, `Ø ${Math.round(D)} mm`, escalaTexto));
  }

  if (totalMm !== null) {
    const x = ctx.rCasco * 1.35;
    const yTopo = ctx.metadeComprimento + ctx.profundidade1;
    const yBase = -(ctx.metadeComprimento + ctx.profundidade2);
    const p1 = new THREE.Vector3(x, yBase, 0);
    const p2 = new THREE.Vector3(x, yTopo, 0);
    grupo.add(criarCota(p1, p2, `L = ${Math.round(totalMm)} mm`, escalaTexto));
  }
}

// ─────────────────────────────────── Montagem do vaso ───────────────────────────────────

/** Reconstrói a malha do vaso a partir do modelo. Retorna null quando faltam os dados mínimos
 * (Ø interno e comprimento do cilindro) — nesse caso o componente mostra o placeholder. */
function construirGrupoVaso(modelo: ModeloVaso, translucido: boolean, mostrarCotas: boolean): THREE.Group | null {
  const D = num(modelo.diametroInterno);
  const L = num(modelo.comprimentoCilindro);
  if (D === null || L === null || D <= 0 || L <= 0) return null;

  const rCasco = mm(D) / 2;
  const metadeComprimento = mm(L) / 2;

  const grupoVaso = new THREE.Group();

  const casco = new THREE.Mesh(new THREE.CylinderGeometry(rCasco, rCasco, mm(L), 48, 1, true), materialAco(translucido));
  grupoVaso.add(casco);

  const profundidade1 = adicionarTampo(grupoVaso, modelo.tampo1, D, rCasco, metadeComprimento, 1, translucido);
  const profundidade2 = adicionarTampo(grupoVaso, modelo.tampo2, D, rCasco, -metadeComprimento, -1, translucido);

  const ctxBocal: ContextoBocal = { rCasco, metadeComprimento, profundidade1, profundidade2 };
  for (const bocal of modelo.bocais) {
    const objeto = construirBocal(bocal, ctxBocal, translucido);
    if (objeto) grupoVaso.add(objeto);
  }

  const suporte = construirSuporte(modelo.suporte, rCasco, metadeComprimento, profundidade2, translucido);
  if (suporte) grupoVaso.add(suporte);

  if (mostrarCotas) {
    adicionarCotas(grupoVaso, modelo, ctxBocal);
  }

  // Orientação horizontal = grupo inteiro rotacionado 90° em Z (eixo Y local → eixo X do mundo).
  const grupoOrientado = new THREE.Group();
  grupoOrientado.add(grupoVaso);
  if (modelo.orientacao === 'horizontal') {
    grupoOrientado.rotation.z = Math.PI / 2;
  }

  return grupoOrientado;
}

// ─────────────────────────────────── Componente ───────────────────────────────────

export default function Viewport3D({ modelo, translucido, mostrarCotas, capturaRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cenaRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const grupoAtualRef = useRef<THREE.Group | null>(null);
  const temDadosRef = useRef(false);

  // Efeito 1 (monta uma única vez): renderer/cena/câmera/controles/loop de animação/captura.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COR_FUNDO);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(2, 1.4, 2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 0.65);
    luzPrincipal.position.set(3, 4, 3);
    scene.add(luzPrincipal);
    const luzPreenchimento = new THREE.DirectionalLight(0xffffff, 0.35);
    luzPreenchimento.position.set(-3, -1.5, -3);
    scene.add(luzPreenchimento);

    cenaRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    function ajustarTamanho(): void {
      const el = container ?? canvas;
      const largura = el ? el.clientWidth : 0;
      const altura = el ? el.clientHeight : 0;
      if (largura <= 0 || altura <= 0) return;
      renderer.setSize(largura, altura, false);
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
    }
    ajustarTamanho();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustarTamanho) : null;
    if (observer && container) observer.observe(container);
    window.addEventListener('resize', ajustarTamanho);

    let ativo = true;
    let frameId = 0;
    function animar(): void {
      if (!ativo) return;
      frameId = requestAnimationFrame(animar);
      controls.update();
      renderer.render(scene, camera);
    }
    animar();

    capturaRef.current = () => {
      if (!temDadosRef.current) return null;
      const corOriginal = scene.background;
      scene.background = new THREE.Color(0xffffff);
      renderer.render(scene, camera);
      const png = renderer.domElement.toDataURL('image/png');
      scene.background = corOriginal;
      renderer.render(scene, camera);
      return png;
    };

    return () => {
      ativo = false;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', ajustarTamanho);
      controls.dispose();
      if (grupoAtualRef.current) {
        descartarGrupo(grupoAtualRef.current);
        grupoAtualRef.current = null;
      }
      renderer.dispose();
      capturaRef.current = null;
      cenaRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // Monta apenas uma vez: capturaRef é estável (ref do componente pai) e o resto é recriado
    // por completo no cleanup/efeito seguinte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efeito 2: reconstrói só a malha do vaso (um único THREE.Group) quando o modelo/flags mudam.
  useEffect(() => {
    const scene = cenaRef.current;
    if (!scene) return;

    if (grupoAtualRef.current) {
      scene.remove(grupoAtualRef.current);
      descartarGrupo(grupoAtualRef.current);
      grupoAtualRef.current = null;
    }

    const grupo = construirGrupoVaso(modelo, translucido, mostrarCotas);
    temDadosRef.current = grupo !== null;

    if (grupo) {
      scene.add(grupo);
      grupoAtualRef.current = grupo;

      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        const caixa = new THREE.Box3().setFromObject(grupo);
        const esfera = new THREE.Sphere();
        caixa.getBoundingSphere(esfera);
        const raio = Math.max(esfera.radius, 0.05);
        const distancia = raio * 2.6;
        camera.position.set(
          esfera.center.x + distancia * 0.7,
          esfera.center.y + distancia * 0.45,
          esfera.center.z + distancia * 0.7,
        );
        camera.near = Math.max(raio * 0.02, 0.001);
        camera.far = raio * 30;
        camera.updateProjectionMatrix();
        controls.target.copy(esfera.center);
        controls.update();
      }
    }
    // Reconstrói pelo CONTEÚDO do modelo (não pela referência do objeto, que muda a cada render
    // do formulário) — daí o JSON.stringify explícito nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(modelo), translucido, mostrarCotas]);

  const temDados = num(modelo?.diametroInterno ?? '') !== null && num(modelo?.comprimentoCilindro ?? '') !== null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8 }} />
      {!temDados && (
        <div
          className="viewport-vazio"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
            color: '#5b6472',
            fontSize: 14,
            background: 'rgba(244,246,248,0.9)',
            borderRadius: 8,
          }}
        >
          Informe Ø e comprimento…
        </div>
      )}
    </div>
  );
}
