/**
 * O REGISTRO ELETRÔNICO — a ficha que o sistema guarda.
 *
 * ## A inversão de prioridade (07/09/2026)
 *
 * Esta sessão nasceu apontada para o papel: tudo era a folha A4 de
 * `LIVRO-REGISTRO.html`, e a tela era um caminho até ela. Mas quem usa o
 * sistema passa quase todo o tempo LENDO registro na tela — a folha existe para
 * imprimir e colar no livro físico, uma vez.
 *
 * Então a ficha eletrônica virou a visualização principal, e o A4 uma opção ao
 * lado. Ela é uma FICHA, não um fac-símile: sem moldura de papel, sem margem de
 * impressão, com a hierarquia que a leitura em tela pede — data em azul escuro,
 * tipo em petróleo, descrição em cinza.
 *
 * ## Ela não substitui a folha
 *
 * O documento que a fiscalização lê continua sendo a folha, gerada do registro
 * gravado. Por isso o rodapé diz de onde ela vem e o visualizador oferece
 * "Folha A4" ao lado: esconder isso faria o usuário achar que o card é o
 * documento legal.
 */
import { dataParaBR, descricaoCombinada, tituloTermo, type DadosPrevia } from './termoRegistro';

export default function PreviaRegistro({
  dados,
  /** Selo do estado, quando há um: "Rascunho" ou "#000003 · Lacrado". */
  selo,
}: {
  dados: DadosPrevia;
  selo?: { texto: string; tom: 'rascunho' | 'lacrado' };
}) {
  const descricao = descricaoCombinada(dados.oQueFoiFeito, dados.descricao);
  return (
    <article className="ficha-reg" aria-label="Registro de segurança">
      <header className="ficha-reg-topo">
        <div className="ficha-reg-id">
          <span className="ficha-reg-eyebrow">Registro de Segurança · NR-13</span>
          <strong className="ficha-reg-equip">{dados.equipamento || dados.tag}</strong>
          <span className="ficha-reg-tag">{dados.tag}</span>
        </div>
        {selo && <span className={`ficha-reg-selo ${selo.tom}`}>{selo.texto}</span>}
      </header>

      {/* Os dados que identificam o registro, em destaque: a data em azul
          escuro e o tipo em petróleo. É por eles que um registro é procurado
          numa lista de dez anos. */}
      <div className="ficha-reg-destaques">
        <span className="ficha-reg-dado">
          <small>Data da ocorrência</small>
          <b className="ficha-reg-data">{dataParaBR(dados.data) || '—'}</b>
        </span>
        <span className="ficha-reg-dado">
          <small>Tipo</small>
          <b className="ficha-reg-tipo">{dados.tipo || '—'}</b>
        </span>
        {dados.relatorioCodigo && (
          <span className="ficha-reg-dado">
            <small>Relatório</small>
            <b className="ficha-reg-rel">{dados.relatorioCodigo}</b>
          </span>
        )}
      </div>

      <section className="ficha-reg-bloco">
        <h4>{tituloTermo(dados.tipo)}</h4>
        {/* `pre-wrap`: o usuário pode ter quebrado linhas no termo, e a ficha
            respeita — senão ele vê um parágrafo que não escreveu. */}
        <p className="ficha-reg-termo">{dados.termo || '—'}</p>
      </section>

      <section className="ficha-reg-bloco">
        <h4>Descrição do registro</h4>
        <p className="ficha-reg-desc">{descricao || '—'}</p>
      </section>

      {(dados.quemRealizou || dados.assinante) && (
        <footer className="ficha-reg-pes">
          {dados.quemRealizou && (
            <span>
              <small>Executado por</small>
              {dados.quemRealizou}
            </span>
          )}
          {dados.assinante && (
            <span>
              <small>Responsável técnico</small>
              {dados.assinante}
            </span>
          )}
        </footer>
      )}

      <p className="ficha-reg-nota">
        Esta é a ficha do registro no sistema. A folha para imprimir e colar no livro físico é
        gerada a partir dela.
      </p>
    </article>
  );
}
