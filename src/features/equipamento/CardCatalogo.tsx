/**
 * Fase 9 · o cartão da lista, desenhado a partir da PROJEÇÃO.
 *
 * Espelha `CardEquipamento` campo a campo — é exigência do portão P9.2 que o
 * conteúdo seja o mesmo com a flag ligada e desligada. A diferença é a FONTE:
 * aquele lê `nr13_*` do cache (que exige a organização inteira hidratada), este
 * recebe a linha da projeção.
 *
 * A FOTO vem por REFERÊNCIA e carrega preguiçosamente: `FotoImg` já resolve com
 * `IntersectionObserver`, então uma lista de 50 cartões não dispara 50
 * downloads — só os que aparecem na tela.
 *
 * O SELETOR DE UNIDADE continua gravando de verdade (`salvarUnidade`), e a
 * gravação reprojeta a TAG pela RPC. Por isso `nr13_pref_unidade_` entrou no
 * despachante da 9B: sem ele o usuário trocaria a unidade e a lista voltaria à
 * antiga no próximo carregamento.
 */
import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemCatalogo } from '../../services/buscaIndex';
import type { SistemaUnidade } from '../../calc/unidades';
import { FATORES_CONVERSAO, formatarValor } from '../../calc/unidades';
import { salvarUnidade } from './equipamentoService';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { rotaEquipamento } from '../../app/rotas';
import './equipamento.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function vidaInfo(anos: number | null): { texto: string; pct: number; cor: string } | null {
  if (anos == null) return null;
  const pct = Math.max(0, Math.min(100, Math.round((anos / 10) * 100)));
  const cor = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--warn)' : 'var(--crit)';
  return { texto: `${anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`, pct, cor };
}

export default function CardCatalogo({ item }: { item: ItemCatalogo }) {
  const navigate = useNavigate();
  const [unidade, setUnidade] = useState<SistemaUnidade>((item.unidade as SistemaUnidade) || 'SI');

  const tipo = item.tipo ?? 'vaso';
  const rotuloTipo =
    (ROTULO_TIPO[tipo] ?? tipo) +
    (item.subtipo && item.subtipo !== 'flamotubular' ? ` (${item.subtipo})` : '');
  const vida = vidaInfo(item.vidaAnos);

  async function trocarUnidade(e: ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const u = e.target.value as SistemaUnidade;
    setUnidade(u);
    await salvarUnidade(item.tag, u);
  }

  return (
    <div className="plate-card" onClick={() => navigate(rotaEquipamento(item.tag))} style={{ cursor: 'pointer' }}>
      <div className="plate-photo">
        <span className="plate-tag-chip">{item.tag}</span>
        {item.fotoRef ? (
          <FotoImg foto={{ ref: item.fotoRef }} alt={`Foto do equipamento ${item.tag}`} variante="thumb" />
        ) : (
          <span className="plate-photo-empty">Sem foto</span>
        )}
        {item.pendente && (
          <span className="plate-pendente" title="Salvo neste aparelho; ainda não confirmado pelo servidor.">
            <Icone nome="cloudoff" tam={12} /> aguardando envio
          </span>
        )}
      </div>

      <div className="plate-body">
        <div className="plate-uom-row" onClick={(e) => e.stopPropagation()}>
          <span className="plate-uom-label">Unidade de medida</span>
          <select className="plate-uom-select" value={unidade} onChange={trocarUnidade} title="Selecionar unidade de medida">
            {(Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]).map((k) => (
              <option key={k} value={k}>
                {k} ({FATORES_CONVERSAO[k].labelPressao})
              </option>
            ))}
          </select>
        </div>

        <div className="plate-name">{item.descricao || rotuloTipo}</div>
        {item.temCliente ? (
          <div className="plate-empresa">{item.cliente ?? ''}</div>
        ) : (
          <div className="plate-empresa sem-cliente">
            <Icone nome="alerttri" tam={12} style={{ display: 'inline-block', verticalAlign: -2, marginRight: 4 }} />
            Sem cliente vinculado{item.cliente ? ` · ${item.cliente}` : ''}
          </div>
        )}

        <div className="plate-meta-grid">
          <div>
            <div className="plate-meta-k">PMTA</div>
            <div className={`plate-meta-v${item.pmtaMpa == null ? ' dash' : ''}`}>
              {item.pmtaMpa != null ? formatarValor(item.pmtaMpa, unidade) : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">Categoria</div>
            <div className={`plate-meta-v${item.categoria ? '' : ' dash'}`}>{item.categoria ?? '—'}</div>
          </div>
          <div>
            <div className="plate-meta-k">Volume</div>
            <div className={`plate-meta-v${item.volumeM3 == null ? ' dash' : ''}`}>
              {item.volumeM3 != null ? `${item.volumeM3} m³` : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">Fluido</div>
            <div className={`plate-meta-v${item.fluido ? '' : ' dash'}`}>
              {item.fluido ? `${item.classeFluido ?? ''}${item.classeFluido ? ' · ' : ''}${item.fluido}` : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">PTH (1,3×)</div>
            <div className={`plate-meta-v${item.pthMpa == null ? ' dash' : ''}`}>
              {item.pthMpa != null ? formatarValor(item.pthMpa, unidade) : '—'}
            </div>
          </div>
          <div>
            <div className="plate-meta-k">Resultado</div>
            <div
              className={`plate-meta-v${
                item.resultado === 'APROVADO' ? ' pass' : item.resultado === 'REPROVADO' ? ' fail' : ' dash'
              }`}
            >
              {item.resultado === 'APROVADO' ? 'Aprovado' : item.resultado === 'REPROVADO' ? 'Reprovado' : 'Pendente'}
            </div>
          </div>
        </div>

        <div className="plate-life">
          <div className="plate-life-top">
            <span className="plate-life-label">Vida remanescente</span>
            <span className="plate-life-val" style={{ color: vida ? vida.cor : '#AEB4B9' }}>
              {vida ? vida.texto : 'Não calculado'}
            </span>
          </div>
          <div className="plate-life-track">
            <div
              className="plate-life-fill"
              style={{ width: `${vida?.pct ?? 0}%`, background: vida ? vida.cor : '#AEB4B9' }}
            />
          </div>
        </div>

        <div className="plate-foot">
          <span className={`fj-type-badge ${tipo}`}>{rotuloTipo}</span>
          <span className="plate-btn-acessar">Acessar →</span>
        </div>
      </div>
    </div>
  );
}
