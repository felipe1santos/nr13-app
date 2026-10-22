/**
 * ENSAIO DE ACUMULAÇÃO — o formulário de campo (21/10/2026). Só caldeira.
 *
 * Mesmo molde do TH: autosave no container, preenchimento da ficha (o técnico
 * não redigita identificação, série, tipo, fabricante nem cliente), editor de
 * fotos descritas e o aviso de salvamento do sistema. As regras — erros e
 * alertas — moram em `acumulacao.ts`, onde o teste alcança.
 */
import { useMemo, useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { mesclarPreenchimento } from './autoPreencher';
import { ler } from '../../../services/storage';
import ResultadoEnsaio from './ResultadoEnsaio';
import RespostaSegmentada from './RespostaSegmentada';
import SeletorCalibracaoInstrumento from './SeletorCalibracaoInstrumento';
import EditorFotosDescritas from '../EditorFotosDescritas';
import { normalizarFotos } from '../fotosDescritas';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';
import {
  dadosPadraoAcumulacao,
  instrumentoDoEnsaio,
  prefillAcumulacao,
  pressaoNasCincoUnidades,
  verificarAcumulacao,
  type AvisoAcumulacao,
  type DadosAcumulacao,
} from '../acumulacao';
import { UNIDADES_PRESSAO, type UnidadePressao } from '../../../calc/pressaoCincoUnidades';
import type { EmpresaEquipamento, InfoEquipamento } from '../../equipamento/tipos';
import { pmtaDoDocumentoMpa } from '../../equipamento/perfilEquipamento';

const ESTILO_DICA = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } as const;
const ESTILO_TEXTAREA = {
  width: '100%',
  padding: 12,
  border: '1px solid var(--border-solid)',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
} as const;

const SIM_NAO = [
  { value: 'sim', label: 'SIM' },
  { value: 'nao', label: 'NÃO' },
];
/** Na pergunta de não conformidade, SIM é problema — mesma linguagem dos exames visuais. */
const SIM_NAO_NC = [
  { value: 'sim', label: 'SIM', tom: 'perigo' as const },
  { value: 'nao', label: 'NÃO', tom: 'ok' as const },
];

function lerSeguro<T>(chave: string): T | null {
  try {
    return ler<T>(chave);
  } catch {
    return null;
  }
}

/** Os avisos de um campo: erro em vermelho (impede finalizar), alerta só informa. */
function Aviso({ avisos, campo }: { avisos: AvisoAcumulacao[]; campo: string }) {
  return (
    <>
      {avisos
        .filter((a) => a.campo === campo)
        .map((a) => (
          <span
            key={a.texto}
            className={`th-dica-campo${a.nivel === 'erro' ? ' th-dica-alerta' : ''}`}
            // Alerta técnico na cor de AVISO do sistema: não é erro (não bloqueia),
            // mas não pode passar por dica de rodapé.
            style={a.nivel === 'alerta' ? { color: 'var(--warn)', fontWeight: 600 } : undefined}
            role={a.nivel === 'erro' ? 'alert' : 'status'}
          >
            {a.nivel === 'alerta' ? '⚠ ' : ''}
            {a.texto}
          </span>
        ))}
    </>
  );
}

