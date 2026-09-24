import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import { artefatoDe, baixarArtefato } from '../relatorios/artefatoRelatorio';
import { agendarConfirmacaoDeEnvios, bytesDaEmissao, listarEmissoes, type EmissaoProntuario } from './emissaoProntuario';
import { revisaoDe } from './emissaoProntuario';
import ModalAnexarProntuario from './ModalAnexarProntuario';
import { baixarArquivo, reservarAba } from './abrirArquivo';
import { confirmarEnvioNoIndice } from './indiceProntuarios';
import { resolverProntuarioVigente, ROTULO_ORIGEM, type ProntuarioVigente } from './prontuarioVigente';
import { arquivoPendente } from '../../services/fotos';
import { ler } from '../../services/storage';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_DOCS } from '../../services/trial';
import { assinarDadosAlterados, emitirAviso, emitirDadosAlterados } from '../../services/eventos';
import {
  baixarPdfFabricante,
  formatarDataEnvio,
  formatarTamanho,
  lerProntuarioFabricante,
  resolverPdfFabricante,
} from '../equipamento/ProntuarioFabricante';
import './prontuarioDoEquipamento.css';

/**
 * O PRONTUÁRIO NR-13 NO TOPO DA FICHA — UM SLOT (24/09/2026).
 *
 * Regra de produto: 1 equipamento = 1 prontuário vigente. A ficha tinha dois
 * blocos grandes no fim da página ("Prontuário NR-13", com a lista de todos os
 * documentos, e "Prontuário do Fabricante", com uma área de envio); agora há um
 * componente compacto dentro do card principal, ao lado da foto.
 *
 * A fonte é a MESMA de `/prontuarios`: as emissões da TAG
 * (`nr13_pront_emitido_<TAG>`) e, como legado, o PDF do fabricante
 * (`nr13_pront_fab_<TAG>`). Qual documento ocupa o slot é decisão de
 * `resolverProntuarioVigente` — aqui só se desenha. Gerado em `/prontuarios`
 * aparece aqui sem nenhum upload pela ficha.
 *
 * Com prontuário: Abrir e Baixar servem os BYTES arquivados, nunca uma
 * remontagem. Sem prontuário: "Anexar prontuário" (o fluxo da Fase 3) e o
 * atalho para criar em `/prontuarios`. Com prontuário, NÃO há "anexar outro":
 * a política de substituição ainda não foi decidida, e um segundo documento
 * não pode entrar calado.
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
  const ler_ = useCallback(
    () => resolverProntuarioVigente(listarEmissoes(tag), lerProntuarioFabricante(tag)),
    [tag],
  );
  const [vigente, setVigente] = useState<ProntuarioVigente | null>(ler_);
  const [anexando, setAnexando] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(() => setVigente(ler_()), [ler_]);

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

  // Rascunho em aberto (dados salvos, nada emitido): o atalho diz "Continuar",
  // não "Criar" — criar de novo sugeriria jogar o trabalho fora.
  const temRascunho = ler<{ tag?: string }>(`nr13_prontuario_${tag}`)?.tag === tag;
  // Histórico: abre a TAG em /prontuarios. Criar/Continuar: direto no formulário.
  const irParaProntuarios = (editar = false) =>
    navigate(`/prontuarios?tag=${encodeURIComponent(tag)}${editar ? '&editar=1' : ''}`);

  function nomeDaEmissao(e: EmissaoProntuario): string {
    return e.arquivoNome ?? `${e.numero ?? 'prontuario'}.pdf`;
  }

  async function abrir() {
    if (!vigente) return;
    setErro('');
    setOcupado(true);
    // A aba é reservada AQUI, dentro do clique: um `window.open` depois do
    // await da busca dos bytes é barrado como popup. Ver `abrirArquivo.ts`.
    const aba = reservarAba();
    try {
      if (vigente.emissao) {
        const e = vigente.emissao;
        const blob = await bytesDaEmissao(e, { artefatoDe, baixarArtefato });
        aba.entregar(blob, nomeDaEmissao(e));
      } else if (vigente.fabricante) {
        const dataUrl = await resolverPdfFabricante(vigente.fabricante);
        if (!dataUrl) throw new Error('O arquivo do fabricante não voltou nem do aparelho nem do servidor.');
        // Decodifica aqui, como `abrirPdfProntuarioFabricante`: `fetch` numa
        // URL `data:` pode ser barrado pela CSP (connect-src).
        const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        aba.entregar(new Blob([bytes], { type: 'application/pdf' }), vigente.fabricante.nome || `prontuario-${tag}.pdf`);
      }
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
      if (vigente.emissao) {
        const e = vigente.emissao;
        const blob = await bytesDaEmissao(e, { artefatoDe, baixarArtefato });
        baixarArquivo(blob, nomeDaEmissao(e));
      } else if (vigente.fabricante) {
        await baixarPdfFabricante(vigente.fabricante, vigente.fabricante.nome || `prontuario-${tag}.pdf`);
      }
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

  return (
    <div className={`pde-slot ${vigente ? `pde-slot-${vigente.origem}` : 'pde-slot-vazio'}`} data-teste="prontuario-slot">
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
            {temRascunho ? 'Rascunho em andamento, ainda não emitido.' : 'Nenhum prontuário neste equipamento.'}
          </span>
        )}
        {vigente && vigente.outros > 0 && (
          <button type="button" className="pde-slot-historico" onClick={() => irParaProntuarios()}>
            + {vigente.outros} {vigente.outros === 1 ? 'documento anterior' : 'documentos anteriores'} em Prontuários
          </button>
        )}
      </div>

      <div className="pde-slot-acoes">
        {vigente ? (
          <>
            <button
              type="button"
              className="fj-btn fj-btn-primary pde-slot-btn"
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
          </>
        ) : (
          <>
            <button type="button" className="fj-btn fj-btn-primary pde-slot-btn" onClick={() => setAnexando(true)}>
              <Icone nome="plus" tam={13} /> Anexar prontuário
            </button>
            <button type="button" className="pde-slot-link" onClick={() => irParaProntuarios(true)}>
              {temRascunho ? 'Continuar em Prontuários' : 'Criar em Prontuários'}
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
