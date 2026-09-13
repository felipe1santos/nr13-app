import { useRef } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import { LIMITE_PDF_KB } from '../relatorios/certificadoUpload';
import type { Rastreabilidade } from '../relatorios/rastreabilidadeService';

/**
 * O formulário do certificado padrão, no CENTRO da tela (13/09/2026).
 *
 * ## O que mudou
 *
 * Ele era um painel que abria ABAIXO dos cards, e a tela dava um
 * `scrollIntoView` para levar o usuário até lá. Dois problemas com isso: o card
 * que originou a edição sai de vista justamente quando se precisa conferir o
 * que já estava cadastrado, e num celular o painel nasce fora da tela — o
 * scroll automático vira a única pista de que algo aconteceu.
 *
 * ## O que ele NÃO faz
 *
 * Não grava. Ele reúne os campos e devolve por `onSalvar`; quem persiste (e
 * quem conduz o aviso de "salvando → salvo") é a tela, que é onde a regra de
 * imutabilidade do certificado mora.
 */
export default function ModalCertificado({
  form,
  titulo,
  subtitulo,
  ocupado,
  erro,
  onCampo,
  onArquivo,
  onSalvar,
  onFechar,
}: {
  form: Rastreabilidade;
  titulo: string;
  subtitulo: string;
  ocupado?: boolean;
  erro?: string;
  onCampo: <K extends keyof Rastreabilidade>(chave: K, valor: Rastreabilidade[K]) => void;
  onArquivo: (file: File) => void;
  onSalvar: () => void;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useFocoPreso(caixa, () => !ocupado && onFechar());

  const placeholderNome =
    form.tipoInstrumento === 'ultrassom'
      ? 'Ex: Bloco padrão BP-01'
      : form.tipoInstrumento === 'valvula'
        ? 'Ex: Bancada de teste PSV-01'
        : 'Ex: Manômetro padrão MP-01';

  return (
    <div className="certm-overlay" onClick={() => !ocupado && onFechar()}>
      <div
        ref={caixa}
        className="certm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Certificado — ${titulo}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="certm-cab">
          <div className="certm-cab-txt">
            <h3>{titulo}</h3>
            <p>{subtitulo}</p>
          </div>
          <button
            type="button"
            className="certm-x"
            onClick={onFechar}
            disabled={ocupado}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        <div className="certm-corpo">
          <div className="certm-secao">Identificação do padrão</div>
          <div className="certm-grid">
            <div className="fj-field certm-full">
              <label>Instrumento / padrão *</label>
              <input
                value={form.nome}
                disabled={ocupado}
                onChange={(e) => onCampo('nome', e.target.value)}
                placeholder={placeholderNome}
              />
            </div>
            <div className="fj-field">
              <label>Nº do certificado</label>
              <input
                value={form.certificadoPadrao}
                disabled={ocupado}
                onChange={(e) => onCampo('certificadoPadrao', e.target.value)}
              />
            </div>
            <div className="fj-field">
              <label>Validade</label>
              <input
                type="date"
                value={form.validade}
                disabled={ocupado}
                onChange={(e) => onCampo('validade', e.target.value)}
              />
            </div>
            <div className="fj-field">
              <label>Aparelho / modelo</label>
              <input
                value={form.aparelho ?? ''}
                disabled={ocupado}
                onChange={(e) => onCampo('aparelho', e.target.value)}
                placeholder="Ex: CYGNUS 6278"
              />
            </div>
            <div className="fj-field">
              <label>Fabricante</label>
              <input
                value={form.fabricante ?? ''}
                disabled={ocupado}
                onChange={(e) => onCampo('fabricante', e.target.value)}
              />
            </div>
            <div className="fj-field">
              <label>Nº de série</label>
              <input
                value={form.numeroSerie ?? ''}
                disabled={ocupado}
                onChange={(e) => onCampo('numeroSerie', e.target.value)}
              />
            </div>
          </div>

          {form.tipoInstrumento === 'ultrassom' && (
            <>
              <div className="certm-secao">Dados padrão do ensaio (injetados na folha de ultrassom)</div>
              <div className="certm-grid">
                <div className="fj-field">
                  <label>Acoplante</label>
                  <input value={form.acoplante ?? ''} disabled={ocupado} onChange={(e) => onCampo('acoplante', e.target.value)} placeholder="Ex: Gel" />
                </div>
                <div className="fj-field">
                  <label>Cabeçote</label>
                  <input value={form.cabecote ?? ''} disabled={ocupado} onChange={(e) => onCampo('cabecote', e.target.value)} placeholder="Ex: 2.25 mhz" />
                </div>
                <div className="fj-field">
                  <label>Velocidade sônica</label>
                  <input value={form.velocidadeSonica ?? ''} disabled={ocupado} onChange={(e) => onCampo('velocidadeSonica', e.target.value)} placeholder="Ex: 5920" />
                </div>
                <div className="fj-field">
                  <label>Estado da superfície</label>
                  <input value={form.estadoSuperficie ?? ''} disabled={ocupado} onChange={(e) => onCampo('estadoSuperficie', e.target.value)} placeholder="Ex: Pintada" />
                </div>
                <div className="fj-field">
                  <label>Temp. da superfície</label>
                  <input value={form.tempSuperficie ?? ''} disabled={ocupado} onChange={(e) => onCampo('tempSuperficie', e.target.value)} placeholder="Ex: Ambiente" />
                </div>
              </div>
            </>
          )}

          <div className="certm-secao">PDF do certificado</div>
          <div className="certm-upload">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Zerar o valor DEPOIS de entregar o arquivo é o que permite
                // reescolher o mesmo PDF (útil quando a primeira tentativa foi
                // recusada por tamanho e o usuário comprimiu o arquivo).
                if (f) onArquivo(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="fj-btn fj-btn-ghost"
              disabled={ocupado}
              onClick={() => fileRef.current?.click()}
            >
              <Icone nome="upload" tam={14} /> {form.pdfBase64 ? 'Trocar PDF' : 'Anexar PDF *'}
            </button>
            {form.pdfBase64 && (
              <span className="cert-ok">
                <Icone nome="check" tam={13} /> PDF anexado
              </span>
            )}
            <span className="certm-limite">
              Arquivo PDF de até <b>{LIMITE_PDF_KB} KB</b> (2 MB). Certificados escaneados costumam
              ter 200–800 KB; se o seu passar do limite, comprima em ilovepdf.com/compress_pdf.
            </span>
          </div>

          {erro && <p className="cert-erro">{erro}</p>}
        </div>

        <footer className="certm-rodape">
          <button type="button" className="btn-secundario" onClick={onFechar} disabled={ocupado}>
            Cancelar
          </button>
          <span className="certm-espaco" />
          <button type="button" className="btn-primario" onClick={onSalvar} disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar certificado'}
          </button>
        </footer>
      </div>
    </div>
  );
}
