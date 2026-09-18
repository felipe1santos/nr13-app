import RespostaSegmentada, { type OpcaoSegmentada } from './RespostaSegmentada';
import {
  PERGUNTA_NC,
  SIGNIFICADO_NC,
  TOM_NC,
  listaDeItens,
  resultadoNcDerivado,
  type RespostaNc,
} from './semanticaNc';

/**
 * As peças de tela da pergunta de não conformidade, COMPARTILHADAS pelo Exame
 * Externo e pelo Exame Interno (18/09/2026).
 *
 * Os dois formulários continuam separados — unificá-los é outra rodada. O que
 * se compartilha é a parte que tem de ser idêntica nos dois: a pergunta, a
 * legenda, as cores e o aviso de observação.
 */

const OPCOES: OpcaoSegmentada[] = (['sim', 'nao', 'na'] as const).map((v) => ({
  value: v,
  label: v === 'sim' ? 'SIM' : v === 'nao' ? 'NÃO' : 'N.A.',
  tom: TOM_NC[v],
  descricao: SIGNIFICADO_NC[v],
}));

export function CabecalhoNaoConformidade({ respostas }: { respostas: RespostaNc[] }) {
  const r = resultadoNcDerivado(respostas);
  const resumo =
    r.resposta === 'SIM'
      ? `Resultado: SIM — ${r.itensNc.length} não conformidade${r.itensNc.length > 1 ? 's' : ''} (${listaDeItens(r.itensNc)})`
      : r.resposta === 'NÃO'
        ? 'Resultado: NÃO — nenhuma não conformidade'
        : r.resposta === 'N.A.'
          ? 'Resultado: N.A. — nenhum item se aplica'
          : `${r.respondidos} de ${r.total} itens respondidos`;
  return (
    <div className="nc-cabecalho" role="group" aria-label={PERGUNTA_NC}>
      <p className="nc-pergunta">{PERGUNTA_NC}</p>
      <ul className="nc-legenda">
        <li>
          <strong className="nc-sim">SIM</strong> = {SIGNIFICADO_NC.sim}
        </li>
        <li>
          <strong className="nc-nao">NÃO</strong> = {SIGNIFICADO_NC.nao}
        </li>
        <li>
          <strong>N.A.</strong> = {SIGNIFICADO_NC.na}
        </li>
      </ul>
      <p className={`nc-resumo${r.resposta === 'SIM' ? ' tem-nc' : ''}`} aria-live="polite">
        {resumo}
      </p>
    </div>
  );
}

/**
 * Registro preenchido antes da pergunta aparecer na tela, e com respostas.
 *
 * Não reinterpreta nada: pede que alguém confira as respostas com a pergunta à
 * vista e confirme. Até isso, o relatório novo não finaliza (ver
 * `validacaoFinalizacao`).
 */
export function AvisoRevisaoNc({ aoConfirmar }: { aoConfirmar: () => void }) {
  return (
    <div className="nc-revisao" role="alert">
      <strong>Revise as respostas deste exame.</strong> Ele foi preenchido antes de a pergunta
      “{PERGUNTA_NC}” aparecer nesta tela. No relatório, <strong>SIM significa não conformidade
      encontrada</strong>. Confira cada item e confirme — o relatório não é finalizado antes disso.
      <button type="button" className="btn-secundario" onClick={aoConfirmar}>
        Revisei — as respostas estão corretas
      </button>
    </div>
  );
}

export function ItemNaoConformidade({
  n,
  texto,
  valor,
  observacao,
  aoResponder,
  aoObservar,
}: {
  n: number;
  texto: string;
  valor: RespostaNc;
  observacao: string;
  aoResponder: (v: RespostaNc) => void;
  aoObservar: (v: string) => void;
}) {
  // Item com não conformidade PEDE a descrição — sem bloquear nada em campo
  // (offline, o técnico pode completar depois). Quem cobra é a finalização.
  const pendente = valor === 'sim' && observacao.trim() === '';
  const idAviso = `nc-aviso-${n}`;
  return (
    <div className="nc-item">
      <div className="nc-item-linha">
        <span className="nc-item-num">{n}.</span>
        <span className="nc-item-texto">{texto}</span>
        <RespostaSegmentada opcoes={OPCOES} valor={valor} onChange={(v) => aoResponder(v as RespostaNc)} />
      </div>
      <input
        type="text"
        className={`nc-item-obs${pendente ? ' pendente' : ''}`}
        placeholder={valor === 'sim' ? 'Descreva a não conformidade' : 'Observação (opcional)'}
        value={observacao}
        onChange={(e) => aoObservar(e.target.value)}
        aria-invalid={pendente || undefined}
        aria-describedby={pendente ? idAviso : undefined}
      />
      {pendente && (
        <span id={idAviso} className="nc-item-aviso">
          Descreva a não conformidade — obrigatório para finalizar o relatório.
        </span>
      )}
    </div>
  );
}
