import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
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
 * tela onde estão os outros padrões, que é justamente a comparação que ela está
 * fazendo.
 *
 * ## Por que o visualizador do SISTEMA, e não um `<iframe>`
 *
 * A primeira versão punha o PDF num `<iframe>` e deixava o Chrome desenhar: o
 * resultado era a barra cinza do navegador, com tipografia, ícones e barra de
 * miniaturas que não são deste sistema — no meio de uma tela que é. O mesmo
 * documento aberto em /relatorios tem outra cara, e o usuário nota.
 *
 * Agora usa `VisualizadorPdfBytes`, o mesmo componente do relatório: mesma
 * barra (Páginas, contador, zoom), mesma moldura de página, mesmo
 * comportamento. `paginas={0}` porque o total sai do próprio documento depois
 * de carregado — o parâmetro é só o palpite inicial de quem já o conhece.
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
   * Guardar o id junto dispensa um `setEstado('carregando')` no corpo do efeito:
   * enquanto o resultado é de outro registro (ou não existe), o estado derivado
   * já é "carregando", sem um render extra só para voltar a bandeira.
   */
  const [resultado, setResultado] = useState<{ id: string; bytes: Uint8Array | null } | null>(null);
  const bytes = resultado?.id === registro.id ? resultado.bytes : null;
  const estado: 'carregando' | 'pronto' | 'falhou' =
    resultado?.id !== registro.id ? 'carregando' : bytes ? 'pronto' : 'falhou';

  useEffect(() => {
    let vivo = true;

    void resolverPdf(registro)
      .then((dataUrl) => {
        if (!vivo) return;
        if (!dataUrl) {
          setResultado({ id: registro.id, bytes: null });
          return;
        }
        // dataURL → bytes sem `fetch(data:)`, que alguns navegadores bloqueiam:
        // o base64 já está na mão, basta decodificá-lo.
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const bin = atob(base64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        setResultado({ id: registro.id, bytes: arr });
      })
      .catch(() => {
        if (vivo) setResultado({ id: registro.id, bytes: null });
      });

    return () => {
      vivo = false;
    };
  }, [registro]);

  const nomeArquivo = `certificado-${(registro.certificadoPadrao || registro.nome || 'padrao')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 60)}.pdf`;

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
          <div className="certv-cab-ic">
            <Icone nome="pdf" tam={18} />
          </div>
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
          {estado === 'pronto' && bytes && (
            <VisualizadorPdfBytes
              bytes={bytes}
              nomeArquivo={nomeArquivo}
              paginas={0}
              selo="Certificado do instrumento padrão"
              extras={
                <button type="button" className="vpdf-btn" onClick={onFechar}>
                  <Icone nome="arrowleft" tam={13} /> Voltar
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
