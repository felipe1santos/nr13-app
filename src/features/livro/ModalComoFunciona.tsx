/**
 * "Como funciona" do registro de segurança (22/11/2026).
 *
 * Era uma aba inteira na coluna da direita do formulário — um bloco grande
 * disputando espaço com a prévia. Virou um botão discreto no cabeçalho do
 * modal, que abre esta camada.
 *
 * ## A ilustração
 *
 * Só as ilustrações LICENCIADAS do sistema (CLAUDE.md §15, `Ilustracao.tsx`).
 * Para trocar por outra arte, basta pôr o arquivo licenciado em
 * `public/ilustracoes/` e apontar `ILUSTRACAO_COMO_FUNCIONA` para ele —
 * `{ src, w, h }` — sem mexer no resto do componente. Imagem de terceiros sem
 * licença (Pinterest, banco gratuito sem termo) NÃO entra.
 */
import { Icone } from '../../components/Icone';
import { Ilustracao, type NomeIlustracao } from '../../components/Ilustracao';
import CamadaModal from './CamadaModal';

type FonteIlustracao = { nome: NomeIlustracao } | { src: string; w: number; h: number };

/** A arte desta camada. Troque aqui (ver o comentário do arquivo). */
const ILUSTRACAO_COMO_FUNCIONA: FonteIlustracao = { nome: 'assinatura' };

function Arte({ fonte }: { fonte: FonteIlustracao }) {
  if ('nome' in fonte) return <Ilustracao nome={fonte.nome} largura={200} className="reg-ajuda-arte-img" />;
  return (
    <img
      className="vz-img reg-ajuda-arte-img"
      src={fonte.src}
      alt=""
      width={fonte.w}
      height={fonte.h}
      style={{ width: 200, height: 'auto' }}
      loading="lazy"
      decoding="async"
    />
  );
}

export default function ModalComoFunciona({ aoFechar }: { aoFechar: () => void }) {
  return (
    <CamadaModal
      eyebrow="Livro de Registro de Segurança"
      titulo="Como funciona o registro"
      aoFechar={aoFechar}
      className="reg-camada-ajuda"
      rodape={
        <button type="button" className="fj-btn fj-btn-primary" onClick={aoFechar}>
          Entendi
        </button>
      }
    >
      <div className="reg-ajuda-grade">
        <figure className="reg-ajuda-arte">
          <Arte fonte={ILUSTRACAO_COMO_FUNCIONA} />
        </figure>
        <ol className="reg-modal-passos">
          <li>
            <b>Descreva a ocorrência</b>
            <span>
              A inspeção realizada, uma manutenção, um reparo ou a troca de um dispositivo de
              segurança.
            </span>
          </li>
          <li>
            <b>Salve como rascunho</b>
            <span>
              Fica só seu: não conta como registro, não vai para o Portal do Cliente e não entra na
              folha impressa. Dá para fechar e continuar depois.
            </span>
          </li>
          <li>
            <b>Tranque quando estiver certo</b>
            <span>
              O trancamento é feito na tela do equipamento. A partir dele o registro é oficial,
              entra na numeração do livro e não pode mais ser editado nem apagado.
            </span>
          </li>
        </ol>
      </div>
      <p className="reg-modal-nota">
        <Icone nome="cadeado" tam={14} />
        <span>
          Cada registro trancado é lacrado com o hash do próprio conteúdo e o elo do anterior — é o
          que prova que o livro não foi alterado depois.
        </span>
      </p>
    </CamadaModal>
  );
}
