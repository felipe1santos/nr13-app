import { useState } from 'react';
import { Icone } from '../../components/Icone';
import './modalFinalizar.css';

/**
 * Editar o NOME do relatório — e só o nome.
 *
 * O modal existe para deixar isso explícito na própria tela: o que se edita é o
 * rótulo pelo qual o documento é encontrado, não o documento. O PDF arquivado,
 * o SHA-256, o `pdfRef` e os bytes no bucket continuam exatamente os mesmos —
 * está escrito na caixa, porque a palavra "editar" ao lado de um relatório
 * assinado assusta com razão.
 */
export default function ModalRenomear({
  nomeAtual,
  ocupado,
  erro,
  aoFechar,
  aoSalvar,
}: {
  nomeAtual: string;
  ocupado: boolean;
  erro: string;
  aoFechar: () => void;
  aoSalvar: (nome: string) => void;
}) {
  const [nome, setNome] = useState(nomeAtual);
  const vazio = nome.trim() === '';

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Editar nome do relatório"
    >
      <div className="fj-modal-box mf-box" style={{ width: 'min(460px, 96vw)' }}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Relatório</div>
            <h2>Editar nome do relatório</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <form
          className="mf-corpo"
          onSubmit={(e) => {
            e.preventDefault();
            if (!vazio && !ocupado) aoSalvar(nome.trim());
          }}
        >
          <label className="mr-campo">
            Nome de exibição
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do relatório"
              maxLength={160}
            />
          </label>
          <p className="mf-nota">
            Muda apenas como o relatório aparece na lista. O PDF arquivado, o código de verificação
            (SHA-256) e o arquivo no cofre continuam exatamente os mesmos.
          </p>
          {erro && (
            <div className="mf-erro" role="alert">
              {erro}
            </div>
          )}
        </form>

        <div className="mf-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="fj-btn fj-btn-primary"
            onClick={() => aoSalvar(nome.trim())}
            disabled={ocupado || vazio}
          >
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
