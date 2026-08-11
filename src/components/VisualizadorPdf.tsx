import { useEffect, useRef, useState } from 'react';
import { baixarArtefato, type PdfArtefato } from '../features/relatorios/artefatoRelatorio';

/**
 * Mostra o PDF ARQUIVADO de um relatório finalizado.
 *
 * POR QUE ISTO EXISTE: um relatório finalizado não pode ser remontado a partir
 * dos templates e dos dados vivos. Enquanto era assim, editar a ficha do
 * equipamento mudava documento assinado, e no Portal do Cliente bastava abrir o
 * DevTools, remover a trava de somente-leitura, trocar "Aprovado" por
 * "Reprovado" e clicar em Baixar PDF — o arquivo saía do domínio oficial, com a
 * logo e a assinatura do engenheiro, adulterado.
 *
 * Aqui não existe DOM do documento para adulterar: o que se vê, o que se imprime
 * e o que se baixa são o MESMO arquivo, byte a byte, o que subiu no dia da
 * emissão.
 *
 * O blob vem do cofre local antes do bucket (`baixarArtefato`), então relatório
 * já aberto uma vez abre offline e sem gastar egress.
 */
export default function VisualizadorPdf({
  artefato,
  nomeArquivo,
  onErro,
}: {
  artefato: PdfArtefato;
  nomeArquivo: string;
  onErro?: (mensagem: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'falhou'>('carregando');
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    void baixarArtefato(artefato)
      .then((blob) => {
        if (!vivo) return;
        if (!blob) {
          setEstado('falhou');
          onErro?.('Não foi possível abrir o PDF deste relatório. Verifique a conexão.');
          return;
        }
        const objeto = URL.createObjectURL(blob);
        urlRef.current = objeto;
        setUrl(objeto);
        setEstado('pronto');
      })
      .catch(() => {
        if (!vivo) return;
        setEstado('falhou');
        onErro?.('Não foi possível abrir o PDF deste relatório.');
      });
    return () => {
      vivo = false;
      // O object URL segura o blob na memória até ser revogado.
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [artefato, onErro]);

  if (estado === 'carregando') {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted, #777)' }}>Abrindo o documento...</div>;
  }
  if (estado === 'falhou' || !url) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#8e2b20' }}>
        Não foi possível abrir o PDF deste relatório.
      </div>
    );
  }

  return (
    <iframe
      title={nomeArquivo}
      src={url}
      style={{ width: '100%', height: '80vh', border: '1px solid var(--line, #ddd)', borderRadius: 8, background: '#fff' }}
    />
  );
}

/**
 * Baixa o arquivo arquivado com o nome do relatório.
 *
 * Não regenera nada: é o mesmo arquivo que está no bucket. Regenerar produziria
 * um PDF com os dados de HOJE e ainda por cima com hash diferente do que ficou
 * registrado na emissão.
 */
export async function baixarPdfArquivado(artefato: PdfArtefato, nomeArquivo: string): Promise<boolean> {
  const blob = await baixarArtefato(artefato);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Abre o arquivo arquivado numa aba, onde o usuário usa a impressão do próprio leitor. */
export async function imprimirPdfArquivado(artefato: PdfArtefato): Promise<boolean> {
  const blob = await baixarArtefato(artefato);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, '_blank', 'noopener,noreferrer');
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
