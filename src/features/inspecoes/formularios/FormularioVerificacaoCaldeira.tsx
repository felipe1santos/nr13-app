/**
 * VERIFICAÇÃO NR-13 DA CALDEIRA — formulário de campo (23/11/2026). Só caldeira.
 *
 * Uma pergunta por item da NR-13 (catálogo em `features/caldeira/verificacaoNr13.ts`),
 * resposta ATENDE / NÃO ATENDE / N.A. em botões grandes (celular), e uma
 * observação por item. "Não atende" pede a observação — ela é o que vai para
 * "Itens da NR-13 não atendidos" (13.4.4.12 i) na folha 1.3 do relatório.
 * Mesmo molde dos outros formulários: autosave no container e aviso de salvamento.
 */
import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import RespostaSegmentada from './RespostaSegmentada';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';
import {
  GRUPOS_NR13_CALDEIRA,
  dadosPadraoVerificacaoNr13,
  normalizarVerificacaoNr13,
  resumoVerificacaoNr13,
  type DadosVerificacaoNr13,
  type RespostaNr13,
} from '../../caldeira/verificacaoNr13';

const OPCOES = [
  { value: 'sim', label: 'Atende', tom: 'ok' as const },
  { value: 'nao', label: 'Não atende', tom: 'perigo' as const },
  { value: 'na', label: 'N.A.', tom: 'neutro' as const, descricao: 'Não se aplica' },
];

const ESTILO_DICA = { fontSize: 12, color: 'var(--texto-3)', margin: '0 0 8px' } as const;

export default function FormularioVerificacaoCaldeira({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosVerificacaoNr13>(() => {
    const salvo = carregarDadosFormulario<DadosVerificacaoNr13>(tag, containerId, 'nr13_caldeira');
    return salvo ? normalizarVerificacaoNr13(salvo) : dadosPadraoVerificacaoNr13();
  });
  useAutosaveFormulario(tag, containerId, 'nr13_caldeira', dados);
  const salvamento = useSalvamento();
  const resumo = resumoVerificacaoNr13(dados);

  function responder(id: string, v: string) {
    setDados((d) => ({ ...d, respostas: { ...d.respostas, [id]: (v || undefined) as RespostaNr13 | undefined } }));
  }
  function observar(id: string, texto: string) {
    setDados((d) => ({ ...d, observacoes: { ...d.observacoes, [id]: texto } }));
  }

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'nr13_caldeira', dados));
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Verificação NR-13 da caldeira</h3>
        <p style={ESTILO_DICA}>
          Itens da NR-13 vigente para caldeira. Marque <b>N.A.</b> quando o item não se aplica a esta caldeira. Todo
          "Não atende" sai no relatório em "Itens da NR-13 não atendidos" (13.4.4.12 i) — descreva o que foi encontrado.
        </p>
        <p style={{ ...ESTILO_DICA, color: 'var(--texto-2)' }}>
          {resumo.respondidos} de {resumo.total} verificados · {resumo.atende} atendem · {resumo.naoAtende} não atendem ·{' '}
          {resumo.naoSeAplica} não se aplicam
        </p>
      </div>

      {GRUPOS_NR13_CALDEIRA.map((g) => (
        <div key={g.id} className="formulario-secao">
          <h3>{g.titulo}</h3>
          {g.itens.map((it) => {
            const r = dados.respostas[it.id] ?? '';
            const obs = dados.observacoes[it.id] ?? '';
            const faltaObs = r === 'nao' && !obs.trim();
            return (
              <div key={it.id} className="checklist-item" style={{ padding: '10px 0', borderBottom: '1px solid #EDF0F5' }}>
                <div style={{ fontSize: 14, lineHeight: '20px', marginBottom: 6 }}>
                  <b style={{ color: 'var(--texto-3)', fontWeight: 600, marginRight: 6 }}>{it.item}</b>
                  {it.texto}
                  {it.condicao && <span style={{ display: 'block', fontSize: 12, color: 'var(--texto-3)' }}>Quando: {it.condicao}</span>}
                </div>
                <RespostaSegmentada opcoes={OPCOES} valor={r} onChange={(v) => responder(it.id, v)} />
                {(r === 'nao' || obs) && (
                  <textarea
                    rows={2}
                    placeholder={r === 'nao' ? 'O que foi encontrado (obrigatório para "não atende")' : 'Observação'}
                    value={obs}
                    onChange={(e) => observar(it.id, e.target.value)}
                    aria-invalid={faltaObs || undefined}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      padding: '8px 10px',
                      border: `1px solid ${faltaObs ? 'var(--crit)' : 'var(--fio-campo)'}`,
                      borderRadius: 4,
                      font: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

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
