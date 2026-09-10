import type { NomeIcone } from '../../components/Icone';

/**
 * A CENTRAL INFO — conteúdo, separado da apresentação.
 *
 * ## Como este arquivo foi escrito
 *
 * Cada frase daqui foi conferida contra o código e contra o app antes de ser
 * escrita (auditoria de 10/09/2026, registrada em
 * `docs/medicoes/2026-09-10-central-info.md`). Não há passo baseado no NOME de
 * uma tela: onde o texto manda clicar em algo, aquele botão existe hoje com
 * aquele rótulo.
 *
 * Isso importa mais aqui do que em qualquer outro lugar do sistema. Ajuda
 * errada é pior do que ajuda nenhuma — ela faz o usuário procurar um botão que
 * não existe e concluir que o sistema está quebrado.
 *
 * ## O que NÃO entra
 *
 * Nada de vocabulário interno: chave de storage, IndexedDB, RPC, bucket, SHA,
 * nome de componente. O leitor é o engenheiro que usa o sistema, não quem o
 * mantém. As REGRAS, porém, ficam ditas por inteiro — documento finalizado não
 * se edita, container precisa ser salvo, prazo depende de data cadastrada.
 *
 * ## Estrutura
 *
 * `GUIAS` são passo a passo. `FAQ` são perguntas na língua de quem pergunta.
 * `PRIMEIROS_PASSOS` é o fluxo do sistema inteiro, em ordem. Acrescentar um
 * guia é acrescentar um objeto — nenhum JSX precisa mudar.
 */

export type CategoriaInfo = 'primeiros' | 'operacao' | 'documentacao' | 'gestao';

export const CATEGORIAS: { id: CategoriaInfo; titulo: string; sub: string; icone: NomeIcone }[] = [
  {
    id: 'primeiros',
    titulo: 'Primeiros passos',
    sub: 'O que configurar antes de começar a operar',
    icone: 'flame',
  },
  {
    id: 'operacao',
    titulo: 'Operação',
    sub: 'O trabalho de campo e os dados que alimentam os documentos',
    icone: 'clipboard',
  },
  {
    id: 'documentacao',
    titulo: 'Documentação',
    sub: 'Os documentos que o sistema emite e as regras deles',
    icone: 'pdf',
  },
  {
    id: 'gestao',
    titulo: 'Gestão',
    sub: 'Prazos, agenda e acessos da equipe',
    icone: 'barchart',
  },
];

export interface PassoGuia {
  titulo: string;
  texto: string;
}

export interface Guia {
  id: string;
  titulo: string;
  resumo: string;
  categoria: CategoriaInfo;
  icone: NomeIcone;
  /** Termos que a busca também casa, além do título e do resumo. */
  chaves: string[];
  /** O que precisa existir ANTES. Lista vazia = nada. */
  preRequisitos: string[];
  passos: PassoGuia[];
  /** Regras que o usuário precisa saber, mesmo que não peça. */
  observacoes: string[];
  /** O que se torna possível depois de concluir o guia. */
  depois?: string;
  /** Rota real do sistema, para o botão "Ir para…". */
  rota?: string;
  rotaRotulo?: string;
}

/**
 * O FLUXO do sistema, em ordem — auditado contra as telas em 10/09/2026.
 *
 * Duas leituras da MESMA jornada, e é de propósito:
 *
 * - na tela, cada etapa é um cartão curto, ligado ao próximo por uma seta. É o
 *   "onde estou e o que vem depois", que se lê em vinte segundos;
 * - no modal, a mesma etapa abre com `detalhe` e `pontos` — o porquê e o que se
 *   preenche ali. Quem quiser estudar a jornada inteira avança de etapa em
 *   etapa pela própria seta, com a barra de progresso no topo.
 *
 * As dependências são reais: sem equipamento não há inspeção; sem container
 * preenchido o relatório sai sem dados de campo; sem funcionário cadastrado não
 * há quem assine.
 *
 * ## O QUE NÃO ENTRA NA JORNADA (10/09/2026)
 *
 * Calibrações dos acessórios e certificados dos padrões saíram daqui — eram a
 * etapa 7 de 12. Decisão do dono, e ela está certa: **nem toda inspeção precisa
 * calibrar padrão**. O certificado do bloco de espessura vale meses e serve a
 * todos os equipamentos; a calibração dos acessórios só existe quando o
 * equipamento tem manômetro ou PSV instalado.
 *
 * Pôr no caminho principal algo que às vezes não se faz ensina a pessoa a pular
 * etapa — e uma jornada em que se aprende a pular etapa deixa de ser jornada.
 * Os dois continuam com guia próprio, entre os guias por seção, como operação
 * avulsa do sistema.
 */
export interface EtapaJornada {
  titulo: string;
  /** Uma linha, no cartão. */
  texto: string;
  /** O parágrafo do modal: por que esta etapa existe. */
  detalhe: string;
  /** O que se preenche ou decide ali. */
  pontos: string[];
  rota: string;
  rotaRotulo: string;
  icone: NomeIcone;
}

