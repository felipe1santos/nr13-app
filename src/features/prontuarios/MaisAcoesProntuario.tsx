/**
 * O menu "Mais ações" da barra do prontuário.
 *
 * ## Por que ele existe
 *
 * A barra tinha até seis botões do mesmo tamanho e do mesmo peso — Editar,
 * Imprimir, Emitir, Abrir emitido, Excluir — e nenhum deles se destacava. Numa
 * fila assim o usuário lê todos para achar um. As duas ações que ele faz o
 * tempo todo (editar e emitir) ficaram na linha; o resto mora aqui.
 *
 * ## A exclusão vive SÓ aqui, e é o último item
 *
 * Prontuário não é descartável: uma vez criado, ele é o cadastro técnico do
 * equipamento, e depois de emitido há PDFs com código de verificação apontando
 * para ele. Um botão vermelho grande na barra convidava a tratá-lo como algo
 * que se joga fora. Ela continua existindo — o rascunho que nasceu errado
 * precisa poder sumir —, separada por uma linha e com o nome exato do que faz.
 */
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import './maisAcoes.css';

export default function MaisAcoesProntuario({
  temEmissao,
  imprimindo,
  rotuloImprimir,
  bloqueado,
  aoImprimir,
  aoAbrirEmitido,
  aoEditar,
  aoExcluir,
}: {
  temEmissao: boolean;
  imprimindo: boolean;
  rotuloImprimir: string;
  /** Plano sem documentos: o item aparece com cadeado, e não some. */
  bloqueado: boolean;
  aoImprimir: () => void;
  aoAbrirEmitido: () => void;
  /**
   * "Editar dados" — só quando HÁ emissão.
   *
   * Sem emissão, editar é a ação óbvia e mora na barra. Com emissão, o que
   * está na tela é um ARQUIVO que não se edita: editar aqui prepara a PRÓXIMA
   * revisão, e por isso desce para o menu com o nome do que faz.
   */
  aoEditar?: () => void;
  aoExcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * Fecha ao clicar fora e no ESC.
   *
   * Sem isso o menu fica aberto sobre o documento enquanto o usuário rola a
   * página — e um menu que não fecha vira um pedaço de interface preso na tela.
   */
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const executar = (fn: () => void) => () => {
    setAberto(false);
    fn();
  };

  return (
    <div className="mais-acoes" ref={caixa}>
      <button
        type="button"
        className="fj-btn fj-btn-ghost mais-acoes-botao"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Mais ações"
        title="Mais ações"
        onClick={() => setAberto((v) => !v)}
      >
        ⋯
      </button>
      {aberto && (
        <div className="mais-acoes-menu" role="menu">
          <button type="button" role="menuitem" onClick={executar(aoImprimir)} disabled={imprimindo}>
            {bloqueado && <Icone nome="cadeado" tam={13} />}
            <Icone nome="filetext" tam={14} />
            {imprimindo ? 'Preparando…' : rotuloImprimir}
          </button>
          {temEmissao && (
            <button type="button" role="menuitem" onClick={executar(aoAbrirEmitido)}>
              <Icone nome="eye" tam={14} /> Abrir documento emitido
            </button>
          )}
          {aoEditar && (
            <button type="button" role="menuitem" onClick={executar(aoEditar)}>
              <Icone nome="pencil" tam={14} /> Editar dados (nova revisão)
            </button>
          )}
          <div className="mais-acoes-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="mais-acoes-perigo"
            onClick={executar(aoExcluir)}
          >
            <Icone nome="trash" tam={14} /> Excluir prontuário…
          </button>
        </div>
      )}
    </div>
  );
}
