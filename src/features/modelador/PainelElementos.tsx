// Painel de elementos do Modelador de Vaso (fase 2) — estilo PVElite: seções colapsáveis
// (Geral, Casco, Tampo 1/2, Bocais, Suporte, Pesos) que editam o `ModeloVaso` em memória.
// Nenhum dado é persistido aqui — quem grava é `ModeladorVaso` (botão "Salvar" chama
// `salvarModelo`). Os campos numéricos aceitam vírgula decimal (padrão do app): o valor digitado
// fica em estado local do campo (draft) e só converte/propaga pro modelo no blur — evita que o
// input "salte"/corte a vírgula a cada tecla (problema clássico de number input controlado).
import { useEffect, useId, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { dimensoesTampo, num, pesosKg } from './geometriaVaso';
import type { BocalModelo, ModeloVaso, SuporteModelo, TampoModelo, TipoTampoModelo } from './tiposModelador';

interface Props {
  modelo: ModeloVaso;
  onChange: (m: ModeloVaso) => void;
}

const OPCOES_TAMPO: { value: TipoTampoModelo; label: string }[] = [
  { value: 'eliptico', label: 'Elíptico 2:1' },
  { value: 'toriesferico', label: 'Toriesférico' },
  { value: 'hemisferico', label: 'Hemisférico' },
  { value: 'plano', label: 'Plano' },
];

const OPCOES_LOCAL: { value: BocalModelo['local']; label: string }[] = [
  { value: 'casco', label: 'Casco' },
  { value: 'tampo1', label: 'Tampo 1' },
  { value: 'tampo2', label: 'Tampo 2' },
];

const OPCOES_SUPORTE: { value: SuporteModelo['tipo']; label: string }[] = [
  { value: 'nenhum', label: 'Nenhum' },
  { value: 'saia', label: 'Saia' },
  { value: 'pes', label: 'Pés' },
  { value: 'selas', label: 'Selas' },
];

// Textos de ajuda dos campos (balão do ícone "i") — curtos e técnicos, para o usuário de campo
// não preencher errado. Centralizados aqui para revisão fácil.
const DICAS = {
  orientacao: 'Posição de trabalho do vaso: deitado (horizontal) ou em pé (vertical).',
  diametroInterno: 'Diâmetro interno do casco, em mm (D do memorial de cálculo).',
  comprimentoCilindro:
    'Comprimento só da parte cilíndrica, entre as linhas de tangência dos tampos (sem contar os tampos), em mm.',
  material: 'Especificação do aço do casco (ex.: SA-516-70). Informativo — vem do memorial de cálculo e re-sincroniza a cada abertura.',
  densidadeAco: 'Usada no cálculo do peso vazio. Aço carbono ≈ 7.850 kg/m³.',
  espessuraCasco: 'Espessura nominal da chapa do casco, em mm (Tnom do memorial).',
  virolas: 'Número de seções de chapa do casco. Define as costuras circunferenciais no croqui (n−1 costuras).',
  tampoTipo:
    'Formato do tampo, conforme o memorial: elíptico 2:1, toriesférico (Klopper), hemisférico ou plano.',
  tampoEspessura: 'Espessura nominal do tampo, em mm.',
  tampoProfundidade: 'Altura interna do tampo (h), calculada pelo tipo e pelo Ø. Entra no comprimento total.',
  tampoRaioCoroa: 'Raio da calota central do tampo toriesférico (≈ D).',
  tampoRaioCanto: 'Raio da dobra entre a calota e o cilindro (≈ 0,1·D).',
  bocalId: 'Identificação do bocal na prancha (N1, N2…). Aparece no balão do croqui e na lista de bocais.',
  bocalServico:
    'Função do bocal (ex.: entrada de ar, dreno, manômetro, boca de visita). Vai para a lista de bocais da folha de dados.',
  bocalDn: 'Diâmetro nominal comercial (ex.: 2", DN50). Só para a lista de bocais.',
  bocalDiametro: 'Diâmetro real da abertura, em mm. Define o tamanho do bocal desenhado no croqui.',
  bocalEspessura: 'Espessura da parede do pescoço do bocal, em mm. Entra no cálculo do peso vazio.',
  bocalFlange: 'Tipo/classe do flange (ex.: SO #150). Só para a lista de bocais.',
  bocalLocal: 'Onde o bocal fica: no casco ou num dos tampos.',
  bocalPosicaoAxial:
    'Distância do bocal a partir da linha de tangência do tampo 1 (esquerdo/inferior), em mm, ao longo do casco.',
  bocalAngulo: 'Posição angular vista de topo: 0° = topo, sentido horário (90° = direita, 180° = fundo, 270° = esquerda).',
  bocalProjecao: 'Quanto o pescoço do bocal se projeta para fora da parede, em mm. Entra no cálculo do peso vazio.',
  suporteTipo:
    'Apoio do vaso: saia (cilindro sob o tampo, vasos verticais), pés (colunas) ou selas (berços, vasos horizontais).',
  suporteAltura: 'Altura do suporte, em mm. Entra só no desenho do croqui — não soma no comprimento total do equipamento.',
  suporteQuantidade: 'Número de apoios (pés ou selas). Vai para a folha de dados.',
  pesoVazio: 'Peso do aço (casco + tampos + bocais + saia), calculado por volume × densidade (casca fina).',
  pesoCheio: "Peso vazio + água enchendo todo o volume interno (condição do teste hidrostático).",
  pesoOperacao:
    'Peso do equipamento em operação (com fluido de processo), em kg — informado pelo usuário, vai para a folha de dados.',
} as const;

const LARGURA_BALAO = 240;

/**
 * Ícone "i" com balão de explicação do campo. Funciona por hover (mouse) e por clique/toque
 * (mobile — uso em campo). O balão usa `position: fixed` para não ser cortado pelo
 * `overflow-y: auto` do painel; fecha em Escape, blur, toque fora ou scroll.
 */
function DicaCampo({ rotulo, texto }: { rotulo: string; texto: string }) {
  const id = useId();
  const [aberta, setAberta] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const raizRef = useRef<HTMLSpanElement>(null);

  function abrirEm(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left - 8, window.innerWidth - LARGURA_BALAO - 8)),
    });
    setAberta(true);
  }

  useEffect(() => {
    if (!aberta) return;
    // Toque/clique fora fecha (iOS não foca <button> no toque, então onBlur sozinho não basta);
    // scroll fecha porque o balão é `fixed` e ficaria desalinhado do ícone.
    function fecharFora(e: PointerEvent) {
      if (!(e.target instanceof Node) || !raizRef.current?.contains(e.target)) setAberta(false);
    }
    function fechar() {
      setAberta(false);
    }
    document.addEventListener('pointerdown', fecharFora);
    document.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('pointerdown', fecharFora);
      document.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberta]);

  return (
    <span className="modelador-dica" ref={raizRef}>
      <button
        type="button"
        className="modelador-dica-btn"
        aria-label={`Sobre o campo ${rotulo}`}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        onClick={(e) => {
          // Botão dentro de <label>: sem preventDefault o clique também ativaria/focaria o input.
          e.preventDefault();
          e.stopPropagation();
          if (aberta) setAberta(false);
          else abrirEm(e.currentTarget);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') abrirEm(e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setAberta(false);
        }}
        onBlur={() => setAberta(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberta(false);
        }}
      >
        i
      </button>
      {aberta && pos && (
        <span role="tooltip" id={id} className="modelador-dica-balao" style={{ top: pos.top, left: pos.left }}>
          {texto}
        </span>
      )}
    </span>
  );
}

