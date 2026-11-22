/**
 * "Novo registro" — o modal que cria (ou continua) um registro do Livro de
 * Registro de Segurança.
 *
 * ## O desenho (22/11/2026)
 *
 * Uma coluna só: o formulário, em três grupos (Ocorrência, Termo,
 * Responsáveis), com o cabeçalho e o rodapé FIXOS e só o corpo rolando. A
 * prévia viva e o "Como funciona" deixaram de dividir a largura com o
 * formulário: cada um abre numa camada POR CIMA (`CamadaModal`) — "Ver prévia"
 * no rodapé, "Como funciona" num botão discreto do cabeçalho.
 *
 * Era assim que o modal "esticava": a prévia morava numa coluna flex de 340px
 * com `min-width: auto`, e um texto longo sem espaço (ou uma URL) colado no
 * termo empurrava a coluna para a direita e espremia o formulário. A causa e a
 * trava estão em `modalNovoRegistro.css` e em `modalRegistroLargura.test.ts`.
 *
 * ## O termo é EDITÁVEL
 *
 * O texto do Termo nasce com a sugestão na redação da folha (ver
 * `termoRegistro.ts`) e o que o usuário escrever vence.
 *
 * ## O que ele NÃO mudou
 *
 * Nenhuma regra. O estado do formulário continua na página, `salvarOcorrencia`
 * continua gravando RASCUNHO (`nr13_livro_rascunho_<TAG>`), e só o trancamento
 * — que acontece na tela, não aqui — torna o registro oficial e imutável.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '../../components/Icone';
import CamadaModal from './CamadaModal';
import ModalComoFunciona from './ModalComoFunciona';
import PopoverAjuda from './PopoverAjuda';
import PreviaRegistro from './PreviaRegistro';
import SeletorOcorrencia from './SeletorOcorrencia';
import { tituloTermo, type DadosPrevia } from './termoRegistro';
import type { FormOcorrencia } from './formRegistro';
import { TIPOS_OCORRENCIA } from './formRegistro';
import {
  MOTIVOS_ABERTURA,
  TIPO_ABERTURA,
  descricaoDoMotivo,
  ehAbertura,
  podeTrocarDescricao,
  type DadosAberturaEquipamento,
  type MotivoAbertura,
} from './aberturaLivro';
import { sugestaoDoFormulario } from './sugestaoTermo';
import './modalNovoRegistro.css';

export interface OpcaoAssinante {
  id: string;
  rotulo: string;
}

export default function ModalNovoRegistro({
  tag,
  equipamento,
  empresa,
  modo,
  form,
  aoMudarForm,
  assinantes,
  avisoRetificacao,
  erro,
  abaInicial = 'formulario',
  abertura,
  aoSalvar,
  aoFechar,
}: {
  tag: string;
  /** Nome do equipamento, para o cabeçalho da prévia. */
  equipamento: string;
  /** Razão social da executante — é ela que o Termo cita. */
  empresa: string;
  modo: 'novo' | 'editar' | 'retificar';
  form: FormOcorrencia;
  aoMudarForm: (f: FormOcorrencia) => void;
  assinantes: OpcaoAssinante[];
  /** Aviso do registro que está sendo retificado (a página monta o texto). */
  avisoRetificacao?: string;
  erro: string;
  /**
   * `formulario` (padrão) ou `previa` — o OLHO da lista abre o rascunho já com
   * a prévia por cima (o usuário quer LER), o lápis abre no formulário.
   */
  abaInicial?: 'formulario' | 'previa';
  /**
   * Os dados que o Termo de Abertura cita (equipamento, cliente, folhas). A
   * página os lê uma vez do cache; sem eles, a sugestão os lê sozinha.
   */
  abertura?: DadosAberturaEquipamento | null;
  aoSalvar: () => void;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const idTitulo = useId();
  const [vendoPrevia, setVendoPrevia] = useState(abaInicial === 'previa');
  const [vendoAjuda, setVendoAjuda] = useState(false);

  const ehAberturaLivro = ehAbertura(form.tipoOcorrencia);
  const titulo =
    modo === 'retificar'
      ? 'Registro de retificação'
      : modo === 'editar'
        ? 'Editar rascunho'
        : ehAberturaLivro
          ? 'Abrir livro de registro'
          : 'Novo registro';

  // Foco na DATA: é o primeiro campo obrigatório. Com a prévia aberta, o foco
  // é dela (`CamadaModal`), e volta para cá quando ela fecha.
  useEffect(() => {
    if (abaInicial !== 'previa') primeiro.current?.focus();
  }, [abaInicial]);

  /*
   * SAIR SEM SALVAR PERGUNTA ANTES.
   *
   * O estado da abertura fica congelado numa ref — e não em `useState` — porque
   * ele não pode mudar quando o formulário muda; se mudasse, nada seria
   * "alteração". Comparar por JSON basta: são sete campos de texto, e a
   * pergunta é "mudou alguma coisa?", não "o que mudou".
   */
  const inicial = useRef(JSON.stringify(form));
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const alterado = JSON.stringify(form) !== inicial.current;

  function tentarFechar() {
    if (alterado) setConfirmandoSaida(true);
    else aoFechar();
  }

  /* Com uma camada por cima, o foco é DELA: a armadilha daqui se desliga. */
  const camadaAberta = useRef(false);
  useEffect(() => {
    camadaAberta.current = vendoPrevia || vendoAjuda;
  }, [vendoPrevia, vendoAjuda]);

  /* Ao fechar uma camada o foco volta para DENTRO deste modal — quando a prévia
     abriu junto com ele (o olho da lista), quem a abriu é a lista, lá atrás. */
  const btnPrevia = useRef<HTMLButtonElement>(null);
  const btnAjuda = useRef<HTMLButtonElement>(null);
  function fecharCamada(qual: 'previa' | 'ajuda') {
    if (qual === 'previa') setVendoPrevia(false);
    else setVendoAjuda(false);
    setTimeout(() => (qual === 'previa' ? btnPrevia : btnAjuda).current?.focus(), 0);
  }

  /*
   * ESC NÃO FECHA ESTE MODAL (07/09/2026).
   *
   * Ele é a exceção deliberada da sessão: o formulário pode ter dez minutos de
   * texto escrito à mão, e ESC — como o clique no fundo — é o gesto que se dá
   * sem querer. O foco preso e o `aria-modal` continuam; o único caminho de
   * saída é o X, que pergunta antes de descartar.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !caixa.current || camadaAberta.current) return;
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
  }, []);

  const set = <K extends keyof FormOcorrencia>(campo: K, v: FormOcorrencia[K]) =>
    aoMudarForm({ ...form, [campo]: v });

  /*
   * O tipo GRAVADO pode não estar na lista de ocorrências manuais: um rascunho
   * antigo pode trazer "Inspeção Periódica" (do pré-preenchimento por
   * relatório, que saiu em 21/11/2026). Sem esta linha o campo recebia um valor
   * sem opção correspondente e exibia VAZIO — o usuário via o obrigatório em
   * branco, e o "Salvar" recusava (medido em produção em 07/09/2026).
   *
   * A ABERTURA DE LIVRO entra no fim da lista: o botão "Abrir livro" da tela é
   * o caminho principal, e aqui ela continua escolhível.
   */
  const conhecidos = [...TIPOS_OCORRENCIA, TIPO_ABERTURA];
  const tipos = TIPOS_OCORRENCIA.includes(form.tipoOcorrencia) || !form.tipoOcorrencia || ehAberturaLivro
    ? conhecidos
    : [form.tipoOcorrencia, ...TIPOS_OCORRENCIA, TIPO_ABERTURA];

  /** Trocar o motivo reescreve o "o que foi feito" só se ele ainda for a frase de um motivo. */
  function escolherMotivo(m: MotivoAbertura) {
    aoMudarForm({
      ...form,
      motivoAbertura: m,
      oQueFoiFeito: podeTrocarDescricao(form.oQueFoiFeito) ? descricaoDoMotivo(m) : form.oQueFoiFeito,
    });
  }

  /*
   * O termo SUGERIDO acompanha os campos enquanto o usuário não escreve o dele.
   * No instante em que ele digita, `form.termoTexto` passa a existir e vence —
   * mudar a data depois disso não pode reescrever o texto de alguém.
   */
  const sugestao = useMemo(
    () => sugestaoDoFormulario(form, { tag, empresa, abertura }),
    [form, empresa, tag, abertura],
  );
  /*
   * A REGRA DO TERMO, em uma linha: `null` é "ainda não editado" — só aí a
   * sugestão manda. Qualquer string do usuário vence, INCLUSIVE a vazia.
   *
   * Era `form.termoTexto.trim() ? form.termoTexto : sugestao`, e o defeito
   * saía direto dali: apagar a última letra devolvia `''`, o ternário escolhia
   * a sugestão e o `value` do textarea reescrevia a frase inteira. O usuário
   * não conseguia esvaziar o campo — nem com Ctrl+A e Delete.
   */
  const editouTermo = form.termoTexto !== null;
  const termoEfetivo = editouTermo ? (form.termoTexto as string) : sugestao;

  const previa: DadosPrevia = {
    tag,
    equipamento,
    empresa,
    data: form.data,
    tipo: form.tipoOcorrencia,
    oQueFoiFeito: form.oQueFoiFeito,
    descricao: form.descricao,
    quemRealizou: form.quemRealizou,
    assinante: assinantes.find((a) => a.id === form.phId)?.rotulo ?? '',
    termo: termoEfetivo,
    relatorioCodigo: form.relatorioCodigo,
  };

  return createPortal(
    <>
      {/* O CLIQUE NO FUNDO NÃO FECHA. É o gesto acidental mais comum, e aqui ele
          descartaria um formulário inteiro. Sem `onClick` no overlay: não há o
          que dar errado. */}
      <div className="fj-modal-overlay reg-modal-overlay">
        <div
          className="fj-modal-box reg-modal"
          ref={caixa}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
        >
          <div className="fj-modal-head reg-modal-head">
            <div className="reg-modal-titulos">
              <div className="fj-eyebrow">Livro de Registro · {tag}</div>
              <h2 id={idTitulo}>{titulo}</h2>
            </div>
            {/* "Como funciona" é um atalho discreto, não uma aba: quem já sabe
                não precisa vê-lo; quem não sabe acha no canto de sempre. */}
            <button ref={btnAjuda} type="button" className="reg-modal-comofunciona" onClick={() => setVendoAjuda(true)}>
              <Icone nome="interrogacao" tam={14} />
              <span>Como funciona</span>
            </button>
            <button type="button" className="fj-modal-close" onClick={tentarFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          </div>

          <div className="reg-modal-corpo">
            <div className="reg-modal-form">
              {avisoRetificacao && (
                <p className="reg-modal-aviso" role="status">
                  <Icone nome="alerttri" tam={13} />
                  <span>{avisoRetificacao}</span>
                </p>
              )}

              <section className="reg-modal-grupo">
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
                    <SeletorOcorrencia
                      id="oc-tipo"
                      valor={form.tipoOcorrencia}
                      opcoes={tipos}
                      aoMudar={(v) => set('tipoOcorrencia', v)}
                    />
                  </div>
                </div>

                {ehAberturaLivro && (
                  <div className="fj-field reg-motivo">
                    <span className="reg-motivo-topo" id="oc-motivo-rot">
                      Motivo da abertura <em>obrigatório</em>
                      <PopoverAjuda rotulo="O que é abrir o livro">
                        <b>Lavra o Termo de Abertura de um livro novo.</b>
                        <span>
                          Serve a qualquer momento — também para equipamento em operação que perdeu o
                          livro original. O termo entra no livro como um registro: nasce rascunho e,
                          trancado, é lacrado no fim do livro. Nenhum registro anterior é apagado.
                        </span>
                      </PopoverAjuda>
                    </span>
                    <div className="reg-motivo-opcoes" role="radiogroup" aria-labelledby="oc-motivo-rot">
                      {MOTIVOS_ABERTURA.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={form.motivoAbertura === m.id}
                          className={`reg-motivo-opcao${form.motivoAbertura === m.id ? ' ativa' : ''}`}
                          onClick={() => escolherMotivo(m.id)}
                        >
                          <b>{m.rotulo}</b>
                          <small>{m.apoio}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                    rows={3}
                    placeholder="Detalhes da ocorrência, peças substituídas, condições encontradas…"
                    value={form.descricao}
                    onChange={(e) => set('descricao', e.target.value)}
                  />
                </div>
              </section>

              {/* O TERMO, editável. A sugestão é ponto de partida; o texto do
                  usuário vence e é o que fica gravado no registro. */}
              <section className="reg-modal-grupo">
                <h3>{tituloTermo(form.tipoOcorrencia)}</h3>
                <div className="fj-field">
                  <label htmlFor="oc-termo">
                    Texto que sai no livro
                    {/* "Restaurar" devolve o campo ao estado INTOCADO (`null`) —
                        é o único caminho de volta para a sugestão, e ele é do
                        usuário. Aparece assim que ele edita, mesmo que tenha
                        apagado tudo: é justamente aí que o botão serve. */}
                    {editouTermo && (
                      <button
                        type="button"
                        className="reg-modal-restaurar"
                        onClick={() => set('termoTexto', null)}
                      >
                        restaurar sugestão
                      </button>
                    )}
                  </label>
                  <textarea
                    id="oc-termo"
                    rows={5}
                    value={termoEfetivo}
                    onChange={(e) => set('termoTexto', e.target.value)}
                  />
                  <small>
                    Escreva do seu jeito: o texto acima é só uma sugestão, e o que ficar aqui é o que
                    vai impresso no livro.
                  </small>
                </div>
              </section>

              <section className="reg-modal-grupo">
                <h3>Responsáveis</h3>
                <div className="reg-modal-linha">
                  <div className="fj-field">
                    <label htmlFor="oc-quem">Quem realizou</label>
                    <input
                      id="oc-quem"
                      type="text"
                      className={form.quemRealizou.trim() ? 'preenchido' : undefined}
                      placeholder="Empresa ou técnico executante"
                      value={form.quemRealizou}
                      onChange={(e) => set('quemRealizou', e.target.value)}
                    />
                  </div>
                  <div className="fj-field">
                    <label htmlFor="oc-ph">Responsável técnico</label>
                    <select
                      id="oc-ph"
                      className={form.phId ? 'preenchido' : undefined}
                      value={form.phId}
                      onChange={(e) => set('phId', e.target.value)}
                    >
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
              </section>

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
              {/* "Cancelar" saiu: dois caminhos de descarte é um a mais do que o
                  necessário, e o do rodapé ficava ao lado do que SALVA. Quem
                  quiser sair usa o X, que pergunta. */}
              <button ref={btnPrevia} type="button" className="fj-btn fj-btn-ghost reg-modal-ver-previa" onClick={() => setVendoPrevia(true)}>
                <Icone nome="eye" tam={13} /> Ver prévia
              </button>
              <button type="button" className="fj-btn fj-btn-primary" onClick={aoSalvar}>
                <Icone nome="check" tam={13} /> Salvar rascunho
              </button>
            </div>
          </div>

          {/* A confirmação de saída, DENTRO da caixa: ela pertence a este modal,
              e um segundo overlay por cima do primeiro escureceria a tela duas
              vezes. Nada de `window.confirm` — o sistema tem o seu desenho. */}
          {confirmandoSaida && (
            <div className="reg-modal-descarte" role="alertdialog" aria-label="Alterações não salvas">
              <div className="reg-modal-descarte-caixa">
                <strong>Há alterações ainda não salvas.</strong>
                <p>Fechar agora descarta o que você escreveu neste registro.</p>
                <div className="reg-modal-descarte-btns">
                  <button
                    type="button"
                    className="fj-btn fj-btn-primary"
                    onClick={() => setConfirmandoSaida(false)}
                  >
                    Continuar editando
                  </button>
                  <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
                    Descartar e fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A PRÉVIA, por cima: é a ficha do registro montada do que está no
          formulário agora — nada é gravado ao abri-la. */}
      {vendoPrevia && (
        <CamadaModal
          eyebrow={`Prévia · ${tag}`}
          titulo="Como o registro vai ficar"
          aoFechar={() => fecharCamada('previa')}
          className="reg-camada-previa"
          rodape={
            <>
              <span className="reg-camada-dica">Ainda é rascunho: nada foi salvo ao abrir a prévia.</span>
              <div className="reg-camada-btns">
                <button type="button" className="fj-btn fj-btn-ghost" onClick={() => fecharCamada('previa')}>
                  <Icone nome="pencil" tam={13} /> Voltar e editar
                </button>
                <button
                  type="button"
                  className="fj-btn fj-btn-primary"
                  onClick={() => {
                    setVendoPrevia(false);
                    aoSalvar();
                  }}
                >
                  <Icone nome="check" tam={13} /> Salvar rascunho
                </button>
              </div>
            </>
          }
        >
          <PreviaRegistro dados={previa} selo={{ texto: 'Rascunho', tom: 'rascunho' }} />
        </CamadaModal>
      )}

      {vendoAjuda && <ModalComoFunciona aoFechar={() => fecharCamada('ajuda')} />}
    </>,
    document.body,
  );
}
