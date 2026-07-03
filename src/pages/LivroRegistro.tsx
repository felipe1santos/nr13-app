import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import PaginaA4 from '../components/PaginaA4';
import { ler, listarChavesComPrefixo } from '../services/storage';
import type { InfoEquipamento } from '../features/equipamento/tipos';
import './dashboard-novo.css';

interface LivroEntrada {
  id?: string;
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
}

interface LinhaLivro {
  tag: string;
  nomeEquip: string;
  entradas: LivroEntrada[];
  temTermoAbertura: boolean; // livro com 1ª inspeção registrada → termo foi gerado
  ultimaData: string;
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

function montarLinhas(): LinhaLivro[] {
  const linhas: LinhaLivro[] = [];
  for (const chave of listarChavesComPrefixo('nr13_info_')) {
    try {
      const tag = chave.slice('nr13_info_'.length);
      const info = ler<InfoEquipamento>(chave);
      if (!info) continue;
      const entradas = ler<LivroEntrada[]>(`nr13_livro_${tag}`) ?? [];
      linhas.push({
        tag,
        nomeEquip: info.descricao?.trim() || ROTULO_TIPO[info.tipo] || 'Equipamento',
        entradas,
        temTermoAbertura: entradas.length > 0,
        ultimaData: entradas.length > 0 ? entradas[entradas.length - 1].data : '',
      });
    } catch { /* chave malformada: ignora */ }
  }
  // Com livro primeiro, depois por TAG.
  linhas.sort((a, b) => (b.entradas.length - a.entradas.length) || a.tag.localeCompare(b.tag));
  return linhas;
}

export default function LivroRegistro() {
  const navigate = useNavigate();
  const linhas = useMemo(() => montarLinhas(), []);
  const [preview, setPreview] = useState<{ tag: string; doc: 'LIVRO-REGISTRO.html' | 'TERMO-ABERTURA.html' } | null>(null);

  const comLivro = linhas.filter((l) => l.entradas.length > 0);

  return (
    <div className="dash-page">
      <div className="fj-panel">
        <div className="fj-panel-head">
          <div>
            <div className="fj-eyebrow">NR-13 · 13.4.1.9</div>
            <h2>Livros de Registro de Segurança</h2>
          </div>
          <span className="fj-badge neutro">{comLivro.length} livro{comLivro.length !== 1 ? 's' : ''} gerado{comLivro.length !== 1 ? 's' : ''}</span>
        </div>

        {linhas.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="book" tam={22} /></div>
            <div className="fj-empty-title">Nenhum equipamento cadastrado</div>
            O livro de registro de cada equipamento é criado automaticamente na primeira inspeção
            (com termo de abertura) e recebe uma anotação a cada relatório salvo.
          </div>
        ) : (
          <div className="fj-table-wrap">
            <table className="fj-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Registros</th>
                  <th>Termo de abertura</th>
                  <th>Último registro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.tag}>
                    <td>
                      <div className="fj-tag-cell">
                        <div className="fj-tag-ico"><Icone nome="book" tam={15} /></div>
                        <div>
                          <div className="fj-tag-code">{l.tag}</div>
                          <div className="fj-eq-name">{l.nomeEquip}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{l.entradas.length > 0 ? l.entradas.length : <span className="fj-dash">—</span>}</td>
                    <td>
                      {l.temTermoAbertura ? (
                        <span className="fj-badge ok">Gerado</span>
                      ) : (
                        <span className="fj-badge neutro">Na 1ª inspeção</span>
                      )}
                    </td>
                    <td className="mono">{l.ultimaData || <span className="fj-dash">—</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {l.entradas.length > 0 ? (
                          <>
                            <button
                              type="button"
                              className="fj-btn fj-btn-ghost"
                              onClick={() => setPreview({ tag: l.tag, doc: 'LIVRO-REGISTRO.html' })}
                            >
                              <Icone nome="eye" tam={13} style={{ color: 'var(--blue2)' }} /> Livro
                            </button>
                            <button
                              type="button"
                              className="fj-btn fj-btn-ghost"
                              onClick={() => setPreview({ tag: l.tag, doc: 'TERMO-ABERTURA.html' })}
                            >
                              <Icone nome="filetext" tam={13} /> Termo
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="fj-btn fj-btn-ghost"
                            onClick={() => navigate(`/equipamento/${l.tag}`)}
                          >
                            Abrir equipamento
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fj-panel-foot">
          O livro é preenchido automaticamente: cada relatório salvo adiciona a anotação de inspeção correspondente.
        </div>
      </div>

      {preview && (
        <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="fj-modal-box" style={{ maxWidth: 900 }}>
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">{preview.doc === 'TERMO-ABERTURA.html' ? 'Termo de abertura' : 'Livro de registro'}</div>
                <h2>{preview.tag}</h2>
              </div>
              <button type="button" className="fj-modal-close" onClick={() => setPreview(null)} aria-label="Fechar">
                <Icone nome="x" tam={15} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <PaginaA4>
                <iframe
                  src={`/arquivos-inspecao/${preview.doc}?tag=${encodeURIComponent(preview.tag)}`}
                  scrolling="no"
                  title={preview.doc}
                />
              </PaginaA4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
