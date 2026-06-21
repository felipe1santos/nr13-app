import { useState } from 'react';
import { ler, salvar } from '../../services/storage';
import type { EmpresaEquipamento } from './tipos';
import Campo from '../memorial/Campo';
import { listarClientes } from '../cadastros/cadastroService';
import type { Cliente } from '../cadastros/tipos';
import '../../pages/cadastros.css';

const CAMPOS_VIEW: { chave: keyof EmpresaEquipamento; label: string; span2?: boolean }[] = [
  { chave: 'razaoSocial', label: 'Razão Social', span2: true },
  { chave: 'cnpj', label: 'CNPJ' },
  { chave: 'nomeFantasia', label: 'Nome Fantasia' },
  { chave: 'atividade', label: 'Atividade Principal', span2: true },
  { chave: 'endereco', label: 'Endereço', span2: true },
  { chave: 'bairro', label: 'Bairro' },
  { chave: 'cep', label: 'CEP' },
  { chave: 'cidade', label: 'Cidade' },
  { chave: 'estado', label: 'Estado' },
  { chave: 'telefone', label: 'Telefone' },
  { chave: 'contato', label: 'Contato' },
  { chave: 'email', label: 'E-mail' },
];

export default function DadosEmpresa({ tag }: { tag: string }) {
  const [editando, setEditando] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaEquipamento>(() => ler<EmpresaEquipamento>(`nr13_emp_${tag}`) || {});
  const [salvando, setSalvando] = useState(false);
  const [clientes] = useState<Cliente[]>(() => listarClientes());

  function set(chave: keyof EmpresaEquipamento, valor: string) {
    setEmpresa((e) => ({ ...e, [chave]: valor }));
  }

  function setCidade(valor: string) {
    setEmpresa((e) => ({ ...e, cidade: valor, localidade: valor }));
  }

  function aplicarCliente(id: string) {
    if (!id) {
      setEmpresa((e) => ({ ...e, clienteId: undefined }));
      return;
    }
    const c = clientes.find((cl) => cl.id === id);
    if (!c) return;
    setEmpresa((e) => ({
      ...e,
      clienteId: c.id,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      cnpj: c.cnpj,
      atividade: c.atividade,
      endereco: c.endereco,
      bairro: c.bairro,
      cidade: c.cidade,
      localidade: c.cidade,
      cep: c.cep,
      estado: c.estado,
      telefone: c.telefone,
      contato: c.contato,
      email: c.email,
    }));
  }

  async function salvarTudo() {
    setSalvando(true);
    try {
      await salvar(`nr13_emp_${tag}`, empresa);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="bloco-header-acoes">
        <h4>Dados da Empresa</h4>
        {!editando && (
          <button type="button" className="btn-editar-pencil" onClick={() => setEditando(true)} title="Editar">
            ✏️
          </button>
        )}
      </div>

      {editando ? (
        <>
          {clientes.length > 0 && (
            <div className="emp-cliente-selector">
              <label>Selecionar empresa cadastrada</label>
              <select
                value={empresa.clienteId || ''}
                onChange={(e) => aplicarCliente(e.target.value)}
              >
                <option value="">— Preencher manualmente —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razaoSocial}{c.nomeFantasia ? ` (${c.nomeFantasia})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="memorial-campos-grid">
            <Campo label="Razão Social" type="text" value={empresa.razaoSocial ?? ''} onChange={(v) => set('razaoSocial', v)} />
            <Campo label="CNPJ" type="text" value={empresa.cnpj ?? ''} onChange={(v) => set('cnpj', v)} />
            <Campo label="Nome Fantasia" type="text" value={empresa.nomeFantasia ?? ''} onChange={(v) => set('nomeFantasia', v)} />
            <Campo label="Atividade" type="text" value={empresa.atividade ?? ''} onChange={(v) => set('atividade', v)} />
            <Campo label="Endereço" type="text" value={empresa.endereco ?? ''} onChange={(v) => set('endereco', v)} />
            <Campo label="Bairro" type="text" value={empresa.bairro ?? ''} onChange={(v) => set('bairro', v)} />
            <Campo label="CEP" type="text" value={empresa.cep ?? ''} onChange={(v) => set('cep', v)} />
            <Campo label="Cidade" type="text" value={empresa.cidade ?? ''} onChange={(v) => setCidade(v)} />
            <Campo label="Estado" type="text" value={empresa.estado ?? ''} onChange={(v) => set('estado', v)} />
            <Campo label="Telefone" type="text" value={empresa.telefone ?? ''} onChange={(v) => set('telefone', v)} />
            <Campo label="Contato" type="text" value={empresa.contato ?? ''} onChange={(v) => set('contato', v)} />
            <Campo label="E-mail" type="text" value={empresa.email ?? ''} onChange={(v) => set('email', v)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn-primario" onClick={salvarTudo} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Dados da Empresa'}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="dash-grid-4">
          {CAMPOS_VIEW.map((c) => (
            <div key={c.chave} className={`resultado-item ${c.span2 ? 'span-2' : ''}`}>
              <span className="lbl-view">{c.label}</span>
              <span className="val-view">{empresa[c.chave] || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
