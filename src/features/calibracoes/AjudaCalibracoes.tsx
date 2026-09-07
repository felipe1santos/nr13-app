/**
 * "Como funcionam as calibrações" — a ajuda da sessão de Calibrações.
 *
 * Os quatro passos descrevem o fluxo REAL da tela, conferido no código antes de
 * escrever: `salvarComponente` (o acessório fica na chave por TAG do
 * equipamento), `criarLote` (a rodada daquela inspeção), a calibração de cada
 * componente dentro do lote, e o vínculo com o próximo relatório
 * (`vincularProximoRelatorio`), que é o que leva as validades para o histórico.
 */
import ModalAjuda from './ModalAjuda';

export default function AjudaCalibracoes({ aoFechar }: { aoFechar: () => void }) {
  return (
    <ModalAjuda
      eyebrow="Calibrações"
      icone="manometro"
      titulo="Como funcionam as calibrações"
      subtitulo="As calibrações são organizadas por equipamento e por lote: primeiro você cadastra os acessórios do equipamento, depois cria um lote e registra a calibração de cada um."
      ilustracao="/ilustracoes/fluxo-calibracao.webp"
      alt="Fluxo em quatro etapas: o equipamento com seus acessórios, o cadastro dos acessórios, a pasta do lote de calibração e o técnico calibrando, com o lote concluído"
      passos={[
        {
          titulo: 'Cadastre os acessórios',
          texto: (
            <>
              Os componentes que pertencem ao equipamento — manômetros e válvulas de segurança
              (PSV). Cada um guarda nome, fabricante, nº de série e foto, e{' '}
              <b>fica vinculado àquele equipamento</b>: você cadastra uma vez e reaproveita em
              todas as inspeções seguintes.
            </>
          ),
        },
        {
          titulo: 'Crie um lote de calibração',
          texto: (
            <>
              O lote é a <b>rodada daquela inspeção</b>. Ele agrupa as calibrações feitas na
              ocasião e mantém o histórico separado das anteriores — o lote do ano passado continua
              inteiro quando você abre o deste ano.
            </>
          ),
        },
        {
          titulo: 'Calibre os acessórios do lote',
          texto: (
            <>
              Dentro do lote, cada componente cadastrado aparece com o botão <b>Calibrar</b>. Ao
              preencher, o sistema gera o certificado daquele componente e marca o lote como
              completo quando todos foram calibrados.
            </>
          ),
        },
        {
          titulo: 'Use o lote no relatório',
          texto: (
            <>
              Ao montar um relatório, a seção <b>Calibrações</b> do modal lista os últimos lotes.
              Marcando um lote, as folhas de certificado dele entram no documento e o lote é
              vinculado àquele relatório — é isso que alimenta as colunas de validade de válvula e
              manômetro no histórico do equipamento.
            </>
          ),
        },
      ]}
      nota={
        <>
          O certificado do <b>instrumento padrão</b> usado na medição é outra coisa, e fica em{' '}
          <b>Certificados</b> — lá também há um "Como funciona".
        </>
      }
      aoFechar={aoFechar}
    />
  );
}
