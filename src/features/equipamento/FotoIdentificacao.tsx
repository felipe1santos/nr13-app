import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { ler } from '../../services/storage';
import { salvarFoto } from '../../services/fotos';
import type { FotoEquipamento } from './tipos';
import { gravarFotosDaFicha } from './gravarFotosDaFicha';
import { comNovaIdentificacao, identificacaoDe, semIdentificacao } from './identificacaoEquipamento';
import './equipamento.css';

/**
 * A ficha do equipamento tem UMA foto, e ela serve para IDENTIFICAR o ativo —
 * decisão do dono em 20/08/2026. As fotos técnicas (várias, com descrição)
 * continuam onde sempre estiveram: nos formulários de inspeção, no checklist e
 * nas folhas do relatório, em outra família de chave (`nr13_docs_`).
 *
 * ── O QUE NÃO MUDOU, DE PROPÓSITO ──────────────────────────────────────────
 *
 * O formato de `nr13_fotos_<TAG>` continua sendo uma LISTA, e a identificação
 * continua sendo `fotos.find(isCapa) ?? fotos[0]` — exatamente o critério que
 * `equipamentoService`, `Equipamento`, `portalService`, `PortalAtivo` e a folha
 * `CAPA.html` já usavam. Nenhum template mudou, nenhum dado foi migrado, e o
 * Portal não precisou de deploy.
 *
 * ── NADA É APAGADO ─────────────────────────────────────────────────────────
 *
 * Equipamento antigo pode ter várias fotos aqui. Elas ficam: nem o arquivo sai
 * do bucket, nem a referência sai do registro. Só uma aparece.
 *
 * TROCAR não apaga a anterior. É a regra, e o motivo é concreto: relatório
 * LEGADO (sem `pdfRef`) é remontado a partir de `CAPA.html`, que lê
 * `nr13_fotos_` VIVO. Apagar o arquivo da foto trocada deixaria a capa daquele
 * relatório sem imagem. Uma referência custa ~150 bytes; perder a capa de um
 * documento emitido não tem preço de volta.
 *
 * REMOVER tira a foto da ficha, mas também **não apaga o arquivo**. Se o
 * equipamento for antigo e tiver fotos anteriores, a anterior volta a ser a
 * identificação — o histórico não é destruído para acomodar a interface.
 */
export default function FotoIdentificacao({ tag }: { tag: string }) {
  const [fotos, setFotos] = useState<FotoEquipamento[]>(
    () => ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [],
  );
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const identificacao = identificacaoDe(fotos);

  async function persistir(novas: FotoEquipamento[]) {
    setFotos(novas);
    // Grava E avisa a ficha: sem o aviso, a foto grande do topo (outro
    // componente) só mostrava a nova depois do F5 — ver `gravarFotosDaFicha`.
    await gravarFotosDaFicha(tag, novas);
  }

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      // A imagem vai para o bucket; aqui fica só a referência. `src` nasce
      // vazio de propósito — é o campo do formato antigo, mantido para as fotos
      // que já estavam gravadas em base64.
      const ref = await salvarFoto(arquivo, tag);
      const nova: FotoEquipamento = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        src: '',
        ref,
        isCapa: true,
      };
      // As anteriores perdem a marca mas CONTINUAM na lista e no bucket.
      await persistir(comNovaIdentificacao(fotos, nova));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não foi possível anexar a foto');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remover() {
    if (!identificacao) return;
    // A anterior (se houver) volta a identificar o equipamento. Nenhuma chamada
    // a `removerFoto`: o arquivo fica no bucket, disponível para o relatório
    // legado que ainda aponte para ele.
    await persistir(semIdentificacao(fotos));
  }

  // Botões de verdade (não `label` com input escondido): o input `display:none`
  // não recebia foco, e quem navega por teclado não conseguia enviar a foto.
  const escolher = () => inputRef.current?.click();

  return (
    <div className={`ficha-foto-id${identificacao ? ' com-foto' : ' sem-foto'}`} aria-busy={enviando}>
      {identificacao ? (
        <button
          type="button"
          className="ficha-foto-id-thumb"
          onClick={escolher}
          disabled={enviando}
          title="Trocar a foto de identificação"
          aria-label="Trocar a foto de identificação"
        >
          <FotoImg
            foto={{ ref: identificacao.ref, base64: identificacao.src }}
            alt={`Foto de identificação de ${tag}`}
            variante="thumb"
          />
          <span className="ficha-foto-id-trocar" aria-hidden="true">
            <Icone nome="refresh" tam={14} />
          </span>
        </button>
      ) : (
        <span className="ficha-foto-id-icone" aria-hidden="true">
          <Icone nome="upload" tam={18} />
        </span>
      )}

      <span className="ficha-foto-id-corpo">
        <strong>Foto de identificação</strong>
        <span className="ficha-foto-id-detalhe" aria-live="polite">
          {enviando ? 'Enviando…' : identificacao ? 'Clique na foto para trocar' : 'JPG ou PNG, tirada na hora ou da galeria'}
        </span>
      </span>

      <span className="ficha-foto-id-acoes">
        {identificacao ? (
          <button
            type="button"
            className="ficha-foto-id-btn ficha-foto-id-remover"
            onClick={remover}
            disabled={enviando}
            title="Remover a foto de identificação (o arquivo não é apagado)"
            aria-label="Remover foto de identificação"
          >
            <Icone nome="x" tam={15} />
          </button>
        ) : (
          <button type="button" className="ficha-foto-id-enviar" onClick={escolher} disabled={enviando}>
            <Icone nome="upload" tam={14} /> {enviando ? 'Enviando…' : 'Enviar foto'}
          </button>
        )}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={enviando}
        onChange={anexar}
        hidden
        tabIndex={-1}
        aria-hidden="true"
      />
      {erro && (
        <p className="ficha-foto-id-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
