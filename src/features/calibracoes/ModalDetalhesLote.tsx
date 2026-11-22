/**
 * O modal DETALHES DO LOTE — o que era o corpo do accordion.
 *
 * ## Por que saiu da página (11/09/2026)
 *
 * Cada lote aberto despejava todos os componentes do equipamento embaixo dele,
 * com foto, status e três botões. Dois lotes abertos com cinco acessórios = dez
 * blocos empilhados antes do próximo lote, e a página crescia sem limite.
 *
 * Aqui o conteúdo é o mesmo, mas sobre a lista: consultar um lote não faz a
 * lista perder o lugar, e fechar devolve exatamente o estado anterior.
 *
 * ## O visor de PDF vive DENTRO deste modal
 *
 * "Visualizar" abre a folha aqui mesmo, sobre o conteúdo, e voltar não fecha o
 * modal do lote (§22 da especificação). O certificado é renderizado do
 * registro — não existe artefato arquivado para calibração, ao contrário de
 * relatório e prontuário; ver a auditoria em
 * `docs/medicoes/2026-09-11-ux-calibracoes.md`.
 */
import { useEffect, useRef, useState } from 'react';
import FotoImg from '../../components/FotoImg';
import { Icone } from '../../components/Icone';
import PaginaA4 from '../../components/PaginaA4';
import RecusaPalco from '../../components/RecusaPalco';
import { usePalcoDocumento } from '../documentos/usePalcoDocumento';
import VisualizadorPdf from '../../components/VisualizadorPdf';
import { arquivoCalibracao } from './calibracaoService';
import PreviaCertificado from './PreviaCertificado';
import { ehRascunhoInterno } from './acoesPreviaCertificado';
import { artefatoDaCalibracao, nomeArquivoCalibracao } from './artefatoCalibracao';
import { definicaoDe } from './instrumentos';
import { fotoDoComponente, type ComponenteCal, type LoteCal } from './componentesService';
import { calibracaoDoItem, dataDoLote, itensDoLote, progressoLote } from './lote';
import { ehEmitido, ehOficial, ehTerceiro, type DadosCalibracao } from './tipos';
import { paramsSomenteLeitura, travarIframeSomenteLeitura } from '../documentos/somenteLeituraDoc';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalLote.css';

const ROTULO_STATUS: Record<string, string> = {
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  '': 'Sem conclusão',
};

type Situacao = 'pendente' | 'rascunho' | 'concluido';
type Filtro = '' | Situacao;

function situacaoDe(cal: DadosCalibracao | null): Situacao {
  if (!cal) return 'pendente';
  return ehOficial(cal) ? 'concluido' : 'rascunho';
}

const ORDEM: Record<Situacao, number> = { pendente: 0, rascunho: 1, concluido: 2 };

/**
 * O lote de calibração, redesenhado em 22/11/2026 para ser entendido de
 * relance: o progresso no topo, os três passos do fluxo escritos, e UMA linha
 * por acessório com a ação certa em destaque (calibrar → revisar e emitir →
 * ver certificado). Tudo abre em MODAL por cima do lote — o usuário nunca é
 * levado para outra tela e, ao fechar, volta exatamente aqui.
 */
