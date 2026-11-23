/**
 * ALIMENTAÇÃO DE ÁGUA E CONTROLE DE NÍVEL — formulário de campo (23/11/2026). Só caldeira.
 *
 * Perguntas do teste (bomba principal, alimentação independente, controle
 * automático, alarme, intertravamento 13.4.1.2 e, visores), resultado e laudo.
 * As fotos do teste vão no Relatório de Imagens (seção 8 do relatório). Regras
 * em `features/caldeira/alimentacaoAgua.ts`, onde o teste alcança.
 */
import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import RespostaSegmentada from './RespostaSegmentada';
import ResultadoEnsaio from './ResultadoEnsaio';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';
import {
  LAUDO_PADRAO_ALIMENTACAO,
  PERGUNTAS_ALIMENTACAO,
  dadosPadraoAlimentacao,
  normalizarAlimentacao,
  verificarAlimentacao,
  type DadosAlimentacao,
  type RespostaTeste,
} from '../../caldeira/alimentacaoAgua';

const OPCOES = [
  { value: 'sim', label: 'Sim', tom: 'ok' as const },
  { value: 'nao', label: 'Não', tom: 'perigo' as const },
  { value: 'na', label: 'N.A.', tom: 'neutro' as const, descricao: 'Não se aplica' },
];
const ESTILO_DICA = { fontSize: 12, color: 'var(--texto-3)', margin: '0 0 8px' } as const;
const ESTILO_TEXTAREA = { width: '100%', padding: '8px 10px', border: '1px solid var(--fio-campo)', borderRadius: 4, font: 'inherit', boxSizing: 'border-box' } as const;

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FormularioAlimentacaoAgua({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosAlimentacao>(() => {
    const salvo = carregarDadosFormulario<DadosAlimentacao>(tag, containerId, 'alimentacao');
    return salvo ? normalizarAlimentacao(salvo) : { ...dadosPadraoAlimentacao(hojeLocal()), laudo: LAUDO_PADRAO_ALIMENTACAO };
  });
  useAutosaveFormulario(tag, containerId, 'alimentacao', dados);
  const salvamento = useSalvamento();
  const avisos = verificarAlimentacao(dados);

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'alimentacao', dados));
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Ensaio dos dispositivos de alimentação de água e controle de nível</h3>
        <p style={ESTILO_DICA}>
          Teste com a caldeira em operação, acompanhado pelo operador. A NR-13 exige o controle automático de nível com
          intertravamento contra superaquecimento (13.4.1.2 e). As fotos do teste vão no Relatório de Imagens.
        </p>
        <div className="form-grid">
          <label>
            Data do ensaio
            <input type="date" value={dados.dataEnsaio} onChange={(e) => setDados((d) => ({ ...d, dataEnsaio: e.target.value }))} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Verificações</h3>
        {PERGUNTAS_ALIMENTACAO.map((p) => (
          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid #EDF0F5' }}>
            <div style={{ fontSize: 14, lineHeight: '20px', marginBottom: 6 }}>
              {p.item && <b style={{ color: 'var(--texto-3)', fontWeight: 600, marginRight: 6 }}>{p.item}</b>}
              {p.texto}
            </div>
            <RespostaSegmentada
              opcoes={OPCOES}
              valor={dados.respostas[p.id] ?? ''}
              onChange={(v) =>
                setDados((d) => ({ ...d, respostas: { ...d.respostas, [p.id]: (v || undefined) as RespostaTeste | undefined } }))
              }
            />
          </div>
        ))}
      </div>

      <div className="formulario-secao">
        <h3>Resultado e laudo</h3>
        <ResultadoEnsaio valor={dados.resultado} onChange={(v) => setDados((d) => ({ ...d, resultado: v as DadosAlimentacao['resultado'] }))} />
        <label style={{ display: 'block', marginTop: 10 }}>
          Laudo
          <textarea rows={2} style={ESTILO_TEXTAREA} value={dados.laudo} onChange={(e) => setDados((d) => ({ ...d, laudo: e.target.value }))} />
        </label>
        {avisos.map((a) => (
          <p
            key={a.texto}
            role={a.nivel === 'erro' ? 'alert' : 'status'}
            style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: a.nivel === 'erro' ? 'var(--crit)' : 'var(--warn)' }}
          >
            {a.texto}
          </p>
        ))}
      </div>

      <div className="formulario-secao">
        <h3>Observações</h3>
        <textarea rows={3} style={ESTILO_TEXTAREA} value={dados.observacoes} onChange={(e) => setDados((d) => ({ ...d, observacoes: e.target.value }))} />
      </div>

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvamento.salvando}>
          {salvamento.salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
    </>
  );
}