export const PRIMEIROS_PASSOS: EtapaJornada[] = [
  {
    titulo: 'Configure sua empresa',
    texto: 'Razão social, CNPJ, endereço, contato e a logo.',
    detalhe:
      'Tudo que se repete em cabeçalho e rodapé de documento sai daqui — você preenche uma vez e não digita de novo. É a primeira etapa porque um relatório emitido antes disso sai sem a sua identificação, e documento assinado não se corrige depois.',
    pontos: [
      'Razão social, nome fantasia e CNPJ',
      'Endereço completo, telefone e e-mail',
      'A logo, que vai ao topo de cada folha',
    ],
    rota: '/minha-empresa',
    rotaRotulo: 'Ir para Meus dados',
    icone: 'building',
  },
  {
    titulo: 'Cadastre quem assina',
    texto: 'Engenheiro e técnico, com registro e imagem da assinatura.',
    detalhe:
      'O sistema carimba a assinatura nas folhas a partir deste cadastro. Sem um profissional cadastrado, o bloco de responsabilidade técnica sai vazio — e é justamente ele que dá validade ao laudo.',
    pontos: [
      'Tipo: Engenheiro (assina o laudo) ou Inspetor (executa o ensaio)',
      'CREA ou registro, e a função como deve aparecer sob a assinatura',
      'A imagem da assinatura',
      'Quais folhas cada um assina — há listas separadas para relatório e prontuário',
    ],
    rota: '/funcionarios',
    rotaRotulo: 'Ir para Funcionários',
    icone: 'users',
  },
  {
    titulo: 'Cadastre o cliente',
    texto: 'A empresa proprietária do equipamento.',
    detalhe:
      'O cliente vira o CONTRATANTE do relatório e do prontuário. Ele é vinculado ao equipamento na ficha, e daí em diante razão social, CNPJ e endereço entram sozinhos em todo documento daquele ativo.',
    pontos: [
      'Razão social, CNPJ e atividade principal',
      'Endereço completo — há busca no Google para preencher a partir do nome',
      'Opcional: um login de Portal do Cliente, somente leitura',
    ],
    rota: '/empresas',
    rotaRotulo: 'Ir para Clientes',
    icone: 'briefcase',
  },
  {
    titulo: 'Cadastre o equipamento',
    texto: 'TAG, tipo e a ficha completa.',
    detalhe:
      'O equipamento é a raiz do sistema: inspeção, relatório, prontuário, calibração e prazo pendem dele. Criar é rápido — TAG e tipo —, mas é a FICHA que alimenta a capa, a placa reconstruída e a caracterização de risco.',
    pontos: [
      'TAG (a identificação única) e o tipo: vaso, caldeira ou autoclave',
      'Fabricante, ano, nº de série, código de projeto e localização',
      'O cliente proprietário',
      'PMTA, PMO e PTH adotadas — quando preenchidas, vencem as calculadas',
      'A foto de capa',
      'Vários de uma vez: a tela aceita importação por planilha',
    ],
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
    icone: 'box',
  },
  {
    titulo: 'Calcule o memorial',
    texto: 'Casco, tampos, material e pressão de projeto.',
    detalhe:
      'Do memorial saem a PMTA do equipamento, a espessura mínima requerida de cada componente e a base da categoria de risco. Sem ele, as folhas de cálculo do relatório saem vazias e a categorização não tem pressão para trabalhar.',
    pontos: [
      'Pressão de projeto e diâmetro interno',
      'Por componente: tensão admissível, eficiência da junta, espessura comercial, margem de corrosão, material e temperatura',
      'Σ Gerar Cálculo e depois Salvar',
      'A PMTA do equipamento é a MENOR entre as calculadas por componente',
    ],
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
    icone: 'calculator',
  },
  {
    titulo: 'Categorize',
    texto: 'Volume e classe do fluido — a categoria sai sozinha.',
    detalhe:
      'Com a PMTA do memorial, o volume e a classe do fluido, o sistema devolve o enquadramento na norma, o produto pressão × volume, o grupo de potencial de risco e a categoria final. Recalcular o memorial atualiza a categoria sozinho.',
    pontos: [
      'Volume geométrico em m³',
      'Classe do fluido (A, B, C ou D, com a descrição de cada uma)',
      'A categoria aparece na capa, na placa e na folha de caracterização',
    ],
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
    icone: 'shield',
  },
  {
    titulo: 'Crie a inspeção',
    texto: 'Um container por rodada, com os ensaios que serão feitos.',
    detalhe:
      'O container é a rodada de inspeção daquele equipamento. Ele agrupa os ensaios da ocasião e mantém o histórico separado: criar o container deste ano não toca no do ano passado.',
    pontos: [
      'Escolha o equipamento e clique em + Nova Inspeção',
      'Dê um nome à rodada',
      'Marque os ensaios: checklist, visual externo, visual interno, ultrassom e teste hidrostático',
    ],
    rota: '/inspecoes',
    rotaRotulo: 'Ir para Inspeções',
    icone: 'clipboard',
  },
  {
    titulo: 'Preencha em campo',
    texto: 'Pelo celular, salvando cada formulário.',
    detalhe:
      'Os formulários foram feitos para o celular, e o salvamento funciona sem rede: o que você preencher offline sobe quando o sinal voltar. Marcar o ensaio na criação apenas o ATRIBUI — ele só existe para o documento depois de preenchido e salvo.',
    pontos: [
      'Cada ensaio abre em Preencher e mostra Pendente ou Preenchido',
      'Fotos com legenda: 4 por folha; a quinta abre uma folha nova',
      'Cada formulário tem o próprio botão de salvar',
    ],
    rota: '/inspecoes',
    rotaRotulo: 'Ir para Inspeções',
    icone: 'camera',
  },
  {
    titulo: 'Gere o relatório',
    texto: 'O assistente em três etapas.',
    detalhe:
      'O assistente pergunta uma vez o equipamento e depois só três coisas: quais folhas compõem o documento, qual inspeção fornece os dados de campo e a revisão antes de gerar. O documento nasce como rascunho.',
    pontos: [
      'Etapa 1 — o tipo de inspeção e as folhas do relatório',
      'Etapa 2 — o container, com a contagem de ensaios preenchidos e um olho para conferir antes',
      'Etapa 3 — revisar e gerar',
    ],
    rota: '/relatorios',
    rotaRotulo: 'Ir para Relatórios',
    icone: 'pdf',
  },
  {
    titulo: 'Revise em rascunho',
    texto: 'A barra "O que falta" aponta cada campo em branco.',
    detalhe:
      'Enquanto for rascunho, o documento continua editável: você pode fechar, voltar depois e corrigir qualquer campo clicando nele. A correção vale só para aquele relatório — nenhum cadastro do sistema é alterado.',
    pontos: [
      'A barra agrupa os campos vazios por assunto e leva até cada um',
      'Configurações: nº, datas, validade, próximas inspeções, A.R.T. e quem assina',
      'Predefinições: recomendações guardadas da sua empresa, aplicadas com um clique',
      'Rascunho não gera prazo, não entra no Portal e não vira registro de segurança',
    ],
    rota: '/relatorios',
    rotaRotulo: 'Ir para Relatórios',
    icone: 'pencil',
  },
  {
    titulo: 'Finalize e acompanhe',
    texto: 'O documento vira oficial e as datas passam a valer.',
    detalhe:
      'Finalizar arquiva o documento: a partir daí abrir, imprimir, baixar e o Portal do Cliente entregam exatamente o mesmo arquivo, mesmo que a ficha mude depois. E só então as datas dele passam a alimentar o Dashboard.',
    pontos: [
      'O conteúdo não muda mais — para alterar algo, use Duplicar',
      'O prazo é a menor data entre próxima interna e próxima externa',
      'A régua 15/30/60/90 dias é cumulativa; Vencidos isola o que já passou',
    ],
    rota: '/dashboard',
    rotaRotulo: 'Ir para o Dashboard',
    icone: 'grid',
  },
];

