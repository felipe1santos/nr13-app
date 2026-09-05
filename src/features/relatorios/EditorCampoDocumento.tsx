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
}: {
  campo: CampoEditavel;
  ocupado?: boolean;
  onSalvar: (texto: string) => void;
  onRestaurar: () => void;
  onFechar: () => void;
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
