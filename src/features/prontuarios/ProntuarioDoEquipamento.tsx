import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../../components/Icone';
import { artefatoDe, baixarArtefato } from '../relatorios/artefatoRelatorio';
import { agendarConfirmacaoDeEnvios, bytesDaEmissao, listarEmissoes, ehAnexado, type EmissaoProntuario } from './emissaoProntuario';
import { revisaoDe } from './emissaoProntuario';
import ModalAnexarProntuario from './ModalAnexarProntuario';
import { baixarArquivo, reservarAba } from './abrirArquivo';
import { confirmarEnvioNoIndice } from './indiceProntuarios';
import { arquivoPendente } from '../../services/fotos';
import { assinarDadosAlterados, emitirDadosAlterados } from '../../services/eventos';
import { formatarTamanho } from '../equipamento/ProntuarioFabricante';
import './prontuarioDoEquipamento.css';

/**
 * O PRONTUÁRIO NR-13 DENTRO DA FICHA (19/09/2026).
 *
 * A ficha mostrava só o prontuário do FABRICANTE (`nr13_pront_fab_<TAG>`), que
 * é outro documento. Quem abria a ficha de um equipamento com prontuário
 * emitido não via nada disso — e, para anexar um prontuário antigo, não havia
 * caminho nenhum.
 *
 * Esta seção lê a MESMA fonte da lista de `/prontuarios`: as emissões daquela
 * TAG (`nr13_pront_emitido_<TAG>`). Documento gerado aqui e PDF anexado
 * aparecem juntos, cada um com o seu selo — anexar não apaga nem substitui o
 * que foi gerado, e emitir não apaga o anexo.
 *
 * Abrir serve os BYTES arquivados (`bytesDaEmissao`): nada é remontado a partir
 * dos dados de hoje, nem para o anexo nem para o documento emitido.
 */
export default function ProntuarioDoEquipamento({
  tag,
  descricao,
  cliente,
}: {
  tag: string;
  descricao?: string | null;
  cliente?: string | null;
}) {
  const [docs, setDocs] = useState<EmissaoProntuario[]>(() => listarEmissoes(tag));
  const [anexando, setAnexando] = useState(false);
  const [erro, setErro] = useState('');
  const [abrindo, setAbrindo] = useState('');

  // Sem efeito de carga: a lista nasce do cache no primeiro render e só é
  // relida quando ESTA tela grava alguma coisa (o anexo). Efeito que chama
  // setState no mount é render duplicado e é o que o lint barra.
  const recarregar = useCallback(() => setDocs(listarEmissoes(tag)), [tag]);

  /**
   * "Aguardando sincronização" é o retrato do momento da gravação: quem anexou
   * sem rede ficaria com o selo para sempre, e aviso que não some deixa de ser
   * aviso. Quem confere é o SERVIÇO, fora do React (`setState` dentro de efeito
   * é render duplicado, e o lint barra); esta tela só assina o barramento e
   * relê quando alguma coisa mudou.
   */
  useEffect(() => {
    agendarConfirmacaoDeEnvios(tag, {
      arquivoPendente,
      aoConfirmar: async (ids) => {
        await confirmarEnvioNoIndice(ids);
        emitirDadosAlterados();
      },
    });
    return assinarDadosAlterados(recarregar);
  }, [tag, recarregar]);

  async function abrir(e: EmissaoProntuario) {
    setErro('');
    setAbrindo(e.id);
    // A aba é reservada AQUI, dentro do clique: num aparelho que ainda não tem
    // o arquivo no cofre, a busca vai ao bucket e um `window.open` depois do
    // await é barrado como popup, em silêncio. Ver `abrirArquivo.ts`.
    const aba = reservarAba();
    try {
      const blob = await bytesDaEmissao(e, { artefatoDe, baixarArtefato });
      aba.entregar(blob, e.arquivoNome ?? `${e.numero ?? 'prontuario'}.pdf`);
    } catch (err) {
      aba.descartar();
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir o documento.');
    } finally {
      setAbrindo('');
    }
  }

  /** Os MESMOS bytes do visualizar, salvos com o nome original do arquivo. */
  async function baixar(e: EmissaoProntuario) {
    setErro('');
    setAbrindo(e.id);
    try {
      const blob = await bytesDaEmissao(e, { artefatoDe, baixarArtefato });
      baixarArquivo(blob, e.arquivoNome ?? `${e.numero ?? 'prontuario'}.pdf`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível baixar o documento.');
    } finally {
      setAbrindo('');
    }
  }

  return (
    <div className="bloco-dados pde-bloco">
      <div className="pde-cabecalho">
        <div>
          <h3>Prontuário NR-13</h3>
          <p className="pde-sub">
            Documentos deste equipamento — os gerados aqui e os PDFs existentes que você anexou.
          </p>
        </div>
        <button type="button" className="fj-btn fj-btn-primary pde-btn-anexar" onClick={() => setAnexando(true)}>
          <Icone nome="plus" tam={14} /> Anexar prontuário existente
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="dashboard-vazio pde-vazio">
          Nenhum prontuário ainda. Crie o prontuário em <b>Prontuários</b> ou anexe aqui o PDF que o
          cliente já tem.
        </p>
      ) : (
        <ul className="pde-lista">
          {docs.map((d) => {
            const anexo = ehAnexado(d);
            const rev = revisaoDe(tag, d.id);
            return (
              <li key={d.id} className="pde-item">
                <span className="pde-icone" aria-hidden>
                  <Icone nome={anexo ? 'pdf' : 'filetext'} tam={16} />
                </span>
                <span className="pde-nome">
                  <strong>{anexo ? d.arquivoNome ?? 'Prontuário existente' : d.numero ?? 'Prontuário NR-13'}</strong>
                  <span className="pde-meta">
                    {anexo ? 'PDF anexado' : `Gerado pelo sistema · Rev. ${String(rev).padStart(2, '0')}`}
                    {d.tamanho ? ` · ${formatarTamanho(d.tamanho)}` : ''}
                    {d.pdfPendente ? ' · aguardando sincronização' : ''}
                  </span>
                </span>
                <span className={`pde-selo ${anexo ? 'pde-selo-anexo' : 'pde-selo-sistema'}`}>
                  {anexo ? 'PDF ANEXADO' : 'EMITIDO'}
                </span>
                <button
                  type="button"
                  className="btn-icone cor-azul"
                  title="Visualizar"
                  aria-label={`Visualizar o prontuário ${anexo ? d.arquivoNome ?? '' : d.numero ?? ''}`}
                  disabled={abrindo === d.id}
                  onClick={() => void abrir(d)}
                >
                  <Icone nome="eye" tam={14} />
                </button>
                <button
                  type="button"
                  className="btn-icone cor-azul"
                  title="Baixar o PDF original"
                  aria-label={`Baixar o prontuário ${anexo ? d.arquivoNome ?? '' : d.numero ?? ''}`}
                  disabled={abrindo === d.id}
                  onClick={() => void baixar(d)}
                >
                  <Icone nome="download" tam={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {erro && <p className="erro-form pde-erro">{erro}</p>}

      {anexando && (
        <ModalAnexarProntuario
          tag={tag}
          descricao={descricao}
          cliente={cliente}
          aoFechar={() => setAnexando(false)}
          aoConcluir={() => {
            recarregar();
            setAnexando(false);
          }}
        />
      )}
    </div>
  );
}
