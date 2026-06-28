import { useState } from 'react';
import { carregarMinhaEmpresa, salvarMinhaEmpresa } from '../features/cadastros/cadastroService';
import type { MinhaEmpresaDados } from '../features/cadastros/tipos';
import { comprimirImagem } from '../services/imagem';
import './cadastros.css';

export default function MinhaEmpresa() {
  const [editando, setEditando] = useState(false);
  const [dados, setDados] = useState<MinhaEmpresaDados>(() => carregarMinhaEmpresa());
  const [rascunho, setRascunho] = useState<MinhaEmpresaDados>({});
  const [salvando, setSalvando] = useState(false);

  function iniciarEdicao() {
    setRascunho({ ...dados });
    setEditando(true);
  }

  function cancelar() {
    setEditando(false);
    setRascunho({});
  }

  function set(chave: keyof MinhaEmpresaDados, valor: string) {
    setRascunho((d) => ({ ...d, [chave]: valor }));
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Comprime antes de gravar: logo em resolução cheia (vários MB em base64) estoura a cota do
    // localStorage e impede a hidratação dos dados no PC do escritório — a logo some dos documentos.
    try {
      set('logo', await comprimirImagem(file, 300));
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => set('logo', ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      salvarMinhaEmpresa(rascunho);
      setDados(rascunho);
      setEditando(false);
      setRascunho({});
    } finally {
      setSalvando(false);
    }
  }

  const vazio = !dados.razao && !dados.fantasia && !dados.cnpj;

  if (editando) {
    return (
      <div className="cad-page">
        <div className="cad-page-header">
          <div>
            <h2 className="cad-page-titulo">Minha Empresa</h2>
            <p className="cad-page-sub">Dados injetados automaticamente em toda documentação gerada</p>
          </div>
        </div>

        <div className="cad-card">
          <div className="cad-secao-titulo">Logo</div>
          <div className="cad-logo-area">
            {rascunho.logo ? (
              <img src={rascunho.logo} alt="Logo" className="cad-logo-preview" />
            ) : (
              <div className="cad-sem-logo">Sem logo</div>
            )}
            <div className="cad-logo-acoes">
              <label className="cad-upload-btn">
                {rascunho.logo ? 'Trocar Logo' : 'Carregar Logo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
              </label>
              {rascunho.logo && (
                <button type="button" className="btn-secundario" onClick={() => set('logo', '')}>
                  Remover
                </button>
              )}
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Identificação</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Razão Social</label>
              <input type="text" value={rascunho.razao || ''} onChange={(e) => set('razao', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Nome Fantasia</label>
              <input type="text" value={rascunho.fantasia || ''} onChange={(e) => set('fantasia', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CNPJ</label>
              <input type="text" value={rascunho.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Contato</div>
          <div className="cad-grid">
            <div className="cad-campo">
              <label>Telefone</label>
              <input type="text" value={rascunho.telefone || ''} onChange={(e) => set('telefone', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>E-mail</label>
              <input type="text" value={rascunho.email || ''} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Endereço</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Endereço</label>
              <input type="text" value={rascunho.endereco || ''} onChange={(e) => set('endereco', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Bairro</label>
              <input type="text" value={rascunho.bairro || ''} onChange={(e) => set('bairro', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CEP</label>
              <input type="text" value={rascunho.cep || ''} onChange={(e) => set('cep', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Cidade</label>
              <input type="text" value={rascunho.cidade || ''} onChange={(e) => set('cidade', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Estado</label>
              <input type="text" value={rascunho.estado || ''} onChange={(e) => set('estado', e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Dados'}
            </button>
            <button type="button" className="btn-secundario" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cad-page">
      <div className="cad-page-header">
        <div>
          <h2 className="cad-page-titulo">Minha Empresa</h2>
          <p className="cad-page-sub">Dados injetados automaticamente em toda documentação gerada</p>
        </div>
        <button type="button" className="btn-editar-pencil" onClick={iniciarEdicao} title="Editar">
          ✏️
        </button>
      </div>

      {vazio ? (
        <div className="cad-vazio">
          <div>Nenhum dado cadastrado ainda.</div>
          <div className="cad-vazio-sub">Clique no lápis para preencher os dados da sua empresa.</div>
          <button type="button" className="btn-primario" style={{ marginTop: 16 }} onClick={iniciarEdicao}>
            Preencher Dados
          </button>
        </div>
      ) : (
        <div className="cad-card">
          {dados.logo && (
            <div style={{ marginBottom: 20 }}>
              <img src={dados.logo} alt="Logo" className="cad-logo-preview" />
            </div>
          )}

          <div className="cad-secao-titulo">Identificação</div>
          <div className="dash-grid-4" style={{ marginBottom: 20 }}>
            <div className="resultado-item span-2">
              <span className="lbl-view">Razão Social</span>
              <span className="val-view">{dados.razao || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Nome Fantasia</span>
              <span className="val-view">{dados.fantasia || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">CNPJ</span>
              <span className="val-view">{dados.cnpj || '—'}</span>
            </div>
          </div>

          <div className="cad-secao-titulo">Contato</div>
          <div className="dash-grid-4" style={{ marginBottom: 20 }}>
            <div className="resultado-item">
              <span className="lbl-view">Telefone</span>
              <span className="val-view">{dados.telefone || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">E-mail</span>
              <span className="val-view">{dados.email || '—'}</span>
            </div>
          </div>

          <div className="cad-secao-titulo">Endereço</div>
          <div className="dash-grid-4">
            <div className="resultado-item span-2">
              <span className="lbl-view">Endereço</span>
              <span className="val-view">{dados.endereco || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Bairro</span>
              <span className="val-view">{dados.bairro || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">CEP</span>
              <span className="val-view">{dados.cep || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Cidade</span>
              <span className="val-view">{dados.cidade || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Estado</span>
              <span className="val-view">{dados.estado || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
