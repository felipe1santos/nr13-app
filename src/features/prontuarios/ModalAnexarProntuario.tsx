import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import '../relatorios/modalFinalizar.css';
import './modalAnexarProntuario.css';
import CatalogoProntuariosV9 from './CatalogoProntuariosV9';
import {
  anexarProntuarioExistente,
  LIMITE_ANEXO_BYTES,
  validarPdf,
  type ResultadoAnexo,
} from './anexoProntuario';
import { formatarTamanho } from '../equipamento/ProntuarioFabricante';
import { usuarioLogado } from '../../services/auth';

/**
 * ANEXAR PRONTUÁRIO EXISTENTE — o mesmo modal nos dois pontos de entrada.
 *
 * Da FICHA, o equipamento já está decidido e chega em `tag`: o bloco de
 * equipamento é só leitura, e o usuário só escolhe o arquivo. Da LISTA, `tag`
 * vem vazia e o primeiro passo é ESCOLHER o equipamento — pelo mesmo catálogo
 * da criação (`CatalogoProntuariosV9` em modo seleção), que busca pela projeção
 * do servidor e não hidrata a organização.
 *
 * Um componente só, e não dois quase iguais: o pedido é explícito em ter UMA
 * arquitetura, e a regra de validação/gravação é a mesma dos dois lados —
 * `anexarProntuarioExistente`.
 */
export type EstadoEnvio = 'escolher' | 'pronto' | 'enviando' | 'concluido' | 'erro';

export default function ModalAnexarProntuario({
  tag: tagFixa,
  descricao,
  cliente,
  aoFechar,
  aoConcluir,
}: {
  /** Equipamento já definido (ficha). Vazio = a lista pede para escolher. */
  tag?: string;
  descricao?: string | null;
  cliente?: string | null;
  aoFechar: () => void;
  aoConcluir: (r: ResultadoAnexo) => void;
}) {
  const [tag, setTag] = useState(tagFixa ?? '');
  /**
   * Os rótulos do equipamento ESCOLHIDO na lista — vêm do catálogo, que é a
   * projeção do servidor. Guardá-los aqui é o que faz a linha do índice nascer
   * com o nome do equipamento mesmo quando esta máquina nunca hidratou a TAG.
   */
  const [rotulos, setRotulos] = useState<{ descricao: string | null; cliente: string | null }>({
    descricao: descricao ?? null,
    cliente: cliente ?? null,
  });
  const [termo, setTermo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<EstadoEnvio>('escolher');
  const [erro, setErro] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const enviando = estado === 'enviando';

  function escolherArquivo(f: File | null) {
    setErro('');
    if (!f) return;
    // A conferência barata (nome, MIME, tamanho) acontece aqui para o usuário
    // saber na hora; a assinatura dos bytes é conferida no envio, quando eles
    // já foram lidos — ler 8 MB só para desenhar o nome do arquivo seria caro.
    if (!f.name.toLowerCase().endsWith('.pdf') || (f.type && f.type !== 'application/pdf')) {
      setErro('O arquivo precisa ser um PDF.');
      return;
    }
    if (f.size > LIMITE_ANEXO_BYTES) {
      setErro(`O PDF tem ${formatarTamanho(f.size)}. O limite é ${LIMITE_ANEXO_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    setArquivo(f);
    setEstado('pronto');
  }

  async function enviar() {
    if (!tag || !arquivo || enviando) return; // trava o duplo clique
    setEstado('enviando');
    setErro('');
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const valido = validarPdf({ nome: arquivo.name, tamanho: arquivo.size, mimeType: arquivo.type }, bytes);
      if (!valido.ok) throw new Error(valido.erro);
      const r = await anexarProntuarioExistente({
        tag,
        arquivo: { nome: arquivo.name, tamanho: arquivo.size, mimeType: arquivo.type },
        bytes,
        enviadoPor: usuarioLogado(),
        equipamento: rotulos.descricao,
        cliente: rotulos.cliente,
      });
      setEstado('concluido');
      aoConcluir(r);
    } catch (e) {
      setEstado('erro');
      setErro(e instanceof Error ? e.message : 'Não foi possível anexar o prontuário.');
    }
  }

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !enviando && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Anexar prontuário existente"
    >
      <div className="fj-modal-box mf-box map-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Prontuário</div>
            <h2>Anexar prontuário existente</h2>
          </div>
          {!enviando && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <div className="mf-corpo map-corpo">
          <p className="map-explica">
            O PDF é guardado como está, sem conversão, e fica vinculado ao equipamento. Ele{' '}
            <b>não substitui</b> um prontuário feito aqui — os dois convivem.
          </p>

          <section className="map-secao">
            <h3>Equipamento {tagFixa ? '' : '*'}</h3>
            {tag ? (
              <div className="map-equip" data-teste="equip-escolhido">
                <strong>{tag}</strong>
                <span>{rotulos.descricao || 'Equipamento'}</span>
                {rotulos.cliente && <span className="map-equip-cliente">{rotulos.cliente}</span>}
                {!tagFixa && !enviando && (
                  <button type="button" className="fj-btn fj-btn-ghost map-trocar" onClick={() => setTag('')}>
                    Trocar
                  </button>
                )}
              </div>
            ) : (
              <div className="map-catalogo">
                <CatalogoProntuariosV9
                  modo="selecao"
                  termo={termo}
                  aoMudarTermo={setTermo}
                  aoEscolher={(t, item) => {
                    setTag(t);
                    setRotulos({ descricao: item?.descricao ?? null, cliente: item?.clienteNome ?? null });
                  }}
                />
              </div>
            )}
          </section>

          <section className="map-secao">
            <h3>Arquivo do prontuário *</h3>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="map-file"
              disabled={enviando}
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="fj-btn fj-btn-ghost map-btn-arquivo"
              disabled={enviando}
              onClick={() => fileRef.current?.click()}
            >
              <Icone nome="upload" tam={14} /> {arquivo ? 'Trocar PDF' : 'Selecionar PDF'}
            </button>
            {arquivo && (
              <p className="map-arquivo" title={arquivo.name}>
                <Icone nome="pdf" tam={14} /> {arquivo.name}{' '}
                <span className="map-arquivo-tam">{formatarTamanho(arquivo.size)}</span>
              </p>
            )}
            <p className="map-ajuda">PDF de até {LIMITE_ANEXO_BYTES / (1024 * 1024)} MB.</p>
          </section>

          {erro && (
            <div className="mf-alerta" role="alert">
              <Icone nome="alerttri" tam={18} />
              <div>{erro}</div>
            </div>
          )}
          {enviando && (
            <p className="map-estado" role="status">
              <span className="spinner" /> Enviando o arquivo…
            </p>
          )}
          {estado === 'concluido' && (
            <p className="map-estado map-estado-ok" role="status">
              <Icone nome="checkcircle" tam={15} /> Prontuário anexado.
            </p>
          )}
        </div>

        <div className="mf-acoes">
          <button type="button" className="fj-btn" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className="fj-btn fj-btn-primary"
            onClick={() => void enviar()}
            disabled={!tag || !arquivo || enviando || estado === 'concluido'}
          >
            {enviando ? 'Enviando…' : 'Anexar prontuário'}
          </button>
        </div>
      </div>
    </div>
  );
}
