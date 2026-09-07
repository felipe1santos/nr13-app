/**
 * "Certificados e rastreabilidade dos padrões" — a ajuda da sessão de
 * Certificados.
 *
 * ## O passo 4 é o que exige cuidado
 *
 * A reutilização automática tem DUAS condições, conferidas no código
 * (`tiposPadraoDoRelatorio` e `rastreabilidadesParaRelatorio`):
 *
 *  1. o relatório precisa incluir a folha correspondente — `ULTRASSOM.html`
 *     puxa o bloco padrão de espessura; cada folha `CERTIFICADO-CAL-*` puxa o
 *     padrão do tipo daquela calibração (manômetro ou PSV);
 *  2. a caixa "Injetar no final do relatório" precisa estar marcada.
 *
 * Sem uma das duas nada é anexado. Uma promessa genérica aqui faria o usuário
 * entregar um documento acreditando que o certificado está dentro — e por isso
 * as condições estão escritas, não subentendidas.
 */
import ModalAjuda from './ModalAjuda';

export default function AjudaCertificados({ aoFechar }: { aoFechar: () => void }) {
  return (
    <ModalAjuda
      eyebrow="Certificados"
      icone="filetext"
      titulo="Certificados e rastreabilidade dos padrões"
      subtitulo="Esta área concentra os certificados de calibração dos instrumentos usados como PADRÃO nos ensaios. É um certificado por padrão, válido para todos os equipamentos."
      ilustracao="/ilustracoes/rastreabilidade-padroes.webp"
      alt="Bancada com os instrumentos padrão — manômetros, válvula de segurança e medidor de espessura por ultrassom — ao lado dos certificados de calibração e do calendário de validade"
      passos={[
        {
          titulo: 'Cadastre o padrão',
          texto: (
            <>
              São três, um por rota de injeção que o sistema tem:
              <ul>
                <li>
                  <b>bloco padrão de espessura</b> — o padrão do ultrassom;
                </li>
                <li>
                  <b>manômetro padrão</b>;
                </li>
                <li>
                  <b>válvula PSV padrão</b>.
                </li>
              </ul>
            </>
          ),
        },
        {
          titulo: 'Informe a rastreabilidade',
          texto: (
            <>
              Instrumento, nº do certificado e validade. Esses dados são lidos pela folha do ensaio
              — é o que preenche <b>"Instrumento de medição utilizado"</b> no laudo de ultrassom,
              em vez de sair com travessão.
            </>
          ),
        },
        {
          titulo: 'Anexe o certificado em PDF',
          texto: (
            <>
              O arquivo original <b>não é alterado</b>: na emissão do relatório as páginas dele são
              copiadas para o fim do documento, como vieram.
            </>
          ),
        },
        {
          titulo: 'O relatório busca sozinho — sob duas condições',
          texto: (
            <>
              O padrão entra no relatório quando <b>as duas</b> valem:
              <ul>
                <li>
                  o relatório <b>inclui a folha</b> daquele ensaio — o laudo de ultrassom puxa o
                  bloco padrão; as folhas de certificado de calibração puxam o padrão do tipo
                  calibrado (manômetro ou PSV);
                </li>
                <li>
                  a caixa <b>"Injetar no final do relatório"</b>, no card do padrão, está marcada.
                </li>
              </ul>
              Havendo mais de um cadastro do mesmo tipo, vale o mais recente que tenha PDF.
            </>
          ),
        },
      ]}
      nota={
        <>
          Mantenha o certificado atualizado quando ele vencer: é ele que dá validade à medição
          dentro de um documento assinado por engenheiro.
        </>
      }
      aoFechar={aoFechar}
    />
  );
}
