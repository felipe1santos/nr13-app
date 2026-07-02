import { useMemo, useState } from 'react';
import { ler, salvar } from '../../services/storage';
import { listarContainers } from '../inspecoes/inspecaoService';
import { calcularVidaRemanescente, parseDataBR, type ResultadoVidaRemanescente } from '../../calc/vidaRemanescente';
import type { Categoria } from '../../calc/categoria';
import MemorialLog from '../memorial/MemorialLog';
import type { InfoEquipamento } from './tipos';
import { comLoadingGlobal } from '../../app/loadingGlobal';

type MedidasUS = Record<string, Record<string, string>>;

interface UltrassomBlob {
  medidas?: MedidasUS;
  espNomCasco?: string;
}

// Menor espessura válida (>0) da grade de medição de um container.
function minGlobal(medidas: MedidasUS | undefined): number | null {
  if (!medidas) return null;
  let min = Infinity;
  for (const comp of Object.values(medidas)) {
    for (const v of Object.values(comp)) {
      const n = parseFloat(String(v).replace(',', '.'));
      if (Number.isFinite(n) && n > 0 && n < min) min = n;
    }
  }
  return min === Infinity ? null : min;
}

// Espessura mínima requerida do memorial salvo: menor tReqMm dos componentes (fallback ecasco).
function tReqDoMemorial(tag: string): number | null {
  const calc = ler<{ componentes?: { tReqMm?: number | null }[]; ecasco?: string }>(`nr13_calc_${tag}`);
  const treqs = (calc?.componentes ?? [])
    .map((c) => c.tReqMm)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (treqs.length > 0) return Math.min(...treqs);
  const ecasco = parseFloat(String(calc?.ecasco ?? ''));
  return Number.isFinite(ecasco) && ecasco > 0 ? ecasco : null;
}

function categoriaSalva(tag: string): Categoria | null {
  const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
  const c = cat?.catFinal;
  return c === 'I' || c === 'II' || c === 'III' || c === 'IV' || c === 'V' ? c : null;
}

