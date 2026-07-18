import { useEffect, useRef, useState } from 'react';
import type { CategoriaSalva, CalculoSalvo, InfoEquipamento } from './tipos';
import { salvarInfo } from './equipamentoService';
import { ler } from '../../services/storage';
import { FATORES_CONVERSAO, type SistemaUnidade } from '../../calc/unidades';

// Pressões "adotadas" da documentação (pedido do engenheiro): valores manuais que os templates
// (PLACA/PRONTUARIO/INSPECOES) preferem sobre as calculadas. Armazenadas em MPa dentro de
// nr13_info_<TAG> (pmtaAdotadaMpa/pmoAdotadaMpa/pthAdotadaMpa); a UI exibe/edita na unidade
// atual da ficha. NÃO alimentam o cálculo da Categoria de Risco (regra absoluta §4).

type Chave = 'pmta' | 'pmo' | 'pth';

const ROTULOS: Record<Chave, string> = {
  pmta: 'PMTA Adotada',
  pmo: 'PMO Adotada',
  pth: 'PTH Adotada',
};

// nr13_cat: presInput está na unidade de entrada da categorização (unidInput) → MPa.
const FATOR_UNID_CAT: Record<string, number> = { SI: 1, TECNICO: 10.19716, PETROBRAS: 10 };

// `unidade` vem de nr13_pref_unidade_<TAG> via cast sem validação (carregarUnidade) — um valor
// legado/corrompido fora de SI/TECNICO/PETROBRAS derrubaria o componente ao acessar `.mult`.
// Fallback defensivo: unidade desconhecida se comporta como SI (mult 1 / MPa).
function fatorUnidade(u: SistemaUnidade) {
  return FATORES_CONVERSAO[u] ?? FATORES_CONVERSAO.SI;
}

function numero(s: string): number | null {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Formata sem zeros à direita excessivos (até 4 casas), padrão dos inputs da ficha.
function fmt(n: number): string {
  return String(Number(n.toFixed(4)));
}

function mpaParaExib(mpaStr: string | undefined, unidade: SistemaUnidade): string {
  const n = numero(mpaStr ?? '');
  return n == null ? '' : fmt(n * fatorUnidade(unidade).mult);
}

export default function PressoesDocumentacao({
  tag,
  info,
  unidade,
  onSalvo,
}: {
  tag: string;
  info: InfoEquipamento;
  unidade: SistemaUnidade;
  onSalvo: (i: InfoEquipamento) => void;
}) {
  const [valores, setValores] = useState<Record<Chave, string>>(() => ({
    pmta: mpaParaExib(info.pmtaAdotadaMpa, unidade),
    pmo: mpaParaExib(info.pmoAdotadaMpa, unidade),
    pth: mpaParaExib(info.pthAdotadaMpa, unidade),
  }));
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(false);
  const unidadeAnterior = useRef(unidade);

  // Trocar a unidade da ficha reconverte os valores exibidos (mesmo comportamento do resto da ficha).
  useEffect(() => {
    if (unidadeAnterior.current === unidade) return;
    const de = fatorUnidade(unidadeAnterior.current).mult;
    const para = fatorUnidade(unidade).mult;
    unidadeAnterior.current = unidade;
    setValores((v) => {
      const conv = (s: string) => {
        const n = numero(s);
        return n == null ? s : fmt((n / de) * para);
      };
      return { pmta: conv(v.pmta), pmo: conv(v.pmo), pth: conv(v.pth) };
    });
  }, [unidade]);

  const labelUnid = fatorUnidade(unidade).labelPressao;

  function usarCalculadas() {
    const calc = ler<CalculoSalvo>(`nr13_calc_${tag}`);
    const cat = ler<CategoriaSalva>(`nr13_cat_${tag}`);
    const mult = fatorUnidade(unidade).mult;

    const pmtaMpa = numero(calc?.pmta ?? '');
    const pthMpa = numero(calc?.pth ?? '') ?? (pmtaMpa != null ? pmtaMpa * 1.3 : null);
    // PMO = pressão de operação informada na categorização, convertida da unidade de entrada.
    let pmoMpa: number | null = null;
    if (cat?.presInput) {
      const f = FATOR_UNID_CAT[cat.unidInput] || 1;
      const p = numero(String(cat.presInput));
      if (p != null) pmoMpa = p / f;
    }

    setValores((v) => ({
      pmta: pmtaMpa != null ? fmt(pmtaMpa * mult) : v.pmta,
      pmo: pmoMpa != null ? fmt(pmoMpa * mult) : v.pmo,
      pth: pthMpa != null ? fmt(pthMpa * mult) : v.pth,
    }));
  }

  async function salvarPressoes() {
    const mult = fatorUnidade(unidade).mult;
    const paraMpaStr = (s: string): string | undefined => {
      const n = numero(s);
      return n == null ? undefined : fmt(n / mult);
    };
    const novo: InfoEquipamento = {
      ...info,
      pmtaAdotadaMpa: paraMpaStr(valores.pmta),
      pmoAdotadaMpa: paraMpaStr(valores.pmo),
      pthAdotadaMpa: paraMpaStr(valores.pth),
    };
    setSalvando(true);
    try {
      await salvarInfo(novo);
      onSalvo(novo);
      setToast(true);
      window.setTimeout(() => setToast(false), 1800);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bloco-dados">
      <h3>Pressões da Documentação</h3>
      <p className="vida-hint">
        Valores adotados manualmente para as folhas do relatório (placa, prontuário, resumo de inspeções).
        Quando preenchidos, substituem os calculados; em branco, a documentação segue usando o cálculo.
      </p>

      <div className="vida-campos-grid">
        {(Object.keys(ROTULOS) as Chave[]).map((k) => (
          <label className="vida-campo" key={k}>
            <span>
              {ROTULOS[k]} ({labelUnid})
            </span>
            <input
              value={valores[k]}
              onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
              inputMode="decimal"
              placeholder="usar calculada"
            />
          </label>
        ))}
      </div>

      <div className="memorial-acoes" style={{ marginTop: 10 }}>
        <button type="button" className="btn-secundario" onClick={usarCalculadas}>
          Usar calculadas
        </button>
        <button type="button" className="btn-primario" onClick={salvarPressoes} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Pressões'}
        </button>
        {toast && <span className="unidade-salva-ok">✓ Pressões salvas</span>}
      </div>
    </div>
  );
}
