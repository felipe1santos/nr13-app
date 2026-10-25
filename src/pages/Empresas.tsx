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
import { useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import MenuMais from '../components/MenuMais';
import { listarClientes } from '../features/cadastros/cadastroService';
import LogoCliente from '../features/cadastros/LogoCliente';
import ModalCliente from '../features/cadastros/ModalCliente';
import { normalizarNome } from '../features/cadastros/clienteResumo';
import type { Cliente } from '../features/cadastros/tipos';
import '../features/cadastros/modalCliente.css';
import './clientes.css';

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
  return c.cidade ? `${c.cidade}${c.estado ? `/${c.estado}` : ''}` : '';
}

export default function Empresas() {
  const [clientes, setClientes] = useState<Cliente[]>(() => listarClientes());
  const [termo, setTermo] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todos');
  const [aberto, setAberto] = useState<Aberto | null>(null);

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
          <div className="cli-vazio">
            <p>Nenhum cliente encontrado.</p>
          </div>
        ) : (
          <>
            <table className="cli-tabela cli-desk">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CNPJ</th>
                  <th>Cidade</th>
                  <th>Contato</th>
                  <th>Telefone</th>
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
                        {c.razaoSocial}
                      </button>
                    </td>
                    <td className="mono sub">{c.cnpj || '—'}</td>
                    <td className="sub2">{cidadeUf(c) || '—'}</td>
                    <td className="sub2">{c.contato || '—'}</td>
                    <td className="mono sub">{c.telefone || '—'}</td>
                    <td>
                      {c.portalEmail ? (
                        <span className="badge b-ok"><Icone nome="checkcircle" tam={12} /> Ativo</span>
                      ) : (
                        <span className="badge b-neutro">Sem acesso</span>
                      )}
                    </td>
                    <td className="acoes" onClick={(e) => e.stopPropagation()}>
                      {menuDaLinha(c)}
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
                      <span className="cli-item-nome">{c.razaoSocial}</span>
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