export default function VidaRemanescente({ tag, info }: { tag: string; info: InfoEquipamento }) {
  // Duas medições mais recentes com grade de ultrassom preenchida.
  const medicoes = useMemo(() => {
    return listarContainers(tag)
      .map((c) => {
        const us = c.dados?.ultrassom as UltrassomBlob | undefined;
        return { data: c.criadoEm, min: minGlobal(us?.medidas), espNom: us?.espNomCasco };
      })
      .filter((m) => m.min != null && parseDataBR(m.data) != null)
      .sort((a, b) => parseDataBR(b.data)!.getTime() - parseDataBR(a.data)!.getTime());
  }, [tag]);

  const atual = medicoes[0] ?? null;
  const anterior = medicoes[1] ?? null;
  const espNominal = parseFloat(String(atual?.espNom ?? '').replace(',', '.'));
  const tReq = tReqDoMemorial(tag);

  const [tAtual, setTAtual] = useState(() => (atual?.min != null ? String(atual.min) : ''));
  const [dataAtual, setDataAtual] = useState(() => atual?.data ?? new Date().toLocaleDateString('pt-BR'));
  const [tAnterior, setTAnterior] = useState(() =>
    anterior?.min != null ? String(anterior.min) : Number.isFinite(espNominal) && espNominal > 0 ? String(espNominal) : '',
  );
  const [dataAnterior, setDataAnterior] = useState(() =>
    anterior?.data ?? (info.ano && /^\d{4}$/.test(info.ano.trim()) ? `01/01/${info.ano.trim()}` : ''),
  );
  const [tRequerida, setTRequerida] = useState(() => (tReq != null ? tReq.toFixed(2) : ''));
  const [resultado, setResultado] = useState<ResultadoVidaRemanescente | null>(null);
  const [salvando, setSalvando] = useState(false);

  const num = (s: string) => parseFloat(s.replace(',', '.'));

  function calcular(): ResultadoVidaRemanescente | null {
    if (!Number.isFinite(num(tAtual)) || !Number.isFinite(num(tAnterior)) || !Number.isFinite(num(tRequerida))) {
      alert('Preencha as três espessuras (atual, anterior e mínima requerida).');
      return null;
    }
    const r = calcularVidaRemanescente({
      tAtualMm: num(tAtual),
      dataAtual,
      tAnteriorMm: num(tAnterior),
      dataAnterior,
      tRequeridaMm: num(tRequerida),
      categoria: categoriaSalva(tag),
      tipo: info.tipo,
    });
    setResultado(r);
    return r;
  }

  async function calcularESalvar() {
    const r = calcular();
    if (!r) return;
    setSalvando(true);
    try {
      await comLoadingGlobal('Salvando vida remanescente...', () => salvar(`nr13_vida_${tag}`, {
        entrada: { tAtual: num(tAtual), dataAtual, tAnterior: num(tAnterior), dataAnterior, tRequerida: num(tRequerida) },
        taxaMmAno: r.taxaMmAno,
        sobremetalMm: r.sobremetalMm,
        vidaAnos: r.vidaAnos,
        prazoNR13Anos: r.prazoNR13Anos,
        proximaInspecaoAnos: r.proximaInspecaoAnos,
        avisos: r.avisos,
        calculadoEm: new Date().toLocaleDateString('pt-BR'),
      }));
      alert('Vida remanescente salva.');
    } finally {
      setSalvando(false);
    }
  }

  const fmt = (n: number | null | undefined, un: string, casas = 2) =>
    n == null ? '—' : `${n.toFixed(casas)} ${un}`;

  return (
    <div className="bloco-dados">
      <h3>Vida Remanescente (taxa de corrosão)</h3>
      <p className="vida-hint">
        {medicoes.length >= 2
          ? `Pré-preenchido com as 2 medições de espessura mais recentes (${anterior?.data} → ${atual?.data}).`
          : medicoes.length === 1
            ? 'Só há 1 medição de espessura salva — a espessura anterior foi pré-preenchida com a nominal (ajuste se necessário) e a data anterior com o ano de fabricação.'
            : 'Nenhuma medição de espessura salva nas inspeções — preencha manualmente.'}
      </p>

      <div className="vida-campos-grid">
        <label className="vida-campo">
          <span>Esp. anterior (mm)</span>
          <input value={tAnterior} onChange={(e) => setTAnterior(e.target.value)} inputMode="decimal" />
        </label>
        <label className="vida-campo">
          <span>Data anterior</span>
          <input value={dataAnterior} onChange={(e) => setDataAnterior(e.target.value)} placeholder="dd/mm/aaaa" />
        </label>
        <label className="vida-campo">
          <span>Esp. atual (mm)</span>
          <input value={tAtual} onChange={(e) => setTAtual(e.target.value)} inputMode="decimal" />
        </label>
        <label className="vida-campo">
          <span>Data atual</span>
          <input value={dataAtual} onChange={(e) => setDataAtual(e.target.value)} placeholder="dd/mm/aaaa" />
        </label>
        <label className="vida-campo">
          <span>Esp. mín. requerida (mm)</span>
          <input value={tRequerida} onChange={(e) => setTRequerida(e.target.value)} inputMode="decimal" />
        </label>
      </div>

      <div className="memorial-acoes" style={{ marginTop: 10 }}>
        <button type="button" className="btn-secundario" onClick={calcular}>
          Calcular
        </button>
        <button type="button" className="btn-primario" onClick={calcularESalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Calcular e Salvar'}
        </button>
      </div>

      {resultado && (
        <>
          <div className="memorial-resumo-grid" style={{ marginTop: 12 }}>
            <div className="resultado-item">
              <span className="lbl-view">Taxa de corrosão</span>
              <span className="val-view">{fmt(resultado.taxaMmAno, 'mm/ano', 4)}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Sobremetal</span>
              <span className={`val-view ${resultado.sobremetalMm <= 0 ? 'val-erro' : ''}`}>
                {fmt(resultado.sobremetalMm, 'mm')}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Vida remanescente</span>
              <span className={`val-view accent ${resultado.vidaAnos === 0 ? 'val-erro' : ''}`}>
                {resultado.vidaAnos == null ? 'indeterminada' : fmt(resultado.vidaAnos, 'anos')}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Próxima inspeção</span>
              <span className="val-view">{fmt(resultado.proximaInspecaoAnos, 'anos')}</span>
            </div>
          </div>
          <MemorialLog log={resultado.log} />
        </>
      )}
    </div>
  );
}
