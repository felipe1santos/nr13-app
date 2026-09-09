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
      proporcao="626 / 417"
      layout="lateral"
      passos={[
        {
          titulo: 'Crie ou escolha um container',
          texto: (
            <>
              Em <b>+ Nova Inspeção</b>, dê um nome à rodada e marque os ensaios dela. O container
              pertence àquele equipamento, e as rodadas anteriores continuam inteiras.
            </>
          ),
        },
        {
          titulo: 'Preencha os ensaios',
          texto: (
            <>
              Cada ensaio abre com <b>Preencher</b> e mostra o estado — Pendente ou Preenchido. Os
              formulários são feitos para o celular, em campo.
            </>
          ),
        },
        {
          titulo: 'Salve os dados do container',
          texto: (
            <>
              Marcar um ensaio na criação apenas o <b>atribui</b>. Ele só passa a existir no
              documento depois de <b>preenchido e salvo</b> — e o salvamento funciona sem rede.
            </>
          ),
        },
        {
          titulo: 'Use o container no relatório',
          texto: (
            <>
              Em <b>Relatórios → Criar relatório</b>, a etapa <b>Inspeção</b> lista os containers e
              diz quantos ensaios cada um tem com dados salvos. O escolhido é injetado no
              documento.
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
