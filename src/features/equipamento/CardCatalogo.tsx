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
 * ## A UNIDADE NÃO SE TROCA AQUI (16/09/2026)
 *
 * Havia um `<select>` neste cartão que gravava na hora. Unidade de medida não é
 * preferência de visualização: ela é característica do equipamento, escolhida na
 * CRIAÇÃO, e é a referência da ficha e da documentação inteira. Trocá-la num
 * cartão de lista mudava, num clique e sem confirmação, a unidade em que o
 * relatório daquele equipamento sai.
 *
 * Aqui virou INFORMAÇÃO — texto, não controle. E desde 16/09/2026 a ficha
 * também não troca mais: a unidade só se escolhe no cadastro. `nr13_pref_unidade_`
 * continua no despachante da 9B e na projeção: o cartão a LÊ de `item.unidade`.
 *
 * ## PMTA e PTH aqui são as ADOTADAS, não as calculadas (15/09/2026)
 *
 * O cartão é o RESUMO DA FICHA daquele equipamento, e na ficha quem manda sobre
 * pressão para documentação é a seção "Pressões da Documentação": o valor que o
 * engenheiro ADOTOU (`nr13_info_.pmtaAdotadaMpa`/`.pthAdotadaMpa`). O memorial
 * calcula, o engenheiro adota — e eram duas coisas diferentes aparecendo com o
 * mesmo rótulo: o cartão mostrava 2,33 MPa calculada onde a ficha dizia 2,2 MPa
 * adotada.
 *
 * NÃO HÁ QUEDA PARA A CALCULADA. Sem valor adotado o cartão escreve "—". Um
 * `?? pmtaMpa` faria o resumo afirmar uma adoção que não houve, e o usuário
 * perderia justamente o sinal de que falta definir aquele valor. (Fora daqui a
 * precedência oficial do sistema segue sendo `adotada ?? calculada` — PLACA,
 * PRONTUARIO, INSPECOES e o PDF vetorial não mudaram.)
 *
 * O rótulo do PTH perdeu o "(1,3×)": o multiplicador descreve a DERIVAÇÃO do
 * cálculo, e a pressão adotada não é obrigada a segui-la (nem seria 1,3× numa
 * caldeira, onde a regra é 1,5×). Anunciar um fator que este número não usa
 * seria o rótulo mentindo sobre o valor ao lado.
 *
 * `item.pmtaMpa`/`item.pthMpa` (as calculadas) CONTINUAM existindo e continuam
 * sendo o que Inspeções, Prontuários, Relatórios e Calibrações mostram.
 */
import { useNavigate } from 'react-router-dom';
import { textoCliente, type ItemCatalogo } from '../../services/buscaIndex';
import { formatarValor, rotuloSistemaCompleto, unidadeValida } from '../../calc/unidades';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { rotaEquipamento } from '../../app/rotas';
import { COR_VIDA, vidaDaBarra } from './barraVida';
import './equipamento.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

// A regra da barra de vida mora em `barraVida.ts`: ela é a MESMA do
// `CardEquipamento`, e o P9.2 exige que os dois mostrem a mesma coisa com a
// flag ligada e desligada. Copiada, ela divergiria na primeira mudança.

export default function CardCatalogo({ item }: { item: ItemCatalogo }) {
  const navigate = useNavigate();
  // `unidadeValida`, e não um cast: a projeção devolve `unidade` como string
  // livre, e um valor fora do domínio quebrava o render do cartão inteiro.
  // Ausente (equipamento anterior a 16/09/2026, que nunca teve preferência
  // gravada) também cai em SI — o MESMO recuo que o sistema já aplicava.
  const unidade = unidadeValida(item.unidade);

  const tipo = item.tipo ?? 'vaso';
  const rotuloTipo =
    (ROTULO_TIPO[tipo] ?? tipo) +
    (item.subtipo && item.subtipo !== 'flamotubular' ? ` (${item.subtipo})` : '');
  const vida = vidaDaBarra(item.vidaAnos);
  // MESMO texto do cartão antigo: nome (razão social primeiro) · cidade.
  const empresaTxt = textoCliente(item);

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
        {/* INFORMAÇÃO, não controle (16/09/2026). Ver o cabeçalho do arquivo. */}
        <div className="plate-uom-row">
          <span className="plate-uom-label">Unidade de medida</span>
          <span className="plate-uom-valor">{rotuloSistemaCompleto(unidade)}</span>
        </div>

        <div className="plate-name">{item.descricao || rotuloTipo}</div>
        {item.temCliente ? (
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
            <div className={`plate-meta-v${item.pmtaAdotadaMpa == null ? ' dash' : ''}`}>
              {item.pmtaAdotadaMpa != null ? formatarValor(item.pmtaAdotadaMpa, unidade) : '—'}
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
            <div className="plate-meta-k">PTH</div>
            <div className={`plate-meta-v${item.pthAdotadaMpa == null ? ' dash' : ''}`}>
              {item.pthAdotadaMpa != null ? formatarValor(item.pthAdotadaMpa, unidade) : '—'}
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
          <span className={`fj-type-badge ${tipo}`}>{rotuloTipo}</span>
          <span className="plate-btn-acessar">Acessar →</span>
        </div>
      </div>
    </div>
  );
}
