import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import { resolverPdf } from '../relatorios/rastreabilidadeService';
import type { Rastreabilidade } from '../relatorios/rastreabilidadeService';

/**
 * VER o PDF do certificado sem sair da tela (13/09/2026).
 *
 * ## Por que um modal, e não uma aba nova
 *
 * Conferir o certificado é parte de decidir se ele ainda serve — validade,
 * instrumento, se é mesmo o documento certo. Abrir numa aba tira a pessoa da
 * tela onde estão os outros padrões, que é justamente a comparação que ela
 * está fazendo.
 *
 * ## Blob, não data:
 *
 * `resolverPdf` devolve uma dataURL. Chrome trata `data:` como navegação de
 * topo em alguns caminhos e recusa; um `blob:` de `URL.createObjectURL` é
 * servido pelo visualizador nativo sem essa ressalva. A URL é revogada na
 * desmontagem — sem isso cada abertura deixa um PDF inteiro preso na memória
 * da aba.
 */
export default function ModalVerCertificado({
  registro,
  titulo,
  onFechar,
}: {
  registro: Rastreabilidade;
  titulo: string;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);

  /**
   * O resultado, CARIMBADO com o id que o produziu.
   *
   * Guardar o id junto é o que dispensa um `setEstado('carregando')` no corpo do
   * efeito: enquanto o resultado é de outro registro (ou não existe), o estado
   * derivado já é "carregando", sem um render extra só para voltar a bandeira.
   */
  const [resultado, setResultado] = useState<{ id: string; url: string | null } | null>(null);
  const url = resultado?.id === registro.id ? resultado.url : null;
  const estado: 'carregando' | 'pronto' | 'falhou' =
    resultado?.id !== registro.id ? 'carregando' : url ? 'pronto' : 'falhou';

  useEffect(() => {
    let vivo = true;
    let objeto: string | null = null;

    void resolverPdf(registro)
      .then((dataUrl) => {
        if (!vivo) return;
        if (!dataUrl) {
          setResultado({ id: registro.id, url: null });
          return;
        }
        // dataURL → Blob, sem depender de fetch(data:) que alguns navegadores
        // bloqueiam: o base64 já está na mão, basta decodificá-lo.
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        objeto = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setResultado({ id: registro.id, url: objeto });
      })
      .catch(() => {
        if (vivo) setResultado({ id: registro.id, url: null });
      });

    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [registro]);

  return (
    <div className="certv-overlay" onClick={onFechar}>
      <div
        ref={caixa}
        className="certv-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Certificado — ${titulo}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="certv-cab">
          <div className="certv-cab-txt">
            <h3>{titulo}</h3>
            <p>
              {registro.nome || 'Instrumento sem identificação'}
              {registro.certificadoPadrao && <> · certificado {registro.certificadoPadrao}</>}
            </p>
          </div>
          <button type="button" className="certv-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="certv-corpo">
          {estado === 'carregando' && <p className="certv-aviso">Abrindo o certificado…</p>}
          {estado === 'falhou' && (
            <p className="certv-aviso certv-falha">
              <Icone nome="alerttri" tam={14} /> Não foi possível abrir o PDF deste certificado.
              Verifique a conexão — o arquivo pode estar só no servidor.
            </p>
          )}
          {estado === 'pronto' && url && (
            <iframe src={url} title={`Certificado de ${titulo}`} className="certv-frame" />
          )}
        </div>

        <footer className="certv-rodape">
          <span className="certv-espaco" />
          <button type="button" className="btn-secundario" onClick={onFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
