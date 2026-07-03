import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { Link, useParams } from 'react-router-dom';
import { ler } from '../../services/storage';
import { listarHistorico } from '../../features/relatorios/relatoriosService';
import { gravarMetaAtual, gravarInspecaoOrigemAtual, filtrarFolhasFotoVazias } from '../../features/relatorios/relatoriosService';
import { listarContainers, carregarContainer } from '../../features/inspecoes/inspecaoService';
import type { InfoEquipamento } from '../../features/equipamento/tipos';
import type { RelatorioSalvo } from '../../features/relatorios/tipos';
import PaginaA4 from '../../components/PaginaA4';

type Aba = 'documentacao' | 'inspecoes' | 'anotacoes';

interface LivroEntradaView {
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
}

// Detalhe do ativo no portal: resumo à esquerda, abas à direita (Documentação /
// Registros de Inspeção / Anotações). Tudo somente leitura.
export default function PortalAtivo() {
  const { tag = '' } = useParams<{ tag: string }>();
  const [aba, setAba] = useState<Aba>('documentacao');
  const [relatorioAberto, setRelatorioAberto] = useState<RelatorioSalvo | null>(null);
  const [docsVisiveis, setDocsVisiveis] = useState<string[]>([]);

  const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
  const fotos = ler<{ src: string; isCapa: boolean }[]>(`nr13_fotos_${tag}`) || [];
  const capa = fotos.find((f) => f.isCapa) ?? fotos[0] ?? null;
  const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
  const calc = ler<{ pmta?: string; pth?: string; resultado?: string }>(`nr13_calc_${tag}`);
  const emp = ler<{ razaoSocial?: string; cidade?: string; endereco?: string }>(`nr13_emp_${tag}`);
  const livro = ler<LivroEntradaView[]>(`nr13_livro_${tag}`) || [];
  const relatorios = useMemo(() => listarHistorico(tag), [tag]);
  const containers = useMemo(() => listarContainers(tag), [tag]);

  // Reabre um relatório salvo em modo leitura: regrava as chaves "atuais" que os
  // templates leem (CLAUDE.md §2 — REGRA CRÍTICA DE INJEÇÃO) antes de montar os iframes.
  async function abrirRelatorio(r: RelatorioSalvo) {
    await gravarMetaAtual(r.meta);
    const container = r.meta.containerOrigemId ? carregarContainer(tag, r.meta.containerOrigemId) : null;
    await gravarInspecaoOrigemAtual(container?.dados ?? {});
    setDocsVisiveis(filtrarFolhasFotoVazias(r.documentos, container?.dados));
    setRelatorioAberto(r);
  }

  if (relatorioAberto) {
    return (
      <div className="portal-pagina">
        <button type="button" className="btn-secundario" onClick={() => setRelatorioAberto(null)}>
          ← Voltar para {tag}
        </button>
        <h2 style={{ margin: '12px 0' }}>{relatorioAberto.nome}</h2>
        <div className="relatorio-preview portal-preview-doc">
          {docsVisiveis.map((doc, i) => {
            const sep = doc.includes('?') ? '&' : '?';
            return (
              <PaginaA4 key={`${doc}-${i}`}>
                <iframe src={`/arquivos-inspecao/${doc}${sep}tag=${tag}&page=${i + 1}`} scrolling="no" title={doc} />
              </PaginaA4>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-pagina">
      <Link to="/portal" className="btn-secundario">← Todos os equipamentos</Link>

      <div className="portal-detalhe">
        {/* ── Resumo do ativo (esquerda) ── */}
        <aside className="portal-resumo">
          <div className="portal-resumo-foto">
            {capa ? <img src={capa.src} alt={tag} /> : <span className="portal-card-sem-foto"><Icone nome="box" tam={22} /></span>}
          </div>
          <h2>{tag}</h2>
          {info?.descricao && <p className="portal-card-desc">{info.descricao}</p>}
          <dl className="portal-resumo-dados">
            {info?.fabricante && (<><dt>Fabricante</dt><dd>{info.fabricante}</dd></>)}
            {info?.ano && (<><dt>Ano</dt><dd>{info.ano}</dd></>)}
            {info?.numeroSerie && (<><dt>Nº de série</dt><dd>{info.numeroSerie}</dd></>)}
            {cat?.catFinal && (<><dt>Categoria NR-13</dt><dd>{cat.catFinal}</dd></>)}
            {calc?.pmta && (<><dt>PMTA</dt><dd>{calc.pmta} MPa</dd></>)}
            {calc?.resultado && (<><dt>Situação</dt><dd>{calc.resultado}</dd></>)}
            {emp?.razaoSocial && (<><dt>Instalado em</dt><dd>{emp.razaoSocial}{emp.cidade ? ` — ${emp.cidade}` : ''}</dd></>)}
          </dl>
        </aside>

        {/* ── Abas (direita) ── */}
        <section className="portal-abas">
          <div className="portal-abas-nav">
            <button type="button" className={aba === 'documentacao' ? 'ativa' : ''} onClick={() => setAba('documentacao')}>
              Documentação
            </button>
            <button type="button" className={aba === 'inspecoes' ? 'ativa' : ''} onClick={() => setAba('inspecoes')}>
              Registros de Inspeção
            </button>
            <button type="button" className={aba === 'anotacoes' ? 'ativa' : ''} onClick={() => setAba('anotacoes')}>
              Anotações
            </button>
          </div>

          {aba === 'documentacao' && (
            <div className="portal-aba-corpo">
              {relatorios.length === 0 ? (
                <p className="portal-hint">Nenhum relatório publicado para este equipamento ainda.</p>
              ) : (
                <ul className="portal-lista-docs">
                  {relatorios.map((r) => (
                    <li key={r.id}>
                      <div>
                        <b>{r.nome}</b>
                        <span className="portal-doc-meta">
                          {r.meta?.codigo ? `${r.meta.codigo} · ` : ''}{r.data} · {r.tipo}
                        </span>
                      </div>
                      <button type="button" className="btn-primario" onClick={() => void abrirRelatorio(r)}>
                        Visualizar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {aba === 'inspecoes' && (
            <div className="portal-aba-corpo">
              {livro.length === 0 && containers.length === 0 ? (
                <p className="portal-hint">Nenhum registro de inspeção ainda.</p>
              ) : (
                <>
                  {livro.length > 0 && (
                    <table className="portal-tabela">
                      <thead>
                        <tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Relatório</th><th>Responsável</th></tr>
                      </thead>
                      <tbody>
                        {livro.map((l, i) => (
                          <tr key={i}>
                            <td>{l.data}</td>
                            <td>{l.tipo}</td>
                            <td>{l.descricao}</td>
                            <td>{l.relatorioCodigo}</td>
                            <td>{l.phNome}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {containers.length > 0 && (
                    <p className="portal-hint" style={{ marginTop: 10 }}>
                      {containers.length} rodada(s) de inspeção de campo registradas
                      ({containers.map((c) => c.criadoEm).join(', ')}).
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {aba === 'anotacoes' && (
            <div className="portal-aba-corpo">
              <p className="portal-hint">
                Espaço reservado para anotações da executante sobre este equipamento. Em caso de dúvida,
                entre em contato com a empresa responsável pela inspeção.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
