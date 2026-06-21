import { useState } from 'react';
import { ler } from '../../../services/storage';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import type { EmpresaEquipamento } from '../../equipamento/tipos';

const PROCEDIMENTO =
  'A calibração é realizada por comparação direta com o padrão de referência e a leitura do erro indicada no instrumento em calibração.';

interface LinhaCalibracao {
  vcv: string;
  vic: string;
  vid: string;
}

interface DadosManometro {
  cliente: string;
  endereco: string;
  fabricante: string;
  modelo: string;
  serie: string;
  dataCal: string;
  dataProx: string;
  tempAr: string;
  umidade: string;
  local: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  incerteza: string;
  coeficiente: string;
  status: 'Aprovado' | 'Reprovado' | '';
  obs: string;
  linhas: LinhaCalibracao[];
}

function linhasVazias(): LinhaCalibracao[] {
  return Array.from({ length: 5 }, () => ({ vcv: '', vic: '', vid: '' }));
}

function dadosPadrao(tag: string): DadosManometro {
  const empresa = ler<EmpresaEquipamento>(`nr13_emp_${tag}`);
  const rastreabilidade = ler<{ manometro?: Record<string, string> }>('nr13_rastreabilidade');
  const padrao = rastreabilidade?.manometro;
  return {
    cliente: empresa?.razaoSocial ?? '',
    endereco: empresa?.endereco ?? '',
    fabricante: '',
    modelo: '',
    serie: '',
    dataCal: new Date().toISOString().split('T')[0],
    dataProx: '',
    tempAr: '',
    umidade: '',
    local: '',
    padraoInst: padrao?.padraoInst ?? '',
    padraoSerie: padrao?.padraoSerie ?? '',
    padraoCert: padrao?.padraoCert ?? '',
    padraoVal: padrao?.padraoVal ?? '',
    incerteza: '',
    coeficiente: '',
    status: '',
    obs: '',
    linhas: linhasVazias(),
  };
}

function erro(vi: string, vcv: string): string {
  const a = parseFloat(vi);
  const b = parseFloat(vcv);
  if (Number.isNaN(a) || Number.isNaN(b)) return '';
  return (a - b).toFixed(2);
}

export default function FormularioManometro({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosManometro>(
    () => carregarDadosFormulario<DadosManometro>(tag, containerId, 'manometro') ?? dadosPadrao(tag),
  );
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof DadosManometro>(chave: K, valor: DadosManometro[K]) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function setLinha(i: number, chave: keyof LinhaCalibracao, valor: string) {
    setDados((d) => ({ ...d, linhas: d.linhas.map((l, idx) => (idx === i ? { ...l, [chave]: valor } : l)) }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await salvarDadosFormulario(tag, containerId, 'manometro', dados);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>1. Dados do Cliente / Solicitante</h3>
        <div className="form-grid">
          <label>
            Empresa
            <input type="text" value={dados.cliente} onChange={(e) => set('cliente', e.target.value)} />
          </label>
          <label>
            Endereço
            <input type="text" value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>2. Dados do Item Calibrado</h3>
        <div className="form-grid">
          <label>
            Instrumento
            <input type="text" value="Manômetro" disabled />
          </label>
          <label>
            Referência (T.A.G)
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Fabricante
            <input type="text" value={dados.fabricante} onChange={(e) => set('fabricante', e.target.value)} />
          </label>
          <label>
            Modelo
            <input type="text" value={dados.modelo} onChange={(e) => set('modelo', e.target.value)} />
          </label>
          <label>
            Lote / Série
            <input type="text" value={dados.serie} onChange={(e) => set('serie', e.target.value)} />
          </label>
          <label>
            Data da Calibração
            <input type="date" value={dados.dataCal} onChange={(e) => set('dataCal', e.target.value)} />
          </label>
          <label>
            Data da Próxima Calibração
            <input type="date" value={dados.dataProx} onChange={(e) => set('dataProx', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>3. Procedimento</h3>
        <div className="form-grid">
          <label>
            Procedimento de Calibração
            <textarea value={PROCEDIMENTO} disabled rows={3} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>4. Condições Ambientais</h3>
        <div className="form-grid">
          <label>
            Temperatura do Ar (°C)
            <input type="text" value={dados.tempAr} onChange={(e) => set('tempAr', e.target.value)} />
          </label>
          <label>
            Umidade Relativa (%)
            <input type="text" value={dados.umidade} onChange={(e) => set('umidade', e.target.value)} />
          </label>
          <label>
            Local
            <input type="text" value={dados.local} onChange={(e) => set('local', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>5. Padrões Utilizados e Rastreabilidade</h3>
        <div className="form-grid">
          <label>
            Instrumento Padrão
            <input type="text" value={dados.padraoInst} onChange={(e) => set('padraoInst', e.target.value)} />
          </label>
          <label>
            Nº Série
            <input type="text" value={dados.padraoSerie} onChange={(e) => set('padraoSerie', e.target.value)} />
          </label>
          <label>
            Nº Certificado
            <input type="text" value={dados.padraoCert} onChange={(e) => set('padraoCert', e.target.value)} />
          </label>
          <label>
            Validade
            <input type="date" value={dados.padraoVal} onChange={(e) => set('padraoVal', e.target.value)} />
          </label>
          <label>
            Incerteza de Medição
            <input type="text" value={dados.incerteza} onChange={(e) => set('incerteza', e.target.value)} />
          </label>
          <label>
            Coeficiente k
            <input type="text" value={dados.coeficiente} onChange={(e) => set('coeficiente', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>6. Resultados Obtidos</h3>
        {dados.linhas.map((linha, i) => (
          <div key={i} className="linha-medida-card">
            <span className="linha-medida-titulo">Ponto {i + 1}</span>
            <div className="linha-medida-campos">
              <label>
                VCV (Valor Verdadeiro)
                <input type="number" step="0.01" value={linha.vcv} onChange={(e) => setLinha(i, 'vcv', e.target.value)} />
              </label>
              <label>
                VI Crescente
                <input type="number" step="0.01" value={linha.vic} onChange={(e) => setLinha(i, 'vic', e.target.value)} />
              </label>
              <label>
                VI Decrescente
                <input type="number" step="0.01" value={linha.vid} onChange={(e) => setLinha(i, 'vid', e.target.value)} />
              </label>
              <label>
                Erro (C / D)
                <input type="text" value={`${erro(linha.vic, linha.vcv) || '—'} / ${erro(linha.vid, linha.vcv) || '—'}`} disabled />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="formulario-secao">
        <h3>8. Conclusão Técnica</h3>
        <div className="form-grid">
          <label>
            Status Final
            <select
              className="status-select"
              value={dados.status}
              onChange={(e) => set('status', e.target.value as DadosManometro['status'])}
            >
              <option value="">Selecione...</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Reprovado">Reprovado</option>
            </select>
          </label>
          <label>
            Observações Adicionais
            <textarea rows={3} value={dados.obs} onChange={(e) => set('obs', e.target.value)} />
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
