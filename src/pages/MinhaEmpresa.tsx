import { useState } from 'react';
import { Icone } from '../components/Icone';
import { carregarMinhaEmpresa, salvarMinhaEmpresa } from '../features/cadastros/cadastroService';
import type { MinhaEmpresaDados } from '../features/cadastros/tipos';
import { comprimirImagemComBlob } from '../services/imagem';
import { paraGravar, ESCOPO_LOGO } from '../services/identidadeVisual';
import SeletorModeloRelatorio from '../features/relatorios/SeletorModeloRelatorio';
import ModalTrocarSenha from '../components/ModalTrocarSenha';
import './cadastros.css';
import { useEmailDaSessao } from '../services/emailSessao';

export default function MinhaEmpresa() {
  // Hook no TOPO: a tela tem um `return` antecipado (modo edição).
  const email = useEmailDaSessao();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
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
      // FASE 7B — GRAVAÇÃO DUPLA (D-11), e ela é deliberada.
      //
      // A dataURL continua na chave viva durante toda a convivência: é o que
      // torna o rollback para a 7A gratuito, porque o código anterior volta a
      // lê-la sem perder nada. O ganho da fase NÃO vem daqui — vem do snapshot
      // do relatório novo, que congela só a referência.
      //
      // Custo declarado: a logo fica duplicada nesta chave (~7 KB) enquanto a
      // convivência durar. É UMA chave por organização, e o encerramento tem
      // data-alvo em PENDENCIAS.md (deploy + 45 dias, condições C1–C8).
      const { dataUrl, ref } = await paraGravar(
        await comprimirImagemComBlob(file, 300),
        ESCOPO_LOGO,
      );
      setRascunho((d) => ({ ...d, logo: dataUrl, ...(ref ? { logoRef: ref } : {}) }));
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

  const nomeExibido = dados.fantasia || dados.razao || 'Sua empresa';
  const cidadeUf = [dados.cidade, dados.estado].filter(Boolean).join(' · ');

  return (
    <div className="cad-page md2">
      {vazio ? (
        <section className="md2-card md2-vazio">
          <b>Nenhum dado cadastrado ainda.</b>
          <span>Os dados e a logo da sua empresa saem no cabeçalho de relatórios, prontuários e certificados.</span>
          <button type="button" className="btn-primario md2-editar" onClick={iniciarEdicao}>
            PREENCHER DADOS
          </button>
        </section>
      ) : (
        <>
          {/* Topo (protótipo Cobalto): logo, nome em destaque, razão e CNPJ. */}
          <section className="md2-card md2-topo">
            <div className="md2-logo">
              {dados.logo ? <img src={dados.logo} alt="Logo da empresa" /> : <span>Sem logo</span>}
            </div>
            <div className="md2-id">
              <h1>{nomeExibido}</h1>
              <p>
                {dados.razao || '—'}
                {dados.cnpj ? ` · CNPJ ${dados.cnpj}` : ''}
              </p>
              <p className="md2-info">
                <Icone nome="info" tam={14} /> Estes dados e a logo saem no cabeçalho de relatórios, prontuários e
                certificados. Documentos já emitidos guardam a versão da época.
              </p>
            </div>
            <button type="button" className="btn-primario md2-editar" onClick={iniciarEdicao}>
              EDITAR DADOS
            </button>
          </section>

          <div className="md2-cols">
            <section className="md2-card">
              <h2>Dados da empresa</h2>
              <dl className="md2-dl">
                <div className="s2"><dt>Razão social</dt><dd>{dados.razao || '—'}</dd></div>
                <div><dt>Nome fantasia</dt><dd>{dados.fantasia || '—'}</dd></div>
                <div><dt>CNPJ</dt><dd>{dados.cnpj || '—'}</dd></div>
              </dl>
            </section>
            <section className="md2-card">
              <h2>Endereço e contato</h2>
              <dl className="md2-dl">
                <div className="s2"><dt>Endereço</dt><dd>{dados.endereco || '—'}</dd></div>
                <div><dt>Bairro</dt><dd>{dados.bairro || '—'}</dd></div>
                <div><dt>CEP</dt><dd>{dados.cep || '—'}</dd></div>
                <div><dt>Cidade</dt><dd>{cidadeUf || '—'}</dd></div>
                <div><dt>Telefone</dt><dd>{dados.telefone || '—'}</dd></div>
                <div className="s2"><dt>E-mail</dt><dd>{dados.email || '—'}</dd></div>
              </dl>
            </section>
          </div>

          {/* Seu acesso: a troca de senha também mora aqui (pedido do dono). */}
          <section className="md2-card">
            <h2>Seu acesso</h2>
            <div className="md2-acesso">
              <span className="md2-av">{(email ?? '?').slice(0, 2).toUpperCase()}</span>
              <dl className="md2-dl md2-dl-4">
                <div><dt>Usuário</dt><dd>{email ? email.split('@')[0] : '—'}</dd></div>
                <div className="s2"><dt>E-mail de login</dt><dd>{email ?? '—'}</dd></div>
              </dl>
              <button type="button" className="btn-secundario md2-senha" onClick={() => setTrocandoSenha(true)}>
                <Icone nome="key" tam={15} /> Trocar senha
              </button>
            </div>
          </section>

          {/* Prévia do cabeçalho dos documentos. */}
          <section className="md2-card">
            <h2>Como aparece nos documentos</h2>
            <div className="md2-prev">
              <div className="md2-folha">
                <div className="md2-cab">
                  <div className="md2-logo mini">{dados.logo ? <img src={dados.logo} alt="" /> : <span>Logo</span>}</div>
                  <div>
                    <b>{dados.razao || nomeExibido}</b>
                    <small>
                      {[dados.cnpj && `CNPJ ${dados.cnpj}`, cidadeUf, dados.telefone].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                </div>
                <div className="ln" />
                <div className="ln" style={{ width: '80%' }} />
                <div className="ln" style={{ width: '65%' }} />
              </div>
            </div>
          </section>
        </>
      )}

      {/* Configuração da ORGANIZAÇÃO, fora do formulário de cadastro — grava sozinha. */}
      <SeletorModeloRelatorio />

      {trocandoSenha && email && <ModalTrocarSenha email={email} onClose={() => setTrocandoSenha(false)} />}
    </div>
  );
}
