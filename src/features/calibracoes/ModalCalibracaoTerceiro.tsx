/**
 * Revisão do engenheiro, fase 2 (D) · REGISTRAR calibração feita por
 * laboratório externo.
 *
 * ## O que ele faz — e o que ele NÃO faz
 *
 * Registra e referencia. O certificado é do LABORATÓRIO: o PDF original vai
 * intacto para o bucket (`<org>/certificados-externos/`, pela mesma fila
 * durável das fotos — offline fica no cofre e sobe sozinho), com o SHA-256 dos
 * bytes recebidos. Nenhuma folha nossa é gerada, nenhuma logo ou assinatura
 * nossa é aplicada. O relatório CITA esta calibração no quadro 7.1.1.
 *
 * Serve às duas telas: Calibrações (a partir do lote/acessório) e o checklist
 * da inspeção no celular (a partir da linha do instrumento). Sem acessório
 * cadastrado, cadastra o instrumento junto — a calibração nunca fica solta.
 */
import { useEffect, useRef, useState } from 'react';
import FeedbackSalvamento, { useSalvamento } from '../../components/FeedbackSalvamento';
import { Icone } from '../../components/Icone';
import { mascararData } from '../../services/mascaras';
import { salvarArquivo } from '../../services/fotos';
import { sha256Hex } from '../relatorios/artefatoRelatorio';
import { LIMITE_PDF_KB, validarPdfCertificado } from '../relatorios/certificadoUpload';
import { salvarCalibracao } from './calibracaoService';
import { salvarComponente, type ComponenteCal } from './componentesService';
import {
  INSTRUMENTOS,
  TIPOS_INSTRUMENTO,
  definicaoDe,
  unidadeCompativel,
  unidadesDoInstrumento,
  type TipoInstrumento,
} from './instrumentos';
import { unidadeDoComponente } from './preencherCalibracao';
import type { DadosTerceiro } from './tipos';
import { ESCOPO_CERTIFICADOS_EXTERNOS, faltasTerceiro, montarTerceiro, type FormTerceiro } from './terceiro';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalComponente.css';

