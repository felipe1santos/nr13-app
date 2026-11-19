/**
 * `/empresas` — Clientes (v4 "Aço Frio", 25/10/2026).
 *
 * UM cartão: busca, abas e "Novo cliente" na barra do topo, e uma tabela de
 * 40px por linha. Abrir um cliente abre o MODAL (`ModalCliente`), em leitura;
 * editar, cadastrar e excluir acontecem lá dentro. Antes eram duas telas
 * inteiras (detalhe e formulário) e um "Excluir" à vista em cada cartão.
 *
 * As abas recortam pelo que o cadastro sabe dizer de cada cliente: se há
 * acesso ao Portal. "Com vencidos", da prévia, exigiria cruzar o cliente com
 * os prazos de todos os equipamentos para cada linha — o modal mostra isso
 * por cliente, sob demanda.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import MenuMais from '../components/MenuMais';
import { listarClientes } from '../features/cadastros/cadastroService';
import LogoCliente from '../features/cadastros/LogoCliente';
import ModalCliente from '../features/cadastros/ModalCliente';
import { equipamentosDoCliente, normalizarNome } from '../features/cadastros/clienteResumo';
import * as catalogo from '../services/catalogoLocal';
import type { ItemCatalogo } from '../services/buscaIndex';
import type { Cliente } from '../features/cadastros/tipos';
import '../features/cadastros/modalCliente.css';
import './clientes.css';
import { Ilustracao } from '../components/Ilustracao';

const VAZIO: Omit<Cliente, 'id'> = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', atividade: '',
  endereco: '', bairro: '', cidade: '', estado: '', cep: '',
  telefone: '', email: '', contato: '',
};

type Recorte = 'todos' | 'portal' | 'sem-portal';

const RECORTES: { valor: Recorte; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'portal', rotulo: 'Com Portal' },
  { valor: 'sem-portal', rotulo: 'Sem Portal' },
];

interface Aberto {
  cliente: Cliente;
  novo: boolean;
  acao?: 'editar' | 'excluir';
}

function cidadeUf(c: Cliente): string {
  return c.cidade ? `${c.cidade}${c.estado ? ` · ${c.estado}` : ''}` : '';
}

/** Nome em destaque: o fantasia quando existe (cliente importado da busca às
 *  vezes só tem ele); a razão social vira a 2ª linha. */
function nomeDe(c: Cliente): string {
  return c.nomeFantasia?.trim() || c.razaoSocial?.trim() || c.cnpj || '—';
}
function segundaLinha(c: Cliente): string {
  const r = c.razaoSocial?.trim() ?? '';
  return r && r !== nomeDe(c) ? r : '';
}

