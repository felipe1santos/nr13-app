/**
 * Os dados que SÓ a caldeira tem (22/10/2026) — em BLOCOS (23/11/2026).
 *
 * Mesmo desenho das outras seções da ficha (§3-quater): leitura = rótulo
 * pequeno + valor, edição pelo lápis com Salvar/Cancelar. Os grupos e os
 * rótulos são os de `GRUPOS_CALDEIRA` — os mesmos que o relatório imprime.
 *
 * A ficha da caldeira deixou de ser uma lista única e longa: cada bloco
 * (Dados de placa, Construção, Operação, Instrumentos e acessórios) mostra SÓ
 * os seus grupos e pode vir RECOLHIDO, com o resumo na barra. Na leitura, grupo
 * sem nenhum valor não aparece (é assim que "PSV 2", "bomba 2" e "nível 2" só
 * surgem quando têm dado); na edição aparecem todos.
 *
 * Grava `nr13_ficha_caldeira_<TAG>` RELENDO a chave e mesclando SÓ os grupos do
 * bloco — os outros blocos e o volume da classificação gravam a mesma chave.
 */
import { useState } from 'react';
import { Icone } from '../../components/Icone';
import {
  GRUPOS_CALDEIRA,
  carregarDadosCaldeira,
  comValorCaldeira,
  salvarDadosCaldeira,
  valorCaldeira,
  type DadosCaldeira,
  type GrupoCaldeira,
} from './dadosCaldeira';

/** Os blocos da ficha da caldeira, na ordem da tela. */
export const BLOCOS_CALDEIRA = {
  placa: {
    titulo: 'Dados de placa (NR-13 13.4.1.3)',
    grupos: ['equipamento'],
  },
  construcao: {
    titulo: 'Construção',
    grupos: ['corpo', 'espelhos', 'fornalha', 'tubos'],
  },
  operacao: {
    titulo: 'Operação',
    grupos: ['termodinamicos', 'operacionais', 'controles'],
  },
  acessorios: {
    titulo: 'Instrumentos de segurança e acessórios',
    grupos: [
      'indicadorPressao',
      'alivio1',
      'alivio2',
      'nivel1',
      'nivel2',
      'drenagem',
      'bomba1',
      'bomba2',
      'aberturas',
      'chamine',
    ],
  },
} as const;

export type BlocoCaldeira = keyof typeof BLOCOS_CALDEIRA;

const grupoPreenchido = (d: DadosCaldeira, g: GrupoCaldeira) => g.campos.some((c) => valorCaldeira(d, c.chave).trim() !== '');

export default function FichaCaldeira({
  tag,
  bloco,
  recolhivel = false,
}: {
  tag: string;
  bloco: BlocoCaldeira;
  /** Recolhido por padrão, com o resumo na barra (Construção, Operação, Acessórios). */
  recolhivel?: boolean;
}) {
  const def = BLOCOS_CALDEIRA[bloco];
  const grupos = GRUPOS_CALDEIRA.filter((g) => (def.grupos as readonly string[]).includes(g.id));
  const [dados, setDados] = useState<DadosCaldeira>(() => carregarDadosCaldeira(tag));
  const [local, setLocal] = useState<DadosCaldeira>(dados);
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(!recolhivel);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const preenchidos = grupos.filter((g) => grupoPreenchido(dados, g)).length;

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      // Relê e mescla SÓ os grupos deste bloco.
      const atual = carregarDadosCaldeira(tag);
      const novo: DadosCaldeira = { ...atual };
      for (const g of grupos) {
        for (const c of g.campos) {
          const [a] = c.chave.split('.');
          if (a in local) novo[a] = local[a];
          else delete novo[a];
        }
      }
      await salvarDadosCaldeira(tag, novo);
      setDados(novo);
      setEditando(false);
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  const conteudoVisivel = aberto || editando;

  return (
    <div className={`ficha-cald-bloco${editando ? ' ficha-editando ficha-editando-sub' : ''}`}>
      <div className="bloco-header-acoes">
        {recolhivel ? (
          <button
            type="button"
            className="ficha-cald-toggle"
            aria-expanded={conteudoVisivel}
            onClick={() => setAberto((v) => !v)}
            disabled={editando}
          >
            <Icone nome={conteudoVisivel ? 'chevdown' : 'chevright'} tam={14} />
            <h3>{def.titulo}</h3>
            <small>
              {preenchidos === 0 ? 'não preenchido' : `${preenchidos} de ${grupos.length} preenchido${grupos.length > 1 ? 's' : ''}`}
            </small>
          </button>
        ) : (
          <h4>{def.titulo}</h4>
        )}
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
            title={`Editar — ${def.titulo}`}
            aria-label={`Editar — ${def.titulo}`}
          >
            <Icone nome="pencil" tam={14} />
          </button>
        )}
      </div>

      {conteudoVisivel && !editando && preenchidos === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ainda não preenchido. Use o lápis para preencher — sai no relatório.</p>
      )}

      {conteudoVisivel &&
        grupos.map((g) => {
          if (!editando && !grupoPreenchido(dados, g)) return null;
          return (
            <div key={g.id} className="ficha-grupo">
              {grupos.length > 1 && <h5 className="ficha-grupo-titulo">{g.titulo}</h5>}
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
              {salvando ? 'Salvando...' : 'Salvar'}
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
