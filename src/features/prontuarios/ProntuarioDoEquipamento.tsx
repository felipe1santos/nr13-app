import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import { agendarConfirmacaoDeEnvios, listarEmissoes, revisaoDe } from './emissaoProntuario';
import ModalAnexarProntuario from './ModalAnexarProntuario';
import ModalHistoricoProntuario from './ModalHistoricoProntuario';
import { baixarArquivo, reservarAba } from './abrirArquivo';
import { confirmarEnvioNoIndice, idRascunho, listarDocumentos } from './indiceProntuarios';
import { resolverProntuarioVigente, ROTULO_ORIGEM, type ProntuarioVigente } from './prontuarioVigente';
import { bytesDaVersao } from './bytesDaVersao';
import { arquivoPendente } from '../../services/fotos';
import { ler } from '../../services/storage';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_DOCS } from '../../services/trial';
import { assinarDadosAlterados, emitirAviso, emitirDadosAlterados } from '../../services/eventos';
import { formatarDataEnvio, formatarTamanho, lerProntuarioFabricante } from '../equipamento/ProntuarioFabricante';
import './prontuarioDoEquipamento.css';

/**
 * O PRONTUÁRIO NR-13 NO TOPO DA FICHA — UM SLOT (24/09/2026).
 *
 * Regra de produto: 1 equipamento = 1 prontuário VIGENTE + histórico. O slot
 * mostra o vigente (gerado ou anexado — a origem é só o selo); quem decide qual
 * é `resolverProntuarioVigente`, a mesma porta que `/prontuarios` usa. A fonte
 * é a lista de emissões da TAG (e, sem nenhuma, o PDF do fabricante como
 * legado) — gerado em `/prontuarios` aparece aqui sem upload pela ficha.
 *
 * Estados:
 * - **vigente**: Abrir · Baixar · "Atualizar prontuário" (NOVA VERSÃO: o novo
 *   vira vigente, o atual vai para o histórico) · "Ver histórico (N)" · e,
 *   com rascunho aberto, "Continuar nova revisão". O rascunho NÃO substitui o
 *   vigente.
 * - **só rascunho**: "Prontuário ainda não emitido" · Continuar · Anexar.
 * - **nada**: Anexar prontuário · Criar em Prontuários.
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
  const navigate = useNavigate();
  const lerVigente = useCallback(
    () => resolverProntuarioVigente(listarEmissoes(tag), lerProntuarioFabricante(tag)),
    [tag],
  );
  const [vigente, setVigente] = useState<ProntuarioVigente | null>(lerVigente);
  const [anexando, setAnexando] = useState(false);
  const [vendoHistorico, setVendoHistorico] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(() => setVigente(lerVigente()), [lerVigente]);

  /**
   * "Aguardando sincronização" é o retrato do momento da gravação: quem anexou
   * sem rede ficaria com o selo para sempre. Quem confere é o SERVIÇO, fora do
   * React; esta tela só assina o barramento e relê quando algo mudou.
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

  /**
   * Rascunho = TRABALHO EM ABERTO, não documento. O sinal é a linha de
   * rascunho do índice (gravada ao salvar o formulário, apagada ao emitir):
   * `nr13_prontuario_<TAG>` sozinho não serve depois da primeira emissão,
   * porque os dados do formulário continuam gravados. Sem emissão e sem
   * índice, vale a mesma regra de `reconciliar`: dados com a própria TAG.
   */
  const temRascunho =
    listarDocumentos().some((d) => d.id === idRascunho(tag) && d.situacao === 'rascunho') ||
    (!vigente?.emissao && ler<{ tag?: string }>(`nr13_prontuario_${tag}`)?.tag === tag);
  // Histórico: abre a TAG em /prontuarios. Criar/Continuar: direto no formulário.
  const irParaProntuarios = (editar = false) =>
    navigate(`/prontuarios?tag=${encodeURIComponent(tag)}${editar ? '&editar=1' : ''}`);

  async function abrir() {
    if (!vigente) return;
    setErro('');
    setOcupado(true);
    // A aba é reservada AQUI, dentro do clique: um `window.open` depois do
    // await da busca dos bytes é barrado como popup. Ver `abrirArquivo.ts`.
    const aba = reservarAba();
    try {
      const { blob, nome } = await bytesDaVersao(vigente, tag);
      aba.entregar(blob, nome);
    } catch (err) {
      aba.descartar();
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir o prontuário.');
    } finally {
      setOcupado(false);
    }
  }

  /** Os MESMOS bytes do Abrir, salvos com o nome original do arquivo. */
  async function baixar() {
    if (!vigente) return;
    setErro('');
    if (vigente.fabricante && isTrial()) {
      // O gate do trial que o bloco antigo do fabricante já tinha.
      emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_DOCS });
      return;
    }
    setOcupado(true);
    try {
      const { blob, nome } = await bytesDaVersao(vigente, tag);
      baixarArquivo(blob, nome);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível baixar o prontuário.');
    } finally {
      setOcupado(false);
    }
  }

  function detalhe(v: ProntuarioVigente): string {
    if (v.emissao && v.origem === 'gerado') {
      const e = v.emissao;
      const rev = String(revisaoDe(tag, e.id)).padStart(2, '0');
      return [e.numero, `Rev. ${rev}`, e.emissao].filter(Boolean).join(' · ');
    }
    if (v.emissao) {
      const e = v.emissao;
      return [e.arquivoNome, e.tamanho ? formatarTamanho(e.tamanho) : null].filter(Boolean).join(' · ');
    }
    const f = v.fabricante!;
    return [f.nome, formatarTamanho(f.tamanho), `enviado em ${formatarDataEnvio(f.enviadoEm)}`].filter(Boolean).join(' · ');
  }

  const classe = vigente ? `pde-slot-${vigente.origem}` : temRascunho ? 'pde-slot-rascunho' : 'pde-slot-vazio';

  return (
    <div className={`pde-slot ${classe}`} data-teste="prontuario-slot">
      <span className="pde-slot-icone" aria-hidden>
        <Icone nome={vigente ? 'pdf' : 'filetext'} tam={18} />
      </span>

      <div className="pde-slot-corpo">
        <div className="pde-slot-titulo">
          <strong>Prontuário NR-13</strong>
          {vigente && <span className={`pde-slot-selo pde-slot-selo-${vigente.origem}`}>{ROTULO_ORIGEM[vigente.origem]}</span>}
        </div>
        {vigente ? (
          <span className="pde-slot-detalhe" title={detalhe(vigente)}>
            {detalhe(vigente)}
            {vigente.emissao?.pdfPendente ? ' · aguardando sincronização' : ''}
          </span>
        ) : (
          <span className="pde-slot-detalhe">
            {temRascunho ? 'Prontuário ainda não emitido.' : 'Nenhum prontuário neste equipamento.'}
          </span>
        )}
        {vigente && (vigente.outros > 0 || !!vigente.legado || temRascunho) && (
          <span className="pde-slot-links">
            {vigente.outros > 0 && (
              <button type="button" className="pde-slot-historico" onClick={() => setVendoHistorico(true)}>
                Ver histórico ({vigente.outros})
              </button>
            )}
            {/* O PDF do fabricante, quando há prontuário principal, NÃO é versão:
                não conta no histórico e abre na seção "Documentos legados". */}
            {vigente.legado && (
              <button type="button" className="pde-slot-historico" onClick={() => setVendoHistorico(true)}>
                Documento legado
              </button>
            )}
            {temRascunho && (
              <button type="button" className="pde-slot-link" onClick={() => irParaProntuarios(true)}>
                Continuar nova revisão
              </button>
            )}
          </span>
        )}
      </div>

      <div className="pde-slot-acoes">
        {vigente ? (
          <>
            <button
              type="button"
              className="fj-btn pde-slot-btn"
              onClick={() => void abrir()}
              disabled={ocupado}
              title="Abrir o prontuário"
            >
              <Icone nome="eye" tam={13} /> Abrir
            </button>
            <button
              type="button"
              className="fj-btn pde-slot-btn"
              onClick={() => void baixar()}
              disabled={ocupado}
              title="Baixar o PDF original"
            >
              <Icone nome="download" tam={13} /> Baixar
            </button>
            <button type="button" className="pde-slot-link" onClick={() => setAnexando(true)}>
              Atualizar prontuário
            </button>
          </>
        ) : temRascunho ? (
          <>
            <button type="button" className="fj-btn pde-slot-btn" onClick={() => irParaProntuarios(true)}>
              <Icone nome="pencil" tam={13} /> Continuar
            </button>
            <button type="button" className="pde-slot-link" onClick={() => setAnexando(true)}>
              Anexar prontuário
            </button>
          </>
        ) : (
          <>
            <button type="button" className="fj-btn pde-slot-btn" onClick={() => setAnexando(true)}>
              <Icone nome="plus" tam={13} /> Anexar prontuário
            </button>
            <button type="button" className="pde-slot-link" onClick={() => irParaProntuarios(true)}>
              Criar em Prontuários
            </button>
          </>
        )}
      </div>

      {erro && <p className="erro-form pde-slot-erro">{erro}</p>}

      {anexando && (
        <ModalAnexarProntuario
          tag={tag}
          descricao={descricao}
          cliente={cliente}
          atualizacao={!!vigente}
          aoFechar={() => {
            setAnexando(false);
            recarregar();
          }}
          aoConcluir={() => {
            recarregar();
            setAnexando(false);
          }}
        />
      )}
      {vendoHistorico && <ModalHistoricoProntuario tag={tag} aoFechar={() => setVendoHistorico(false)} />}
    </div>
  );
}
