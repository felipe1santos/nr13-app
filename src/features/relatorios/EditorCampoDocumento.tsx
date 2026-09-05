import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import type { CampoEditavel } from './pdfVetorial/documento';

/**
 * 13D-bis · o editor de UM campo do documento.
 *
 * Abre onde o usuário clicou, mostra o que está impresso e oferece as três
 * saídas que a regra exige:
 *
 * | ação | resultado |
 * |---|---|
 * | escrever e salvar | override `manual` — o documento passa a dizer isso |
 * | apagar tudo e salvar | override `branco` — fica vazio, e o automático NÃO volta |
 * | Restaurar automático | tira o override — volta a seguir a fonte do sistema |
 *
 * O valor automático fica visível quando há override: sem isso, restaurar seria
 * um salto no escuro ("o que estava aqui antes mesmo?").
 */
export default function EditorCampoDocumento({
  campo,
  ocupado,
  onSalvar,
  onRestaurar,
  onFechar,
  onEscolherImagem,
}: {
  campo: CampoEditavel;
  ocupado?: boolean;
  onSalvar: (texto: string) => void;
  onRestaurar: () => void;
  onFechar: () => void;
  /** Só para campos de imagem: o arquivo escolhido pelo usuário. */
  onEscolherImagem?: (arquivo: File) => void;
}) {
  const [texto, setTexto] = useState(campo.valor);
  const campoRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setTexto(campo.valor);
    // Foco e seleção: quem clicou num valor quer trocá-lo, não posicionar cursor.
    const t = window.setTimeout(() => {
      campoRef.current?.focus();
      campoRef.current?.select?.();
    }, 30);
    return () => window.clearTimeout(t);
  }, [campo]);

  const manual = campo.origem !== 'auto';

  // ── ÁREA DE IMAGEM ──────────────────────────────────────────────────────
  //
  // A troca acontece NO LUGAR da imagem, e não num botão distante no topo:
  // trocar, remover e voltar ao automático são as três decisões possíveis, e
  // estão as três aqui. "Remover" grava vazio de propósito (a foto do cadastro
  // não volta); "Restaurar automático" desfaz a escolha deste relatório.
  if (campo.tipo === 'imagem') {
    return (
      <div className="edcampo" role="dialog" aria-label={`Editar ${campo.rotulo}`}>
        <div className="edcampo-topo">
          <strong>{campo.rotulo}</strong>
          <button type="button" className="edcampo-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="edcampo-nota">
          {campo.origem === 'branco'
            ? 'Área deixada em branco neste relatório.'
            : campo.valor
              ? 'Há uma imagem nesta área.'
              : 'Área sem imagem.'}{' '}
          Vale só para este relatório — o cadastro do sistema não é alterado.
        </p>
        <div className="edcampo-acoes">
          <label className={`fj-btn fj-btn-primary${ocupado ? ' is-loading' : ''}`}>
            <Icone nome="upload" tam={13} /> Escolher imagem
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={ocupado}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) onEscolherImagem?.(arquivo);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => onSalvar('')} disabled={ocupado}>
            <Icone nome="trash" tam={13} /> Remover imagem
          </button>
          <span className="edcampo-espaco" />
          {manual && (
            <button type="button" className="fj-btn fj-btn-ghost" onClick={onRestaurar} disabled={ocupado}>
              <Icone nome="refresh" tam={13} /> Restaurar automático
            </button>
          )}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={onFechar} disabled={ocupado}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="edcampo" role="dialog" aria-label={`Editar ${campo.rotulo}`}>
      <div className="edcampo-topo">
        <strong>{campo.rotulo}</strong>
        <button type="button" className="edcampo-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      {campo.multilinha ? (
        <textarea
          ref={campoRef as React.RefObject<HTMLTextAreaElement>}
          value={texto}
          rows={6}
          onChange={(e) => setTexto(e.target.value)}
          disabled={ocupado}
        />
      ) : (
        <input
          ref={campoRef as React.RefObject<HTMLInputElement>}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSalvar(texto);
            if (e.key === 'Escape') onFechar();
          }}
          disabled={ocupado}
        />
      )}

      {manual && (
        <p className="edcampo-auto">
          Valor automático: <b>{campo.auto.trim() === '' ? '— (vazio)' : campo.auto}</b>
        </p>
      )}
      <p className="edcampo-nota">
        Vale só para este relatório. O cadastro do sistema não é alterado.
        {texto.trim() === '' && ' Salvar vazio deixa o campo em branco no documento.'}
      </p>

      <div className="edcampo-acoes">
        {manual && (
          <button type="button" className="fj-btn fj-btn-ghost" onClick={onRestaurar} disabled={ocupado}>
            <Icone nome="refresh" tam={13} /> Restaurar automático
          </button>
        )}
        <span className="edcampo-espaco" />
        <button type="button" className="fj-btn fj-btn-ghost" onClick={onFechar} disabled={ocupado}>
          Cancelar
        </button>
        <button type="button" className="fj-btn fj-btn-primary" onClick={() => onSalvar(texto)} disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
