import { artefatoDe, type PdfArtefato } from '../relatorios/artefatoRelatorio';
import { listarEmissoes, ehAnexado, type EmissaoProntuario } from '../prontuarios/emissaoProntuario';
import { resolverProntuarioVigente, ROTULO_ORIGEM } from '../prontuarios/prontuarioVigente';

/**
 * Fase 6.3 · o PRONTUÁRIO no Portal do Cliente.
 *
 * ## O defeito
 *
 * `PortalAtivo.abrirProntuario` copiava o rascunho vivo (`nr13_prontuario_<TAG>`)
 * para `nr13_prontuario_atual` e montava as folhas `PRONT-*.html` em iframe —
 * com os dados de HOJE do equipamento (ficha, memorial, medição, assinantes).
 * O cliente via um prontuário diferente do emitido assim que qualquer dado
 * mudasse. A Edge `portal_cliente` nem entregava `nr13_pront_emitido_<TAG>`
 * (estava em `FORA_DO_PORTAL`, "a tela ainda não sabe apresentá-lo").
 *
 * ## A regra
 *
 * Prontuário com emissão vigente — GERADA pelo sistema ou PDF ANEXADO — abre o
 * ARQUIVO daquela emissão: `pdfRef` → `portal_arquivo` (autoriza por vínculo,
 * URL assinada de 5 min) → os MESMOS bytes, com o SHA registrado. O vigente é
 * decidido pela MESMA porta da ficha e de `/prontuarios`
 * (`resolverProntuarioVigente`: mais recente, retirada não conta).
 *
 * O PDF do FABRICANTE (`nr13_pront_fab_<TAG>`) é documento legado e continua
 * no seu próprio item do Portal — não é promovido a prontuário aqui.
 *
 * SEM emissão/anexo vigente (decisão do dono, 25/09/2026 — Opção B): estado
 * "Prontuário ainda não emitido", sem botão. Rascunho NÃO é documento: nada é
 * remontado, e a Edge nem entrega mais `nr13_prontuario_<TAG>` ao cliente — por
 * isso o estado não distingue "tem rascunho" de "nunca começou" (e não vaza isso).
 */
export type ProntuarioNoPortal =
  | {
      tipo: 'arquivo';
      titulo: string;
      artefato: PdfArtefato;
      emissao: EmissaoProntuario;
      /** "GERADO PELO SISTEMA" / "PDF ANEXADO". */
      rotuloOrigem: string;
      /** Linha de apoio da lista: nº, data. */
      descricao: string;
      nomeArquivo: string;
    }
  /** Sem prontuário oficial: estado explícito, sem ação. */
  | { tipo: 'naoEmitido'; titulo: string; descricao: string }
  /** Há emissão, mas sem arquivo referenciado: nunca remontar no lugar dela. */
  | { tipo: 'indisponivel'; titulo: string; descricao: string };

const dataBr = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
};

export function prontuarioNoPortal(tag: string): ProntuarioNoPortal {
  // O fabricante NÃO entra: no Portal ele tem item próprio (legado separado).
  const vigente = resolverProntuarioVigente(listarEmissoes(tag), null);
  const emissao = vigente?.emissao;
  const artefato = artefatoDe(emissao);
  if (emissao && artefato) {
    const anexado = ehAnexado(emissao);
    const quando = emissao.emissao ?? dataBr(emissao.geradoEm);
    return {
      tipo: 'arquivo',
      titulo: 'Prontuário do Equipamento',
      artefato,
      emissao,
      rotuloOrigem: ROTULO_ORIGEM[anexado ? 'anexado' : 'gerado'],
      descricao: [
        emissao.numero ? `Nº ${emissao.numero}` : null,
        quando ? `${anexado ? 'anexado' : 'emitido'} em ${quando}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      nomeArquivo: (anexado && emissao.arquivoNome) || `Prontuario_${tag}.pdf`,
    };
  }
  if (emissao) {
    return {
      tipo: 'indisponivel',
      titulo: 'Prontuário do Equipamento',
      descricao: 'O arquivo desta emissão não está disponível. Fale com a empresa responsável.',
    };
  }
  return { tipo: 'naoEmitido', titulo: 'Prontuário do Equipamento', descricao: 'Prontuário ainda não emitido.' };
}
