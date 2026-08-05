import type { FalhaPalco } from '../services/palco';

/**
 * Mostra por que o documento não pôde ser montado.
 *
 * A regra que este componente serve: documento acima do orçamento é RECUSADO,
 * nunca montado sem as fotos. Omitir imagem em silêncio produziria um relatório
 * que sai impresso incompleto e ninguém percebe.
 */
export default function RecusaPalco({
  estado,
  falha,
}: {
  estado: 'montando' | 'pronto' | 'recusado';
  falha: FalhaPalco | null;
}) {
  if (estado === 'montando') {
    return <p className="palco-aviso">Preparando o documento…</p>;
  }
  if (!falha) return null;

  const kb = (b: number) => `${Math.round(b / 1024)} KB`;

  return (
    <div className="palco-recusa aviso aviso--erro">
      {falha.tipo === 'ocupado' && (
        <>
          <strong>Este relatório já está aberto em outra aba.</strong>
          <p>
            Feche a outra aba ou termine o documento aberto lá. Duas abas montando relatórios ao
            mesmo tempo produziriam folhas misturadas.
          </p>
        </>
      )}

      {falha.tipo === 'acima_do_orcamento' && (
        <>
          <strong>O documento não cabe no espaço disponível do navegador.</strong>
          <p>
            {kb(falha.total)} contra um limite de {kb(falha.orcamento)}. Remova algumas fotos ou
            divida o relatório em partes.
          </p>
          <ul>
            {falha.maiores.slice(0, 8).map((m) => (
              <li key={m.chave}>
                {m.chave} — {kb(m.bytes)}
              </li>
            ))}
          </ul>
        </>
      )}

      {falha.tipo === 'imagem_indegradavel' && (
        <>
          <strong>Uma imagem não pôde ser reduzida o suficiente.</strong>
          <p>
            {falha.chave}: {kb(falha.bytes)}, acima do limite de {kb(falha.limite)} por imagem.
            Substitua a foto por uma menor.
          </p>
        </>
      )}

      {falha.tipo === 'erro_ao_resolver_imagem' && (
        <>
          <strong>Não foi possível preparar uma das imagens.</strong>
          <p>{falha.chave}</p>
          <details>
            <summary>Detalhes técnicos</summary>
            <code>{falha.erro.detalhe.mensagemOriginal}</code>
          </details>
        </>
      )}

      {(falha.tipo === 'escrita_falhou' || falha.tipo === 'rollback_falhou') && (
        <>
          <strong>
            {falha.tipo === 'escrita_falhou'
              ? 'Não foi possível preparar o documento.'
              : 'Falha ao desfazer a preparação do documento.'}
          </strong>
          <p>{falha.erro.explicacao}</p>
          <details>
            <summary>Detalhes técnicos</summary>
            <dl>
              <dt>Chave</dt>
              <dd>{falha.chave}</dd>
              <dt>Código</dt>
              <dd>{falha.erro.detalhe.codigo}</dd>
              <dt>Mensagem original</dt>
              <dd>
                <code>{falha.erro.detalhe.mensagemOriginal}</code>
              </dd>
            </dl>
          </details>
        </>
      )}
    </div>
  );
}
