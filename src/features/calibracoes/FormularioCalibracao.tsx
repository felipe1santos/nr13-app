/**
 * Reestruturação de Calibrações (19/09/2026) · o FORMULÁRIO de uma calibração
 * interna, dentro da `JanelaCalibracao` (modal ⇄ tela cheia). Substitui a
 * página inteira que o "Calibrar" abria.
 *
 * O que o usuário DIGITA aqui é só o que muda a cada calibração: datas,
 * condições ambientais, resultados, conclusão. Ele ESCOLHE o padrão e o
 * responsável. Todo o resto é resumo somente leitura:
 *
 *   - ITEM CALIBRADO ← cadastro do componente ("Editar componente" abre o
 *     cadastro mestre; não há mais ajuste silencioso só neste certificado);
 *   - PADRÃO UTILIZADO ← cadastro de Certificados (série, certificado e
 *     validade derivados);
 *   - CERTIFICADO DESTA CALIBRAÇÃO ← nº gerado; data de emissão na emissão.
 */
import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { mascararData } from '../../services/mascaras';
import ModalComponente from './ModalComponente';
import ModalResultados from './ModalResultados';
import JanelaCalibracao from './JanelaCalibracao';
import type { ComponenteCal, LoteCal } from './componentesService';
import { aplicarComponente, faltasDoForm, type FormDados } from './formCalibracao';
import { definicaoDe } from './instrumentos';
import { dataDoLote } from './lote';
import {
  padroesCompativeis,
  padraoPorId,
  situacaoValidade,
  snapshotPadrao,
  type SituacaoValidade,
} from './padraoCalibracao';
import { motivoPadrao, proximaCalibracao } from './preencherCalibracao';
import { listarResponsaveis } from './responsavelCalibracao';
import { maiorErro, paraLinhas, paraPontos, resumoPontos, type PontoCal } from './resultadosCalibracao';
import { resolverPdf } from '../relatorios/rastreabilidadeService';
import './janelaCalibracao.css';

const ROTULO_VALIDADE: Record<SituacaoValidade, string> = {
  valido: 'Certificado válido',
  vence_em_breve: 'Vence em até 30 dias',
  vencido: 'Certificado VENCIDO',
  sem_validade: 'Validade não informada',
};

export type AcaoSalvar = 'rascunho' | 'emitir';

