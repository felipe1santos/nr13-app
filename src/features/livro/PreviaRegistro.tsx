/**
 * A PRÉVIA do registro — o que está sendo escrito, na forma em que será lido.
 *
 * ## O que ela é, e o que ela não é
 *
 * É o conteúdo do registro na ordem e com os rótulos da folha
 * `LIVRO-REGISTRO.html`: identificação, termo, descrição, executante e quem
 * assina. **Não é a folha A4**: a folha tem cabeçalho da empresa com logo,
 * moldura, numeração e o bloco de assinatura desenhado para impressão, e é
 * gerada a partir do que está GRAVADO. Chamar isto de "documento final" seria
 * prometer fidelidade tipográfica que este bloco não entrega — por isso o
 * rodapé diz, em uma linha, o que ele é.
 *
 * O que ela garante é o que faltava: o usuário lê o texto que digitou, com o
 * termo já redigido, antes de salvar — e não descobre a redação só depois de
 * trancar, quando não dá mais para mudar.
 */
import { dataParaBR, descricaoCombinada, tituloTermo, type DadosPrevia } from './termoRegistro';

export default function PreviaRegistro({ dados }: { dados: DadosPrevia }) {
  const descricao = descricaoCombinada(dados.oQueFoiFeito, dados.descricao);
  return (
    <div className="prev-doc" aria-label="Prévia do registro">
      <div className="prev-doc-topo">
        <span className="prev-doc-eyebrow">Registro de Segurança · NR-13</span>
        <strong>{dados.equipamento || dados.tag}</strong>
        <span className="prev-doc-tag">{dados.tag}</span>
      </div>

      <dl className="prev-doc-campos">
        <div>
          <dt>Data</dt>
          {/* A prévia é o documento em português: `2026-09-07` é o formato do
              `<input type="date">`, não o do livro. */}
          <dd>{dataParaBR(dados.data) || '—'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{dados.tipo || '—'}</dd>
        </div>
        {dados.relatorioCodigo && (
          <div>
            <dt>Relatório</dt>
            <dd>{dados.relatorioCodigo}</dd>
          </div>
        )}
      </dl>

      <div className="prev-doc-bloco">
        <span className="prev-doc-rot">{tituloTermo(dados.tipo)}</span>
        {/* `pre-wrap`: o usuário pode ter quebrado linhas no termo, e a prévia
            precisa respeitar isso — senão ele vê um parágrafo que não escreveu. */}
        <p className="prev-doc-termo">{dados.termo || '—'}</p>
      </div>

      <div className="prev-doc-bloco">
        <span className="prev-doc-rot">Descrição do registro</span>
        <p>{descricao || '—'}</p>
      </div>

      {(dados.quemRealizou || dados.assinante) && (
        <div className="prev-doc-pes">
          {dados.quemRealizou && (
            <span>
              <b>Executado por</b>
              {dados.quemRealizou}
            </span>
          )}
          {dados.assinante && (
            <span>
              <b>Responsável técnico</b>
              {dados.assinante}
            </span>
          )}
        </div>
      )}

      <p className="prev-doc-nota">
        Prévia do conteúdo. A folha impressa do livro, com cabeçalho, moldura e assinatura, é gerada
        a partir deste registro.
      </p>
    </div>
  );
}
