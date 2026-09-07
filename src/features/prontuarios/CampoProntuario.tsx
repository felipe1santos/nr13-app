/**
 * Um campo do formulário do prontuário.
 *
 * ## Por que ele existe
 *
 * Os 31 campos de texto eram escritos à mão, cada um com o mesmo bloco de
 * `<div><label><input>`. Isso não é só repetição: era o que impedia qualquer
 * mudança transversal — como marcar o que veio preenchido pelo sistema — de
 * acontecer sem editar 31 lugares e esquecer um.
 *
 * ## O campo AUTOMÁTICO
 *
 * `abrirEquipamento` já sabia, desde sempre, quais campos ele conseguiu
 * preencher a partir do memorial, da ficha e do cadastro do cliente — o
 * conjunto `preenchidos`. Esse conjunto era montado e **jogado fora**. Agora
 * ele chega aqui.
 *
 * A marca não é decorativa: o usuário precisa saber que aquele "12 mm" veio do
 * cálculo, e não de alguém que digitou. E precisa poder mudá-lo assim mesmo —
 * por isso o campo continua totalmente editável, só com fundo e um selo
 * discretos. Ao digitar, a marca some: o valor deixou de ser do sistema.
 */
import type { InputHTMLAttributes } from 'react';

export interface PropsCampo extends Pick<InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'inputMode'> {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** O valor exibido veio do sistema (memorial, ficha, cadastro do cliente). */
  automatico?: boolean;
  /** Ocupa a linha inteira da grade. */
  largo?: boolean;
  /** Só leitura — prontuário emitido não se edita. */
  travado?: boolean;
}

export default function CampoProntuario({
  rotulo,
  valor,
  aoMudar,
  automatico = false,
  largo = false,
  travado = false,
  placeholder,
  inputMode,
}: PropsCampo) {
  return (
    <div className={`pront-campo${largo ? ' pront-campo-full' : ''}`}>
      <label>
        {rotulo}
        {automatico && (
          <span
            className="pront-selo-auto"
            title="Preenchido automaticamente a partir do memorial, da ficha do equipamento ou do cadastro do cliente. Pode ser alterado."
          >
            auto
          </span>
        )}
      </label>
      <input
        className={automatico ? 'campo-auto' : undefined}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        readOnly={travado}
      />
    </div>
  );
}
