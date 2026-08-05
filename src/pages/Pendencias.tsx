import { useState } from 'react';
import { listarFila, tentarNovamente, type ItemFila } from '../services/sync';
import { rotuloEstado, pendenciaVelha } from '../services/selo';
import { diagnosticarPerda } from '../services/manifesto';
import { erroDoManifesto } from '../services/manifesto';

/**
 * Tela de Pendências.
 *
 * Toda falha aparece aqui com texto compreensível E com o detalhe técnico
 * disponível — nunca a mensagem crua do Postgres na cara do usuário, nunca o
 * erro escondido. É daqui que sai o "Tentar de novo", que REUSA o `mutationId`:
 * reenfileirar criaria uma segunda mutação para a mesma alteração.
 */
export default function Pendencias() {
  const [itens, setItens] = useState<ItemFila[]>(() => listarFila());
  const [ocupado, setOcupado] = useState(false);
  const perda = diagnosticarPerda(listarFila(), true);
  const erroManifesto = erroDoManifesto();

  const recarregar = () => setItens(listarFila());

  const retentar = async (mutationId: string) => {
    setOcupado(true);
    try {
      await tentarNovamente(mutationId);
    } finally {
      setOcupado(false);
      recarregar();
    }
  };

  const retentarTodas = async () => {
    setOcupado(true);
    try {
      for (const i of itens) await tentarNovamente(i.mutationId);
    } finally {
      setOcupado(false);
      recarregar();
    }
  };

  return (
    <section className="pendencias">
      <header className="pendencias__cabecalho">
        <h1>Pendências de sincronização</h1>
        <p>Alterações que ainda não chegaram ao servidor.</p>
      </header>

      {perda.tipo === 'despejo_detectado' && (
        <div className="aviso aviso--erro">
          <strong>
            O navegador apagou {perda.perdidos.length} alteração(ões) que ainda não tinham subido.
          </strong>
          <ul>
            {perda.perdidos.map((p) => (
              <li key={p.mutationId}>
                {p.chave} — {p.criadoEm}
              </li>
            ))}
          </ul>
        </div>
      )}

      {perda.tipo === 'estado_zerado' && (
        <div className="aviso aviso--erro">
          Se havia alterações não sincronizadas neste aparelho, elas foram perdidas. Não é possível
          listar quais: o registro foi apagado junto.
        </div>
      )}

      {perda.tipo === 'manifesto_invalido' && (
        <div className="aviso aviso--alerta">
          O registro de pendências deste aparelho está ilegível. Não dá para afirmar que nada se
          perdeu.
        </div>
      )}

      {erroManifesto && (
        <div className="aviso aviso--alerta">
          Não foi possível atualizar o registro local de pendências.
          <details>
            <summary>Detalhes técnicos</summary>
            <code>{erroManifesto.detalhe.mensagemOriginal}</code>
          </details>
        </div>
      )}

      {itens.length === 0 && <p className="pendencias__vazio">Tudo sincronizado.</p>}

      {itens.map((item) => (
        <article key={item.mutationId} className={`pendencia pendencia--${item.estado}`}>
          <h2 className="pendencia__chave">{item.chave}</h2>
          <p className="pendencia__estado">{rotuloEstado(item.estado)}</p>

          <p className="pendencia__titulo">{item.erro?.titulo ?? 'Aguardando envio'}</p>
          <p className="pendencia__explicacao">
            {item.erro?.explicacao ?? 'Na fila para subir assim que houver conexão.'}
          </p>

          <p className="pendencia__quando">
            {item.criadoEm} · {item.tentativas} tentativa(s)
            {pendenciaVelha(item.criadoEm) && (
              <strong className="pendencia__velha"> · pendente há mais de uma hora</strong>
            )}
          </p>

          <button type="button" disabled={ocupado} onClick={() => void retentar(item.mutationId)}>
            Tentar de novo
          </button>

          {item.erro && (
            <details className="pendencia__detalhes">
              <summary>Detalhes técnicos</summary>
              <dl>
                <dt>Código</dt>
                <dd>{item.erro.detalhe.codigo}</dd>
                <dt>Mensagem original</dt>
                <dd>
                  <code>{item.erro.detalhe.mensagemOriginal}</code>
                </dd>
                <dt>Identificador</dt>
                <dd>{item.erro.detalhe.mutationId}</dd>
                <dt>Aparelho</dt>
                <dd>{item.erro.detalhe.dispositivo}</dd>
                <dt>Quando</dt>
                <dd>{item.erro.detalhe.quando}</dd>
              </dl>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(JSON.stringify(item.erro!.detalhe, null, 2))
                }
              >
                Copiar para o suporte
              </button>
            </details>
          )}
        </article>
      ))}

      {itens.length > 0 && (
        <button type="button" disabled={ocupado} onClick={() => void retentarTodas()}>
          Tentar todas
        </button>
      )}
    </section>
  );
}
