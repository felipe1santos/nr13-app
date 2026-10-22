/**
 * "Dados da Caldeira" — a seção da ficha que SÓ a caldeira tem (22/10/2026).
 *
 * Mesmo desenho das outras seções da ficha (§3-quater): leitura = rótulo
 * pequeno + valor, edição pelo lápis com Salvar/Cancelar. Os grupos e os
 * rótulos são os de `GRUPOS_CALDEIRA` — os mesmos que o relatório imprime.
 * Grava `nr13_ficha_caldeira_<TAG>` inteiro; nenhuma outra chave é tocada.
 */
import { useState } from 'react';
import { Icone } from '../../components/Icone';
import {
  GRUPOS_CALDEIRA,
  carregarDadosCaldeira,
  comValorCaldeira,
  salvarDadosCaldeira,
  temDadosCaldeira,
  valorCaldeira,
  type DadosCaldeira,
} from './dadosCaldeira';

export default function FichaCaldeira({ tag }: { tag: string }) {
  const [dados, setDados] = useState<DadosCaldeira>(() => carregarDadosCaldeira(tag));
  const [local, setLocal] = useState<DadosCaldeira>(dados);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      await salvarDadosCaldeira(tag, local);
      setDados(local);
      setEditando(false);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={editando ? 'ficha-editando ficha-editando-sub' : undefined}>
      <div className="bloco-header-acoes">
        <h4>Dados da Caldeira</h4>
        {!editando && (
          <button
            type="button"
            className="btn-editar-pencil"
            onClick={() => {
              const atual = carregarDadosCaldeira(tag);
              setDados(atual);
              setLocal(atual);
              setEditando(true);
            }}
            title="Editar dados da caldeira"
            aria-label="Editar dados da caldeira"
          >
            <Icone nome="pencil" tam={14} />
          </button>
        )}
      </div>

      {!editando && !temDadosCaldeira(dados) && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Construção, operação, controles e acessórios da caldeira ainda não preenchidos. Eles saem no prontuário de
          inspeção do relatório.
        </p>
      )}

      {GRUPOS_CALDEIRA.map((g) => {
        if (!editando && !g.campos.some((c) => valorCaldeira(dados, c.chave).trim() !== '')) return null;
        return (
          <div key={g.id} className="ficha-grupo">
            <h5 className="ficha-grupo-titulo">{g.titulo}</h5>
            <div className={editando ? 'memorial-campos-grid' : 'dash-grid-4'}>
              {g.campos.map((c) => {
                const rotulo = c.unidade ? `${c.rotulo} (${c.unidade})` : c.rotulo;
                if (!editando) {
                  return (
                    <div key={c.chave} className="resultado-item">
                      <span className="lbl-view">{rotulo}</span>
                      <span className="val-view">{valorCaldeira(dados, c.chave) || '—'}</span>
                    </div>
                  );
                }
                const lista = c.opcoes ? `opcoes-${g.id}-${c.chave.replace('.', '-')}` : undefined;
                return (
                  <div key={c.chave} className="memorial-campo">
                    <div className="memorial-campo-label-row">
                      <label htmlFor={`cald-${c.chave}`}>{rotulo}</label>
                    </div>
                    <div className="memorial-campo-input">
                      <input
                        id={`cald-${c.chave}`}
                        type="text"
                        list={lista}
                        value={valorCaldeira(local, c.chave)}
                        onChange={(e) => setLocal((l) => comValorCaldeira(l, c.chave, e.target.value))}
                      />
                    </div>
                    {lista && (
                      <datalist id={lista}>
                        {c.opcoes!.map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {editando && (
        <>
          {erro && (
            <p role="alert" style={{ color: 'var(--crit, #b91c1c)', fontSize: 13 }}>
              {erro}
            </p>
          )}
          <div className="ficha-acoes-edicao">
            <button type="button" className="btn-primario" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar dados da caldeira'}
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setLocal(dados);
                setEditando(false);
                setErro('');
              }}
              disabled={salvando}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
