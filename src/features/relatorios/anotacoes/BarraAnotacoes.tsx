import { useEffect } from 'react';
import { Icone } from '../../../components/Icone';
import type { EstadoAnotacoes } from './contexto';
import { CORES_ANOTACAO, ESPESSURAS_ANOTACAO, type Ferramenta } from './modelo';
import './anotacoes.css';

/** O aviso que acompanha toda a ferramenta — curto na barra, inteiro na dica. */
export const AVISO_ANOTACOES =
  'As anotações saem só na cópia que você baixar ou imprimir por esta tela. Elas não ficam salvas no relatório e somem ao fechar o documento.';

/**
 * Os botões de anotação, dentro da barra única do documento.
 *
 * Esc desliga a ferramenta (o primeiro Esc, com uma caixa em edição, só fecha
 * a edição — ver `CaixaTexto`).
 */
export default function BarraAnotacoes({ estado }: { estado: EstadoAnotacoes }) {
  const { ferramenta, setFerramenta, cor, setCor, espessura, setEspessura, lista, podeDesfazer, desfazer, limpar, setSelecionada } =
    estado;

  useEffect(() => {
    if (!ferramenta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setFerramenta(null);
      setSelecionada(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ferramenta, setFerramenta, setSelecionada]);

  const alternar = (f: Ferramenta) => {
    setSelecionada(null);
    setFerramenta(ferramenta === f ? null : f);
  };

  const ferramentaBtn = (f: Ferramenta, icone: 'texto' | 'caneta', rotulo: string, dica: string) => (
    <button
      type="button"
      className={`vpdf-btn vpdf-alterna${ferramenta === f ? ' is-ativo' : ''}`}
      aria-pressed={ferramenta === f}
      aria-label={rotulo}
      title={`${dica} Esc sai da ferramenta. ${AVISO_ANOTACOES}`}
      onClick={() => alternar(f)}
    >
      <Icone nome={icone} tam={14} />
      <span className="vpdf-rotulo"> {rotulo}</span>
    </button>
  );

  return (
    <span className="vpdf-anot" role="group" aria-label="Anotações (só na cópia baixada ou impressa)">
      {ferramentaBtn('texto', 'texto', 'Texto', 'Clique na página para escrever; arraste para mover; Delete exclui.')}
      {ferramentaBtn('desenhar', 'caneta', 'Desenhar', 'Risque à mão livre com o mouse, a caneta ou o dedo.')}
      {ferramenta && (
        <span className="vpdf-anot-opcoes" role="group" aria-label="Cor da anotação">
          {CORES_ANOTACAO.map((c) => (
            <button
              key={c.valor}
              type="button"
              className={`anot-cor${cor === c.valor ? ' is-ativo' : ''}`}
              aria-pressed={cor === c.valor}
              aria-label={`Cor ${c.nome.toLowerCase()}`}
              title={c.nome}
              onClick={() => setCor(c.valor)}
            >
              <span style={{ background: c.valor }} />
            </button>
          ))}
        </span>
      )}
      {ferramenta === 'desenhar' && (
        <span className="vpdf-anot-opcoes" role="group" aria-label="Espessura do traço">
          {ESPESSURAS_ANOTACAO.map((e, i) => (
            <button
              key={e.valor}
              type="button"
              className={`anot-esp${espessura === e.valor ? ' is-ativo' : ''}`}
              aria-pressed={espessura === e.valor}
              aria-label={`Traço ${e.nome.toLowerCase()}`}
              title={`Traço ${e.nome.toLowerCase()}`}
              onClick={() => setEspessura(e.valor)}
            >
              <span style={{ height: i === 0 ? 2 : 5 }} />
            </button>
          ))}
        </span>
      )}
      {(ferramenta || lista.length > 0) && (
        <>
          <button
            type="button"
            className="vpdf-btn"
            onClick={desfazer}
            disabled={!podeDesfazer}
            aria-label="Desfazer a última anotação"
            title="Desfazer"
          >
            <Icone nome="desfazer" tam={14} />
          </button>
          <button
            type="button"
            className="vpdf-btn"
            onClick={limpar}
            disabled={lista.length === 0}
            aria-label="Limpar todas as anotações"
            title="Limpar todas as anotações (dá para desfazer)"
          >
            <Icone nome="trash" tam={14} />
          </button>
          <span className="vpdf-anot-aviso" title={AVISO_ANOTACOES}>
            Só na cópia<span className="sr-only">: {AVISO_ANOTACOES}</span>
          </span>
        </>
      )}
    </span>
  );
}
