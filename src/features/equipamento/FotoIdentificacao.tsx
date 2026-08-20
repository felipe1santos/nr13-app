import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { ler, salvar } from '../../services/storage';
import { salvarFoto } from '../../services/fotos';
import type { FotoEquipamento } from './tipos';
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
    await salvar(`nr13_fotos_${tag}`, novas);
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

  return (
    <div className="galeria-fotos-row">
      {identificacao && (
        <div className="galeria-foto-item capa" title="Foto de identificação do equipamento">
          <FotoImg
            foto={{ ref: identificacao.ref, base64: identificacao.src }}
            alt={`Foto de identificação de ${tag}`}
            variante="thumb"
          />
          <button
            type="button"
            className="btn-remover-foto"
            title="Remover a foto de identificação (o arquivo não é apagado)"
            onClick={remover}
          >
            ×
          </button>
        </div>
      )}
      <label className="gallery-add-dropzone">
        <span className="gallery-add-icone">
          <Icone nome="camera" tam={20} />
        </span>
        <span>
          {enviando ? 'Enviando…' : identificacao ? 'Trocar Foto' : 'Foto de Identificação'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={enviando}
          onChange={anexar}
          style={{ display: 'none' }}
        />
      </label>
      {erro && <p style={{ color: 'var(--erro, #c00)', fontSize: 12, width: '100%' }}>{erro}</p>}
    </div>
  );
}
