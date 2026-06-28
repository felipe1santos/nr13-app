import { useRef, useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { comprimirImagem } from '../../../services/imagem';

interface LinhaCurva {
  tempo: string;
  pressao: string;
}

interface Foto {
  base64: string;
  descricao: string;
}

interface DadosTH {
  cliente: string;
  docNum: string;
  equipamento: string;
  dataTeste: string;
  pressaoProj: string;
  pressaoTeste: string;
  fluido: string;
  curva: LinhaCurva[];
  fotos: Foto[];
}

function dadosPadrao(): DadosTH {
  return {
    cliente: '',
    docNum: '',
    equipamento: 'Vaso de Pressão',
    dataTeste: new Date().toISOString().split('T')[0],
    pressaoProj: '',
    pressaoTeste: '',
    fluido: 'Água Potável',
    curva: [{ tempo: '', pressao: '' }, { tempo: '', pressao: '' }, { tempo: '', pressao: '' }],
    fotos: [],
  };
}

export default function FormularioTH({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosTH>(() => carregarDadosFormulario<DadosTH>(tag, containerId, 'th') ?? dadosPadrao());
  useAutosaveFormulario(tag, containerId, 'th', dados);
  const [salvando, setSalvando] = useState(false);
  const [salvoOk, setSalvoOk] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function set(chave: keyof DadosTH, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function setLinha(i: number, chave: keyof LinhaCurva, valor: string) {
    setDados((d) => ({ ...d, curva: d.curva.map((l, idx) => (idx === i ? { ...l, [chave]: valor } : l)) }));
  }

  function adicionarLinha() {
    setDados((d) => ({ ...d, curva: [...d.curva, { tempo: '', pressao: '' }] }));
  }

  function removerLinha(i: number) {
    setDados((d) => ({ ...d, curva: d.curva.filter((_, idx) => idx !== i) }));
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      // 800px para qualidade adequada no laudo impresso
      const base64 = await comprimirImagem(arquivo, 800);
      setDados((d) => ({ ...d, fotos: [...d.fotos, { base64, descricao: '' }] }));
    } catch {
      setErroSalvar('Erro ao processar imagem. Tente outra foto.');
      setTimeout(() => setErroSalvar(''), 4000);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function setDescricaoFoto(i: number, descricao: string) {
    setDados((d) => ({ ...d, fotos: d.fotos.map((f, idx) => (idx === i ? { ...f, descricao } : f)) }));
  }

  function removerFoto(i: number) {
    setDados((d) => ({ ...d, fotos: d.fotos.filter((_, idx) => idx !== i) }));
  }

  async function salvar() {
    setSalvando(true);
    setSalvoOk(false);
    setErroSalvar('');
    const inicio = Date.now();
    try {
      await salvarDadosFormulario(tag, containerId, 'th', dados);
      // Garante ao menos 600ms visíveis de "Salvando..." para o usuário perceber
      const restante = 600 - (Date.now() - inicio);
      if (restante > 0) await new Promise((r) => setTimeout(r, restante));
      setSalvoOk(true);
      setTimeout(() => setSalvoOk(false), 3000);
    } catch (err) {
      setErroSalvar('Erro ao salvar: ' + String(err));
    } finally {
      setSalvando(false);
    }
  }

  const nFotos = dados.fotos.length;
  const nFolhas = Math.max(1, Math.ceil(nFotos / 4));

  return (
    <>
      <div className="formulario-secao">
        <h3>Informações Gerais do Teste</h3>
        <div className="form-grid">
          <label>
            Cliente / Empresa
            <input type="text" value={dados.cliente} onChange={(e) => set('cliente', e.target.value)} />
          </label>
          <label>
            Doc Nº
            <input type="text" value={dados.docNum} onChange={(e) => set('docNum', e.target.value)} />
          </label>
          <label>
            T.A.G.
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Equipamento
            <input type="text" value={dados.equipamento} onChange={(e) => set('equipamento', e.target.value)} />
          </label>
          <label>
            Data do Teste
            <input type="date" value={dados.dataTeste} onChange={(e) => set('dataTeste', e.target.value)} />
          </label>
          <label>
            Pressão de Projeto (kgf/cm²)
            <input type="number" step="0.01" value={dados.pressaoProj} onChange={(e) => set('pressaoProj', e.target.value)} />
          </label>
          <label>
            Pressão de Teste (kgf/cm²)
            <input type="number" step="0.01" value={dados.pressaoTeste} onChange={(e) => set('pressaoTeste', e.target.value)} />
          </label>
          <label>
            Fluido Utilizado
            <input type="text" value={dados.fluido} onChange={(e) => set('fluido', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Curva de Pressurização e Estabilização</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Os dados preenchidos aqui irão compor o gráfico de estabilização do laudo técnico.
        </p>
        {dados.curva.map((linha, i) => (
          <div key={i} className="linha-medida-card">
            <span className="linha-medida-titulo">Ponto {i + 1}</span>
            <div className="linha-medida-campos">
              <label>
                Tempo (min)
                <input type="number" value={linha.tempo} onChange={(e) => setLinha(i, 'tempo', e.target.value)} />
              </label>
              <label>
                Pressão (kgf/cm²)
                <input type="number" step="0.01" value={linha.pressao} onChange={(e) => setLinha(i, 'pressao', e.target.value)} />
              </label>
            </div>
            {dados.curva.length > 1 && (
              <button type="button" className="btn-remover-linha" onClick={() => removerLinha(i)}>
                Remover ponto
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn-secundario" onClick={adicionarLinha}>
          + Adicionar Ponto
        </button>
      </div>

      <div className="formulario-secao">
        <h3>
          Registro Fotográfico
          {nFotos > 0 && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 10 }}>
              {nFotos} foto{nFotos !== 1 ? 's' : ''} → {nFolhas} folha{nFolhas !== 1 ? 's' : ''} de evidência no laudo
            </span>
          )}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Sem limite de fotos. 4 fotos por folha no laudo. Cada foto pode ter uma legenda.
        </p>

        <div className="fotos-formulario-grid">
          {dados.fotos.map((f, i) => (
            <div key={i} className="foto-formulario-item">
              <img src={f.base64} alt={`Foto ${i + 1}`} />
              <input
                type="text"
                placeholder={`Legenda da Foto ${i + 1}`}
                value={f.descricao}
                onChange={(e) => setDescricaoFoto(i, e.target.value)}
              />
              <button type="button" className="btn-remover-linha" onClick={() => removerFoto(i)}>
                Remover
              </button>
            </div>
          ))}
        </div>

        {/* Botão sempre visível — sem limite */}
        <label className="btn-add-foto" style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>
          + Adicionar Foto
          <input ref={inputRef} type="file" accept="image/*" onChange={adicionarFoto} style={{ display: 'none' }} />
        </label>
      </div>

      {erroSalvar && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          {erroSalvar}
        </div>
      )}

      <div className="formulario-acoes-fixas">
        <button
          type="button"
          className="btn-primario"
          onClick={salvar}
          disabled={salvando}
          style={salvoOk ? { background: '#16a34a' } : undefined}
        >
          {salvando ? 'Salvando...' : salvoOk ? '✓ Salvo com sucesso!' : 'Salvar'}
        </button>
      </div>
    </>
  );
}