export const GUIAS: Guia[] = [
  // ── PRIMEIROS PASSOS ─────────────────────────────────────────────────────
  {
    id: 'comecar',
    titulo: 'Como começar a usar o sistema',
    resumo: 'O caminho inteiro, do cadastro da sua empresa ao acompanhamento dos prazos.',
    categoria: 'primeiros',
    icone: 'flame',
    chaves: ['início', 'começar', 'primeiro acesso', 'fluxo', 'passo a passo', 'onde começo'],
    preRequisitos: [],
    passos: [
      {
        titulo: 'Configure o que se repete em todo documento',
        texto:
          'Meus dados (empresa e logo), Funcionários (quem assina) e Clientes. Esses três alimentam automaticamente o cabeçalho, o rodapé, a assinatura e o contratante de todos os documentos — você preenche uma vez.',
      },
      {
        titulo: 'Cadastre o equipamento e feche a ficha',
        texto:
          'O equipamento é a raiz: inspeção, relatório, prontuário, calibração e prazos pendem dele. Depois de criado, preencha a ficha (fabricante, série, ano, código de projeto), calcule o memorial e informe o fluido para o sistema categorizar.',
      },
      {
        titulo: 'Faça a inspeção em campo',
        texto:
          'Em Inspeções, crie um container — uma rodada de inspeção — e marque os ensaios. Preencha cada formulário pelo celular e salve. Só o que for salvo chega ao relatório.',
      },
      {
        titulo: 'Monte o documento',
        texto:
          'Em Relatórios → Criar relatório, o assistente pergunta o equipamento, quais folhas entram e qual inspeção fornece os dados de campo. O documento nasce como rascunho.',
      },
      {
        titulo: 'Revise e finalize',
        texto:
          'A barra "O que falta" lista cada campo em branco e leva até ele. Quando estiver pronto, finalize — o documento vira oficial e as datas dele passam a valer para os prazos.',
      },
    ],
    observacoes: [
      'Cada etapa depende da anterior: pular o cadastro do equipamento faz a inspeção não ter onde existir.',
      'Você pode parar em qualquer ponto e continuar depois. Ficha, inspeção e rascunho ficam salvos.',
    ],
    depois: 'O equipamento passa a aparecer no Dashboard com a data da próxima inspeção.',
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
  },
  {
    id: 'empresa',
    titulo: 'Dados da sua empresa e logo',
    resumo: 'O cabeçalho e o rodapé de todas as folhas saem daqui.',
    categoria: 'primeiros',
    icone: 'building',
    chaves: ['minha empresa', 'logo', 'cnpj', 'razão social', 'cabeçalho', 'rodapé', 'executante'],
    preRequisitos: [],
    passos: [
      { titulo: 'Abra Meus dados', texto: 'No topo do menu. A tela é da empresa executante — a sua, que emite os laudos.' },
      {
        titulo: 'Preencha a identificação',
        texto: 'Razão social, nome fantasia, CNPJ, endereço completo, telefone e e-mail.',
      },
      {
        titulo: 'Envie a logo',
        texto: 'Ela aparece no canto superior de cada folha do relatório e do prontuário, em todas as páginas.',
      },
    ],
    observacoes: [
      'Só o usuário mestre da conta abre esta tela.',
      'Trocar a logo depois NÃO altera documentos já finalizados: cada um guarda a versão que tinha na emissão.',
    ],
    depois: 'Todos os documentos passam a sair com a sua identificação, sem você digitar nada.',
    rota: '/minha-empresa',
    rotaRotulo: 'Ir para Meus dados',
  },
  {
    id: 'funcionarios',
    titulo: 'Cadastrar quem assina os documentos',
    resumo: 'Engenheiro e técnico, com registro profissional e imagem da assinatura.',
    categoria: 'primeiros',
    icone: 'users',
    chaves: ['funcionário', 'engenheiro', 'técnico', 'assinatura', 'crea', 'inspetor', 'rubrica', 'art'],
    preRequisitos: [],
    passos: [
      { titulo: 'Abra Cadastrar → Funcionários', texto: 'A lista dos profissionais que podem assinar a documentação.' },
      {
        titulo: 'Crie o profissional',
        texto:
          'Nome, CREA/registro, o tipo (Engenheiro, que assina o laudo, ou Inspetor, que executa o ensaio) e a função como deve aparecer sob a assinatura.',
      },
      {
        titulo: 'Envie a imagem da assinatura',
        texto: 'É ela que o sistema carimba nas folhas. Sem ela o bloco de responsabilidade técnica sai sem rubrica.',
      },
      {
        titulo: 'Acrescente informações extras',
        texto:
          'Certificação, qualificação, nº de ART — cada par nome/valor aparece abaixo do nome no bloco de assinatura.',
      },
      {
        titulo: 'Escolha as folhas que ele assina',
        texto:
          'Há duas listas, uma do prontuário e outra do relatório, com "Marcar todas". Por padrão o engenheiro assina tudo e o inspetor, nenhuma.',
      },
      {
        titulo: 'Use no documento',
        texto:
          'No relatório, o modal Configurações traz os seletores Engenheiro (assina) e Técnico (assina) com os profissionais cadastrados aqui. No prontuário, os mesmos seletores ficam no visualizador.',
      },
    ],
    observacoes: [
      'Quem assina cada relatório é escolhido no modal Configurações do próprio documento, entre os profissionais cadastrados aqui.',
      'O CREA do engenheiro e o número da A.R.T. da inspeção são coisas diferentes: o CREA vem do cadastro; a A.R.T. é digitada nas Configurações do relatório.',
    ],
    depois: 'O profissional passa a aparecer nos seletores de assinante do relatório e do prontuário.',
    rota: '/funcionarios',
    rotaRotulo: 'Ir para Funcionários',
  },
  {
    id: 'clientes',
    titulo: 'Cadastrar clientes',
    resumo: 'A empresa proprietária do equipamento — vira o contratante dos documentos.',
    categoria: 'primeiros',
    icone: 'briefcase',
    chaves: ['cliente', 'empresa', 'contratante', 'proprietário', 'portal'],
    preRequisitos: [],
    passos: [
      { titulo: 'Abra Cadastrar → Clientes', texto: 'A lista das empresas para as quais você presta serviço.' },
      {
        titulo: 'Cadastre a empresa',
        texto:
          'Razão social, CNPJ, atividade principal, endereço completo, contato e e-mail. Há uma busca no Google para preencher endereço e telefone a partir do nome.',
      },
      {
        titulo: 'Vincule ao equipamento',
        texto: 'Na ficha do equipamento, o card de empresa aponta para o cliente. É de lá que o relatório tira o contratante.',
      },
    ],
    observacoes: [
      'Opcionalmente é possível criar um login de Portal do Cliente: a empresa acompanha os próprios equipamentos e documentos numa área somente-leitura.',
      'Endereço, CNPJ e razão social do cliente entram automaticamente na capa e no prontuário.',
    ],
    depois: 'O cliente pode ser escolhido na ficha de qualquer equipamento.',
    rota: '/empresas',
    rotaRotulo: 'Ir para Clientes',
  },

  // ── OPERAÇÃO ─────────────────────────────────────────────────────────────
  {
    id: 'equipamentos',
    titulo: 'Cadastrar e preencher a ficha do equipamento',
    resumo: 'A raiz de tudo: inspeção, relatório, prontuário e prazos pendem do equipamento.',
    categoria: 'operacao',
    icone: 'box',
    chaves: ['equipamento', 'tag', 'ficha', 'vaso', 'caldeira', 'autoclave', 'fabricante', 'série', 'placa', 'planilha'],
    preRequisitos: ['Cliente cadastrado (opcional, mas o relatório precisa dele para o contratante)'],
    passos: [
      {
        titulo: 'Abra Equipamentos e clique em Criar equipamento',
        texto:
          'Informe a TAG (a identificação única, ex.: V-200) e o tipo: vaso de pressão, caldeira ou autoclave. Caldeira e autoclave ainda pedem o subtipo.',
      },
      {
        titulo: 'Abra a ficha',
        texto: 'Clique no cartão do equipamento. A ficha reúne todos os cards de dados dele.',
      },
      {
        titulo: 'Preencha Dados do Equipamento',
        texto:
          'Descrição, fabricante, ano de fabricação, nº de série, código de projeto, edição, adenda, localização, tipo de construção e descrição resumida.',
      },
      {
        titulo: 'Preencha Dados da Empresa',
        texto: 'Escolha o cliente proprietário. Razão social, CNPJ e endereço vêm do cadastro.',
      },
      {
        titulo: 'Informe as Pressões da Documentação',
        texto:
          'PMTA adotada, PMO adotada e PTH adotada. Quando preenchidas, são elas que a placa, o prontuário e o resumo de inspeções imprimem — em MPa, psi, kgf/cm² e bar. Em branco, o documento usa as calculadas pelo memorial.',
      },
      {
        titulo: 'Envie a foto de capa',
        texto: 'A foto marcada como capa é a que aparece na primeira página do relatório.',
      },
      {
        titulo: 'Registre a vida remanescente',
        texto:
          'O card de vida remanescente compara a espessura anterior com a atual e devolve a taxa de corrosão, o sobremetal e a vida em anos. Ele serve de reserva para o prazo quando o relatório não traz as datas de próxima inspeção.',
      },
      {
        titulo: 'Anexe o prontuário do fabricante',
        texto:
          'Se você tem o PDF original do fabricante, o card correspondente o guarda junto do equipamento — e as páginas dele entram no fim do relatório.',
      },
    ],
    observacoes: [
      'A unidade de medida é escolhida dentro da ficha e reflete em todo o sistema. A categoria de risco NUNCA é convertida — ela tem base própria.',
      'Vários equipamentos de uma vez: a tela aceita importação por planilha (.xlsx, .xls, .ods ou .csv), inclusive arrastando o arquivo para cima da lista.',
      'A ficha alimenta a capa, a placa de identificação reconstruída, a caracterização de risco, o prontuário e o resumo de inspeções.',
    ],
    depois: 'O equipamento passa a aparecer em Inspeções, Relatórios, Prontuários, Calibrações e Registros de Segurança.',
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
  },
  {
    id: 'memorial',
    titulo: 'Memorial de cálculo',
    resumo: 'De onde saem a PMTA, a espessura mínima requerida e a base da categoria.',
    categoria: 'operacao',
    icone: 'calculator',
    chaves: ['memorial', 'cálculo', 'pmta', 'espessura', 'casco', 'tampo', 'asme', 'corrosão', 'material'],
    preRequisitos: ['Equipamento cadastrado'],
    passos: [
      {
        titulo: 'Abra a calculadora',
        texto: 'Na ficha do equipamento, o card Memorial de Cálculo tem o botão Abrir calculadora.',
      },
      {
        titulo: 'Informe os dados gerais',
        texto: 'Pressão de projeto e diâmetro interno, além da orientação (vertical ou horizontal).',
      },
      {
        titulo: 'Preencha cada componente',
        texto:
          'Vaso de pressão traz tampo esquerdo, casco cilíndrico e tampo direito. Em cada um: tipo do tampo, tensão admissível do material (S), eficiência da junta (E), espessura comercial, margem de corrosão, material e temperatura de projeto.',
      },
      {
        titulo: 'Gere o cálculo',
        texto:
          'O botão Σ Gerar Cálculo devolve a PMTA calculada, a espessura mínima, a pressão de teste e o status (aprovado ou reprovado) de cada componente.',
      },
      {
        titulo: 'Salve',
        texto: 'O botão Salvar guarda o memorial completo na ficha. Ele fica disponível em "Ver Memorial Completo".',
      },
    ],
    observacoes: [
      'A PMTA do equipamento é a MENOR entre as PMTA calculadas por componente.',
      'Vaso de pressão usa pressão de teste de 1,3 × PMTA; caldeira usa 1,5 ×.',
      'O relatório imprime a memória de cálculo inteira, com as fórmulas que o motor realmente usou naquele componente — nada é reescrito à mão.',
      'Bocais são opcionais e entram como verificação de compensação de área; eles não têm PMTA própria e não entram na menor PMTA.',
    ],
    depois: 'A PMTA calculada alimenta a categoria de risco e as folhas de memorial do relatório.',
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
  },
  {
    id: 'categoria',
    titulo: 'Categorização NR-13',
    resumo: 'O sistema calcula sozinho: basta o volume, a pressão e o fluido.',
    categoria: 'operacao',
    icone: 'shield',
    chaves: ['categoria', 'classe', 'grupo', 'risco', 'enquadramento', 'fluido', 'volume', 'nr-13'],
    preRequisitos: ['Equipamento cadastrado', 'Memorial calculado (para a PMTA)'],
    passos: [
      { titulo: 'Abra o card Categoria NR-13', texto: 'Na ficha do equipamento, logo abaixo dos dados de identificação.' },
      { titulo: 'Informe o volume geométrico', texto: 'Em metros cúbicos.' },
      {
        titulo: 'Escolha a classe do fluido',
        texto:
          'A lista traz as classes A, B, C e D do anexo da NR-13, com a descrição de cada uma (inflamável, combustível acima de 200 °C, vapor de água, ar comprimido, outros).',
      },
      {
        titulo: 'Leia o resultado',
        texto:
          'O card mostra o enquadramento na norma, o produto pressão × volume, o grupo de potencial de risco e a categoria final.',
      },
    ],
    observacoes: [
      'A pressão usada é a PMTA do memorial. Recalcular o memorial atualiza a categoria sozinho.',
      'O enquadramento na norma usa kPa × m³ > 8; o grupo de risco usa MPa × m³. São bases diferentes, e o sistema não converte nenhuma das duas para a unidade de exibição.',
      'A categoria aparece na capa, na placa e na folha de caracterização de risco do relatório.',
    ],
    depois: 'A categoria passa a aparecer no cartão do equipamento e em todos os documentos.',
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
  },
  {
    id: 'inspecoes',
    titulo: 'Criar uma inspeção (container)',
    resumo: 'Uma rodada de inspeção do equipamento, com os ensaios que serão feitos em campo.',
    categoria: 'operacao',
    icone: 'clipboard',
    chaves: ['inspeção', 'container', 'campo', 'celular', 'ensaio', 'checklist', 'ultrassom', 'visual', 'hidrostático'],
    preRequisitos: ['Equipamento cadastrado'],
    passos: [
      { titulo: 'Abra Inspeções e escolha o equipamento', texto: 'A lista tem busca por TAG, equipamento, fabricante ou cliente.' },
      {
        titulo: 'Clique em + Nova Inspeção',
        texto:
          'Dê um nome à rodada (ex.: "Periódica 2026") e marque os ensaios: Checklist Completo (NR-13), Medição de Espessura (Ultrassom), Inspeção Visual Externa, Inspeção Visual Interna e Teste Hidrostático / Estanqueidade.',
      },
      {
        titulo: 'Preencha cada ensaio',
        texto:
          'Cada um abre em Preencher e mostra o estado — Pendente ou Preenchido. Os formulários foram feitos para o celular, em campo.',
      },
      {
        titulo: 'Salve',
        texto:
          'Cada formulário tem o próprio botão de salvar. O salvamento funciona sem rede: o que você preencher offline sobe quando o sinal voltar, e o selo no topo da tela diz quando ainda há coisa por subir.',
      },
      {
        titulo: 'Confira o estado antes de sair de campo',
        texto:
          'O cartão do container mostra quantos ensaios estão preenchidos. Um ensaio ainda Pendente significa que aquele bloco sairá vazio no relatório — é a última chance de voltar ao equipamento.',
      },
    ],
    observacoes: [
      'Marcar um ensaio na criação apenas o ATRIBUI. Ele só existe para o documento depois de preenchido e salvo — um container pode listar cinco ensaios e não ter nenhum dado.',
      'Você pode fechar o app e voltar depois: o que foi salvo permanece.',
      'Renomear a rodada (pelo lápis do cartão) é só um rótulo — não desfaz ensaio nenhum nem o vínculo com relatórios que já a usaram.',
      'As rodadas anteriores continuam inteiras. Criar um container novo não apaga o do ano passado.',
    ],
    depois: 'O container passa a ser escolhível na etapa "Inspeção" do assistente de criação de relatório.',
    rota: '/inspecoes',
    rotaRotulo: 'Ir para Inspeções',
  },
  {
    id: 'fotos',
    titulo: 'Fotos e legendas',
    resumo: 'Onde anexar, quantas cabem por folha e como a legenda é impressa.',
    categoria: 'operacao',
    icone: 'camera',
    chaves: ['foto', 'legenda', 'descrição', 'imagem', 'registro fotográfico', 'câmera'],
    preRequisitos: ['Container de inspeção criado'],
    passos: [
      {
        titulo: 'Abra o formulário do ensaio',
        texto:
          'Checklist (que tem dois grupos: fotos da documentação e fotos do checklist), Inspeção Visual Externa, Inspeção Visual Interna e Teste Hidrostático aceitam foto.',
      },
      { titulo: 'Clique em + Adicionar Foto', texto: 'No celular abre a câmera; no computador, o seletor de arquivos.' },
      {
        titulo: 'Escreva a legenda',
        texto:
          'Cada foto tem UM campo de texto abaixo dela. É esse texto que sai impresso sob a imagem no documento.',
      },
      { titulo: 'Salve o formulário', texto: 'Foto sem salvar não chega ao relatório.' },
    ],
    observacoes: [
      'São 4 fotos por folha. A quinta abre uma folha nova com o mesmo cabeçalho.',
      'A folha de fotos só existe se houver foto: sem nenhuma, ela não entra no documento.',
      'A proporção da imagem é preservada — foto deitada não é esticada para caber.',
      'O formulário de ultrassom não tem campo de foto.',
    ],
    depois: 'As fotos entram nas folhas de registro fotográfico do ensaio correspondente.',
    rota: '/inspecoes',
    rotaRotulo: 'Ir para Inspeções',
  },
  {
    id: 'calibracoes',
    titulo: 'Calibrações dos acessórios',
    resumo: 'Manômetros e válvulas do equipamento, organizados por lote.',
    categoria: 'operacao',
    icone: 'sliders',
    chaves: ['calibração', 'manômetro', 'psv', 'válvula', 'lote', 'acessório', 'componente', 'certificado'],
    preRequisitos: ['Equipamento cadastrado'],
    passos: [
      { titulo: 'Abra Calibrações e escolha o equipamento', texto: 'A tela é organizada por equipamento.' },
      {
        titulo: 'Cadastre os acessórios',
        texto:
          'Os componentes que pertencem ao equipamento — manômetros e válvulas de segurança (PSV). Cada um guarda nome, fabricante, nº de série e foto, e fica vinculado àquele equipamento: você cadastra uma vez e reaproveita nas inspeções seguintes.',
      },
      {
        titulo: 'Crie um lote',
        texto:
          'O lote é a rodada daquela inspeção. Ele agrupa as calibrações da ocasião e mantém o histórico separado das anteriores.',
      },
      {
        titulo: 'Calibre cada componente',
        texto:
          'Dentro do lote, cada acessório aparece com o botão Calibrar. Ao preencher, o sistema gera o certificado daquele componente e marca o lote como completo quando todos foram calibrados.',
      },
    ],
    observacoes: [
      'Ao montar o relatório, a seção Calibrações do modal lista os últimos lotes. Marcar um lote põe as folhas de certificado dele no documento e vincula o lote àquele relatório.',
      'É esse vínculo que alimenta as colunas de validade de válvula e de manômetro no histórico do equipamento.',
      'O certificado do instrumento PADRÃO usado na medição é outra coisa — fica em Certificados.',
    ],
    depois: 'As validades das calibrações passam a aparecer no Dashboard como prazos de origem "calibração".',
    rota: '/calibracoes',
    rotaRotulo: 'Ir para Calibrações',
  },
  {
    id: 'certificados',
    titulo: 'Certificados dos instrumentos padrão',
    resumo: 'A rastreabilidade dos instrumentos que você usa para medir — um por padrão, para toda a empresa.',
    categoria: 'operacao',
    icone: 'shield',
    chaves: ['certificado', 'padrão', 'rastreabilidade', 'bloco', 'manômetro padrão', 'psv padrão', 'validade', 'pdf'],
    preRequisitos: [],
    passos: [
      {
        titulo: 'Abra Certificados',
        texto:
          'São três cartões, um por rota de injeção que o sistema tem: bloco padrão de espessura (o padrão do ultrassom), manômetro padrão e válvula PSV padrão.',
      },
      {
        titulo: 'Cadastre o padrão',
        texto:
          'Instrumento, nº do certificado, validade, aparelho/modelo, fabricante e nº de série. Esses dados preenchem o bloco "Instrumento de medição utilizado" na folha do ensaio.',
      },
      {
        titulo: 'Anexe o certificado em PDF',
        texto: 'O arquivo original não é alterado: na emissão, as páginas dele são copiadas para o fim do documento, como vieram.',
      },
      {
        titulo: 'Deixe marcado "Injetar no final do relatório"',
        texto: 'É a caixa do próprio cartão. Sem ela, o PDF do certificado não é anexado.',
      },
    ],
    observacoes: [
      'O padrão entra no relatório quando as DUAS condições valem: o relatório inclui a folha daquele ensaio, e a caixa "Injetar no final do relatório" está marcada.',
      'Havendo mais de um cadastro do mesmo tipo, vale o mais recente que tenha PDF.',
      'Editar um certificado não apaga o anterior: nasce uma versão nova, e os relatórios já emitidos continuam apontando para a versão que usaram.',
      'É um certificado por padrão, válido para todos os equipamentos — não é por equipamento.',
    ],
    depois: 'O bloco de rastreabilidade das folhas de ultrassom e de teste hidrostático passa a se preencher sozinho.',
    rota: '/certificados',
    rotaRotulo: 'Ir para Certificados',
  },

  // ── DOCUMENTAÇÃO ─────────────────────────────────────────────────────────
  {
    id: 'relatorio',
    titulo: 'Gerar um relatório',
    resumo: 'O assistente em três etapas: documentos, inspeção e revisão.',
    categoria: 'documentacao',
    icone: 'pdf',
    chaves: ['relatório', 'gerar', 'assistente', 'wizard', 'documento', 'folhas', 'laudo'],
    preRequisitos: ['Equipamento cadastrado', 'Container de inspeção preenchido (para os dados de campo)'],
    passos: [
      { titulo: 'Abra Relatórios e clique em Criar relatório', texto: 'A lista fica atrás; o assistente abre em modal.' },
      { titulo: 'Escolha o equipamento', texto: 'Com busca por TAG, equipamento, fabricante ou cliente. Escolhido uma vez, não é perguntado de novo.' },
      {
        titulo: 'Etapa 1 — Documentos',
        texto:
          'O tipo de inspeção (inicial, periódica ou extraordinária) e quais folhas compõem o relatório: capa, sumário, placa, caracterização de risco, prontuário, resumo do memorial, memorial de cálculo, inspeções, verificação da documentação, checklists, exames visuais, conclusão, ultrassom, teste hidrostático e registros de segurança.',
      },
      {
        titulo: 'Etapa 2 — Inspeção',
        texto:
          'A lista dos containers daquele equipamento, dizendo quantos ensaios cada um tem com dados salvos. O olho ao lado mostra o conteúdo antes de escolher. "Não usar container" também é resposta válida.',
      },
      {
        titulo: 'Etapa 3 — Revisar e gerar',
        texto:
          'O resumo do que foi escolhido, com a possibilidade de desmarcar um ensaio que não deve sair no documento. Clique em Gerar Documento.',
      },
      {
        titulo: 'Preencha as Configurações',
        texto:
          'No documento aberto, o botão Configurações reúne nº do relatório, data de emissão, data de execução da inspeção, validade, próximas inspeções interna e externa, o número da A.R.T. e quem assina. "Aplicar ao documento" grava e refaz a folha na hora.',
      },
      {
        titulo: 'Feche o que a barra apontar',
        texto:
          'A barra "O que falta" agrupa os campos em branco por assunto e leva até cada um. Clicar em qualquer texto do documento abre o editor daquele campo, e a correção vale só para este relatório.',
      },
    ],
    observacoes: [
      'As folhas de fotos, o termo de abertura e as folhas extras de memorial são acrescentadas automaticamente onde fazem sentido — você não precisa marcá-las.',
      'O documento nasce como RASCUNHO: nada foi emitido ainda.',
      'Só o que estiver salvo no container escolhido aparece no documento.',
    ],
    depois: 'O relatório abre em rascunho, com a barra "O que falta" apontando os campos em branco.',
    rota: '/relatorios',
    rotaRotulo: 'Ir para Relatórios',
  },
  {
    id: 'de-onde-vem',
    titulo: 'De onde vêm os dados do relatório',
    resumo: 'O que o sistema preenche sozinho e o que depende de você.',
    categoria: 'documentacao',
    icone: 'link',
    chaves: ['automático', 'preenchimento', 'origem', 'dados', 'de onde vem', 'puxa'],
    preRequisitos: [],
    passos: [
      {
        titulo: 'Da sua empresa',
        texto: 'Logo, razão social, CNPJ, endereço e contato — no cabeçalho e no rodapé de todas as folhas.',
      },
      {
        titulo: 'Do cadastro do cliente',
        texto: 'Contratante, CNPJ e endereço, na capa e no prontuário.',
      },
      {
        titulo: 'Da ficha do equipamento',
        texto:
          'TAG, tipo, fabricante, série, ano, código de projeto, localização, descrição, foto de capa e as pressões adotadas — na capa, na placa reconstruída e na caracterização.',
      },
      {
        titulo: 'Do memorial e da categorização',
        texto: 'PMTA, espessura mínima, materiais, as fórmulas de cada componente, classe do fluido, grupo e categoria.',
      },
      {
        titulo: 'Do container de inspeção',
        texto:
          'Checklist com respostas e observações, exames visuais item a item, medições de espessura, dados e curva do teste hidrostático e todas as fotos com legenda.',
      },
      {
        titulo: 'Dos cadastros de apoio',
        texto:
          'Assinatura e registro dos profissionais; instrumento, nº e validade dos certificados dos padrões; folhas de certificado dos lotes de calibração.',
      },
      {
        titulo: 'Do modal Configurações',
        texto: 'Nº do relatório, emissão, execução da inspeção, validade, próximas inspeções, A.R.T. e quem assina.',
      },
    ],
    observacoes: [
      'O que não tem fonte no sistema é escrito no próprio documento: escopo, observações narrativas, parecer técnico, recomendações e os prazos das próximas inspeções.',
      'Clicar em qualquer texto do documento abre o editor daquele campo. A correção vale só para aquele relatório — nenhum cadastro é alterado.',
      'A barra "O que falta" agrupa os campos em branco por assunto e leva até cada um.',
    ],
    rota: '/relatorios',
    rotaRotulo: 'Ir para Relatórios',
  },
  {
    id: 'rascunho',
    titulo: 'Rascunho e documento finalizado',
    resumo: 'A diferença mais importante do sistema: um se edita, o outro não.',
    categoria: 'documentacao',
    icone: 'cadeado',
    chaves: ['rascunho', 'finalizado', 'finalizar', 'editar', 'imutável', 'emitido', 'alterar', 'integridade'],
    preRequisitos: [],
    passos: [
      {
        titulo: 'Enquanto é rascunho',
        texto:
          'O documento continua editável. Você pode fechar o app e voltar depois; o que foi preenchido fica salvo. Cada campo pode ser corrigido clicando nele, e o nome do documento pode ser trocado na lista.',
      },
      {
        titulo: 'O rascunho não conta como documento oficial',
        texto:
          'Ele não gera prazo de vencimento, não entra no Portal do Cliente e não vira registro no livro de segurança. Ele aparece na lista com o selo RASCUNHO.',
      },
      {
        titulo: 'Ao finalizar',
        texto:
          'O sistema gera o PDF, arquiva o documento e passa a servi-lo sempre a partir do arquivo guardado. Só então as datas dele valem como prazo.',
      },
      {
        titulo: 'Depois de finalizado',
        texto:
          'O conteúdo não muda mais. Abrir, imprimir, baixar e o Portal do Cliente entregam exatamente os mesmos bytes emitidos — mesmo que a ficha, o memorial ou o cadastro mudem depois.',
      },
    ],
    observacoes: [
      'Precisa alterar algo num documento já finalizado? Use Duplicar: nasce um relatório novo, editável.',
      'Renomear é a única exceção — é etiqueta de pasta, não conteúdo do documento.',
      'O mesmo vale para o prontuário: emitir cria uma revisão, e emitir de novo acrescenta outra em vez de sobrescrever.',
    ],
    rota: '/relatorios',
    rotaRotulo: 'Ir para Relatórios',
  },
  {
    id: 'integridade',
    titulo: 'Sobre a integridade dos documentos',
    resumo: 'Por que o sistema se recusa a mexer no que já foi emitido.',
    categoria: 'documentacao',
    icone: 'shield',
    chaves: ['integridade', 'segurança', 'adulteração', 'assinado', 'lacre', 'histórico'],
    preRequisitos: [],
    passos: [
      {
        titulo: 'O documento emitido é um arquivo, não uma receita',
        texto:
          'Quando você finaliza, o sistema guarda o arquivo pronto. Reabrir não monta o documento de novo: entrega o mesmo arquivo. Assim, corrigir a ficha do equipamento hoje não muda o laudo que você assinou no ano passado.',
      },
      {
        titulo: 'Cada documento tem uma impressão digital',
        texto:
          'Junto do arquivo é guardado um código calculado a partir do conteúdo. Qualquer alteração de um único caractere produziria um código diferente — é o que permite provar depois que o documento é o mesmo que foi emitido.',
      },
      {
        titulo: 'Os registros de segurança são encadeados',
        texto:
          'Cada registro trancado guarda a impressão digital do anterior. Apagar, reordenar ou editar um registro do meio quebraria a corrente, e o sistema recusa a alteração.',
      },
    ],
    observacoes: [
      'Nada disso impede o trabalho normal: acrescentar um registro novo ao fim, lançar uma ocorrência ou emitir uma revisão continuam permitidos.',
      'O que o sistema impede é a alteração silenciosa do que já foi assinado.',
    ],
  },
  {
    id: 'prontuarios',
    titulo: 'Prontuários',
    resumo: 'A reconstituição do prontuário do equipamento, em seis folhas.',
    categoria: 'documentacao',
    icone: 'book',
    chaves: ['prontuário', 'croqui', 'emissão', 'revisão', 'reconstituição', 'folha de dados'],
    preRequisitos: ['Equipamento cadastrado', 'Memorial calculado (as folhas de cálculo saem dele)'],
    passos: [
      { titulo: 'Abra Prontuários e clique em Criar prontuário', texto: 'Depois escolha o equipamento.' },
      {
        titulo: 'Preencha as seções',
        texto:
          'Identificação do vaso, empresa proprietária, dados do projeto, especificações dos materiais, dimensões e croqui.',
      },
      {
        titulo: 'Desenhe o croqui 2D',
        texto:
          'Só para vaso de pressão: o editor de croqui monta o desenho cotado a partir do diâmetro, comprimento, virolas, tampos, bocais e suporte. Caldeira e autoclave não têm essa folha.',
      },
      { titulo: 'Pré-visualize', texto: 'O botão Pré-visualizar mostra o documento antes de emitir.' },
      {
        titulo: 'Emita',
        texto: 'A emissão arquiva o documento e passa a numerar as revisões — rev. 01, rev. 02, e assim por diante.',
      },
    ],
    observacoes: [
      'Antes de emitir, o prontuário é um rascunho e continua editável.',
      'Emitir de novo NÃO sobrescreve a emissão anterior: acrescenta uma revisão nova, e a anterior continua existindo.',
      'Depois de emitido, o documento daquela revisão não muda mais — abrir e imprimir entregam os bytes arquivados.',
      'O engenheiro e o técnico que assinam são escolhidos no próprio visualizador do prontuário.',
    ],
    depois: 'O prontuário emitido fica disponível para impressão e para o Portal do Cliente.',
    rota: '/prontuarios',
    rotaRotulo: 'Ir para Prontuários',
  },
  {
    id: 'livro',
    titulo: 'Registros de Segurança',
    resumo: 'O histórico de cada equipamento — inspeções, manutenções, reparos e ocorrências.',
    categoria: 'documentacao',
    icone: 'filetext',
    chaves: ['livro', 'registro', 'segurança', 'ocorrência', 'trancar', 'lacre', 'histórico', 'nr-13'],
    preRequisitos: ['Equipamento cadastrado'],
    passos: [
      { titulo: 'Abra Registros de Segurança e escolha o equipamento', texto: 'A tela abre a linha do tempo daquele equipamento.' },
      {
        titulo: 'Clique em Novo registro',
        texto:
          'Quando existe um relatório do equipamento, o formulário já vem pré-preenchido com os dados dele. Ocorrências manuais — manutenções e reparos entre inspeções — também se lançam por aqui.',
      },
      { titulo: 'Revise o rascunho', texto: 'Enquanto for rascunho, o registro pode ser visto, editado e apagado.' },
      {
        titulo: 'Tranque',
        texto:
          'Trancar entra o registro na numeração do livro e o incorpora à cadeia de integridade. A partir daí ele não pode mais ser editado nem apagado.',
      },
      { titulo: 'Exporte', texto: 'O botão Exportar PDF gera o livro completo, com termo de abertura e capa.' },
    ],
    observacoes: [
      'Rascunho e registro trancado são coisas diferentes: só o trancado conta como registro oficial do livro.',
      'Trancar é definitivo. O que se pode fazer depois é acrescentar um registro novo ao fim, ou lançar uma retificação.',
      'A NR-13 (item 13.4.1.9) exige esse registro; é por isso que a tela existe.',
    ],
    rota: '/livro-registro',
    rotaRotulo: 'Ir para Registros de Segurança',
  },

  // ── GESTÃO ───────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    titulo: 'Dashboard e vencimentos',
    resumo: 'Onde o sistema consolida os prazos e diz o que vence primeiro.',
    categoria: 'gestao',
    icone: 'grid',
    chaves: ['dashboard', 'vencimento', 'prazo', 'vencido', 'painel', 'próxima inspeção', '15', '30', '60', '90'],
    preRequisitos: ['Pelo menos um relatório finalizado, uma calibração ou um certificado com validade'],
    passos: [
      { titulo: 'Abra o Dashboard', texto: 'O painel de prazos fica no topo, com os equipamentos ordenados pelo que vence primeiro.' },
      {
        titulo: 'Use a régua de prazos',
        texto:
          'Os chips 15, 30, 60 e 90 dias filtram por janela e são cumulativos: o que vence em 3 dias aparece em todos eles. O chip Vencidos isola o que já passou.',
      },
      {
        titulo: 'Leia a coluna Origem',
        texto:
          'Ela diz de onde o prazo veio: inspeção (do relatório do equipamento), calibração (de um acessório instalado) ou certificado (de um instrumento padrão).',
      },
      {
        titulo: 'Entenda as três origens',
        texto:
          'INSPEÇÃO é o prazo do equipamento, tirado do último relatório finalizado. CALIBRAÇÃO é a validade de um acessório instalado nele — o manômetro, a válvula de segurança. CERTIFICADO é a validade do instrumento PADRÃO que você usa para medir. São coisas diferentes e não podem se confundir: uma é a válvula do vaso, a outra é a válvula-padrão da bancada.',
      },
      { titulo: 'Aprofunde em Vencimentos', texto: 'A tela dedicada traz a lista completa, com busca e paginação.' },
    ],
    observacoes: [
      'O prazo de inspeção sai do ÚLTIMO relatório finalizado — a menor data entre próxima interna e próxima externa. A vida remanescente entra só como reserva, quando o relatório não tem essas datas.',
      'RASCUNHO não gera prazo. Um relatório precisa estar finalizado para o Dashboard passar a contá-lo.',
      'Sem data cadastrada não há prazo: o equipamento aparece como "sem prazo" em vez de sumir.',
      'O sino do topo acende quando existe item vencido.',
    ],
    rota: '/dashboard',
    rotaRotulo: 'Ir para o Dashboard',
  },
  {
    id: 'agenda',
    titulo: 'Agenda e faturamento',
    resumo: 'Os serviços do mês, o que está previsto e o que já foi realizado.',
    categoria: 'gestao',
    icone: 'calendar',
    chaves: ['agenda', 'serviço', 'faturamento', 'previsto', 'realizado', 'calendário', 'valor'],
    preRequisitos: [],
    passos: [
      { titulo: 'Abra Agenda', texto: 'O calendário do mês, com os serviços marcados em cada dia.' },
      {
        titulo: 'Lance um serviço',
        texto: 'Escolha o dia e descreva o serviço (ex.: "inspeção periódica da caldeira"). O valor é opcional.',
      },
      { titulo: 'Atualize o status', texto: 'Agendado, concluído ou cancelado.' },
      { titulo: 'Acompanhe o mês', texto: 'O resumo separa o faturamento previsto do realizado.' },
    ],
    observacoes: [
      'Serviço apenas agendado NÃO conta como faturamento realizado — os dois números são separados de propósito.',
      'Serviço cancelado sai das duas contas.',
      'Valor não informado não é zero: o resumo diz quantos serviços estão sem preço digitado.',
      'A agenda é controle pessoal: ela não alimenta relatório, prontuário nem prazo de inspeção.',
    ],
    rota: '/agenda',
    rotaRotulo: 'Ir para a Agenda',
  },
  {
    id: 'acessos',
    titulo: 'Acessos da equipe e Portal do Cliente',
    resumo: 'Logins para a sua equipe, com permissão por módulo, e área somente-leitura para o cliente.',
    categoria: 'gestao',
    icone: 'key',
    chaves: ['acesso', 'login', 'senha', 'permissão', 'equipe', 'portal', 'sub-login', 'gerente', 'inspetor'],
    preRequisitos: ['Ser o usuário mestre da conta (o login que criou a organização)'],
    passos: [
      {
        titulo: 'Entenda os três tipos de login',
        texto:
          'MESTRE é o login que criou a conta: ele vê tudo, é o único que abre Meus dados e Acessos, e é quem cria os demais. EQUIPE são os logins dos seus colaboradores, com permissão que você escolhe módulo a módulo. CLIENTE é o login do Portal, somente leitura, que enxerga apenas os equipamentos daquela empresa.',
      },
      {
        titulo: 'Abra Acessos e crie o login da equipe',
        texto:
          'Informe o e-mail e a senha inicial do colaborador. O login nasce dentro da SUA organização: ele enxerga os mesmos equipamentos, inspeções e documentos que você — nada é duplicado e nada é separado por pessoa.',
      },
      {
        titulo: 'Escolha o perfil',
        texto:
          'Gerente nasce com todos os módulos marcados; Inspetor nasce com apenas Inspeções. O perfil é só a pré-marcação — depois você ajusta a lista item a item.',
      },
      {
        titulo: 'Marque os módulos permitidos',
        texto:
          'São doze: Dashboard, Agenda, Vencimentos, Equipamentos, Inspeções, Relatórios, Prontuários, Calibrações, Certificados, Registros de Segurança, Cadastrar Funcionários e Cadastrar Clientes. O que não for marcado não aparece na barra lateral daquela pessoa, e digitar o endereço na barra do navegador também não abre — ela é levada de volta ao primeiro módulo permitido.',
      },
      {
        titulo: 'Ajuste ou bloqueie depois',
        texto:
          'A lista de Acessos mostra cada login com o estado (liberado ou bloqueado) e permite trocar a senha e mudar as permissões a qualquer momento. Bloquear tira o acesso sem apagar nada do que a pessoa produziu.',
      },
      {
        titulo: 'Portal do Cliente',
        texto:
          'Em Cadastrar → Clientes, cada empresa pode ganhar um login próprio. Ele abre um portal somente leitura com os equipamentos e os documentos finalizados daquele cliente — sem acesso ao resto do sistema e sem ver nenhuma outra empresa.',
      },
    ],
    observacoes: [
      'Colaborador NÃO paga assinatura separada: os logins da equipe pertencem à sua organização.',
      'O inspetor que só tem Inspeções continua enxergando a central de ajuda — ela não se esconde de ninguém.',
      'Rascunho, inspeção e documento são da ORGANIZAÇÃO, não da pessoa: quem começa uma inspeção em campo pode ter o relatório gerado por outra pessoa no escritório.',
      'O cliente do Portal nunca vê rascunho — só documento finalizado.',
      'Só o mestre cria, bloqueia e muda permissão. Um gerente com todos os módulos ainda não abre Acessos nem Meus dados.',
    ],
    depois: 'A pessoa entra com o e-mail e a senha que você criou e já enxerga os módulos liberados.',
    rota: '/acesso',
    rotaRotulo: 'Ir para Acessos',
  },
];

