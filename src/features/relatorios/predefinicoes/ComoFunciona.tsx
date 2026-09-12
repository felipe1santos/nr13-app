import { useRef } from 'react';
import { Icone } from '../../../components/Icone';
import { useFocoPreso } from './useFocoPreso';

/**
 * O modal de AJUDA, por cima do gerenciador.
 *
 * ## Por que não é um parágrafo fixo na tela
 *
 * A explicação é longa — quatro passos e uma ressalva sobre o que a aplicação
 * NÃO altera — e quem já sabe usar a ferramenta lê aquilo toda vez que abre o
 * modal, ocupando a altura que a lista de conjuntos precisa. O texto introdutório
 * permanente da versão anterior tinha exatamente esse defeito.
 *
 * Aqui ele fica a um clique, num diálogo próprio, com o foco preso
 * (`useFocoPreso`) e o Esc fechando só a camada de cima.
 */
export default function ComoFunciona({ onFechar }: { onFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);

  return (
    <div className="predef-overlay predef-overlay-topo" onClick={onFechar}>
      <div
        ref={caixa}
        className="predef-modal predef-modal-ajuda"
        role="dialog"
        aria-modal="true"
        aria-label="Como funcionam as predefinições"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="predef-cab">
          <div className="predef-cab-txt">
            <h3>Como funcionam as predefinições</h3>
          </div>
          <button type="button" className="predef-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="predef-corpo predef-ajuda-corpo">
          <p className="predef-ajuda-intro">
            As predefinições guardam combinações de textos e valores usados com frequência nos
            relatórios. Você escolhe quais campos fazem parte do conjunto e define o conteúdo de
            cada um.
          </p>
          <p className="predef-ajuda-intro">
            Ao utilizar uma predefinição, o sistema mostra primeiro o que será preenchido. Depois da
            confirmação, os valores são aplicados <strong>somente ao relatório atual</strong> e
            continuam editáveis enquanto ele estiver em rascunho.
          </p>

          <ol className="predef-passos">
            <li>
              <span className="predef-passo-n">1</span>
              <div>
                <strong>Crie um conjunto</strong>
                <p>Dê um nome que facilite identificar quando ele deve ser usado.</p>
              </div>
            </li>
            <li>
              <span className="predef-passo-n">2</span>
              <div>
                <strong>Escolha os campos</strong>
                <p>Selecione somente as informações que deseja automatizar.</p>
              </div>
            </li>
            <li>
              <span className="predef-passo-n">3</span>
              <div>
                <strong>Defina os valores</strong>
                <p>Escreva o conteúdo que deverá ser utilizado nesses campos.</p>
              </div>
            </li>
            <li>
              <span className="predef-passo-n">4</span>
              <div>
                <strong>Revise e aplique</strong>
                <p>Antes de preencher o relatório, confira exatamente o que será alterado.</p>
              </div>
            </li>
          </ol>

          {/* A ressalva não é decoração: é a diferença entre uma ferramenta de
              conveniência e uma que reescreve cadastro. Ela responde a pergunta
              que o usuário faz antes de clicar em "Usar" pela primeira vez. */}
          <div className="predef-ajuda-nota">
            <Icone nome="info" tam={14} />
            <p>
              Aplicar uma predefinição não altera a ficha do equipamento, a inspeção de campo, os
              cálculos, o cadastro da empresa nem relatórios já finalizados. Ela escreve apenas nos
              campos de texto <strong>deste rascunho</strong>, do mesmo jeito que se você os tivesse
              digitado no documento.
            </p>
          </div>
        </div>

        <footer className="predef-rodape">
          <span className="predef-espaco" />
          <button type="button" className="fj-btn fj-btn-primary" onClick={onFechar}>
            Entendi
          </button>
        </footer>
      </div>
    </div>
  );
}
