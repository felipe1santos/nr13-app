import { useEffect, useState } from 'react';
import PaginaA4 from '../../components/PaginaA4';
import RecusaPalco from '../../components/RecusaPalco';
import { usePalcoDocumento } from '../documentos/usePalcoDocumento';
import { carregarContainer } from './inspecaoService';
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from './tipos';
import { gravarInspecaoOrigemAtual, gravarMetaAtual } from '../relatorios/relatoriosService';
import type { RelatorioMeta } from '../relatorios/tipos';

/**
 * A FOLHA DO RELATÓRIO daquele ensaio, montada com os dados de campo.
 *
 * ## Duas etapas, e a ordem entre elas é o ponto
 *
 * Os templates de `public/arquivos-inspecao/` leem os dados direto do
 * `localStorage` no `DOMContentLoaded` (§2 do CLAUDE.md) — eles não recebem
 * props. E na v2 o `localStorage` é só o **PALCO** (§2-ter): as chaves só
 * existem ali enquanto o documento está aberto, materializadas por
 * `usePalcoDocumento`.
 *
 * Então são duas etapas, nesta ordem:
 *
 * 1. **gravar** os dados deste container nas chaves que os templates leem
 *    (`gravarInspecaoOrigemAtual` escreve as DUAS — ver a regra crítica de
 *    injeção do §2);
 * 2. **montar o palco** e só então os iframes.
 *
 * Inverter isso foi exatamente o defeito de 13/09/2026: o palco era montado com
 * o valor anterior da chave (ou com ela ausente) e a folha saía com "--" em
 * todos os campos, **sem erro nenhum** — o pior tipo de falha deste sistema.
 * Por isso o `<Encenado>` só é montado depois de a gravação confirmar.
 *
 * ## Por que a meta vai VAZIA
 *
 * `nr13_relatorio_meta_atual` é chave viva e compartilhada: sem zerá-la, o
 * cabeçalho desta prévia sairia com código, data de emissão e assinantes do
 * ÚLTIMO relatório aberto no visualizador. Aqui não há relatório nenhum, e o
 * cabeçalho precisa dizer isso ficando em branco.
 *
 * ## O que ela NÃO é
 *
 * Não é o documento emitido: sem número, sem assinatura, sem PDF, sem histórico.
 */
export default function PreviewDocumento({
  tag,
  containerId,
  formulario,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
}) {
  const docs = DOCS_POR_FORMULARIO[formulario] ?? [];
  /**
   * Para QUAL ensaio as chaves de injeção já foram gravadas.
   *
   * Marcador, não booleano: trocando de ensaio a chave muda e a gravação volta
   * a ser pendente por derivação, sem `setState` no corpo do efeito.
   */
  const chave = `${tag}|${containerId}|${formulario}`;
  const [gravadoPara, setGravadoPara] = useState<string | null>(null);
  const gravado = gravadoPara === chave;

  useEffect(() => {
    let vivo = true;
    const container = carregarContainer(tag, containerId);
    void Promise.all([
      gravarInspecaoOrigemAtual(container?.dados ?? {}),
      gravarMetaAtual({} as RelatorioMeta),
    ]).then(() => {
      if (vivo) setGravadoPara(chave);
    });
    return () => {
      vivo = false;
    };
  }, [tag, containerId, chave]);

  if (docs.length === 0) {
    return <p className="prevdoc-aviso">Pré-visualização não disponível para este tipo.</p>;
  }
  if (!gravado) return <p className="prevdoc-aviso">Montando documento…</p>;

  return <Encenado tag={tag} containerId={containerId} docs={docs} />;
}

/**
 * O palco e os iframes.
 *
 * Componente separado de propósito: `usePalcoDocumento` materializa as chaves
 * na MONTAGEM, e montá-lo só depois de a gravação confirmar é o que garante que
 * ele encene o dado deste container, e não o que estava lá antes.
 */
function Encenado({ tag, containerId, docs }: { tag: string; containerId: string; docs: string[] }) {
  // O "id do relatório" aqui é o do container: o palco usa isso para saber qual
  // documento está aberto e para a trava de dono por aba (`palcoTrava`).
  const palco = usePalcoDocumento(tag, containerId);

  if (palco.estado !== 'pronto') {
    return <RecusaPalco estado={palco.estado} falha={palco.falha} />;
  }

  return (
    <div className="relatorio-preview">
      {docs.map((doc, i) => {
        const sep = doc.includes('?') ? '&' : '?';
        return (
          <PaginaA4 key={`${doc}-${i}`}>
            <iframe
              src={`/arquivos-inspecao/${doc}${sep}tag=${encodeURIComponent(tag)}&page=${i + 1}${palco.paramsIframe}`}
              scrolling="no"
              title={doc}
            />
          </PaginaA4>
        );
      })}
    </div>
  );
}
