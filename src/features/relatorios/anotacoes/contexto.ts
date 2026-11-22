import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  CORES_ANOTACAO,
  ESPESSURAS_ANOTACAO,
  ehVazia,
  type Anotacao,
  type Ferramenta,
} from './modelo';

/**
 * O estado das anotações de UM documento aberto.
 *
 * Mora na tela que abriu o documento (Relatórios), e não no visualizador,
 * porque são os botões "Baixar PDF" e "Imprimir" dela que precisam da lista
 * para fazer a cópia anotada. O visualizador só a lê pelo contexto — e, sem
 * contexto, não mostra ferramenta nenhuma: Portal, Prontuários e Certificados
 * continuam como estavam.
 *
 * Só memória. Trocar de documento (`chave`) ou sair da tela descarta tudo.
 */
export interface EstadoAnotacoes {
  lista: Anotacao[];
  ferramenta: Ferramenta | null;
  setFerramenta: (f: Ferramenta | null) => void;
  cor: string;
  setCor: (c: string) => void;
  espessura: number;
  setEspessura: (e: number) => void;
  selecionada: string | null;
  setSelecionada: (id: string | null) => void;
  adicionar: (a: Anotacao) => void;
  /** Altera sem criar passo de desfazer — chame `marcarPasso` antes de começar a arrastar/editar. */
  atualizar: (id: string, mudanca: Partial<Anotacao>) => void;
  remover: (id: string) => void;
  /** Guarda o estado atual como um passo de "Desfazer". */
  marcarPasso: () => void;
  desfazer: () => void;
  limpar: () => void;
  podeDesfazer: boolean;
}

export const ContextoAnotacoes = createContext<EstadoAnotacoes | null>(null);

export function useAnotacoesDoDocumento(): EstadoAnotacoes | null {
  return useContext(ContextoAnotacoes);
}

/** Mais que isto de "Desfazer" é memória gasta sem uso. */
const PASSOS_MAX = 60;

type Interno = { chave: string; lista: Anotacao[]; passos: Anotacao[][] };

export function useEstadoAnotacoes(chave: string): EstadoAnotacoes {
  const [interno, setInterno] = useState<Interno>({ chave, lista: [], passos: [] });
  const [ferramenta, setFerramenta] = useState<Ferramenta | null>(null);
  const [cor, setCor] = useState<string>(CORES_ANOTACAO[1].valor);
  const [espessura, setEspessura] = useState<number>(ESPESSURAS_ANOTACAO[0].valor);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  // Outro documento: as anotações do anterior não podem aparecer sobre ele.
  // Ajuste DURANTE o render (padrão do React para estado derivado de prop),
  // sem efeito — um efeito pintaria um quadro com as marcas do documento errado.
  if (interno.chave !== chave) {
    setInterno({ chave, lista: [], passos: [] });
    setSelecionada(null);
    setFerramenta(null);
  }

  const comPasso = (s: Interno, lista: Anotacao[]): Interno => ({
    ...s,
    lista,
    passos: [...s.passos, s.lista].slice(-PASSOS_MAX),
  });

  const adicionar = useCallback((a: Anotacao) => {
    if (ehVazia(a) && a.tipo === 'traco') return;
    setInterno((s) => comPasso(s, [...s.lista, a]));
  }, []);

  const atualizar = useCallback((id: string, mudanca: Partial<Anotacao>) => {
    setInterno((s) => ({
      ...s,
      lista: s.lista.map((a) => (a.id === id ? ({ ...a, ...mudanca } as Anotacao) : a)),
    }));
  }, []);

  const remover = useCallback((id: string) => {
    setInterno((s) => {
      const alvo = s.lista.find((a) => a.id === id);
      if (!alvo) return s;
      const lista = s.lista.filter((a) => a.id !== id);
      // Caixa de texto criada e abandonada vazia: some como se nunca tivesse
      // existido — inclusive do "Desfazer", senão ele devolveria uma caixa vazia.
      if (ehVazia(alvo)) {
        const ultimo = s.passos[s.passos.length - 1];
        const passos = ultimo && !ultimo.some((a) => a.id === id) ? s.passos.slice(0, -1) : s.passos;
        return { ...s, lista, passos };
      }
      return comPasso(s, lista);
    });
    setSelecionada((sel) => (sel === id ? null : sel));
  }, []);

  const marcarPasso = useCallback(() => {
    setInterno((s) => ({ ...s, passos: [...s.passos, s.lista].slice(-PASSOS_MAX) }));
  }, []);

  const desfazer = useCallback(() => {
    setInterno((s) => {
      if (s.passos.length === 0) return s;
      return { ...s, lista: s.passos[s.passos.length - 1], passos: s.passos.slice(0, -1) };
    });
    setSelecionada(null);
  }, []);

  // "Limpar" também vira passo: um toque errado nele se desfaz.
  const limpar = useCallback(() => {
    setInterno((s) => (s.lista.length ? comPasso(s, []) : s));
    setSelecionada(null);
  }, []);

  const { lista, passos } = interno;
  return useMemo(
    () => ({
      lista,
      ferramenta,
      setFerramenta,
      cor,
      setCor,
      espessura,
      setEspessura,
      selecionada,
      setSelecionada,
      adicionar,
      atualizar,
      remover,
      marcarPasso,
      desfazer,
      limpar,
      podeDesfazer: passos.length > 0,
    }),
    [lista, passos.length, ferramenta, cor, espessura, selecionada, adicionar, atualizar, remover, marcarPasso, desfazer, limpar],
  );
}
