/**
 * A PORTA de uma tela por equipamento — 16/09/2026.
 *
 * Nasceu inline na ficha (`pages/Equipamento.tsx`, commit ec66855) e saiu de lá
 * no dia seguinte, quando o MEMORIAL precisou da mesma porta. Duas cópias da
 * mesma decisão divergem na primeira mudança — é a lição que o
 * `modoHidratacao.ts` já registra sobre o boot e o login terem tido cada um a
 * sua regra.
 *
 * A regra de DADOS continua em `aberturaFicha.ts`; aqui mora só o que é React:
 * o estado da busca e o desenho dos três estados que não são "encontrado".
 *
 * REGRA QUE NÃO SE QUEBRA (§3-ter do CLAUDE.md): nenhum destes estados
 * redireciona. Cache vazio não fecha tela.
 */
import { Link } from 'react-router-dom';
import type { AberturaFicha } from './aberturaFicha';
import { Icone } from '../../components/Icone';

/**
 * Os três estados que não são "encontrado". Devolve `null` quando a tela já
 * pode desenhar o equipamento — quem chama trata o caso positivo.
 *
 * `classeDaPagina` é a classe da tela hospedeira (`equipamento-page`,
 * `memorial-page`), para o estado herdar a moldura da própria tela em vez de
 * aparecer solto na área de conteúdo.
 */
export function TelaAbertura({
  abertura,
  tag,
  onTentar,
  classeDaPagina,
}: {
  abertura: AberturaFicha;
  tag: string;
  onTentar: () => void;
  classeDaPagina: string;
}) {
  if (abertura.estado === 'encontrado') return null;

  if (abertura.estado === 'carregando') {
    return (
      <div className={classeDaPagina}>
        <div className="fj-empty">
          <div className="fj-empty-ic">
            <Icone nome="box" tam={22} />
          </div>
          <div className="fj-empty-title">Carregando equipamento…</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>TAG: {tag}</div>
        </div>
      </div>
    );
  }

  if (abertura.estado === 'ausente') {
    return (
      <div className={classeDaPagina}>
        <div className="fj-empty">
          <div className="fj-empty-ic">
            <Icone nome="search" tam={22} />
          </div>
          <div className="fj-empty-title">Equipamento não encontrado</div>
          <div style={{ marginBottom: 10 }}>
            Nenhum equipamento com a TAG <b>{tag}</b> nesta organização.
          </div>
          <Link to="/equipamentos" className="fj-link">
            Voltar para a lista de equipamentos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={classeDaPagina}>
      <div className="fj-empty">
        <div className="fj-empty-ic">
          <Icone nome="cloudoff" tam={22} />
        </div>
        <div className="fj-empty-title">Sem conexão com o servidor</div>
        <div style={{ marginBottom: 10 }}>
          O equipamento <b>{tag}</b> não está neste aparelho e não foi possível buscá-lo agora.
        </div>
        <button type="button" className="fj-btn fj-btn-ghost" onClick={onTentar}>
          <Icone nome="refresh" tam={14} /> Tentar de novo
        </button>
      </div>
    </div>
  );
}
