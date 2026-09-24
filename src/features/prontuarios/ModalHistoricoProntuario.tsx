import { useEffect, useState } from 'react';
import { Icone } from '../../components/Icone';
import { carregarEmissoes, revisaoDe } from './emissaoProntuario';
import { resolverProntuarioVigente, ROTULO_ORIGEM, type ProntuarioVigente, type VersaoProntuario } from './prontuarioVigente';
import { bytesDaVersao } from './bytesDaVersao';
import { baixarArquivo, reservarAba } from './abrirArquivo';
import { chaveProntuarioFabricante, formatarTamanho, lerProntuarioFabricante } from '../equipamento/ProntuarioFabricante';
import { semearEquipamentoDetalhado } from '../../services/storage';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_DOCS } from '../../services/trial';
import { emitirAviso } from '../../services/eventos';
import './modalHistoricoProntuario.css';

/** `AAAA-MM-DD…` → `DD/MM/AAAA` (a lista importa este modal; importar dela seria ciclo). */
function dataDoc(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/**
 * HISTÓRICO DO PRONTUÁRIO DE UM EQUIPAMENTO (24/09/2026) — READ-ONLY.
 *
 * O vigente no topo, as versões anteriores embaixo, cada uma com Abrir e
 * Baixar (os bytes arquivados). Abre da ficha ("Ver histórico") e da lista de
 * `/prontuarios`. Não edita, não exclui, não promove versão antiga.
 *
 * Lê a lista da TAG por `carregarEmissoes` — cache, e leitura DIRIGIDA de só
 * aquela chave quando o cache não a tem (TAG aberta pela lista, aparelho
 * novo). Offline e sem cópia, diz isso em vez de mostrar um histórico vazio.
 */
export default function ModalHistoricoProntuario({ tag, aoFechar }: { tag: string; aoFechar: () => void }) {
  const [estado, setEstado] = useState<{ vigente: ProntuarioVigente | null; erro: string; pronto: boolean }>({
    vigente: null,
    erro: '',
    pronto: false,
  });
  const [ocupado, setOcupado] = useState('');
  const [erroAcao, setErroAcao] = useState('');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const emissoes = await carregarEmissoes(tag);
        // O legado do fabricante também é por TAG e pode não estar no cache.
        try {
          await semearEquipamentoDetalhado([chaveProntuarioFabricante(tag)]);
        } catch {
          /* sem rede: vale o que houver no cache */
        }
        if (vivo) setEstado({ vigente: resolverProntuarioVigente(emissoes, lerProntuarioFabricante(tag)), erro: '', pronto: true });
      } catch (e) {
        if (vivo) setEstado({ vigente: null, erro: e instanceof Error ? e.message : 'Não foi possível ler o histórico.', pronto: true });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tag]);

  const chave = (v: VersaoProntuario) => v.emissao?.id ?? `fab:${tag}`;

  async function abrir(v: VersaoProntuario) {
    setErroAcao('');
    setOcupado(chave(v));
    const aba = reservarAba(); // dentro do clique — ver abrirArquivo.ts
    try {
      const { blob, nome } = await bytesDaVersao(v, tag);
      aba.entregar(blob, nome);
    } catch (e) {
      aba.descartar();
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível abrir.');
    } finally {
      setOcupado('');
    }
  }

  async function baixar(v: VersaoProntuario) {
    setErroAcao('');
    if (v.fabricante && isTrial()) {
      emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_DOCS });
      return;
    }
    setOcupado(chave(v));
    try {
      const { blob, nome } = await bytesDaVersao(v, tag);
      baixarArquivo(blob, nome);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível baixar.');
    } finally {
      setOcupado('');
    }
  }

  function titulo(v: VersaoProntuario): string {
    if (v.emissao && v.origem === 'gerado') {
      const rev = String(revisaoDe(tag, v.emissao.id)).padStart(2, '0');
      return [`Rev. ${rev}`, v.emissao.numero].filter(Boolean).join(' · ');
    }
    if (v.emissao) return v.emissao.arquivoNome ?? 'PDF anexado';
    return v.fabricante?.nome ?? 'PDF do fabricante';
  }
  const data = (v: VersaoProntuario) => dataDoc(v.emissao?.geradoEm ?? v.fabricante?.enviadoEm);
  const tamanho = (v: VersaoProntuario) => {
    const t = v.emissao?.tamanho ?? v.fabricante?.tamanho;
    return t ? formatarTamanho(t) : null;
  };

  const linhas: { v: VersaoProntuario; vigente: boolean }[] = estado.vigente
    ? [{ v: estado.vigente, vigente: true }, ...estado.vigente.historico.map((v) => ({ v, vigente: false }))]
    : [];

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Histórico do prontuário de ${tag}`}
    >
      <div className="fj-modal-box mhp-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Prontuário NR-13 · histórico</div>
            <h2>{tag}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mhp-corpo">
          <p className="mhp-explica">
            O documento vigente vale para o equipamento; os anteriores ficam guardados como estão, só para consulta.
          </p>
          {!estado.pronto && (
            <p className="mhp-estado" role="status">
              <span className="spinner" /> Carregando…
            </p>
          )}
          {estado.erro && (
            <p className="mhp-estado mhp-erro" role="alert">
              {estado.erro}
            </p>
          )}
          {estado.pronto && !estado.erro && linhas.length === 0 && (
            <p className="mhp-estado">Nenhum prontuário neste equipamento.</p>
          )}
          {linhas.length > 0 && (
            <ul className="mhp-lista">
              {linhas.map(({ v, vigente }) => (
                <li key={chave(v)} className={`mhp-item${vigente ? ' mhp-item-vigente' : ''}`} data-teste={vigente ? 'versao-vigente' : 'versao-historico'}>
                  <span className="mhp-icone" aria-hidden>
                    <Icone nome="pdf" tam={16} />
                  </span>
                  <span className="mhp-nome">
                    <strong title={titulo(v)}>{titulo(v)}</strong>
                    <span className="mhp-meta">
                      {[ROTULO_ORIGEM[v.origem], data(v), tamanho(v), v.emissao?.pdfPendente ? 'aguardando sincronização' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={`mhp-status ${vigente ? 'mhp-status-vigente' : 'mhp-status-historico'}`}>
                    {vigente ? 'VIGENTE' : 'HISTÓRICO'}
                  </span>
                  <span className="mhp-acoes">
                    <button
                      type="button"
                      className="btn-icone cor-azul"
                      title="Abrir"
                      aria-label={`Abrir ${titulo(v)}`}
                      disabled={ocupado === chave(v)}
                      onClick={() => void abrir(v)}
                    >
                      <Icone nome="eye" tam={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icone cor-azul"
                      title="Baixar"
                      aria-label={`Baixar ${titulo(v)}`}
                      disabled={ocupado === chave(v)}
                      onClick={() => void baixar(v)}
                    >
                      <Icone nome="download" tam={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* DOCUMENTOS LEGADOS — seção à parte, só quando existem. O PDF do
              fabricante NÃO é versão do prontuário (não classificamos conteúdo:
              pode ser um prontuário antigo ou um manual); fica acessível, sem
              entrar no histórico nem na contagem. */}
          {estado.vigente?.legado && (
            <section className="mhp-legados" data-teste="documentos-legados">
              <h3 className="mhp-legados-titulo">Documentos legados</h3>
              <ul className="mhp-lista">
                {(() => {
                  const v: VersaoProntuario = { origem: 'fabricante', fabricante: estado.vigente.legado };
                  return (
                    <li className="mhp-item mhp-item-legado" data-teste="documento-legado">
                      <span className="mhp-icone" aria-hidden>
                        <Icone nome="pdf" tam={16} />
                      </span>
                      <span className="mhp-nome">
                        <strong title={titulo(v)}>{titulo(v)}</strong>
                        <span className="mhp-meta">
                          {['PDF do fabricante', data(v), tamanho(v)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="mhp-status mhp-status-historico">LEGADO</span>
                      <span className="mhp-acoes">
                        <button
                          type="button"
                          className="btn-icone cor-azul"
                          title="Abrir"
                          aria-label={`Abrir ${titulo(v)}`}
                          disabled={ocupado === chave(v)}
                          onClick={() => void abrir(v)}
                        >
                          <Icone nome="eye" tam={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icone cor-azul"
                          title="Baixar"
                          aria-label={`Baixar ${titulo(v)}`}
                          disabled={ocupado === chave(v)}
                          onClick={() => void baixar(v)}
                        >
                          <Icone nome="download" tam={14} />
                        </button>
                      </span>
                    </li>
                  );
                })()}
              </ul>
            </section>
          )}
          {erroAcao && <p className="erro-form">{erroAcao}</p>}
        </div>
      </div>
    </div>
  );
}