export interface PerguntaFaq {
  pergunta: string;
  resposta: string;
}

export const FAQ: PerguntaFaq[] = [
  {
    pergunta: 'Por onde começo?',
    resposta:
      'Configure Meus dados (empresa e logo), cadastre quem assina em Funcionários e o cliente em Clientes. Depois cadastre o equipamento — é dele que tudo o mais depende.',
  },
  {
    pergunta: 'Preciso cadastrar o equipamento antes de criar uma inspeção?',
    resposta:
      'Sim. A inspeção pertence a um equipamento: a tela de Inspeções pede que você escolha um antes de criar a rodada.',
  },
  {
    pergunta: 'O que é um container de inspeção?',
    resposta:
      'É uma rodada de inspeção daquele equipamento. Dentro dele você marca quais ensaios serão feitos e guarda o que foi coletado em campo. As rodadas anteriores continuam inteiras.',
  },
  {
    pergunta: 'Posso fazer a inspeção pelo celular?',
    resposta:
      'Sim — os formulários foram feitos para isso. E o salvamento funciona sem rede: o que você preencher offline sobe quando o sinal voltar.',
  },
  {
    pergunta: 'Posso fechar uma inspeção e continuar depois?',
    resposta: 'Pode. O que foi salvo permanece, e o ensaio volta a abrir no ponto em que estava.',
  },
  {
    pergunta: 'Marquei o ensaio na criação. Por que ele não aparece no relatório?',
    resposta:
      'Marcar o ensaio apenas o atribui ao container. Ele só chega ao documento depois de preenchido e SALVO no formulário.',
  },
  {
    pergunta: 'Como gero um relatório?',
    resposta:
      'Relatórios → Criar relatório. O assistente pergunta o equipamento, quais folhas entram e qual inspeção fornece os dados de campo.',
  },
  {
    pergunta: 'De onde vêm os dados do relatório?',
    resposta:
      'Da sua empresa, do cadastro do cliente, da ficha do equipamento, do memorial, da categorização, do container de inspeção escolhido, dos certificados e do modal Configurações.',
  },
  {
    pergunta: 'Qual a diferença entre rascunho e finalizado?',
    resposta:
      'Rascunho continua editável e não gera prazo nem entra no Portal. Finalizado é o documento oficial: fica arquivado e o conteúdo não muda mais.',
  },
  {
    pergunta: 'Posso editar um relatório depois de finalizado?',
    resposta:
      'Não. O que existe é Duplicar: nasce um relatório novo, editável, e o documento assinado continua intacto. Renomear é a única coisa que se pode mudar — é etiqueta de pasta, não conteúdo.',
  },
  {
    pergunta: 'Como adiciono uma foto e a legenda dela?',
    resposta:
      'Dentro do formulário do ensaio, em + Adicionar Foto. Cada foto tem um campo de texto logo abaixo — é ele que sai impresso sob a imagem. Depois, salve o formulário.',
  },
  {
    pergunta: 'Quantas fotos cabem por folha?',
    resposta: 'Quatro. A quinta abre uma folha nova com o mesmo cabeçalho, e assim por diante.',
  },
  {
    pergunta: 'Como cadastro um certificado de calibração do meu instrumento?',
    resposta:
      'Em Certificados. São três padrões: bloco padrão de espessura, manômetro padrão e válvula PSV padrão. Informe instrumento, nº, validade e anexe o PDF.',
  },
  {
    pergunta: 'Cadastrei o certificado e ele não foi para o relatório. Por quê?',
    resposta:
      'Duas condições precisam valer ao mesmo tempo: o relatório tem de incluir a folha daquele ensaio, e a caixa "Injetar no final do relatório" no cartão do padrão tem de estar marcada.',
  },
  {
    pergunta: 'Qual a diferença entre Calibrações e Certificados?',
    resposta:
      'Calibrações são os acessórios DO EQUIPAMENTO (o manômetro e a válvula instalados nele). Certificados são os instrumentos PADRÃO que você usa para medir. Um é o que se inspeciona; o outro é com o que se inspeciona.',
  },
  {
    pergunta: 'Por que determinado prazo não aparece no Dashboard?',
    resposta:
      'Ou não há data cadastrada, ou o relatório ainda é rascunho. Rascunho não gera prazo — o Dashboard só conta documento finalizado.',
  },
  {
    pergunta: 'O que significam os chips 15, 30, 60 e 90 dias?',
    resposta:
      'São janelas de prazo, e são cumulativas: o que vence em 3 dias aparece em todas. O chip Vencidos isola o que já passou da data.',
  },
  {
    pergunta: 'Como funciona o prontuário?',
    resposta:
      'Você cria, preenche as seções, desenha o croqui (só vaso de pressão) e emite. Emitir de novo não sobrescreve: cria uma revisão nova, e a anterior continua existindo.',
  },
  {
    pergunta: 'O que significa trancar um Registro de Segurança?',
    resposta:
      'Trancar entra o registro na numeração do livro e o torna definitivo: ele não pode mais ser editado nem apagado. Enquanto for rascunho, pode.',
  },
  {
    pergunta: 'Meus funcionários e colaboradores podem acessar o sistema também?',
    resposta:
      'Podem, e sem pagar assinatura separada: em Acessos, o usuário mestre cria um login para cada pessoa da equipe. O login nasce dentro da sua organização — a pessoa enxerga os mesmos equipamentos, inspeções e documentos que você, nada é duplicado. O que muda é a PERMISSÃO: você marca, módulo a módulo, o que cada uma pode abrir (Dashboard, Agenda, Vencimentos, Equipamentos, Inspeções, Relatórios, Prontuários, Calibrações, Certificados, Registros de Segurança e os dois cadastros). O que não for marcado nem aparece na barra lateral daquela pessoa, e digitar o endereço no navegador também não abre. Há dois perfis para acelerar: Gerente nasce com tudo marcado, Inspetor nasce só com Inspeções — o típico do técnico que preenche em campo pelo celular. Depois dá para ajustar as permissões, trocar a senha ou bloquear o acesso, e bloquear não apaga nada do que a pessoa produziu. Só o mestre entra em Acessos e em Meus dados, mesmo que um gerente tenha todos os módulos. E há um terceiro tipo, diferente: o login de Portal do Cliente, criado em Cadastrar → Clientes, que dá à empresa proprietária uma área somente leitura com os equipamentos e os documentos finalizados dela — sem ver rascunho, sem ver nenhuma outra empresa e sem entrar no resto do sistema.',
  },
  {
    pergunta: 'Uma pessoa começa a inspeção no celular e outra gera o relatório. Funciona?',
    resposta:
      'Funciona, e é o uso previsto. Inspeção, rascunho e documento pertencem à ORGANIZAÇÃO, não a quem os criou: o inspetor preenche os ensaios em campo — inclusive sem rede — e, de volta à internet, os dados sobem e ficam disponíveis para quem for montar o relatório no escritório.',
  },
  {
    pergunta: 'Como cadastro um engenheiro para assinar?',
    resposta:
      'Cadastrar → Funcionários. Informe nome, CREA/registro, o tipo Engenheiro e envie a imagem da assinatura. Depois escolha-o no modal Configurações do relatório.',
  },
  {
    pergunta: 'Como troco a logo da empresa?',
    resposta:
      'Em Meus dados. A logo nova passa a valer para os documentos seguintes; os já finalizados mantêm a que tinham na emissão.',
  },
  {
    pergunta: 'O sistema calcula a categoria sozinho?',
    resposta:
      'Sim. Com o volume, a PMTA do memorial e a classe do fluido, o card Categoria NR-13 devolve o enquadramento, o grupo de risco e a categoria final.',
  },
  {
    pergunta: 'Preenchi um campo nas Configurações e o documento não mudou.',
    resposta:
      'Clique em "Aplicar ao documento" no rodapé do modal. Ele grava e refaz a prévia — o campo passa a aparecer na folha.',
  },
  {
    pergunta: 'Posso trocar a placa de identificação por uma foto?',
    resposta:
      'Pode, e a troca vale só para aquele relatório. Um relatório novo do mesmo equipamento volta a trazer a placa reconstruída com os dados da ficha.',
  },
  {
    pergunta: 'Escrevo as mesmas recomendações em todo relatório. Dá para guardar?',
    resposta:
      'Dá. Na barra do documento, ao lado de "O que falta", o botão Predefinições guarda conjuntos de recomendações da sua empresa e os aplica com um clique em qualquer relatório.',
  },
  {
    pergunta: 'Posso cadastrar vários equipamentos de uma vez?',
    resposta:
      'Pode: a tela de Equipamentos aceita importação por planilha (.xlsx, .xls, .ods ou .csv). Também funciona arrastando o arquivo para cima da lista.',
  },
  {
    pergunta: 'Meu cliente pode acompanhar os documentos dele?',
    resposta:
      'Pode. Em Clientes, cada empresa pode ganhar um login de Portal do Cliente: uma área somente-leitura com os equipamentos e documentos dela.',
  },
];

