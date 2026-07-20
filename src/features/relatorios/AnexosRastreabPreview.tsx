import { useEffect, useState } from 'react';
import { paginasRastreabilidadeComoImagens } from './printService';

/**
 * Páginas dos PDFs dos certificados padrão exibidas no FIM do preview do relatório —
 * o que o usuário vê na tela é o mesmo pacote que sai na impressão/no PDF baixado.
 * Classe própria (.pagina-anexo-rastreab, NÃO .pagina-relatorio-a4): os funis de
 * impressão/exportação anexam o PDF original por conta própria — se estas páginas
 * entrassem no seletor das folhas, sairiam duplicadas.
 */
export default function AnexosRastreabPreview({ documentos }: { documentos: string[] }) {
  const [imagens, setImagens] = useState<string[]>([]);
  const chave = documentos.join('|');

  useEffect(() => {
    let cancelado = false;
    setImagens([]);
    void paginasRastreabilidadeComoImagens(documentos).then(({ imagens: imgs }) => {
      if (!cancelado) setImagens(imgs);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentos é recriado a cada render; comparar pelo conteúdo evita re-rasterizar à toa
  }, [chave]);

  if (imagens.length === 0) return null;
  return (
    <>
      {imagens.map((src, i) => (
        <div key={i} className="pagina-anexo-rastreab">
          <img src={src} alt={`Certificado de calibração do padrão — página ${i + 1}`} />
        </div>
      ))}
    </>
  );
}
