import { useRef, useState } from 'react';
import FotoImg from '../../components/FotoImg';
import { salvarFoto, type RefFoto } from '../../services/fotos';
import { textoDoErro } from '../../services/textoDoErro';
import {
  adicionarFotos,
  definirDescricao,
  moverFoto,
  normalizarFotos,
  removerDaLista,
  rotuloFoto,
  type FotoDescrita,
} from './fotosDescritas';

/**
 * A GRADE DE FOTOS DESCRITAS — uma só para todos os formulários (Fase 5).
 *
 * Substitui as quatro cópias do bloco adicionar/legenda/remover que viviam
 * dentro dos formulários, cada uma com `key={idx}` e a legenda editada por
 * posição. Aqui tudo é por `id` (ver `fotosDescritas.ts`).
 *
 * O componente não grava nada: devolve a lista nova pelo `alterar`, que recebe
 * um ATUALIZADOR — o upload termina depois de o técnico já ter digitado outra
 * legenda, e aplicar uma lista capturada antes do `await` apagaria o que foi
 * digitado no meio.
 *
 * Remover pede uma segunda confirmação NA PRÓPRIA FOTO (nada de `confirm()`
 * nativo, que congela a aba — ver memória `memorial-alert-congela-aba`) e só
 * tira a referência da lista; o arquivo no bucket fica.
 */
export default function EditorFotosDescritas({
  fotos,
  alterar,
  escopo,
  textoVazio = 'Nenhuma imagem adicionada',
  rotuloAdicionar = 'Adicionar imagem',
  destacarSemDescricao = false,
  placeholder = 'Descreva o que a foto mostra',
}: {
  fotos: unknown;
  alterar: (atualizar: (atual: FotoDescrita[]) => FotoDescrita[]) => void;
  /** Pasta da foto no bucket, ex. `${tag}/visual-externo`. */
  escopo: string;
  textoVazio?: string;
  rotuloAdicionar?: string;
  /** Marca em vermelho a foto sem descrição (documento que exige descrição). */
  destacarSemDescricao?: boolean;
  placeholder?: string;
}) {
  const lista = normalizarFotos(fotos);
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    setErro(null);
    setEnviando(arquivos.length);
    // Uma por vez, na ordem escolhida: é a ordem em que elas entram na lista,
    // e processar em paralelo num celular estoura a memória do canvas.
    const falhas: string[] = [];
    for (const arquivo of arquivos) {
      try {
        const ref: RefFoto = await salvarFoto(arquivo, escopo);
        alterar((atual) => adicionarFotos(atual, [ref]));
      } catch (err) {
        falhas.push(`${arquivo.name}: ${textoDoErro(err)}`);
      } finally {
        setEnviando((n) => Math.max(0, n - 1));
      }
    }
    if (falhas.length > 0) setErro(`Não foi possível adicionar ${falhas.length === 1 ? 'a imagem' : 'as imagens'} — ${falhas.join('; ')}`);
  }

  const botaoAdicionar = (
    <button
      type="button"
      className="efd-adicionar"
      onClick={() => input.current?.click()}
      disabled={enviando > 0}
    >
      {enviando > 0 ? `Processando ${enviando === 1 ? 'imagem' : `${enviando} imagens`}…` : `+ ${rotuloAdicionar}`}
    </button>
  );

  return (
    <div className="efd">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={aoEscolher}
        data-teste="efd-input"
      />

      {lista.length === 0 ? (
        <div className="efd-vazio" data-teste="efd-vazio">
          <p>{textoVazio}</p>
          {botaoAdicionar}
        </div>
      ) : (
        <>
          <ol className="efd-lista">
            {lista.map((f, i) => {
              const semDescricao = destacarSemDescricao && f.descricao.trim() === '';
              const rotulo = rotuloFoto(i);
              return (
                <li
                  key={f.id}
                  className={`efd-item${semDescricao ? ' efd-item-pendente' : ''}`}
                  data-teste="efd-item"
                  data-foto-id={f.id}
                >
                  <div className="efd-imagem">
                    <FotoImg foto={f} alt={rotulo} variante="thumb" />
                  </div>
                  <div className="efd-corpo">
                    <div className="efd-topo">
                      <strong className="efd-rotulo">{rotulo}</strong>
                      <div className="efd-mover">
                        <button
                          type="button"
                          className="efd-btn"
                          onClick={() => alterar((atual) => moverFoto(atual, f.id, -1))}
                          disabled={i === 0}
                          aria-label={`Mover ${rotulo} para cima`}
                          title="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="efd-btn"
                          onClick={() => alterar((atual) => moverFoto(atual, f.id, 1))}
                          disabled={i === lista.length - 1}
                          aria-label={`Mover ${rotulo} para baixo`}
                          title="Mover para baixo"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    <label className="efd-descricao">
                      <span className="efd-descricao-rotulo">Descrição</span>
                      <textarea
                        value={f.descricao}
                        rows={3}
                        placeholder={placeholder}
                        onChange={(e) => {
                          const texto = e.target.value;
                          alterar((atual) => definirDescricao(atual, f.id, texto));
                        }}
                        aria-invalid={semDescricao || undefined}
                      />
                    </label>
                    {semDescricao && <span className="efd-aviso">Descrição obrigatória para emitir o documento.</span>}
                    {confirmarRemocao === f.id ? (
                      <div className="efd-remover-confirmar">
                        <span>Remover {rotulo} deste rascunho?</span>
                        <button
                          type="button"
                          className="efd-btn efd-btn-perigo"
                          onClick={() => {
                            setConfirmarRemocao(null);
                            alterar((atual) => removerDaLista(atual, f.id));
                          }}
                        >
                          Remover
                        </button>
                        <button type="button" className="efd-btn" onClick={() => setConfirmarRemocao(null)}>
                          Manter
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="efd-btn efd-btn-remover"
                        onClick={() => setConfirmarRemocao(f.id)}
                        aria-label={`Remover ${rotulo}`}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {botaoAdicionar}
        </>
      )}

      {erro && (
        <p className="efd-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
