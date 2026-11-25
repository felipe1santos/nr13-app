import { useRef, useState } from 'react';
import FotoImg from '../../components/FotoImg';
import { Icone } from '../../components/Icone';
import { salvarFoto, type RefFoto } from '../../services/fotos';
import { concluirProcessamentoFoto, iniciarProcessamentoFotos } from './fotosEmProcessamento';
import { textoDoErro } from '../../services/textoDoErro';
import {
  adicionarFotos,
  definirDescricao,
  definirTitulo,
  moverFoto,
  normalizarFotos,
  removerDaLista,
  rotuloFoto,
  TITULO_FOTO_MAX,
  tituloDaFoto,
  trocarImagem,
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
 *
 * TROCAR IMAGEM (25/11/2026) substitui só o arquivo de uma foto — id, ordem e
 * descrição ficam (`trocarImagem`). No celular oferece Galeria ou Câmera
 * (`capture="environment"` abre a câmera traseira direto); no computador abre
 * o seletor de arquivo. O arquivo antigo também fica no bucket.
 */

/** Dedo na tela: é onde "abrir a câmera" faz sentido como opção própria. */
function telaDeToque(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}
export default function EditorFotosDescritas({
  fotos,
  alterar,
  escopo,
  textoVazio = 'Nenhuma imagem adicionada',
  rotuloAdicionar = 'Adicionar imagem',
  destacarSemDescricao = false,
  placeholder = 'Descreva o que a foto mostra',
  tituloEditavel = false,
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
  /**
   * Título da foto editável. Só onde o DOCUMENTO imprime o título (Relatório
   * de Imagens); nos outros ensaios ele não sai no papel, e editar algo que não
   * aparece seria enganar o técnico.
   */
  tituloEditavel?: boolean;
}) {
  const lista = normalizarFotos(fotos);
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  /** Foto cujo arquivo está sendo escolhido (o input é um só para a lista). */
  const alvoTroca = useRef<string | null>(null);
  const [escolhendoOrigem, setEscolhendoOrigem] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<ReadonlySet<string>>(() => new Set());

  function pedirTroca(id: string) {
    setErro(null);
    setConfirmarRemocao(null);
    if (telaDeToque()) {
      setEscolhendoOrigem(id);
      return;
    }
    alvoTroca.current = id;
    inputGaleria.current?.click();
  }

  function abrirOrigem(id: string, origem: 'galeria' | 'camera') {
    alvoTroca.current = id;
    setEscolhendoOrigem(null);
    (origem === 'camera' ? inputCamera : inputGaleria).current?.click();
  }

  async function aoEscolherTroca(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    const id = alvoTroca.current;
    alvoTroca.current = null;
    if (!arquivo || !id) return;
    setErro(null);
    setTrocando((s) => new Set(s).add(id));
    // Mesma trava do adicionar: o Salvar espera a imagem nova entrar na lista.
    iniciarProcessamentoFotos(1);
    try {
      const ref: RefFoto = await salvarFoto(arquivo, escopo);
      // Pelo id e por atualizador: a legenda digitada durante o envio fica, e
      // se a foto foi removida nesse meio-tempo a troca não a ressuscita.
      alterar((atual) => trocarImagem(atual, id, ref));
    } catch (err) {
      setErro(`Não foi possível trocar a imagem — ${arquivo.name}: ${textoDoErro(err)}`);
    } finally {
      setTrocando((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      concluirProcessamentoFoto();
    }
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    setErro(null);
    setEnviando(arquivos.length);
    // Trava o Salvar do formulário até a última foto entrar na lista (24/11/2026).
    iniciarProcessamentoFotos(arquivos.length);
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
        concluirProcessamentoFoto();
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
      <input
        ref={inputGaleria}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={aoEscolherTroca}
        data-teste="efd-input-troca"
      />
      <input
        ref={inputCamera}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={aoEscolherTroca}
        data-teste="efd-input-camera"
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
              const rotulo = tituloDaFoto(f, i);
              return (
                <li
                  key={f.id}
                  className={`efd-item${semDescricao ? ' efd-item-pendente' : ''}`}
                  data-teste="efd-item"
                  data-foto-id={f.id}
                >
                  <div className="efd-imagem">
                    <FotoImg foto={f} alt={rotulo} variante="thumb" />
                    {trocando.has(f.id) && <span className="efd-trocando">Trocando imagem…</span>}
                  </div>
                  <div className="efd-corpo">
                    <div className="efd-topo">
                      {tituloEditavel ? (
                        <label className="efd-titulo">
                          <span className="efd-sr">Título da foto {i + 1}</span>
                          <input
                            type="text"
                            value={f.titulo ?? ''}
                            placeholder={rotuloFoto(i)}
                            maxLength={TITULO_FOTO_MAX}
                            onChange={(e) => {
                              const texto = e.target.value;
                              alterar((atual) => definirTitulo(atual, f.id, texto));
                            }}
                            data-teste="efd-titulo"
                          />
                          <Icone nome="pencil" tam={14} className="efd-titulo-icone" />
                        </label>
                      ) : (
                        <strong className="efd-rotulo">{rotulo}</strong>
                      )}
                      <div className="efd-mover">
                        <button
                          type="button"
                          className="efd-btn"
                          onClick={() => alterar((atual) => moverFoto(atual, f.id, -1))}
                          disabled={i === 0}
                          aria-label={`Mover ${rotulo} para cima`}
                          title="Mover para cima"
                        >
                          <Icone nome="chevup" tam={16} />
                        </button>
                        <button
                          type="button"
                          className="efd-btn"
                          onClick={() => alterar((atual) => moverFoto(atual, f.id, 1))}
                          disabled={i === lista.length - 1}
                          aria-label={`Mover ${rotulo} para baixo`}
                          title="Mover para baixo"
                        >
                          <Icone nome="chevdown" tam={16} />
                        </button>
                      </div>
                    </div>
                    <label className="efd-descricao">
                      <span className="efd-descricao-rotulo">Descrição</span>
                      <textarea
                        value={f.descricao}
                        rows={2}
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
                    ) : escolhendoOrigem === f.id ? (
                      <div className="efd-origem" data-teste="efd-origem">
                        <span>Trocar a imagem da {rotulo} por:</span>
                        <button type="button" className="efd-btn efd-btn-acao efd-btn-trocar" onClick={() => abrirOrigem(f.id, 'galeria')}>
                          <Icone nome="upload" tam={15} />
                          Galeria
                        </button>
                        <button type="button" className="efd-btn efd-btn-acao efd-btn-trocar" onClick={() => abrirOrigem(f.id, 'camera')}>
                          <Icone nome="camera" tam={15} />
                          Câmera
                        </button>
                        <button type="button" className="efd-btn" onClick={() => setEscolhendoOrigem(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="efd-acoes">
                        <button
                          type="button"
                          className="efd-btn efd-btn-acao efd-btn-trocar"
                          onClick={() => pedirTroca(f.id)}
                          disabled={trocando.has(f.id)}
                          aria-label={`Trocar a imagem da ${rotulo} sem mudar a descrição`}
                          title="Troca só a imagem — a descrição fica"
                          data-teste="efd-trocar"
                        >
                          <Icone nome="refresh" tam={15} />
                          {trocando.has(f.id) ? 'Trocando…' : 'Trocar imagem'}
                        </button>
                        <button
                          type="button"
                          className="efd-btn efd-btn-acao efd-btn-remover"
                          onClick={() => setConfirmarRemocao(f.id)}
                          aria-label={`Remover ${rotulo}`}
                        >
                          <Icone nome="trash" tam={15} />
                          Remover
                        </button>
                      </div>
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
