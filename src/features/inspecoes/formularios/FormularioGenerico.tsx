import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { ROTULO_FORMULARIO, type FormularioEnsaio } from '../tipos';

interface DadosGenerico {
  data: string;
  inspetor: string;
  observacoes: string;
  status: 'Aprovado' | 'Reprovado' | '';
}

function dadosPadrao(): DadosGenerico {
  return { data: new Date().toISOString().split('T')[0], inspetor: '', observacoes: '', status: '' };
}

export default function FormularioGenerico({
  tag,
  containerId,
  formulario,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
}) {
  const [dados, setDados] = useState<DadosGenerico>(
    () => carregarDadosFormulario<DadosGenerico>(tag, containerId, formulario) ?? dadosPadrao(),
  );
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof DadosGenerico>(chave: K, valor: DadosGenerico[K]) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await salvarDadosFormulario(tag, containerId, formulario, dados);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>{ROTULO_FORMULARIO[formulario]}</h3>
        <div className="form-grid">
          <label>
            T.A.G.
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Data do Ensaio
            <input type="date" value={dados.data} onChange={(e) => set('data', e.target.value)} />
          </label>
          <label>
            Inspecionado Por
            <input type="text" value={dados.inspetor} onChange={(e) => set('inspetor', e.target.value)} />
          </label>
          <label>
            Status Final
            <select
              className="status-select"
              value={dados.status}
              onChange={(e) => set('status', e.target.value as DadosGenerico['status'])}
            >
              <option value="">Selecione...</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Reprovado">Reprovado</option>
            </select>
          </label>
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>
            Observações / Resultado
            <textarea rows={5} value={dados.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </>
  );
}