export default function FormularioCalibracao({
  tag,
  titulo,
  inicial,
  componente,
  lotes,
  loteInicial,
  aoSalvar,
  aoComponenteSalvo,
  aoFechar,
}: {
  tag: string;
  titulo: string;
  inicial: FormDados;
  componente: ComponenteCal | null;
  /** Lotes em que esta calibração pode entrar (opcional — a calibração avulsa é válida). */
  lotes: LoteCal[];
  loteInicial: string;
  /** Grava (e, com `emitir`, emite). Lança com a mensagem para a tela. */
  aoSalvar: (form: FormDados, loteId: string, acao: AcaoSalvar) => Promise<void>;
  aoComponenteSalvo?: (c: ComponenteCal) => Promise<void> | void;
  aoFechar: () => void;
}) {
  const [form, setForm] = useState<FormDados>(inicial);
  const [loteId, setLoteId] = useState(loteInicial);
  const [comp, setComp] = useState<ComponenteCal | null>(componente);
  const [editandoComp, setEditandoComp] = useState(false);
  const [resultadosAbertos, setResultadosAbertos] = useState(false);
  const [padraoManual, setPadraoManual] = useState(!inicial.padraoId && !!inicial.padraoInst);
  const [ocupado, setOcupado] = useState<AcaoSalvar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);

  const sujo = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(inicial) || loteId !== loteInicial,
    [form, inicial, loteId, loteInicial],
  );
  const set = <K extends keyof FormDados>(k: K, v: FormDados[K]) => setForm((f) => ({ ...f, [k]: v }));

  const def = definicaoDe(form.tipo);
  const padroes = padroesCompativeis(form.tipo);
  const responsaveis = listarResponsaveis();
  const situacaoPadrao = form.padraoVal ? situacaoValidade(form.padraoVal) : null;
  const faltas = faltasDoForm(form);

  const pontos: PontoCal[] = paraPontos(form.crescente, form.decrescente);
  const resumo = resumoPontos(pontos);
  const pior = maiorErro(pontos);
  const psvFeitos = [form.pressaoAbertura, form.pressaoAjuste, form.fechamento].filter((v) => v.trim() !== '').length;

  function escolherPadrao(id: string) {
    const r = padroes.find((p) => p.id === id);
    setForm((f) =>
      r
        ? { ...f, ...snapshotPadrao(r) }
        : { ...f, padraoId: '', padraoInst: '', padraoSerie: '', padraoCert: '', padraoVal: '' },
    );
  }

  async function verCertificadoPadrao() {
    const r = padraoPorId(form.padraoId);
    if (!r) return;
    const dados = await resolverPdf(r);
    if (!dados) {
      setErro('O PDF do certificado do padrão não está disponível neste aparelho — precisa de conexão.');
      return;
    }
    const b64 = dados.includes(',') ? dados.slice(dados.indexOf(',') + 1) : dados;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bin], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function salvar(acao: AcaoSalvar) {
    setTentou(true);
    setErro(null);
    if (faltas.length) return;
    setOcupado(acao);
    try {
      await aoSalvar(form, loteId, acao);
    } catch (e) {
      const motivos = (e as { motivos?: string[] }).motivos;
      setErro(motivos?.join(' ') ?? (e instanceof Error ? e.message : 'Não foi possível salvar.'));
    } finally {
      setOcupado(null);
    }
  }

  const campo = (rotulo: string, k: keyof FormDados, extra: { data?: boolean; ph?: string } = {}) => (
    <label className="jcal-campo">
      <span>{rotulo}</span>
      <input
        value={form[k] as string}
        inputMode={extra.data ? 'numeric' : undefined}
        placeholder={extra.data ? 'DD/MM/AAAA' : extra.ph}
        onChange={(e) => set(k, (extra.data ? mascararData(e.target.value) : e.target.value) as never)}
      />
    </label>
  );

  return (
    <JanelaCalibracao
      eyebrow={titulo}
      titulo={`${def.rotulo} — ${form.nome || 'sem identificação'}`}
      subtitulo={<>Equipamento: <strong>{tag}</strong></>}
      sujo={sujo}
      ocupado={!!ocupado}
      aoFechar={aoFechar}
      rodape={
        <>
          {(erro || (tentou && faltas.length > 0)) && (
            <p className="jcal-rodape-aviso" role="alert">
              {erro ?? `Falta: ${faltas.join(', ')}.`}
            </p>
          )}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={!!ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-ghost${ocupado === 'rascunho' ? ' is-loading' : ''}`}
            onClick={() => void salvar('rascunho')}
            disabled={!!ocupado}
          >
            {ocupado === 'rascunho' ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-primary${ocupado === 'emitir' ? ' is-loading' : ''}`}
            onClick={() => void salvar('emitir')}
            disabled={!!ocupado}
          >
            <Icone nome="checkcircle" tam={14} /> {ocupado === 'emitir' ? 'Emitindo…' : 'Emitir certificado'}
          </button>
        </>
      }
    >
      {/* ── ITEM CALIBRADO (cadastro do componente) ──────────────────────── */}
      <section className="jcal-bloco derivado" aria-label="Item calibrado">
        <div className="jcal-bloco-titulo">
          Item calibrado <span className="fonte">do cadastro do componente</span>
        </div>
        <p className="jcal-resumo-nome">
          {def.rotulo.toUpperCase()} — {form.nome || '—'}
        </p>
        <dl className="jcal-dl">
          {[
            ['Fabricante', form.fabricante],
            ['Modelo', form.modelo],
            ['Série / lote', form.serie],
            ['Faixa / referência', form.referencia],
            ['Unidade', form.unidade],
            ['Cliente', form.empresa],
          ].map(([r, v]) => (
            <div key={r}>
              <dt>{r}</dt>
              <dd className={v ? undefined : 'vazio'}>{v || '—'}</dd>
            </div>
          ))}
        </dl>
        {comp && (
          <div className="jcal-acoes-linha">
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setEditandoComp(true)}>
              <Icone nome="pencil" tam={13} /> Editar componente
            </button>
          </div>
        )}
      </section>

      {/* ── CERTIFICADO DESTA CALIBRAÇÃO (gerado) ───────────────────────── */}
      <section className="jcal-bloco derivado" aria-label="Certificado desta calibração">
        <div className="jcal-bloco-titulo">
          Certificado desta calibração <span className="fonte">gerado pelo sistema</span>
        </div>
        <dl className="jcal-dl">
          <div>
            <dt>Nº do certificado</dt>
            <dd data-campo="numero-certificado">{form.numeroCertificado}</dd>
          </div>
          <div>
            <dt>Data de emissão</dt>
            <dd className="vazio">definida na emissão</dd>
          </div>
          {form.substitui && (
            <div>
              <dt>Revisão de</dt>
              <dd>{form.substitui}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── CALIBRAÇÃO (evento) ─────────────────────────────────────────── */}
      <section className="jcal-bloco" aria-label="Calibração">
        <div className="jcal-bloco-titulo">Calibração</div>
        <div className="jcal-campos">
          <label className="jcal-campo">
            <span>Data da calibração *</span>
            <input
              value={form.dataCalibracao}
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              onChange={(e) => {
                const v = mascararData(e.target.value);
                // A próxima acompanha a data enquanto o usuário não a mudou.
                setForm((f) => ({
                  ...f,
                  dataCalibracao: v,
                  dataProxCalibracao:
                    f.dataProxCalibracao === proximaCalibracao(f.dataCalibracao) || !f.dataProxCalibracao
                      ? proximaCalibracao(v) || f.dataProxCalibracao
                      : f.dataProxCalibracao,
                }));
              }}
            />
          </label>
          {campo('Próxima calibração *', 'dataProxCalibracao', { data: true })}
          {lotes.length > 0 && (
            <label className="jcal-campo">
              <span>Lote (rodada)</span>
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                <option value="">Sem lote — calibração avulsa</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.descricao} · {dataDoLote(l)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* ── PADRÃO UTILIZADO (cadastro de Certificados) ──────────────────── */}
      <section className="jcal-bloco" aria-label="Padrão utilizado">
        <div className="jcal-bloco-titulo">
          Padrão utilizado <span className="fonte">do cadastro de Certificados</span>
        </div>
        {!padraoManual && (
          <>
            {padroes.length > 0 && (
              <label className="jcal-campo">
                <span>Instrumento padrão</span>
                <select value={form.padraoId} onChange={(e) => escolherPadrao(e.target.value)}>
                  <option value="">Selecione o padrão…</option>
                  {padroes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {[p.nome, p.aparelho].filter(Boolean).join(' — ') || 'Padrão sem nome'}
                    </option>
                  ))}
                  {/* Rascunho antigo com padrão que já foi renovado: continua visível. */}
                  {form.padraoId && !padroes.some((p) => p.id === form.padraoId) && (
                    <option value={form.padraoId}>{form.padraoInst} (versão anterior)</option>
                  )}
                </select>
              </label>
            )}
            {form.padraoInst && (
              <dl className="jcal-dl" style={{ marginTop: 10 }} aria-label="Dados do padrão">
                <div>
                  <dt>Nº de série do padrão</dt>
                  <dd data-campo="padrao-serie">{form.padraoSerie || '—'}</dd>
                </div>
                <div>
                  <dt>Certificado do padrão</dt>
                  <dd data-campo="padrao-certificado">{form.padraoCert || '—'}</dd>
                </div>
                <div>
                  <dt>Validade do certificado</dt>
                  <dd data-campo="padrao-validade">
                    {form.padraoVal || '—'}{' '}
                    {situacaoPadrao && <span className={`jcal-selo ${situacaoPadrao}`}>{ROTULO_VALIDADE[situacaoPadrao]}</span>}
                  </dd>
                </div>
              </dl>
            )}
            {situacaoPadrao === 'vencido' && (
              <p className="jcal-aviso erro">
                <Icone nome="alerttri" tam={13} /> O certificado do padrão venceu em {form.padraoVal}. Renove-o em
                Certificados antes de emitir.
              </p>
            )}
            {form.padraoId && (
              <div className="jcal-acoes-linha">
                <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void verCertificadoPadrao()}>
                  <Icone nome="filetext" tam={13} /> Ver certificado do padrão
                </button>
              </div>
            )}
            {padroes.length === 0 && (
              <p className="jcal-aviso">
                <Icone nome="alerttri" tam={13} />
                <span>
                  Nenhum padrão de {form.tipo === 'psv' ? 'válvula' : 'manômetro'} cadastrado em{' '}
                  <strong>Certificados</strong>. Cadastre-o lá uma vez e ele passa a vir preenchido em
                  toda calibração.{' '}
                  <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setPadraoManual(true)}>
                    Informar manualmente
                  </button>
                </span>
              </p>
            )}
          </>
        )}
        {padraoManual && (
          <>
            <div className="jcal-campos">
              {campo('Instrumento padrão', 'padraoInst')}
              {campo('Nº de série', 'padraoSerie')}
              {campo('Nº do certificado do padrão', 'padraoCert')}
              {campo('Validade', 'padraoVal', { data: true })}
            </div>
            <p className="jcal-aviso">
              <Icone nome="alerttri" tam={13} /> Informado só nesta calibração — cadastre o padrão em
              Certificados para não redigitar.
            </p>
          </>
        )}
      </section>

      {/* ── CONDIÇÕES AMBIENTAIS ─────────────────────────────────────────── */}
      <section className="jcal-bloco" aria-label="Condições ambientais">
        <div className="jcal-bloco-titulo">Condições ambientais</div>
        <div className="jcal-campos">
          {campo('Temperatura', 'tempAr', { ph: 'Ex: 23 °C' })}
          {campo('Umidade relativa', 'umidade', { ph: 'Ex: 60 %' })}
          {campo('Local', 'local', { ph: 'Oficina, cliente…' })}
        </div>
      </section>

      {/* ── RESULTADOS ───────────────────────────────────────────────────── */}
      <section className="jcal-bloco" aria-label="Resultados obtidos">
        <div className="jcal-bloco-titulo">
          Resultados obtidos <span className="fonte">unidade: {form.unidade || '—'}</span>
        </div>
        <div className="jcal-resultados">
          <span>
            {form.tipo === 'manometro' ? (
              <>
                <strong>{resumo.feitos}</strong> de {resumo.total || 0} pontos medidos
                {pior !== null && ` · maior erro ${pior} ${form.unidade}`}
              </>
            ) : (
              <>
                <strong>{psvFeitos}</strong> de 3 pressões registradas
              </>
            )}
          </span>
          <button type="button" className="fj-btn fj-btn-primary" onClick={() => setResultadosAbertos(true)}>
            <Icone nome="sliders" tam={14} /> {resumo.feitos || psvFeitos ? 'Revisar resultados' : 'Preencher resultados'}
          </button>
        </div>
      </section>

      {/* ── CONCLUSÃO ────────────────────────────────────────────────────── */}
      <section className="jcal-bloco" aria-label="Conclusão técnica">
        <div className="jcal-bloco-titulo">Conclusão técnica</div>
        <div className="jcal-campos">
          <label className="jcal-campo">
            <span>Resultado</span>
            <select
              value={form.statusConclusao}
              onChange={(e) => {
                const st = e.target.value as FormDados['statusConclusao'];
                // O texto padrão só entra se o usuário não escreveu o dele.
                setForm((f) => ({
                  ...f,
                  statusConclusao: st,
                  textoMotivo:
                    !f.textoMotivo.trim() || f.textoMotivo === motivoPadrao(f.statusConclusao)
                      ? motivoPadrao(st)
                      : f.textoMotivo,
                }));
              }}
            >
              <option value="">Selecione…</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </label>
          <label className="jcal-campo">
            <span>Responsável pela calibração</span>
            <select value={form.responsavelId} onChange={(e) => set('responsavelId', e.target.value)}>
              <option value="">Selecione…</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                  {r.crea ? ` — ${r.crea}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="jcal-campo largo">
            <span>Texto da conclusão</span>
            <textarea value={form.textoMotivo} onChange={(e) => set('textoMotivo', e.target.value)} />
          </label>
        </div>
      </section>

      {resultadosAbertos && (
        <ModalResultados
          tipo={form.tipo}
          unidade={form.unidade}
          nome={form.nome}
          manometro={{
            pontos,
            incertezaC: form.incertezaC,
            coefC: form.coefC,
            incertezaD: form.incertezaD,
            coefD: form.coefD,
          }}
          psv={{
            pressaoAbertura: form.pressaoAbertura,
            pressaoAjuste: form.pressaoAjuste,
            fechamento: form.fechamento,
            incerteza: form.incerteza,
            coef: form.coef,
          }}
          aoConfirmar={(v) => {
            const linhas = paraLinhas(v.manometro.pontos);
            setForm((f) => ({
              ...f,
              crescente: linhas.crescente.map((l) => ({ vc: l.vc, vi: l.vi })),
              decrescente: linhas.decrescente.map((l) => ({ vc: l.vc, vi: l.vi })),
              incertezaC: v.manometro.incertezaC,
              coefC: v.manometro.coefC,
              incertezaD: v.manometro.incertezaD,
              coefD: v.manometro.coefD,
              pressaoAbertura: v.psv.pressaoAbertura,
              pressaoAjuste: v.psv.pressaoAjuste,
              fechamento: v.psv.fechamento,
              incerteza: v.psv.incerteza,
              coef: v.psv.coef,
            }));
            setResultadosAbertos(false);
          }}
          aoFechar={() => setResultadosAbertos(false)}
        />
      )}

      {editandoComp && comp && (
        <ModalComponente
          valor={{ ...comp }}
          aoFechar={() => setEditandoComp(false)}
          aoSalvar={async (c) => {
            await aoComponenteSalvo?.(c);
            setComp(c);
            setForm((f) => aplicarComponente(f, c));
            setEditandoComp(false);
          }}
        />
      )}
    </JanelaCalibracao>
  );
}
