import { useState } from 'react';
import { listarFila, tentarNovamente, type ItemFila } from '../services/sync';
import { rotuloEstado, pendenciaVelha, resumoSelo } from '../services/selo';
import { diagnosticarPerda } from '../services/manifesto';
import { erroDoManifesto } from '../services/manifesto';
import './pendencias.css';

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

  // Mesma função que alimenta o selo da topbar — a contagem aqui não pode
  // discordar da que o usuário viu antes de clicar.
  const resumo = resumoSelo(itens);

  return (
    <section className="pendencias">
      <header className={`pendencias-hero nivel-${resumo.nivel}`}>
        <div className="pendencias-hero-txt">
          <span className="pendencias-hero-eyebrow">Sincronização</span>
          <h1>{itens.length === 0 ? 'Tudo salvo na nuvem' : resumo.rotulo}</h1>
          <p>
            {itens.length === 0
              ? 'Nada neste aparelho está esperando para subir. Tudo o que você preencheu já está no servidor.'
              : 'Estas alterações estão guardadas no aparelho e ainda não chegaram ao servidor. Elas não se perdem ao fechar o app.'}
          </p>
        </div>
        <div className="pendencias-hero-selos">
          <div className="pend-chip">
            <span className="n">{resumo.pendentes}</span>
            na fila
          </div>
          <div className={`pend-chip${resumo.falhas > 0 ? ' crit' : ''}`}>
            <span className="n">{resumo.falhas}</span>
            {resumo.falhas === 1 ? 'com falha' : 'com falhas'}
          </div>
        </div>
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

      <footer className="pendencias-rodape">
        <img src="/logo-marca.png" alt="" aria-hidden="true" />
        <span>Sistema NR-13 · o que você preenche fica no aparelho até o servidor confirmar</span>
      </footer>
    </section>
  );
}
