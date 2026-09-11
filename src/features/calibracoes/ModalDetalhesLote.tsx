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
import { arquivoCalibracao } from './calibracaoService';
import { fotoDoComponente, type ComponenteCal, type LoteCal } from './componentesService';
import { calibracaoDoItem, dataDoLote, itensDoLote, progressoLote } from './lote';
import type { DadosCalibracao } from './tipos';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalLote.css';

const ROTULO_STATUS: Record<string, string> = {
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  '': 'Sem conclusão',
};

export default function ModalDetalhesLote({
  lote,
  tag,
  componentes,
  calibracoes,
  aoCalibrar,
  aoVerDados,
  aoBaixarPdf,
  aoFechar,
}: {
  lote: LoteCal;
  tag: string;
  componentes: ComponenteCal[];
  calibracoes: DadosCalibracao[];
  aoCalibrar: (c: ComponenteCal) => void;
  aoVerDados: (cal: DadosCalibracao) => void;
  aoBaixarPdf: (cal: DadosCalibracao) => void | Promise<void>;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  /** A calibração cuja folha está aberta sobre o modal; `null` = nenhuma. */
  const [vendo, setVendo] = useState<DadosCalibracao | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const itens = itensDoLote(lote, componentes);
  const progresso = progressoLote(lote, componentes, calibracoes);

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

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Lote ${lote.descricao}`}
    >
      <div className="fj-modal-box mlote-box mlote-box-larga" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Lote de calibração</div>
            <h2>{lote.descricao}</h2>
            <p className="mlote-sub">
              <span>
                <Icone nome="calendar" tam={12} /> {dataDoLote(lote)}
              </span>
              <span>
                {progresso.total} {progresso.total === 1 ? 'item' : 'itens'}
              </span>
              <span className={`mlote-selo${progresso.completo ? ' completo' : ''}`}>
                {progresso.completo ? 'Completo' : `${progresso.feitos}/${progresso.total} calibrados`}
              </span>
            </p>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mlote-corpo">
          {itens.length === 0 ? (
            <p className="mlote-vazio">
              Este lote não tem itens. Edite-o para escolher quais acessórios entram.
            </p>
          ) : (
            <ul className="mlote-detalhe">
              {itens.map((c) => {
                const cal = calibracaoDoItem(lote.id, c.id, calibracoes);
                return (
                  <li key={c.id} className={`mlote-det-item${cal ? '' : ' pendente'}`}>
                    <div className="mlote-det-cabeca">
                      <span className="mlote-item-foto" aria-hidden>
                        {fotoDoComponente(c) ? (
                          <FotoImg foto={fotoDoComponente(c)} alt="" placeholder="" variante="thumb" />
                        ) : (
                          <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={18} />
                        )}
                      </span>
                      <div className="mlote-det-nome">
                        <strong>{c.nome}</strong>
                        <em>{c.tipo === 'psv' ? 'Válvula de segurança' : 'Manômetro'}</em>
                      </div>
                      {cal ? (
                        <span className={`mlote-selo ${cal.statusConclusao || 'sem'}`}>
                          {ROTULO_STATUS[cal.statusConclusao] ?? 'Sem conclusão'}
                        </span>
                      ) : (
                        <span className="mlote-selo pendente">Pendente</span>
                      )}
                    </div>

                    <dl className="mlote-det-dados">
                      {[
                        ['Fabricante', c.fabricante],
                        ['Modelo', c.modelo],
                        ['Série', c.serie],
                        ['Faixa', c.referencia],
                        ['Calibração', cal?.dataCalibracao],
                        ['Próxima', cal?.dataProxCalibracao],
                        ['Certificado', cal?.numeroCertificado],
                      ]
                        .filter(([, v]) => (v ?? '').toString().trim() !== '')
                        .map(([r, v]) => (
                          <div key={r as string}>
                            <dt>{r}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                    </dl>

                    <div className="mlote-det-acoes">
                      {cal ? (
                        <>
                          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => aoVerDados(cal)}>
                            <Icone nome="eye" tam={13} /> Abrir calibração
                          </button>
                          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setVendo(cal)}>
                            <Icone nome="filetext" tam={13} /> Visualizar PDF
                          </button>
                          <button
                            type="button"
                            className={`fj-btn fj-btn-ghost${baixando === cal.id ? ' is-loading' : ''}`}
                            disabled={baixando === cal.id}
                            onClick={async () => {
                              setBaixando(cal.id);
                              try {
                                await aoBaixarPdf(cal);
                              } finally {
                                setBaixando(null);
                              }
                            }}
                          >
                            <Icone nome="download" tam={13} />{' '}
                            {baixando === cal.id ? 'Gerando…' : 'Baixar PDF'}
                          </button>
                        </>
                      ) : (
                        <button type="button" className="fj-btn fj-btn-primary" onClick={() => aoCalibrar(c)}>
                          <Icone nome="sliders" tam={13} /> Calibrar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {vendo && (
        <VisorCertificado
          cal={vendo}
          tag={tag}
          aoFechar={() => setVendo(null)}
          aoBaixar={async () => {
            setBaixando(vendo.id);
            try {
              await aoBaixarPdf(vendo);
            } finally {
              setBaixando(null);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * A folha do certificado, sobre o modal do lote.
 *
 * O palco é materializado aqui (`usePalcoDocumento`): o template lê as chaves
 * do `localStorage` e, na v2, elas só existem enquanto o documento está aberto.
 */
function VisorCertificado({
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
  const palco = usePalcoDocumento(tag, cal.id);

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
        {palco.estado !== 'pronto' ? (
          <RecusaPalco estado={palco.estado} falha={palco.falha} />
        ) : (
          <div className="cal-preview mlote-visor-folha">
            <PaginaA4>
              <iframe
                src={`/arquivos-inspecao/${arquivoCalibracao(cal.tipo)}?calibId=${cal.id}&tag=${encodeURIComponent(tag)}&page=1${palco.paramsIframe}`}
                scrolling="no"
                title="Certificado de calibração"
              />
            </PaginaA4>
          </div>
        )}
      </div>
    </div>
  );
}
