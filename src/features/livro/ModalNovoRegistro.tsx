/**
 * "Novo registro" — o modal que cria (ou continua) um registro do Livro de
 * Registro de Segurança.
 *
 * ## Por que virou componente, e por que ganhou duas colunas
 *
 * Ele nasceu como um bloco inline dentro de `pages/LivroRegistro.tsx`: 120
 * linhas de JSX com estilo escrito à mão em `style={{...}}`, sete campos
 * empilhados em coluna única e um parágrafo cinza de três linhas no topo. O
 * usuário chegava nele sem saber o que ia acontecer com o que digitasse — se
 * já valia como documento oficial, se dava para continuar depois.
 *
 * A coluna da direita responde isso ANTES do primeiro campo: a ilustração
 * (inspetor, registros e o cadeado do lacre) mostra do que se trata, e três
 * passos curtos dizem o ciclo — rascunho → continuar depois → trancar. É o
 * mesmo padrão do "Como funciona" de Calibrações, aqui embutido no próprio
 * modal porque é uma explicação de UMA ação, não de uma sessão inteira.
 *
 * ## O que ele NÃO mudou
 *
 * Nenhuma regra. O estado do formulário continua na página, `salvarOcorrencia`
 * continua gravando RASCUNHO (`nr13_livro_rascunho_<TAG>`), e só o trancamento
 * — que acontece na tela, não aqui — torna o registro oficial e imutável.
 */
import { useEffect, useId, useRef } from 'react';
import { Icone } from '../../components/Icone';
import PopoverAjuda from './PopoverAjuda';
import type { FormOcorrencia } from './formRegistro';
import { TIPOS_OCORRENCIA } from './formRegistro';
import './modalNovoRegistro.css';

export interface OpcaoRelatorio {
  id: string;
  rotulo: string;
}

export interface OpcaoAssinante {
  id: string;
  rotulo: string;
}

