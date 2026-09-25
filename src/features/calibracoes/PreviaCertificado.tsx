import { useEffect, useState } from 'react';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
import { gerarPreviaCertificado } from './emissaoCertificado';
import { nomeArquivoCalibracao } from './artefatoCalibracao';
import type { DadosCalibracaoInterna } from './tipos';

/**
 * Fase 7 · o certificado em RASCUNHO é mostrado pelo MESMO gerador vetorial da
 * emissão — o que o usuário revisa é o que vai ser emitido, com a marca
 * "RASCUNHO — NÃO EMITIDO". Antes era a folha HTML num iframe, montada pelo
 * palco; o PDF emitido saía de outro caminho (a foto dessa folha).
 *
 * Leitura pura: nada é gravado, nada é publicado, e o palco não é montado
 * (nenhuma chave viva do relatório em montagem é tocada). Ver
 * `acoesPreviaCertificado.ts` para baixar/imprimir e para quem decide o caminho.
 */
type Resultado = { bytes: Uint8Array; paginas: number } | 'falhou';

export default function PreviaCertificado({ cal }: { cal: DadosCalibracaoInterna }) {
  // O resultado guarda PARA QUAL registro foi gerado: trocar de calibração
  // volta a "preparando" sem um setState síncrono dentro do efeito.
  const [pronto, setPronto] = useState<{ para: DadosCalibracaoInterna; r: Resultado } | null>(null);

  useEffect(() => {
    let vivo = true;
    gerarPreviaCertificado(cal)
      .then((r) => vivo && setPronto({ para: cal, r }))
      .catch((e) => {
        console.error('Prévia do certificado:', e);
        if (vivo) setPronto({ para: cal, r: 'falhou' });
      });
    return () => {
      vivo = false;
    };
  }, [cal]);

  const r = pronto?.para === cal ? pronto.r : null;
  if (!r) return <div className="vpdf-aviso">Preparando o certificado…</div>;
  if (r === 'falhou') return <div className="vpdf-aviso">Não foi possível montar a prévia do certificado.</div>;
  return (
    <VisualizadorPdfBytes
      bytes={r.bytes}
      paginas={r.paginas}
      nomeArquivo={nomeArquivoCalibracao(cal)}
      selo="Prévia do rascunho — não emitido"
    />
  );
}