/** Link do WhatsApp para o telefone do cliente (só dígitos, DDI 55). */
function linkZap(tel: string | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}`;
}

export default function Empresas() {
  const [clientes, setClientes] = useState<Cliente[]>(() => listarClientes());
  const [termo, setTermo] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todos');
  const [aberto, setAberto] = useState<Aberto | null>(null);
  // Cobalto · coluna Equipamentos (protótipo): conta pelo catálogo guardado no
  // aparelho, sem consulta ao servidor. Sem catálogo baixado, "—".
  const [catalogoItens, setCatalogoItens] = useState<ItemCatalogo[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const todos: ItemCatalogo[] = [];
        let cursor: string | null = null;
        for (let i = 0; i < 40; i++) {
          const pag = await catalogo.paginaLocal({}, cursor);
          todos.push(...pag.itens);
          if (!pag.temMais || !pag.proximoCursor) break;
          cursor = pag.proximoCursor;
        }
        if (vivo) setCatalogoItens(todos.length ? todos : null);
      } catch {
        if (vivo) setCatalogoItens(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const contagem = useMemo(
    () => ({
      todos: clientes.length,
      portal: clientes.filter((c) => c.portalEmail).length,
      'sem-portal': clientes.filter((c) => !c.portalEmail).length,
    }),
    [clientes],
  );

  const visiveis = useMemo(() => {
    const t = normalizarNome(termo);
    return clientes.filter((c) => {
      if (recorte === 'portal' && !c.portalEmail) return false;
      if (recorte === 'sem-portal' && c.portalEmail) return false;
      if (!t) return true;
      return [c.razaoSocial, c.nomeFantasia, c.cnpj, c.cidade, c.contato]
        .some((v) => normalizarNome(v).includes(t));
    });
  }, [clientes, termo, recorte]);

  /** Exportar (protótipo): CSV dos clientes na tela, gerado no aparelho. */
  function exportarCsv() {
    const col = ['Empresa', 'Razão social', 'CNPJ', 'Cidade', 'UF', 'Contato', 'Telefone', 'E-mail', 'Portal'];
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const linhas = visiveis.map((c) =>
      [nomeDe(c), c.razaoSocial, c.cnpj, c.cidade, c.estado, c.contato, c.telefone, c.email, c.portalEmail ? 'Ativo' : 'Sem acesso']
        .map((v) => esc(String(v ?? '')))
        .join(';'),
    );
    const BOM = String.fromCharCode(0xfeff); // Excel abre com acentos
    const QUEBRA = String.fromCharCode(13, 10);
    const blob = new Blob([BOM + [col.join(';'), ...linhas].join(QUEBRA)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function novoCliente() {
    setAberto({ cliente: { id: crypto.randomUUID(), ...VAZIO }, novo: true });
  }

  const menuDaLinha = (c: Cliente) => (
    <MenuMais
      rotulo={`Mais ações — ${c.razaoSocial}`}
      acoes={[
        { rotulo: 'Abrir', icone: <Icone nome="eye" tam={14} />, aoEscolher: () => setAberto({ cliente: c, novo: false }) },
        { rotulo: 'Editar', icone: <Icone nome="pencil" tam={14} />, aoEscolher: () => setAberto({ cliente: c, novo: false, acao: 'editar' }) },
        {
          rotulo: 'Excluir…',
          destrutiva: true,
          icone: <Icone nome="trash" tam={14} />,
          aoEscolher: () => setAberto({ cliente: c, novo: false, acao: 'excluir' }),
        },
      ]}
    />
  );

  return (
    <div className="cli-v4">
      {/* O título já está no cabeçalho de 48px: a página não o repete. */}
      <section className="cli-painel" aria-label="Clientes">
        <div className="cli-barra">
          <h2 className="cli-titulo">Clientes</h2>
          <label className="cli-busca">
            <Icone nome="search" tam={15} />
            <input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por nome, CNPJ, cidade ou contato"
              aria-label="Buscar clientes"
            />
          </label>
          <div className="cli-seg" role="group" aria-label="Recorte">
            {RECORTES.map((r) => (
              <button key={r.valor} type="button" aria-pressed={recorte === r.valor} onClick={() => setRecorte(r.valor)}>
                {r.rotulo} <span className="n">{contagem[r.valor]}</span>
              </button>
            ))}
          </div>
          <span className="cli-esp" />
          <button type="button" className="cli-exportar" onClick={exportarCsv} disabled={visiveis.length === 0}>
            <Icone nome="download" tam={16} /> Exportar
          </button>
          <button type="button" className="mcli-btn pri" onClick={novoCliente}>
            <Icone nome="plus" tam={14} /> Novo cliente
          </button>
        </div>

        {clientes.length === 0 ? (
          <div className="cli-vazio">
            <p>Nenhum cliente cadastrado ainda.</p>
            <p className="sub">Cadastre as empresas clientes para escolhê-las rapidamente nos equipamentos.</p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="cli-vazio vz-centro">
            <Ilustracao nome="busca" />
            <p>Nenhum cliente encontrado.</p>
          </div>
        ) : (
          <>
            <table className="cli-tabela cli-desk">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Cidade</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Equipamentos</th>
                  <th>Portal</th>
                  <th className="acoes"><span className="cli-sr">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} onClick={() => setAberto({ cliente: c, novo: false })}>
                    <td className="cli-nome">
                      <LogoCliente cliente={c} tam={28} classe="cli-logo" />
                      <button
                        type="button"
                        className="cli-nome-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAberto({ cliente: c, novo: false });
                        }}
                      >
                        <b title={nomeDe(c)}>{nomeDe(c)}</b>
                        {segundaLinha(c) && <small>{segundaLinha(c)}</small>}
                      </button>
                    </td>
                    <td className="mono sub">{c.cnpj || '—'}</td>
                    <td className="sub2">{cidadeUf(c) || '—'}</td>
                    <td className="sub2">{c.contato || '—'}</td>
                    <td className="mono sub">{c.telefone || '—'}</td>
                    <td>
                      {catalogoItens ? (
                        <span className="cli-qtd">{equipamentosDoCliente(catalogoItens, c).length}</span>
                      ) : (
                        <span className="cli-qtd vazio">—</span>
                      )}
                    </td>
                    <td>
                      {c.portalEmail ? (
                        <span className="badge b-ok"><Icone nome="checkcircle" tam={12} /> Ativo</span>
                      ) : (
                        <span className="badge b-neutro">Sem acesso</span>
                      )}
                    </td>
                    <td className="acoes" onClick={(e) => e.stopPropagation()}>
                      {/* Ações do protótipo: WhatsApp, editar, abrir. Excluir
                          fica dentro da ficha do cliente (menu dela). */}
                      <span className="cli-acoes">
                        {linkZap(c.telefone) && (
                          <a className="cli-ra zap" href={linkZap(c.telefone)!} target="_blank" rel="noopener noreferrer" title="Conversar no WhatsApp" aria-label={`WhatsApp de ${nomeDe(c)}`}>
                            <Icone nome="phone" tam={15} />
                          </a>
                        )}
                        <button type="button" className="cli-ra edit" title="Editar" aria-label={`Editar ${nomeDe(c)}`} onClick={() => setAberto({ cliente: c, novo: false, acao: 'editar' })}>
                          <Icone nome="pencil" tam={15} />
                        </button>
                        <button type="button" className="cli-ra vis" title="Abrir" aria-label={`Abrir ${nomeDe(c)}`} onClick={() => setAberto({ cliente: c, novo: false })}>
                          <Icone nome="arrowright" tam={15} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Celular: item de duas linhas, 64px, alvo inteiro. */}
            <ul className="cli-lista-m">
              {visiveis.map((c) => (
                <li key={c.id}>
                  <button type="button" className="cli-item" onClick={() => setAberto({ cliente: c, novo: false })}>
                    <LogoCliente cliente={c} tam={32} classe="cli-logo" />
                    <span className="cli-item-txt">
                      <span className="cli-item-nome">{nomeDe(c)}</span>
                      <span className="cli-item-meta">
                        {[cidadeUf(c), c.contato].filter(Boolean).join(' · ') || (c.cnpj ? c.cnpj : '—')}
                        {c.portalEmail && <span className="badge b-ok"><Icone nome="checkcircle" tam={12} /> Portal</span>}
                      </span>
                    </span>
                  </button>
                  {menuDaLinha(c)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {aberto && (
        <ModalCliente
          key={aberto.cliente.id}
          cliente={aberto.cliente}
          novo={aberto.novo}
          acaoInicial={aberto.acao}
          aoFechar={() => setAberto(null)}
          aoMudarLista={setClientes}
        />
      )}
    </div>
  );
}
