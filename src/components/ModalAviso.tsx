import { useEffect, useState } from 'react';
import { assinarAviso, type Aviso } from '../services/eventos';
import { Icone, type NomeIcone } from './Icone';
import './modal-aviso.css';

const ICONE: Record<Aviso['variante'], NomeIcone> = {
  sucesso: 'check',
  alerta: 'alerttri',
  erro: 'alerttri',
};

// Mesmo aviso (variante+título+texto) do que já está na tela — clique duplo no botão
// bloqueado ou dois pontos de bloqueio disparando em sequência não deve empilhar 2x a
// mesma mensagem. Avisos DIFERENTES continuam sendo enfileirados (ver fila abaixo).
function mesmoAviso(a: Aviso, b: Aviso): boolean {
  return a.variante === b.variante && a.titulo === b.titulo && a.texto === b.texto;
}

// Modal único do app para bloqueio/sucesso. Monta uma vez no Layout e escuta o
// barramento — assim serviços (pdfService, printService) avisam sem virar React.
//
// FILA (não só 1 estado): o modal guardava um único `Aviso` — um segundo emitirAviso()
// antes do usuário fechar o primeiro sobrescrevia o estado e a mensagem anterior era
// perdida sem o usuário nunca vê-la. Agora cada emitirAviso() entra numa fila; o de cima
// é exibido e some da fila ao fechar, revelando o próximo (se houver).
export default function ModalAviso() {
  const [fila, setFila] = useState<Aviso[]>([]);
  const aviso = fila[0] ?? null;

  useEffect(
    () =>
      assinarAviso((novo) => {
        setFila((atual) => {
          if (atual.length > 0 && mesmoAviso(atual[atual.length - 1], novo)) return atual;
          return [...atual, novo];
        });
      }),
    [],
  );

  // aviso.aoFechar roda aqui — no momento em que o usuário de fato reconhece o aviso
  // (clique em "Fechar"/fora, Esc ou clique na ação) — nunca na emissão. Quem emitiu usa
  // isso para só consumir uma flag ("já mostrado") depois que houve chance real de leitura.
  const fechar = () => {
    aviso?.aoFechar?.();
    setFila((atual) => atual.slice(1));
  };

  useEffect(() => {
    if (!aviso) return;
    const onEsc = (e: KeyboardEvent) => {
      // Escape sempre fecha, mesmo na variante "erro" (bloqueio de assinatura) — só o
      // clique no fundo é restrito ali (ver onClick abaixo).
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aviso]);

  if (!aviso) return null;

  // Variante "erro" = bloqueio de assinatura com ação de regularizar: clique no fundo
  // (comum ao tentar interagir com o resto da tela) não pode descartar esse aviso sem
  // querer. Alerta/sucesso continuam fechando no clique fora.
  const fecharNoFundo = aviso.variante === 'erro' ? undefined : fechar;

  return (
    <div className="modal-aviso-fundo" role="dialog" aria-modal="true" onClick={fecharNoFundo}>
      <div className={`modal-aviso ${aviso.variante}`} onClick={(e) => e.stopPropagation()}>
        <span className="modal-aviso-ic">
          <Icone nome={ICONE[aviso.variante]} tam={30} />
        </span>
        <h3>{aviso.titulo}</h3>
        <p>{aviso.texto}</p>
        <div className="modal-aviso-acoes">
          {aviso.acao && (
            <button
              type="button"
              className="modal-aviso-btn principal"
              onClick={() => {
                aviso.acao?.aoClicar();
                fechar();
              }}
            >
              {aviso.acao.rotulo}
            </button>
          )}
          <button type="button" className="modal-aviso-btn" onClick={fechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