/**
 * A busca da central.
 *
 * Client-side e por acentuação normalizada: quem digita "calibracao" precisa
 * achar "calibração". Procura em título, resumo, palavras-chave, passos e nas
 * perguntas do FAQ — a dúvida raramente é escrita com a palavra do título.
 */
export function normalizar(s: string): string {
  return s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function buscarGuias(termo: string): Guia[] {
  const t = normalizar(termo).trim();
  if (t === '') return GUIAS;
  return GUIAS.filter((g) => {
    const alvo = normalizar(
      [
        g.titulo,
        g.resumo,
        g.chaves.join(' '),
        g.passos.map((p) => `${p.titulo} ${p.texto}`).join(' '),
        // As OBSERVAÇÕES entram na busca porque é nelas que costuma estar a
        // resposta: "duplicar", "não gera prazo", "renomear" são regras, e o
        // usuário procura pela regra, não pelo título do guia.
        g.observacoes.join(' '),
        g.depois ?? '',
      ].join(' '),
    );
    return alvo.includes(t);
  });
}

export function buscarFaq(termo: string): PerguntaFaq[] {
  const t = normalizar(termo).trim();
  if (t === '') return FAQ;
  return FAQ.filter((f) => normalizar(`${f.pergunta} ${f.resposta}`).includes(t));
}

export function guiaPorId(id: string): Guia | null {
  return GUIAS.find((g) => g.id === id) ?? null;
}

export function guiasDaCategoria(cat: CategoriaInfo, lista: Guia[] = GUIAS): Guia[] {
  return lista.filter((g) => g.categoria === cat);
}