/** Rótulo de campo com o ícone "i" opcional ao lado. */
function RotuloCampo({ label, dica }: { label: string; dica?: string }) {
  return (
    <span className="modelador-campo-rotulo">
      {label}
      {dica && <DicaCampo rotulo={label} texto={dica} />}
    </span>
  );
}

function fmt(v: number | null, casas = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function proximoIdLivre(bocais: BocalModelo[]): string {
  let max = 0;
  for (const b of bocais) {
    const m = /^N(\d+)$/i.exec(b.id.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `N${max + 1}`;
}

function bocalVazio(bocais: BocalModelo[]): BocalModelo {
  return {
    id: proximoIdLivre(bocais),
    doMemorial: false,
    servico: '',
    dn: '',
    diametro: '',
    espessura: '',
    flange: '',
    local: 'casco',
    posicaoAxial: '',
    angulo: 0,
    projecao: '',
  };
}

function CampoNumero({
  label,
  value,
  onChange,
  unidade,
  disabled,
  dica,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  unidade?: string;
  disabled?: boolean;
  dica?: string;
}) {
  const [draft, setDraft] = useState(value === '' ? '' : String(value));
  const focadoRef = useRef(false);

  useEffect(() => {
    if (!focadoRef.current) setDraft(value === '' ? '' : String(value));
  }, [value]);

  function commit() {
    focadoRef.current = false;
    const texto = draft.trim();
    if (texto === '') {
      onChange('');
      return;
    }
    const n = parseFloat(texto.replace(',', '.'));
    if (Number.isFinite(n)) {
      onChange(n);
      setDraft(String(n).replace('.', ','));
    } else {
      setDraft(value === '' ? '' : String(value));
    }
  }

  return (
    <label className="modelador-campo">
      <RotuloCampo label={label} dica={dica} />
      <div className={`modelador-campo-input${unidade ? ' has-unit' : ''}`}>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          onFocus={() => {
            focadoRef.current = true;
          }}
          onChange={(e) => {
            focadoRef.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
        />
        {unidade && <span className="modelador-campo-unit">{unidade}</span>}
      </div>
    </label>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  disabled,
  dica,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  dica?: string;
}) {
  return (
    <label className="modelador-campo">
      <RotuloCampo label={label} dica={dica} />
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CampoSomenteLeitura({ label, valor, dica }: { label: string; valor: string; dica?: string }) {
  return (
    <div className="modelador-campo modelador-campo-ro">
      <RotuloCampo label={label} dica={dica} />
      <output>{valor}</output>
    </div>
  );
}

function SecaoTampo({
  titulo,
  tampo,
  D,
  onChange,
}: {
  titulo: string;
  tampo: TampoModelo;
  D: number | null;
  onChange: (t: TampoModelo) => void;
}) {
  const t = num(tampo.espessura);
  const dims = D !== null && t !== null ? dimensoesTampo(tampo.tipo, D, t) : null;

  return (
    <details className="modelador-secao" open>
      <summary>
        {titulo}
        <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
      </summary>
      <div className="modelador-secao-corpo">
        <label className="modelador-campo">
          <RotuloCampo label="Tipo" dica={DICAS.tampoTipo} />
          <select value={tampo.tipo} onChange={(e) => onChange({ ...tampo, tipo: e.target.value as TipoTampoModelo })}>
            {OPCOES_TAMPO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <CampoNumero
          label="Espessura (mm)"
          dica={DICAS.tampoEspessura}
          value={tampo.espessura}
          onChange={(v) => onChange({ ...tampo, espessura: v })}
        />
        <CampoSomenteLeitura
          label="Profundidade calculada"
          dica={DICAS.tampoProfundidade}
          valor={dims ? `${fmt(dims.profundidade)} mm` : '—'}
        />
        {tampo.tipo === 'toriesferico' && (
          <>
            <CampoSomenteLeitura label="Raio da coroa (Rc)" dica={DICAS.tampoRaioCoroa} valor={dims ? `${fmt(dims.raioCoroa)} mm` : '—'} />
            <CampoSomenteLeitura label="Raio de canto (rc)" dica={DICAS.tampoRaioCanto} valor={dims ? `${fmt(dims.raioCanto)} mm` : '—'} />
          </>
        )}
      </div>
    </details>
  );
}

export default function PainelElementos({ modelo, onChange }: Props) {
  const D = num(modelo.diametroInterno);
  const pesos = pesosKg(modelo);

  function atualizarBocal(idx: number, patch: Partial<BocalModelo>) {
    const bocais = modelo.bocais.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange({ ...modelo, bocais });
  }

  function adicionarBocal() {
    onChange({ ...modelo, bocais: [...modelo.bocais, bocalVazio(modelo.bocais)] });
  }

  function removerBocal(idx: number) {
    onChange({ ...modelo, bocais: modelo.bocais.filter((_, i) => i !== idx) });
  }

  return (
    <div className="modelador-painel-lista">
      <details className="modelador-secao" open>
        <summary>
          Geral
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <label className="modelador-campo">
            <RotuloCampo label="Orientação" dica={DICAS.orientacao} />
            <select
              value={modelo.orientacao}
              onChange={(e) => onChange({ ...modelo, orientacao: e.target.value as ModeloVaso['orientacao'] })}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </label>
          <CampoNumero
            label="Ø Interno (mm)"
            dica={DICAS.diametroInterno}
            value={modelo.diametroInterno}
            onChange={(v) => onChange({ ...modelo, diametroInterno: v })}
          />
          <CampoNumero
            label="Comprimento do Cilindro (mm)"
            dica={DICAS.comprimentoCilindro}
            value={modelo.comprimentoCilindro}
            onChange={(v) => onChange({ ...modelo, comprimentoCilindro: v })}
          />
          {/* Somente leitura: nada consome edição daqui e o memorial re-sincroniza ao reabrir —
              campo editável enganaria o usuário (a edição seria descartada). */}
          <CampoSomenteLeitura label="Material" dica={DICAS.material} valor={modelo.material || '—'} />
          <CampoNumero
            label="Densidade do Aço (kg/m³)"
            dica={DICAS.densidadeAco}
            value={modelo.densidadeAco}
            onChange={(v) => onChange({ ...modelo, densidadeAco: v === '' ? 7850 : v })}
          />
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Casco
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <CampoNumero
            label="Espessura (mm)"
            dica={DICAS.espessuraCasco}
            value={modelo.espessuraCasco}
            onChange={(v) => onChange({ ...modelo, espessuraCasco: v })}
          />
          <CampoNumero
            label="Nº de virolas"
            dica={DICAS.virolas}
            value={modelo.virolas}
            onChange={(v) => onChange({ ...modelo, virolas: v })}
          />
        </div>
      </details>

      <SecaoTampo titulo="Tampo 1" tampo={modelo.tampo1} D={D} onChange={(t) => onChange({ ...modelo, tampo1: t })} />
      <SecaoTampo titulo="Tampo 2" tampo={modelo.tampo2} D={D} onChange={(t) => onChange({ ...modelo, tampo2: t })} />

      <details className="modelador-secao" open>
        <summary>
          Bocais
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo modelador-bocais">
          {modelo.bocais.length === 0 && <p className="modelador-vazio">Nenhum bocal cadastrado.</p>}
          {modelo.bocais.map((b, idx) => (
            <div key={b.id} className="modelador-bocal-item">
              <div className="modelador-bocal-cabecalho">
                <CampoTexto
                  label="ID"
                  dica={DICAS.bocalId}
                  value={b.id}
                  disabled={b.doMemorial}
                  onChange={(v) => atualizarBocal(idx, { id: v })}
                />
                {b.doMemorial && <span className="modelador-badge">memorial</span>}
                {!b.doMemorial && (
                  <button
                    type="button"
                    className="btn-remover modelador-bocal-remover"
                    onClick={() => removerBocal(idx)}
                    title="Remover bocal"
                  >
                    <Icone nome="trash" tam={13} />
                  </button>
                )}
              </div>
              <div className="modelador-bocal-grid">
                <CampoTexto label="Serviço" dica={DICAS.bocalServico} value={b.servico} onChange={(v) => atualizarBocal(idx, { servico: v })} />
                <CampoTexto label="DN" dica={DICAS.bocalDn} value={b.dn} onChange={(v) => atualizarBocal(idx, { dn: v })} />
                <CampoNumero label="Ø (mm)" dica={DICAS.bocalDiametro} value={b.diametro} onChange={(v) => atualizarBocal(idx, { diametro: v })} />
                <CampoNumero
                  label="Espessura (mm)"
                  dica={DICAS.bocalEspessura}
                  value={b.espessura}
                  onChange={(v) => atualizarBocal(idx, { espessura: v })}
                />
                <CampoTexto label="Flange" dica={DICAS.bocalFlange} value={b.flange} onChange={(v) => atualizarBocal(idx, { flange: v })} />
                <label className="modelador-campo">
                  <RotuloCampo label="Local" dica={DICAS.bocalLocal} />
                  <select value={b.local} onChange={(e) => atualizarBocal(idx, { local: e.target.value as BocalModelo['local'] })}>
                    {OPCOES_LOCAL.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <CampoNumero
                  label="Posição Axial (mm)"
                  dica={DICAS.bocalPosicaoAxial}
                  value={b.posicaoAxial}
                  disabled={b.local !== 'casco'}
                  onChange={(v) => atualizarBocal(idx, { posicaoAxial: v })}
                />
                <CampoNumero label="Ângulo (0-360°)" dica={DICAS.bocalAngulo} value={b.angulo} onChange={(v) => atualizarBocal(idx, { angulo: v })} />
                <CampoNumero label="Projeção (mm)" dica={DICAS.bocalProjecao} value={b.projecao} onChange={(v) => atualizarBocal(idx, { projecao: v })} />
              </div>
            </div>
          ))}
          <button type="button" className="btn-secundario modelador-bocal-add" onClick={adicionarBocal}>
            <Icone nome="plus" tam={14} /> Bocal
          </button>
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Suporte
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <label className="modelador-campo">
            <RotuloCampo label="Tipo" dica={DICAS.suporteTipo} />
            <select
              value={modelo.suporte.tipo}
              onChange={(e) => onChange({ ...modelo, suporte: { ...modelo.suporte, tipo: e.target.value as SuporteModelo['tipo'] } })}
            >
              {OPCOES_SUPORTE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <CampoNumero
            label="Altura (mm)"
            dica={DICAS.suporteAltura}
            value={modelo.suporte.altura}
            disabled={modelo.suporte.tipo === 'nenhum'}
            onChange={(v) => onChange({ ...modelo, suporte: { ...modelo.suporte, altura: v } })}
          />
          <CampoNumero
            label="Quantidade"
            dica={DICAS.suporteQuantidade}
            value={modelo.suporte.quantidade}
            disabled={modelo.suporte.tipo === 'nenhum'}
            onChange={(v) => onChange({ ...modelo, suporte: { ...modelo.suporte, quantidade: v } })}
          />
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Pesos
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <CampoSomenteLeitura label="Vazio" dica={DICAS.pesoVazio} valor={pesos.vazioKg !== null ? `${fmt(pesos.vazioKg, 0)} kg` : '—'} />
          <CampoSomenteLeitura
            label="Cheio d'água"
            dica={DICAS.pesoCheio}
            valor={pesos.cheioDaguaKg !== null ? `${fmt(pesos.cheioDaguaKg, 0)} kg` : '—'}
          />
          <CampoNumero
            label="Operação (kg)"
            dica={DICAS.pesoOperacao}
            value={modelo.pesoOperacao}
            onChange={(v) => onChange({ ...modelo, pesoOperacao: v })}
          />
        </div>
      </details>
    </div>
  );
}