export default function ModalNovoRegistro({
  tag,
  modo,
  form,
  aoMudarForm,
  relatorios,
  assinantes,
  avisoRetificacao,
  erro,
  aoPreencherDeRelatorio,
  aoSalvar,
  aoFechar,
}: {
  tag: string;
  modo: 'novo' | 'editar' | 'retificar';
  form: FormOcorrencia;
  aoMudarForm: (f: FormOcorrencia) => void;
  relatorios: OpcaoRelatorio[];
  assinantes: OpcaoAssinante[];
  /** Aviso do registro que está sendo retificado (a página monta o texto). */
  avisoRetificacao?: string;
  erro: string;
  aoPreencherDeRelatorio: (id: string) => void;
  aoSalvar: () => void;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const idTitulo = useId();

  const titulo =
    modo === 'retificar' ? 'Registro de retificação' : modo === 'editar' ? 'Editar rascunho' : 'Novo registro';

  // Foco na DATA: é o primeiro campo obrigatório, e o pré-preenchimento acima
  // dele é uma oferta, não o caminho principal.
  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const set = <K extends keyof FormOcorrencia>(campo: K, v: FormOcorrencia[K]) =>
    aoMudarForm({ ...form, [campo]: v });

  /*
   * O tipo que vem do PRÉ-PREENCHIMENTO não está na lista de ocorrências
   * manuais: um relatório traz "Inspeção Periódica", e a lista oferece
   * manutenção, reparo, substituição… Sem esta linha o `<select>` recebia um
   * valor sem opção correspondente e exibia VAZIO — o usuário via o campo
   * obrigatório em branco depois de pré-preencher, e o "Salvar" recusava
   * (medido em produção em 07/09/2026).
   */
  const tipos = TIPOS_OCORRENCIA.includes(form.tipoOcorrencia) || !form.tipoOcorrencia
    ? TIPOS_OCORRENCIA
    : [form.tipoOcorrencia, ...TIPOS_OCORRENCIA];

  return (
    <div
      className="fj-modal-overlay reg-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div
        className="fj-modal-box reg-modal"
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <div className="fj-modal-head reg-modal-head">
          <div>
            <div className="fj-eyebrow">Livro de Registro · {tag}</div>
            <h2 id={idTitulo}>{titulo}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="reg-modal-corpo">
          {/* Coluna de apoio. Vem antes no DOM (é o que se lê primeiro) e vai
              para a DIREITA no desktop pelo `order` — no celular ela volta a
              ser o topo, que é onde a ilustração ajuda. Não tem nada focável,
              então a ordem de tabulação não muda. */}
          <aside className="reg-modal-lado">
            <figure className="reg-modal-figura">
              <img
                src="/ilustracoes/registro-seguranca.webp"
                alt="Inspetor com o registro em mãos ao lado da pasta de registros do equipamento, protegida por um cadeado"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <ol className="reg-modal-passos">
              <li>
                <b>Descreva a ocorrência</b>
                <span>
                  A inspeção realizada, uma manutenção, um reparo ou a troca de um dispositivo de
                  segurança.
                </span>
              </li>
              <li>
                <b>Salve como rascunho</b>
                <span>
                  Fica só seu: não conta como registro, não vai para o Portal do Cliente e não entra
                  na folha impressa. Dá para fechar e continuar depois.
                </span>
              </li>
              <li>
                <b>Tranque quando estiver certo</b>
                <span>
                  O trancamento é feito na tela do equipamento. A partir dele o registro é oficial,
                  entra na numeração do livro e não pode mais ser editado nem apagado.
                </span>
              </li>
            </ol>
            <p className="reg-modal-nota">
              <Icone nome="cadeado" tam={13} />
              <span>
                Cada registro trancado é lacrado com o hash do próprio conteúdo e o elo do anterior —
                é o que prova que o livro não foi alterado depois.
              </span>
            </p>
          </aside>

          <div className="reg-modal-form">
            {/* Pré-preenchimento: oferta, não caminho obrigatório — por isso ele
                fica destacado num bloco à parte, acima dos campos. */}
            <div className="reg-modal-prefill">
              <div className="reg-modal-prefill-topo">
                <label htmlFor="oc-relatorio">Pré-preencher a partir de um relatório finalizado</label>
                <AjudaPrefill />
              </div>
              <select
                id="oc-relatorio"
                defaultValue=""
                onChange={(e) => aoPreencherDeRelatorio(e.target.value)}
              >
                <option value="">Preencher manualmente</option>
                {relatorios.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </div>

            {avisoRetificacao && (
              <p className="reg-modal-aviso" role="status">
                <Icone nome="alerttri" tam={13} />
                <span>{avisoRetificacao}</span>
              </p>
            )}

            <div className="reg-modal-grupo">
              <h3>Ocorrência</h3>
              <div className="reg-modal-linha">
                <div className="fj-field">
                  <label htmlFor="oc-data">
                    Data da ocorrência <em>obrigatório</em>
                  </label>
                  <input
                    id="oc-data"
                    ref={primeiro}
                    type="date"
                    value={form.data}
                    onChange={(e) => set('data', e.target.value)}
                  />
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-tipo">
                    Tipo de ocorrência <em>obrigatório</em>
                  </label>
                  <select
                    id="oc-tipo"
                    value={form.tipoOcorrencia}
                    onChange={(e) => set('tipoOcorrencia', e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {tipos.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="fj-field">
                <label htmlFor="oc-feito">
                  O que foi feito <em>obrigatório</em>
                </label>
                <input
                  id="oc-feito"
                  type="text"
                  placeholder="Ex.: Troca da válvula de segurança"
                  value={form.oQueFoiFeito}
                  onChange={(e) => set('oQueFoiFeito', e.target.value)}
                />
                <small>Uma linha, do jeito que deve aparecer no livro.</small>
              </div>

              <div className="fj-field">
                <label htmlFor="oc-desc">Descrição</label>
                <textarea
                  id="oc-desc"
                  rows={4}
                  placeholder="Detalhes da ocorrência, peças substituídas, condições encontradas…"
                  value={form.descricao}
                  onChange={(e) => set('descricao', e.target.value)}
                />
              </div>
            </div>

            <div className="reg-modal-grupo">
              <h3>Responsáveis</h3>
              <div className="reg-modal-linha">
                <div className="fj-field">
                  <label htmlFor="oc-quem">Quem realizou</label>
                  <input
                    id="oc-quem"
                    type="text"
                    placeholder="Empresa ou técnico executante"
                    value={form.quemRealizou}
                    onChange={(e) => set('quemRealizou', e.target.value)}
                  />
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-ph">Responsável que assina</label>
                  <select id="oc-ph" value={form.phId} onChange={(e) => set('phId', e.target.value)}>
                    <option value="">Sem assinatura</option>
                    {assinantes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                  <small>Pode ficar em branco no rascunho e ser escolhido antes de trancar.</small>
                </div>
              </div>
            </div>

            {erro && (
              <p className="reg-modal-erro" role="alert">
                <Icone nome="alerttri" tam={13} />
                <span>{erro}</span>
              </p>
            )}
          </div>
        </div>

        <div className="reg-modal-acoes">
          {/* O que acontece ao salvar, escrito ao lado do botão que salva. */}
          <span className="reg-modal-acoes-dica">Salva como rascunho — você tranca depois.</span>
          <div className="reg-modal-acoes-btns">
            <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="button" className="fj-btn fj-btn-primary" onClick={aoSalvar}>
              <Icone nome="check" tam={13} /> Salvar rascunho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * O "i" do pré-preenchimento.
 *
 * O texto descreve o que `preencherDeRelatorio` faz de verdade, conferido no
 * código: ele copia data, tipo, descrição e o responsável do relatório para os
 * campos — que continuam editáveis — e não grava nada sozinho. As duas recusas
 * possíveis (relatório ainda não baixado neste aparelho, relatório que já tem
 * registro trancado) aparecem como erro no próprio modal.
 *
 * O botão e o comportamento do ESC vivem em `PopoverAjuda`, compartilhado com
 * o "i" do título da sessão e o da cadeia de registros.
 */
function AjudaPrefill() {
  return (
    <PopoverAjuda rotulo="O que é pré-preencher">
      <b>Aproveita um relatório já emitido.</b>
      <span>
        Escolha um relatório finalizado deste equipamento e o sistema copia para os campos abaixo
        a data, o tipo, a descrição da inspeção e o responsável que assinou. Tudo continua
        editável: revise e complete antes de salvar.
      </span>
      <span>
        Prefere escrever do zero? Deixe em <b>Preencher manualmente</b>.
      </span>
    </PopoverAjuda>
  );
}