export default function FormularioAcumulacao({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosAcumulacao>(() => {
    const salvo = carregarDadosFormulario<DadosAcumulacao>(tag, containerId, 'acumulacao');
    const prefill = prefillAcumulacao(
      tag,
      lerSeguro<InfoEquipamento>(`nr13_info_${tag}`),
      lerSeguro<EmpresaEquipamento>(`nr13_emp_${tag}`),
    );
    return mesclarPreenchimento(dadosPadraoAcumulacao(), prefill, salvo);
  });
  useAutosaveFormulario(tag, containerId, 'acumulacao', dados);
  const salvamento = useSalvamento();

  const pmtaMpa = useMemo(() => pmtaDoDocumentoMpa(tag), [tag]);
  const avisos = verificarAcumulacao(dados, { pmtaMpa });
  const cinco = pressaoNasCincoUnidades(dados);
  const inst = instrumentoDoEnsaio(dados);

  function set<K extends keyof DadosAcumulacao>(chave: K, valor: DadosAcumulacao[K]) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'acumulacao', dados));
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Dados Gerais</h3>
        <p style={ESTILO_DICA}>Preenchidos a partir do cadastro do cliente; edite se necessário.</p>
        <div className="form-grid">
          <label>
            Contratante
            <input type="text" value={dados.contratante} onChange={(e) => set('contratante', e.target.value)} />
          </label>
          <label>
            Endereço
            <input type="text" value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} />
          </label>
          <label>
            Data do Ensaio
            <input type="date" value={dados.dataEnsaio} onChange={(e) => set('dataEnsaio', e.target.value)} />
          </label>
          <label>
            Nº Rastreável
            <input type="text" value="Nº do relatório + /EA" disabled title="Atribuído na emissão do relatório: número do relatório + /EA" />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Aspectos Gerais do Equipamento</h3>
        <p style={ESTILO_DICA}>Da ficha do equipamento.</p>
        <div className="form-grid">
          <label>
            Identificação
            <input type="text" value={dados.identificacao} onChange={(e) => set('identificacao', e.target.value)} />
          </label>
          <label>
            Nº de Série
            <input type="text" value={dados.serie} onChange={(e) => set('serie', e.target.value)} />
          </label>
          <label>
            Tipo de Equipamento
            <input type="text" value={dados.tipoEquipamento} onChange={(e) => set('tipoEquipamento', e.target.value)} />
          </label>
          <label>
            Fabricante
            <input type="text" value={dados.fabricante} onChange={(e) => set('fabricante', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Parâmetros do Ensaio</h3>
        <div className="form-grid">
          <label>
            Procedimento
            <input type="text" value={dados.procedimento} onChange={(e) => set('procedimento', e.target.value)} />
          </label>
          <label>
            Normas de Referência
            <input type="text" value={dados.normas} onChange={(e) => set('normas', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Instrumento Utilizado</h3>
        <p style={ESTILO_DICA}>
          Escolha a calibração já registrada do manômetro: certificado e validade vêm dela. Sem calibração
          registrada, preencha os campos abaixo.
        </p>
        <SeletorCalibracaoInstrumento
          tag={tag}
          tipo="manometro"
          valor={dados.instrumentoRef}
          dataInspecao={dados.dataEnsaio}
          aoMudar={(ref) =>
            setDados((d) => {
              const { instrumentoRef: _antigo, ...resto } = d;
              void _antigo;
              return ref ? { ...resto, instrumentoRef: ref } : resto;
            })
          }
        />
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>
            Instrumento
            <input type="text" value={inst.instrumento} disabled={inst.vinculado} onChange={(e) => set('instrumento', e.target.value)} />
          </label>
          <label>
            Fabricante
            <input type="text" value={inst.fabricante} disabled={inst.vinculado} onChange={(e) => set('instrumentoFabricante', e.target.value)} />
          </label>
          <label>
            Tipo
            <input type="text" placeholder="Ex.: Analógico" value={dados.instrumentoTipo} onChange={(e) => set('instrumentoTipo', e.target.value)} />
          </label>
          <label>
            Identificação
            <input type="text" value={inst.identificacao} disabled={inst.vinculado} onChange={(e) => set('instrumentoIdentificacao', e.target.value)} />
          </label>
          <label>
            Escala
            <input type="text" placeholder="Ex.: 0 a 20 bar" value={inst.escala} disabled={inst.vinculado} onChange={(e) => set('instrumentoEscala', e.target.value)} />
          </label>
          <label>
            Validade da Calibração
            {inst.vinculado ? (
              <input type="text" value={inst.validade} disabled />
            ) : (
              <input type="date" value={dados.instrumentoValidade} onChange={(e) => set('instrumentoValidade', e.target.value)} />
            )}
          </label>
        </div>
        <Aviso avisos={avisos} campo="instrumento" />
      </div>

      <div className="formulario-secao">
        <h3>Dados do Teste</h3>
        <div className="form-grid">
          <label>
            Tempo de estabilização da(s) válvula(s) após abertura (min)
            <input type="text" inputMode="decimal" value={dados.tempoEstabilizacaoMin} onChange={(e) => set('tempoEstabilizacaoMin', e.target.value)} />
          </label>
          <label>
            Início do Ensaio (h)
            <input type="time" value={dados.horaInicio} onChange={(e) => set('horaInicio', e.target.value)} />
          </label>
          <label>
            Término do Ensaio (h)
            <input type="time" value={dados.horaTermino} onChange={(e) => set('horaTermino', e.target.value)} />
            <Aviso avisos={avisos} campo="horaTermino" />
          </label>
          <label>
            Pressão máxima atingida
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
                value={dados.pressaoMaxima}
                onChange={(e) => set('pressaoMaxima', e.target.value)}
              />
              <select
                aria-label="Unidade da pressão digitada"
                style={{ flex: '0 0 104px', width: 104 }}
                value={dados.pressaoUnidade}
                onChange={(e) => set('pressaoUnidade', e.target.value as UnidadePressao)}
              >
                {UNIDADES_PRESSAO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </span>
            <Aviso avisos={avisos} campo="pressaoMaxima" />
          </label>
        </div>
        {cinco && (
          <p style={{ fontSize: 13, marginTop: 8 }} aria-live="polite">
            {UNIDADES_PRESSAO.map((u) => `${cinco[u]} ${u}`).join(' · ')}
          </p>
        )}

        <p style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px' }}>
          As válvulas de segurança existentes são suficientes para manter o equipamento em funcionamento com segurança?
        </p>
        <RespostaSegmentada opcoes={SIM_NAO} valor={dados.valvulasSuficientes} onChange={(v) => set('valvulasSuficientes', v as DadosAcumulacao['valvulasSuficientes'])} />

        <p style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px' }}>Durante o ensaio foi encontrada alguma não conformidade?</p>
        <RespostaSegmentada opcoes={SIM_NAO_NC} valor={dados.ncEncontrada} onChange={(v) => set('ncEncontrada', v as DadosAcumulacao['ncEncontrada'])} />
        {dados.ncEncontrada === 'sim' && (
          <label style={{ display: 'block', marginTop: 12 }}>
            Justificativa (obrigatória)
            <textarea rows={3} style={ESTILO_TEXTAREA} value={dados.justificativaNc} onChange={(e) => set('justificativaNc', e.target.value)} />
            <Aviso avisos={avisos} campo="justificativaNc" />
          </label>
        )}
      </div>

      <div className="formulario-secao">
        <h3>Laudo</h3>
        <textarea rows={3} style={ESTILO_TEXTAREA} value={dados.laudo} onChange={(e) => set('laudo', e.target.value)} />
      </div>

      <ResultadoEnsaio valor={dados.resultado} onChange={(v) => set('resultado', v)} />

      <div className="formulario-secao">
        <h3>Registro Fotográfico</h3>
        <p style={ESTILO_DICA}>4 fotos por folha no laudo. Cada foto pode ter uma legenda.</p>
        <EditorFotosDescritas
          fotos={dados.fotos}
          escopo={`${tag}/acumulacao`}
          textoVazio="Nenhuma foto adicionada"
          rotuloAdicionar="Adicionar foto"
          alterar={(atualizar) => setDados((d) => ({ ...d, fotos: atualizar(normalizarFotos(d.fotos)) }))}
        />
      </div>

      <div className="formulario-secao">
        <h3>Observações</h3>
        <textarea rows={3} style={ESTILO_TEXTAREA} value={dados.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
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
