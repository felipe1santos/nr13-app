import ModalAjuda from '../calibracoes/ModalAjuda';

/**
 * "Como funcionam os containers de inspeção" — a ajuda da sessão.
 *
 * Os três passos descrevem o que o código faz HOJE, conferido antes de
 * escrever: `criarContainer` grava em `nr13_docs_<TAG>` com os ensaios
 * atribuídos; cada formulário salva o próprio blob em `dados[<formulário>]`
 * (`salvarDadosFormulario`); e o assistente de criação de relatório lê esses
 * blobs por `resumirContainer` e injeta o container escolhido em
 * `meta.containerOrigemId`.
 *
 * A distinção entre ATRIBUÍDO e SALVO está dita no passo 2 porque ela é a
 * fonte de mal-entendido da tela: um container pode listar cinco ensaios e não
 * ter nenhum preenchido, e é o preenchido que vai para o documento.
 */
export default function AjudaContainers({ aoFechar }: { aoFechar: () => void }) {
  return (
    <ModalAjuda
      eyebrow="Inspeções"
      icone="clipboard"
      titulo="Como funcionam os containers de inspeção"
      subtitulo="Um container é uma RODADA de inspeção daquele equipamento: ele agrupa os ensaios que você vai fazer em campo e guarda o que foi preenchido em cada um."
      ilustracao="/ilustracoes/container-inspecao.webp"
      alt="Uma pilha de formulários de inspeção, com o de cima mostrando campos preenchidos e itens marcados"
      passos={[
        {
          titulo: 'Crie ou escolha um container',
          texto: (
            <>
              Em <b>+ Nova Inspeção</b> você dá um nome à rodada e marca quais ensaios ela terá —
              checklist, exame visual externo e interno, medição de espessura, teste hidrostático.
              O container <b>pertence àquele equipamento</b>, e as rodadas anteriores continuam
              inteiras: a inspeção do ano passado não é sobrescrita pela deste ano.
            </>
          ),
        },
        {
          titulo: 'Preencha os ensaios',
          texto: (
            <>
              Abrindo o container, cada ensaio aparece com <b>Preencher</b> e o seu estado —
              Pendente ou Preenchido. Os formulários são feitos para o celular, em campo, e salvam
              no aparelho mesmo sem rede. Atenção à diferença: marcar um ensaio na criação apenas
              o <b>atribui</b>; ele só passa a existir no documento depois de <b>preenchido e
              salvo</b>.
            </>
          ),
        },
        {
          titulo: 'Use o container ao gerar o relatório',
          texto: (
            <>
              Em <b>Relatórios → Criar relatório</b>, a etapa <b>Inspeção</b> lista os containers
              deste equipamento e diz quantos ensaios cada um tem <b>com dados salvos</b>. O que
              você escolher é injetado no documento — as respostas, as medições e as fotos entram
              nas folhas correspondentes. Dá para gerar sem container também, e aí as folhas de
              ensaio saem em branco.
            </>
          ),
        },
      ]}
      nota={
        <>
          O nome do container é só um rótulo: renomear (no lápis do cartão) <b>não desfaz</b> os
          ensaios preenchidos nem o vínculo com relatórios que já usaram esta inspeção.
        </>
      }
      aoFechar={aoFechar}
    />
  );
}
