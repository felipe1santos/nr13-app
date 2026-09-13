import { useEffect, useState } from 'react';
import PaginaA4 from '../../components/PaginaA4';
import { carregarContainer } from './inspecaoService';
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from './tipos';
import { gravarInspecaoOrigemAtual, gravarMetaAtual } from '../relatorios/relatoriosService';
import type { RelatorioMeta } from '../relatorios/tipos';

/**
 * A FOLHA DO RELATÓRIO daquele ensaio, montada com os dados de campo.
 *
 * ## Como ela se monta
 *
 * Os templates de `public/arquivos-inspecao/` leem os dados direto do
 * `localStorage` no `DOMContentLoaded` (§2 do CLAUDE.md) — eles não recebem
 * props. Então a montagem é: gravar os dados deste container nas chaves que
 * eles leem (`gravarInspecaoOrigemAtual` escreve as DUAS, ver a regra crítica
 * de injeção) e só então montar os iframes.
 *
 * ## Por que a meta vai VAZIA
 *
 * `nr13_relatorio_meta_atual` é chave viva e compartilhada: sem zerá-la, o
 * cabeçalho desta prévia sairia com código, data de emissão e assinantes do
 * ÚLTIMO relatório aberto no visualizador — números de outro documento no
 * cabeçalho deste. Aqui não há relatório nenhum, e o cabeçalho precisa dizer
 * isso ficando em branco.
 *
 * ## O que ela NÃO é
 *
 * Não é o documento emitido: não tem número, não tem assinatura, não gera PDF e
 * não entra em histórico nenhum. É a folha como ela FICARÁ quando este ensaio
 * for para um relatório.
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
   * É um marcador, não um booleano, e isso é o que evita `setPronto(false)` no
   * corpo do efeito: trocando de ensaio, a chave muda e `pronto` vira falso por
   * derivação, sem um render a mais só para desligar a bandeira.
   */
  const chave = `${tag}|${containerId}|${formulario}`;
  const [gravadoPara, setGravadoPara] = useState<string | null>(null);
  const pronto = gravadoPara === chave;

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

  if (!pronto) return <p className="prevdoc-aviso">Montando documento…</p>;
  if (docs.length === 0) {
    return <p className="prevdoc-aviso">Pré-visualização não disponível para este tipo.</p>;
  }

  return (
    <div className="relatorio-preview">
      {docs.map((doc, i) => (
        <PaginaA4 key={`${doc}-${i}`}>
          <iframe
            src={`/arquivos-inspecao/${doc}?tag=${encodeURIComponent(tag)}&page=${i + 1}`}
            scrolling="no"
            title={doc}
          />
        </PaginaA4>
      ))}
    </div>
  );
}