export default function ModalCalibracaoTerceiro({
  tag,
  componente,
  tipoInicial,
  loteId,
  dataLote,
  aoSalvar,
  aoFechar,
}: {
  tag: string;
  /** Acessório já cadastrado; ausente = cadastra junto. */
  componente?: ComponenteCal | null;
  tipoInicial?: TipoInstrumento;
  loteId?: string;
  dataLote?: string;
  aoSalvar: (cal: DadosTerceiro, componente: ComponenteCal) => void;
  aoFechar: () => void;
}) {
  const [f, setF] = useState<FormTerceiro>(() => ({
    tipo: componente?.tipo ?? tipoInicial ?? 'manometro',
    nome: componente?.nome ?? '',
    fabricante: componente?.fabricante ?? '',
    modelo: componente?.modelo ?? '',
    serie: componente?.serie ?? '',
    faixa: componente?.referencia ?? '',
    unidade: componente ? unidadeDoComponente(componente) : '',
    laboratorio: '',
    responsavelExterno: '',
    numeroCertificado: '',
    dataCalibracao: dataLote ?? '',
    validade: '',
    statusConclusao: '',
    observacoes: '',
  }));
  const [pdf, setPdf] = useState<File | null>(null);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);
  const salvamento = useSalvamento();
  const arquivo = useRef<HTMLInputElement>(null);
  const set = <K extends keyof FormTerceiro>(k: K, v: FormTerceiro[K]) => setF((a) => ({ ...a, [k]: v }));
  const faltas = faltasTerceiro(f);
  const doCadastro = !!componente;

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvamento.salvando) aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvamento.salvando]);

  async function registrar() {
    setTentou(true);
    if (faltas.length) return;
    await salvamento.executar(async () => {
      let comp = componente ?? null;
      if (!comp) {
        comp = {
          id: `comp-${Date.now()}`,
          tipo: f.tipo,
          nome: f.nome.trim(),
          fabricante: f.fabricante.trim(),
          modelo: f.modelo.trim(),
          serie: f.serie.trim(),
          referencia: f.faixa.trim(),
          unidade: f.unidade,
          criadoEm: new Date().toLocaleDateString('pt-BR'),
        };
        await salvarComponente(tag, comp);
      }
      let anexo: { ref: DadosTerceiro['pdfExternoRef']; nome: string; sha256: string } | null = null;
      if (pdf) {
        // Os bytes COMO RECEBIDOS: nada de recomprimir, carimbar ou renomear
        // dentro do arquivo. O hash prova isso depois.
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        const sha256 = await sha256Hex(bytes);
        const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
        const ref = await salvarArquivo(blob, ESCOPO_CERTIFICADOS_EXTERNOS, 'pdf', 'application/pdf');
        anexo = { ref, nome: pdf.name, sha256 };
      }
      const cal = montarTerceiro(f, tag, { id: `cal-${Date.now()}`, componenteId: comp.id, loteId }, anexo);
      await salvarCalibracao(tag, cal);
      aoSalvar(cal, comp);
    });
  }

  const campo = (rotulo: string, k: keyof FormTerceiro, props: { data?: boolean; ph?: string; bloqueado?: boolean } = {}) => (
    <label className="mcomp-campo">
      <span>{rotulo}</span>
      <input
        value={f[k] as string}
        disabled={props.bloqueado}
        inputMode={props.data ? 'numeric' : undefined}
        placeholder={props.data ? 'DD/MM/AAAA' : props.ph}
        onChange={(e) => set(k, (props.data ? mascararData(e.target.value) : e.target.value) as never)}
      />
    </label>
  );

  return (
    <div className="fj-modal-overlay" role="dialog" aria-modal="true" aria-label="Calibração de laboratório externo">
      <div className="fj-modal-box mcomp-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Calibração de terceiro</div>
            <h2>Registrar certificado do laboratório</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mcomp-corpo">
          <p className="mcomp-ajuda">
            O certificado é do laboratório. O sistema só o <b>registra</b> e o <b>cita</b> no
            relatório — nenhum certificado nosso é gerado para ele, e o PDF é guardado sem
            alteração.
          </p>

          <div className="mcomp-grid">
            <label className="mcomp-campo">
              <span>Instrumento</span>
              <select
                value={f.tipo}
                // Vindo da linha do quadro (checklist), o instrumento é o da linha.
                disabled={doCadastro || !!tipoInicial}
                onChange={(e) => {
                  const tipo = e.target.value as TipoInstrumento;
                  setF((a) => ({ ...a, tipo, unidade: unidadeCompativel(tipo, a.unidade) ? a.unidade : '' }));
                }}
              >
                {TIPOS_INSTRUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {INSTRUMENTOS[t].rotulo}
                  </option>
                ))}
              </select>
            </label>
            {campo('Identificação *', 'nome', { ph: 'Ex: Manômetro principal', bloqueado: doCadastro })}
            {campo('Fabricante', 'fabricante', { bloqueado: doCadastro })}
            {campo('Modelo', 'modelo', { bloqueado: doCadastro })}
            {campo('Nº de série', 'serie', { bloqueado: doCadastro })}
            {campo('Faixa', 'faixa', { ph: definicaoDe(f.tipo).grandeza === 'temperatura' ? 'Ex: 0 a 150' : 'Ex: 0 a 10', bloqueado: doCadastro })}
            <label className="mcomp-campo">
              <span>Unidade do instrumento *</span>
              <select value={f.unidade} onChange={(e) => set('unidade', e.target.value)}>
                <option value="">Selecione…</option>
                {unidadesDoInstrumento(f.tipo).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mcomp-bloco">
            <div className="mcomp-bloco-titulo">
              <Icone nome="building" tam={13} />
              <span>Certificado do laboratório</span>
            </div>
            <div className="mcomp-grid">
              {campo('Laboratório *', 'laboratorio')}
              {campo('Responsável no laboratório', 'responsavelExterno')}
              {campo('Nº do certificado *', 'numeroCertificado')}
              <label className="mcomp-campo">
                <span>Conclusão</span>
                <select
                  value={f.statusConclusao}
                  onChange={(e) => set('statusConclusao', e.target.value as FormTerceiro['statusConclusao'])}
                >
                  <option value="">Não informada</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                </select>
              </label>
              {campo('Data da calibração *', 'dataCalibracao', { data: true })}
              {campo('Validade *', 'validade', { data: true })}
              <label className="mcomp-campo mcomp-campo-full">
                <span>Observações</span>
                <input value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="mcomp-foto">
            <input
              ref={arquivo}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                if (!file) return;
                const v = validarPdfCertificado(file);
                if (!v.ok) {
                  setErroPdf(v.erro);
                  setPdf(null);
                  return;
                }
                setErroPdf(null);
                setPdf(file);
              }}
            />
            <div className="mcomp-foto-caixa">
              <Icone nome="pdf" tam={22} />
            </div>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => arquivo.current?.click()}>
              <Icone nome="upload" tam={13} /> {pdf ? 'Trocar PDF' : `PDF do laboratório (até ${LIMITE_PDF_KB / 1024} MB)`}
            </button>
          </div>
          {pdf && <p className="mcomp-ajuda terc-arquivo">{pdf.name}</p>}
          {erroPdf && <p className="mcomp-ajuda terc-erro">{erroPdf}</p>}
          {!pdf && !erroPdf && (
            <p className="mcomp-ajuda">Sem o PDF, o relatório cita o certificado mas não o anexa.</p>
          )}
          {tentou && faltas.length > 0 && (
            <p className="mcomp-ajuda terc-erro" role="alert">
              Falta: {faltas.join(', ')}.
            </p>
          )}
        </div>

        <div className="mcomp-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={salvamento.salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-primary${salvamento.salvando ? ' is-loading' : ''}`}
            onClick={() => void registrar()}
            disabled={salvamento.salvando}
          >
            {salvamento.salvando ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
        <FeedbackSalvamento
          estado={salvamento.estado}
          erro={salvamento.erro}
          aoTentarNovamente={() => void registrar()}
          aoFechar={salvamento.limpar}
        />
      </div>
    </div>
  );
}