export default function ModalDetalhesLote({
  lote,
  tag,
  componentes,
  calibracoes,
  aoCalibrar,
  aoRegistrarTerceiro,
  aoRevisar,
  aoVerDados,
  aoVerCertificado,
  aoBaixarPdf,
  aoFechar,
}: {
  lote: LoteCal;
  tag: string;
  componentes: ComponenteCal[];
  calibracoes: DadosCalibracao[];
  aoCalibrar: (c: ComponenteCal) => void;
  /** Fase 2 (D) · registrar certificado de laboratório externo para o acessório. */
  aoRegistrarTerceiro: (c: ComponenteCal) => void;
  /** Fase 2 (C.3) · abrir o rascunho para continuar o preenchimento. */
  aoRevisar: (cal: DadosCalibracao) => void;
  /** Os dados preenchidos, em modal. */
  aoVerDados: (cal: DadosCalibracao) => void;
  /**
   * O certificado em modal (o mesmo da lista de calibrações): no rascunho é
   * onde se escolhe o responsável e se EMITE. Sem ele, o lote usa o próprio
   * visor (só leitura).
   */
  aoVerCertificado?: (cal: DadosCalibracao) => void;
  aoBaixarPdf: (cal: DadosCalibracao) => void | Promise<void>;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  /** A calibração cuja folha está aberta sobre o modal; `null` = nenhuma. */
  const [vendo, setVendo] = useState<DadosCalibracao | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('');

  const itens = itensDoLote(lote, componentes);
  const progresso = progressoLote(lote, componentes, calibracoes);
  const linhas = itens
    .map((c) => {
      const cal = calibracaoDoItem(lote.id, c.id, calibracoes);
      return { c, cal, sit: situacaoDe(cal) };
    })
    // Pendentes primeiro: é o que falta fazer.
    .sort((a, b) => ORDEM[a.sit] - ORDEM[b.sit] || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));
  const conta = (s: Situacao) => linhas.filter((l) => l.sit === s).length;
  const visiveis = filtro ? linhas.filter((l) => l.sit === filtro) : linhas;
  const pct = progresso.total ? Math.round((conta('concluido') / progresso.total) * 100) : 0;

  const verCertificado = (cal: DadosCalibracao) => (aoVerCertificado ? aoVerCertificado(cal) : setVendo(cal));

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // ESC fecha primeiro a folha, depois o lote: quem está lendo o
      // certificado espera voltar ao lote, não à lista.
      if (vendo) setVendo(null);
      else aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, vendo]);

  async function baixar(cal: DadosCalibracao) {
    setBaixando(cal.id);
    try {
      await aoBaixarPdf(cal);
    } finally {
      setBaixando(null);
    }
  }

  const pend = conta('pendente');
  const rasc = conta('rascunho');
  const conc = conta('concluido');

  return (
    <div
      className="fj-modal-overlay mlt-fundo"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Lote ${lote.descricao}`}
    >
      <div className="mlt" ref={caixa}>
        {/* ── Topo: o lote e o progresso ─────────────────────────────── */}
        <header className="mlt-topo">
          <div className="mlt-id">
            <span className="mlt-ic" aria-hidden="true">
              <Icone nome="sliders" tam={20} />
            </span>
            <div>
              <h2>{lote.descricao}</h2>
              <p>
                <Icone nome="calendar" tam={12} /> {dataDoLote(lote)} · {progresso.total}{' '}
                {progresso.total === 1 ? 'acessório' : 'acessórios'}
              </p>
            </div>
          </div>
          <button type="button" className="mlt-fechar" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={16} />
          </button>

          <div className="mlt-prog">
            <div className="mlt-prog-top">
              <b>{progresso.completo ? 'Lote completo' : `${conc} de ${progresso.total} concluídos`}</b>
              <span>{pct}%</span>
            </div>
            <div className="mlt-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Os três passos, sempre à vista: o lote se entende sozinho. */}
          <ol className="mlt-passos">
            <li className={pend === 0 ? 'ok' : 'atual'}>
              <span className="n">1</span>
              <span className="t">Calibrar cada acessório</span>
              <em>{pend} pendente{pend === 1 ? '' : 's'}</em>
            </li>
            <li className={pend === 0 && rasc === 0 ? 'ok' : pend === 0 ? 'atual' : ''}>
              <span className="n">2</span>
              <span className="t">Revisar e emitir o certificado</span>
              <em>{rasc} em rascunho</em>
            </li>
            <li className={progresso.completo ? 'ok' : ''}>
              <span className="n">3</span>
              <span className="t">Lote completo</span>
              <em>
                {conc} concluído{conc === 1 ? '' : 's'}
              </em>
            </li>
          </ol>

          <div className="mlt-filtros" role="group" aria-label="Filtrar acessórios">
            {(
              [
                ['', 'Todos', linhas.length],
                ['pendente', 'Pendentes', pend],
                ['rascunho', 'Em rascunho', rasc],
                ['concluido', 'Concluídos', conc],
              ] as const
            ).map(([v, r, n]) => (
              <button
                key={v || 'todos'}
                type="button"
                aria-pressed={filtro === v}
                className={`f-${v || 'todos'}`}
                onClick={() => setFiltro(v)}
              >
                {r} <i>{n}</i>
              </button>
            ))}
          </div>
        </header>

        {/* ── Acessórios: uma linha cada ─────────────────────────────── */}
        <div className="mlt-corpo">
          {itens.length === 0 ? (
            <p className="mlt-vazio">Este lote não tem acessórios. Edite o lote para escolher quais entram.</p>
          ) : visiveis.length === 0 ? (
            <p className="mlt-vazio">Nenhum acessório nesta situação.</p>
          ) : (
            <ul className="mlt-lista">
              {visiveis.map(({ c, cal, sit }) => {
                const def = definicaoDe(c.tipo);
                const comPdf = !!cal && (!ehTerceiro(cal) || !!cal.pdfExternoRef?.path);
                return (
                  <li key={c.id} className={`mlt-item s-${sit}`}>
                    <span className="mlt-foto" aria-hidden="true">
                      {fotoDoComponente(c) ? (
                        <FotoImg foto={fotoDoComponente(c)} alt="" placeholder="" variante="thumb" />
                      ) : (
                        <Icone nome={def.icone} tam={18} />
                      )}
                    </span>
                    <div className="mlt-nome">
                      <b>{c.nome}</b>
                      <small>
                        {def.rotulo}
                        {c.serie ? ` · SN ${c.serie}` : ''}
                        {c.referencia ? ` · ${c.referencia}` : ''}
                      </small>
                    </div>
                    <div className="mlt-info">
                      {cal ? (
                        <>
                          <span>
                            {cal.dataCalibracao || '—'}
                            {cal.dataProxCalibracao ? ` → ${cal.dataProxCalibracao}` : ''}
                          </span>
                          <small>
                            {cal.numeroCertificado || 'sem nº'}
                            {ehTerceiro(cal) ? ` · ${cal.laboratorio || 'lab. externo'}` : ''}
                            {cal.statusConclusao ? ` · ${ROTULO_STATUS[cal.statusConclusao] ?? ''}` : ''}
                          </small>
                        </>
                      ) : (
                        <small>ainda não calibrado</small>
                      )}
                    </div>
                    <span className={`mlt-sit ${sit}`}>
                      <Icone nome={sit === 'pendente' ? 'clock' : sit === 'rascunho' ? 'pencil' : 'checkcircle'} tam={12} />
                      {sit === 'pendente'
                        ? 'Pendente'
                        : sit === 'rascunho'
                          ? 'Rascunho'
                          : ehTerceiro(cal)
                            ? 'Lab. externo'
                            : ehEmitido(cal)
                              ? 'Emitido'
                              : 'Concluído'}
                    </span>
                    <div className="mlt-acoes">
                      {sit === 'pendente' ? (
                        <>
                          {def.modeloInterno && (
                            <button type="button" className="mlt-btn pri" onClick={() => aoCalibrar(c)}>
                              <Icone nome="sliders" tam={13} /> Calibrar
                            </button>
                          )}
                          <button
                            type="button"
                            className="mlt-btn"
                            title="Registrar certificado de laboratório externo"
                            onClick={() => aoRegistrarTerceiro(c)}
                          >
                            <Icone nome="building" tam={13} /> Lab. externo
                          </button>
                        </>
                      ) : sit === 'rascunho' && cal ? (
                        <>
                          <button type="button" className="mlt-btn pri" onClick={() => verCertificado(cal)}>
                            <Icone nome="checkcircle" tam={13} /> Revisar e emitir
                          </button>
                          <button
                            type="button"
                            className="mlt-ic-btn"
                            title="Continuar o preenchimento"
                            aria-label="Continuar o preenchimento"
                            onClick={() => aoRevisar(cal)}
                          >
                            <Icone nome="pencil" tam={14} />
                          </button>
                        </>
                      ) : cal ? (
                        <>
                          {comPdf && (
                            <button type="button" className="mlt-btn azul" onClick={() => verCertificado(cal)}>
                              <Icone nome="filetext" tam={13} /> {ehTerceiro(cal) ? 'PDF do laboratório' : 'Ver certificado'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="mlt-ic-btn"
                            title={ehTerceiro(cal) ? 'Abrir registro' : 'Abrir calibração'}
                            aria-label={ehTerceiro(cal) ? 'Abrir registro' : 'Abrir calibração'}
                            onClick={() => aoVerDados(cal)}
                          >
                            <Icone nome="eye" tam={14} />
                          </button>
                          {comPdf && (
                            <button
                              type="button"
                              className={`mlt-ic-btn${baixando === cal.id ? ' is-loading' : ''}`}
                              title="Baixar PDF"
                              aria-label="Baixar PDF"
                              disabled={baixando === cal.id}
                              onClick={() => void baixar(cal)}
                            >
                              <Icone nome="download" tam={14} />
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {vendo && <VisorCertificado cal={vendo} tag={tag} aoFechar={() => setVendo(null)} aoBaixar={() => baixar(vendo)} />}
    </div>
  );
}

/**
 * A folha do certificado, sobre o modal do lote.
 *
 * O palco é materializado aqui (`usePalcoDocumento`): o template lê as chaves
 * do `localStorage` e, na v2, elas só existem enquanto o documento está aberto.
 */
export function VisorCertificado({
  cal,
  tag,
  aoFechar,
  aoBaixar,
}: {
  cal: DadosCalibracao;
  tag: string;
  aoFechar: () => void;
  aoBaixar: () => void | Promise<void>;
}) {
  // O id do "relatório" aqui é o do próprio certificado: o palco materializa
  // as chaves daquela TAG e identifica o documento aberto.
  // Emitido ou de laboratório: o ARQUIVO — sem palco, sem template.
  const arte = artefatoDaCalibracao(cal);
  const arquivo = arquivoCalibracao(cal);
  // Fase 7 · rascunho interno: a prévia vetorial (o mesmo gerador da emissão), sem palco.
  const rascunho = ehRascunhoInterno(cal);
  const palco = usePalcoDocumento(tag, cal.id, {
    pular: !!arte || !arquivo || rascunho,
    // Concluída = somente leitura: a folha não grava (mesma regra da lista).
    somenteLeitura: ehOficial(cal),
  });

  return (
    <div
      className="fj-modal-overlay mlote-visor-fundo"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Certificado ${cal.numeroCertificado}`}
    >
      <div className="mlote-visor">
        <div className="mlote-visor-barra">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
            <Icone nome="arrowleft" tam={13} /> Voltar ao lote
          </button>
          <strong>{cal.nome}</strong>
          <span className="mlote-visor-cert">{cal.numeroCertificado}</span>
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void aoBaixar()}>
            <Icone nome="download" tam={13} /> Baixar PDF
          </button>
        </div>
        {arte ? (
          <div className="mlote-visor-folha mlote-visor-arquivo">
            <VisualizadorPdf artefato={arte} nomeArquivo={nomeArquivoCalibracao(cal)} />
          </div>
        ) : rascunho ? (
          <div className="mlote-visor-folha mlote-visor-arquivo">
            <PreviaCertificado cal={cal} />
          </div>
        ) : !arquivo ? (
          <p className="mlote-vazio">Esta calibração não tem folha de certificado nem PDF anexado.</p>
        ) : palco.estado !== 'pronto' ? (
          <RecusaPalco estado={palco.estado} falha={palco.falha} />
        ) : (
          <div className="cal-preview mlote-visor-folha">
            <PaginaA4>
              <iframe
                src={`/arquivos-inspecao/${arquivo}?calibId=${cal.id}&tag=${encodeURIComponent(tag)}&page=1${palco.paramsIframe}${paramsSomenteLeitura(ehOficial(cal))}`}
                scrolling="no"
                title="Certificado de calibração"
                onLoad={(e) => {
                  if (ehOficial(cal)) travarIframeSomenteLeitura(e.currentTarget);
                }}
              />
            </PaginaA4>
          </div>
        )}
      </div>
    </div>
  );
}
