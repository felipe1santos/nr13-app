import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
import { textoDoErro } from '../../services/textoDoErro';
import { gerarProntuarioVetorial } from '../relatorios/pdfVetorial/gerarProntuario';

/**
 * A PRÉVIA do prontuário é o documento.
 *
 * A tela mostrava as seis folhas HTML em `<iframe>` e a emissão desenhava outra
 * coisa — o usuário aprovava um documento e assinava outro. Aqui roda o MESMO
 * gerador da emissão; o que aparece na tela é o que vai para o PDF.
 *
 * ## Por que um botão, e não geração a cada mudança
 *
 * Gerar o documento inteiro custa alguns segundos (as três vistas do croqui são
 * rasterizadas antes das duas passagens). A prévia nasce gerada e se refaz
 * quando alguém pede, ou quando a versão dos dados muda — trocar o croqui ou o
 * assinante e continuar vendo o desenho antigo seria pior do que esperar.
 *
 * ## O que ela NÃO faz
 *
 * Não emite, não calcula SHA oficial, não grava `pdfRef` e não cria revisão.
 * Quem faz isso é o botão EMITIR, que chama o mesmo gerador.
 */
export default function PreviaProntuarioVetorial({
  tag,
  versao,
  nomeArquivo,
}: {
  tag: string;
  versao: number;
  nomeArquivo: string;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [falhas, setFalhas] = useState<string[]>([]);

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro('');
    try {
      const r = await gerarProntuarioVetorial(tag);
      setBytes(r.bytes);
      setPaginas(r.paginas);
      // Croqui que não converteu volta NOMEADO: o documento sai sem ele, e
      // ninguém descobre isso depois de assinar.
      setFalhas(r.croquisFalhos);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível gerar a pré-visualização do prontuário.'));
    } finally {
      setGerando(false);
    }
  }, [tag]);

  useEffect(() => {
    void gerar();
  }, [gerar, versao]);

  return (
    <div className="previa">
      <div className="previa-barra">
        <button type="button" className="btn-secundario barra-btn" onClick={() => void gerar()} disabled={gerando}>
          <Icone nome="refresh" tam={14} /> {gerando ? 'Gerando…' : 'Atualizar prévia'}
        </button>
        {falhas.length > 0 && (
          <span className="previa-atrasada" title={falhas.join(' · ')}>
            <Icone nome="alerttri" tam={13} /> Croqui não convertido: {falhas.join(', ')}
          </span>
        )}
      </div>

      {erro && <p className="med-erro">{erro}</p>}

      {bytes ? (
        <VisualizadorPdfBytes
          bytes={bytes}
          nomeArquivo={nomeArquivo}
          paginas={paginas}
          selo="Prévia — não é o documento emitido"
        />
      ) : (
        !erro && <p className="previa-painel-vazio">{gerando ? 'Montando o prontuário…' : 'Prévia ainda não gerada.'}</p>
      )}
    </div>
  );
}
