import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmpresaEquipamento, EquipamentoResumo } from './tipos';
import type { SistemaUnidade } from '../../calc/unidades';
import { FATORES_CONVERSAO, formatarValor } from '../../calc/unidades';
import { salvarUnidade } from './equipamentoService';
import { ler } from '../../services/storage';
import { Icone } from '../../components/Icone';
import './equipamento.css';
import FotoImg from '../../components/FotoImg';
import { rotaEquipamento } from '../../app/rotas';
import { COR_VIDA, vidaDaBarra, type VidaBarra } from './barraVida';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

const CLASSE_TIPO: Record<string, string> = {
  vaso: 'vaso',
  autoclave: 'autoclave',
  caldeira: 'caldeira',
};

interface VidaSalva {
  vidaAnos?: number | null;
}

/**
 * Vida remanescente do cálculo salvo.
 *
 * Aqui mora só a LEITURA (`nr13_vida_<TAG>` do cache) — o que fazer com o
 * número vem de `vidaRemanescente.ts`, o mesmo módulo que o `CardCatalogo` usa.
 * Os dois cartões precisam mostrar a mesma coisa (P9.2), e a regra estava
 * copiada nos dois arquivos.
 */
function vidaInfo(tag: string): VidaBarra | null {
  const vida = ler<VidaSalva>(`nr13_vida_${tag}`);
  if (!vida) return null;
  // Cálculo existe mas sem o número: "Indeterminada" é diferente de "não
  // calculado", e não pinta a barra de vermelho.
  if (typeof vida.vidaAnos !== 'number') {
    return { texto: 'Indeterminada', pct: 0, cor: COR_VIDA.indefinida };
  }
  return vidaDaBarra(vida.vidaAnos);
}

export default function CardEquipamento({ item }: { item: EquipamentoResumo }) {
  const navigate = useNavigate();
  const { tag, info, categoria, calculo, fotoCapa } = item;
  const [unidade, setUnidade] = useState<SistemaUnidade>(item.unidade);

  const rotuloTipo =
    ROTULO_TIPO[info.tipo] + (info.subtipo && info.subtipo !== 'flamotubular' ? ` (${info.subtipo})` : '');

  const pmtaMpa = calculo ? parseFloat(calculo.pmta) : null;
  const pthMpa = calculo?.pth ? parseFloat(calculo.pth) : null;
  const emp = ler<EmpresaEquipamento>(`nr13_emp_${tag}`);
  const empresaTxt = [emp?.razaoSocial || emp?.nomeFantasia, emp?.cidade].filter(Boolean).join(' · ');
  const vida = vidaInfo(tag);
  const resultado = calculo?.resultado ?? null;

  async function handleUnidadeChange(e: ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const u = e.target.value as SistemaUnidade;
    setUnidade(u);
    await salvarUnidade(tag, u);
  }

  return (
    <div className="plate-card" onClick={() => navigate(rotaEquipamento(tag))} style={{ cursor: 'pointer' }}>
      <div className="plate-photo">
        <span className="plate-tag-chip">{tag}</span>
        {fotoCapa ? (
          <FotoImg foto={fotoCapa} alt={`Foto do equipamento ${tag}`} variante="thumb" />
        ) : (
          <span className="plate-photo-empty">Sem foto</span>
        )}
      </div>

      <div className="plate-body">
        <div className="plate-uom-row" onClick={(e) => e.stopPropagation()}>
          <span className="plate-uom-label">Unidade de medida</span>
          <select
            className="plate-uom-select"
            value={unidade}
            onChange={handleUnidadeChange}
            title="Selecionar unidade de medida"
          >
            {(Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]).map((key) => (
              <option key={key} value={key}>
                {key} ({FATORES_CONVERSAO[key].labelPressao})
              </option>
            ))}
          </select>
        </div>

        <div className="plate-name">{info.descricao || rotuloTipo}</div>
        {/* Sem clienteId o equipamento não aparece no portal do cliente — aviso âmbar. */}
        {emp?.clienteId ? (
          <div className="plate-empresa">{empresaTxt}</div>
        ) : (
          <div className="plate-empresa sem-cliente">
            <Icone nome="alerttri" tam={12} style={{ display: 'inline-block', verticalAlign: -2, marginRight: 4 }} />
            Sem cliente vinculado{empresaTxt ? ` · ${empresaTxt}` : ''}
          </div>
        )}

        <div className="plate-meta-grid">
          <div>
            <div className="plate-meta-k">PMTA</div>
            <div className={`plate-meta-v${pmtaMpa == null ? ' dash' : ''}`}>
              {pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">Categoria</div>
            <div className={`plate-meta-v${categoria?.catFinal ? '' : ' dash'}`}>{categoria?.catFinal ?? '—'}</div>
          </div>
          <div>
            <div className="plate-meta-k">Volume</div>
            <div className={`plate-meta-v${categoria ? '' : ' dash'}`}>{categoria ? `${categoria.volInput} m³` : '—'}</div>
          </div>
          <div>
            <div className="plate-meta-k">Fluido</div>
            <div className={`plate-meta-v${categoria?.fluidoInput ? '' : ' dash'}`}>
              {categoria ? `${categoria.classe} · ${categoria.fluidoInput}` : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">PTH (1,3×)</div>
            <div className={`plate-meta-v${pthMpa == null ? ' dash' : ''}`}>
              {pthMpa != null ? formatarValor(pthMpa, unidade) : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">Resultado</div>
            <div className={`plate-meta-v${resultado === 'APROVADO' ? ' pass' : resultado === 'REPROVADO' ? ' fail' : ' dash'}`}>
              {resultado === 'APROVADO' ? 'Aprovado' : resultado === 'REPROVADO' ? 'Reprovado' : 'Pendente'}
            </div>
          </div>
        </div>

        <div className="plate-life">
          <div className="plate-life-top">
            <span className="plate-life-label">Vida remanescente</span>
            <span className="plate-life-val" style={{ color: vida ? vida.cor : COR_VIDA.indefinida }}>
              {vida ? vida.texto : 'Não calculado'}
            </span>
          </div>
          <div className="plate-life-track">
            <div
              className="plate-life-fill"
              style={{ width: `${vida?.pct ?? 0}%`, background: vida ? vida.cor : COR_VIDA.indefinida }}
            />
          </div>
        </div>

        <div className="plate-foot">
          <span className={`fj-type-badge ${CLASSE_TIPO[info.tipo] ?? 'vaso'}`}>{rotuloTipo}</span>
          <span className="plate-btn-acessar">Acessar →</span>
        </div>
      </div>
    </div>
  );
}
