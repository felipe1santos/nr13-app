import { useState } from 'react';
import { Icone } from '../../components/Icone';
import { textoDoErro } from '../../services/textoDoErro';
import {
  comPredefinicao,
  gravarPredefinicoes,
  resumoPredefinicao,
  semPredefinicao,
  type ItemRecomendacao,
  type PredefinicaoRecomendacoes,
} from './predefinicoes';

/**
 * A BIBLIOTECA DE RECOMENDAÇÕES da empresa.
 *
 * ## Por que ver antes de aplicar
 *
 * Recomendação de segurança entra num documento assinado por engenheiro. O
 * modal mostra o texto INTEIRO de cada conjunto — não um rótulo — e só então
 * oferece "Usar neste relatório". Preencher sozinho, sem alguém ler, seria
 * transformar um catálogo de conveniência em afirmação técnica automática.
 *
 * ## O que ele NÃO faz
 *
 * Não altera nenhuma outra parte do documento e não escreve em cadastro
 * nenhum: aplicar produz overrides do relatório aberto, o mesmo caminho de
 * quem digita a recomendação na folha.
 */
export default function ModalPredefinicoes({
  lista,
  atuais,
  somenteLeitura,
  onFechar,
  onLista,
  onUsar,
}: {
  lista: PredefinicaoRecomendacoes[];
  /** As recomendações que o documento aberto tem AGORA — viram predefinição. */
  atuais: ItemRecomendacao[];
  somenteLeitura?: boolean;
  onFechar: () => void;
  onLista: (nova: PredefinicaoRecomendacoes[]) => void;
  onUsar: (p: PredefinicaoRecomendacoes) => Promise<void> | void;
}) {
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(lista[0]?.id ?? null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

  async function persistir(nova: PredefinicaoRecomendacoes[]) {
    setOcupado(true);
    setErro('');
    try {
      await gravarPredefinicoes(nova);
      onLista(nova);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar a predefinição.'));
    } finally {
      setOcupado(false);
    }
  }

  async function salvarAtuais() {
    const limpo = nome.trim();
    if (!limpo || atuais.length === 0) return;
    await persistir(
      comPredefinicao(lista, {
        id: `pref-${Date.now()}`,
        nome: limpo,
        criadoEm: new Date().toISOString(),
        itens: atuais,
      }),
    );
    setNome('');
  }

  async function usar(p: PredefinicaoRecomendacoes) {
    setOcupado(true);
    setErro('');
    try {
      await onUsar(p);
      onFechar();
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível aplicar a predefinição.'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-content predef-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Recomendações predefinidas</h3>
          <button type="button" className="btn-close-modal" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="predef-ajuda">
          Conjuntos de recomendações guardados para a sua empresa. Ao aplicar, eles substituem as
          quatro linhas da tabela <strong>Recomendações de Segurança</strong> deste relatório — só
          deste. Nenhum cadastro do sistema é alterado.
        </p>

        <div className="modal-body predef-corpo">
          {lista.length === 0 ? (
            <p className="predef-vazio">
              Nenhuma predefinição salva ainda. Escreva as recomendações no documento e guarde-as
              aqui com um nome — elas ficam disponíveis em todos os próximos relatórios.
            </p>
          ) : (
            <ul className="predef-lista">
              {lista.map((p) => {
                const expandida = aberta === p.id;
                return (
                  <li key={p.id} className={`predef-item${expandida ? ' is-aberta' : ''}`}>
                    <button
                      type="button"
                      className="predef-cabeca"
                      onClick={() => setAberta(expandida ? null : p.id)}
                      aria-expanded={expandida}
                    >
                      <span className="predef-nome">{p.nome}</span>
                      <span className="predef-resumo">{resumoPredefinicao(p)}</span>
                      <Icone nome={expandida ? 'chevup' : 'chevdown'} tam={13} />
                    </button>

                    {expandida && (
                      <div className="predef-conteudo">
                        <ol className="predef-itens">
                          {p.itens.map((it, i) => (
                            <li key={i}>
                              <span className="predef-texto">{it.texto}</span>
                              <span className="predef-prazo">{it.prazo || 'sem prazo'}</span>
                            </li>
                          ))}
                        </ol>
                        <div className="predef-acoes-item">
                          {!somenteLeitura && (
                            <button
                              type="button"
                              className="btn-primario"
                              disabled={ocupado}
                              onClick={() => void usar(p)}
                            >
                              Usar neste relatório
                            </button>
                          )}
                          {confirmandoExclusao === p.id ? (
                            <>
                              <span className="predef-confirma">Excluir esta predefinição?</span>
                              <button
                                type="button"
                                className="btn-secundario cor-doc-forte"
                                disabled={ocupado}
                                onClick={() => void persistir(semPredefinicao(lista, p.id)).then(() => setConfirmandoExclusao(null))}
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                className="btn-secundario"
                                onClick={() => setConfirmandoExclusao(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-secundario"
                              disabled={ocupado}
                              onClick={() => setConfirmandoExclusao(p.id)}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!somenteLeitura && (
          <div className="predef-guardar">
            <span className="predef-guardar-rot">
              Guardar as recomendações deste relatório
              <em>
                {atuais.length === 0
                  ? ' — escreva ao menos uma recomendação no documento para poder guardar.'
                  : ` — ${atuais.length} linha${atuais.length > 1 ? 's' : ''} preenchida${atuais.length > 1 ? 's' : ''}.`}
              </em>
            </span>
            <div className="predef-guardar-linha">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do conjunto (ex.: Vaso de ar comprimido — padrão)"
                disabled={ocupado || atuais.length === 0}
              />
              <button
                type="button"
                className="btn-secundario"
                disabled={ocupado || atuais.length === 0 || nome.trim() === ''}
                onClick={() => void salvarAtuais()}
              >
                Guardar
              </button>
            </div>
          </div>
        )}

        {erro && <p className="med-erro">{erro}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secundario" onClick={onFechar} disabled={ocupado}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
