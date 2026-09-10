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
  /** Ilustração já existente em `public/ilustracoes/`, quando couber. */
  ilustracao?: string;
  ilustracaoAlt?: string;
}

/**
 * O fluxo do sistema, em ordem — auditado contra as telas em 10/09/2026.
 *
 * As dependências são reais: sem equipamento não há inspeção; sem container
 * preenchido o relatório sai sem dados de campo; sem funcionário cadastrado
 * não há quem assine.
 */
export const PRIMEIROS_PASSOS: { titulo: string; texto: string; rota: string; icone: NomeIcone }[] = [
  {
    titulo: 'Configure sua empresa',
    texto: 'Razão social, CNPJ, endereço, contato e a logo. É o que aparece no cabeçalho de todas as folhas.',
    rota: '/minha-empresa',
    icone: 'building',
  },
  {
    titulo: 'Cadastre quem assina',
    texto: 'Engenheiro e técnico, com CREA/registro e a imagem da assinatura. Sem isso o documento sai sem assinatura.',
    rota: '/funcionarios',
    icone: 'users',
  },
  {
    titulo: 'Cadastre o cliente',
    texto: 'A empresa proprietária do equipamento. Vira o contratante do relatório e do prontuário.',
    rota: '/empresas',
    icone: 'briefcase',
  },
  {
    titulo: 'Cadastre o equipamento',
    texto: 'TAG, tipo e a ficha. Nada operacional funciona sem ele — é a raiz de todo o resto.',
    rota: '/equipamentos',
    icone: 'box',
  },
  {
    titulo: 'Calcule o memorial',
    texto: 'Casco, tampos, material e pressão. Dele saem a PMTA, a espessura mínima e a categoria de risco.',
    rota: '/equipamentos',
    icone: 'calculator',
  },
  {
    titulo: 'Prepare os padrões',
    texto: 'Certificados dos instrumentos padrão e as calibrações dos acessórios do equipamento.',
    rota: '/certificados',
    icone: 'shield',
  },
  {
    titulo: 'Crie a inspeção',
    texto: 'Um container por rodada de inspeção, com os ensaios que você vai fazer.',
    rota: '/inspecoes',
    icone: 'clipboard',
  },
  {
    titulo: 'Preencha em campo',
    texto: 'Checklist, exames visuais, ultrassom e teste hidrostático — pelo celular, e salvando cada um.',
    rota: '/inspecoes',
    icone: 'camera',
  },
  {
    titulo: 'Gere o relatório',
    texto: 'O assistente pergunta o equipamento, as folhas e qual inspeção fornece os dados de campo.',
    rota: '/relatorios',
    icone: 'pdf',
  },
  {
    titulo: 'Revise em rascunho',
    texto: 'A barra "O que falta" aponta cada campo em branco. Rascunho continua editável o tempo que precisar.',
    rota: '/relatorios',
    icone: 'pencil',
  },
  {
    titulo: 'Finalize',
    texto: 'O documento vira oficial, é arquivado e deixa de ser editável.',
    rota: '/relatorios',
    icone: 'cadeado',
  },
  {
    titulo: 'Acompanhe os prazos',
    texto: 'As datas do relatório finalizado passam a alimentar o Dashboard e a tela de Vencimentos.',
    rota: '/dashboard',
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
    ilustracao: '/ilustracoes/escolher-equipamento.webp',
    ilustracaoAlt: 'Um técnico escolhendo um equipamento numa lista de ativos',
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
    ],
    observacoes: [
      'A unidade de medida é escolhida dentro da ficha e reflete em todo o sistema. A categoria de risco NUNCA é convertida — ela tem base própria.',
      'Vários equipamentos de uma vez: a tela aceita importação por planilha (.xlsx, .xls, .ods ou .csv), inclusive arrastando o arquivo para cima da lista.',
      'A ficha alimenta a capa, a placa de identificação reconstruída, a caracterização de risco, o prontuário e o resumo de inspeções.',
    ],
    depois: 'O equipamento passa a aparecer em Inspeções, Relatórios, Prontuários, Calibrações e Registros de Segurança.',
    rota: '/equipamentos',
    rotaRotulo: 'Ir para Equipamentos',
    ilustracao: '/ilustracoes/escolher-equipamento.webp',
    ilustracaoAlt: 'Um técnico escolhendo um equipamento numa lista de ativos',
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
    ilustracao: '/ilustracoes/memorial-calculo.webp',
    ilustracaoAlt: 'Croqui de um vaso de pressão ao lado das fórmulas do memorial de cálculo',
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
          'Cada formulário tem o próprio botão de salvar. O salvamento funciona sem rede: o que você preencher offline sobe quando o sinal voltar.',
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
    ilustracao: '/ilustracoes/container-inspecao.webp',
    ilustracaoAlt: 'Uma pilha de formulários de inspeção, com o de cima preenchido',
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
    ilustracao: '/ilustracoes/fluxo-calibracao.webp',
    ilustracaoAlt: 'Fluxo em quatro etapas: equipamento, cadastro dos acessórios, lote e calibração concluída',
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
    ilustracao: '/ilustracoes/rastreabilidade-padroes.webp',
    ilustracaoAlt: 'Bancada com instrumentos padrão ao lado dos certificados e do calendário de validade',
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
    ilustracao: '/ilustracoes/registro-seguranca.webp',
    ilustracaoAlt: 'Livro de registro de segurança aberto, com a linha do tempo do equipamento',
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
    preRequisitos: ['Ser o usuário mestre da conta'],
    passos: [
      { titulo: 'Abra Acessos', texto: 'A lista dos logins da sua organização. Só o mestre entra nesta tela.' },
      {
        titulo: 'Crie o acesso',
        texto:
          'Escolha o perfil: Gerente (vê tudo por padrão) ou Inspetor (nasce com acesso apenas a Inspeções).',
      },
      {
        titulo: 'Marque os módulos',
        texto:
          'A permissão é por módulo: Dashboard, Agenda, Vencimentos, Equipamentos, Inspeções, Relatórios, Prontuários, Calibrações, Certificados, Registros de Segurança e os cadastros.',
      },
      {
        titulo: 'Portal do Cliente',
        texto:
          'Em Clientes, cada empresa pode ganhar um login próprio para acompanhar os equipamentos e documentos dela — somente leitura.',
      },
    ],
    observacoes: [
      'O menu e as rotas seguem a permissão: o que não foi marcado nem aparece na barra lateral.',
      'O cliente do Portal não enxerga nada de outras empresas.',
    ],
    rota: '/acesso',
    rotaRotulo: 'Ir para Acessos',
  },
];

export interface PerguntaFaq {
  pergunta: string;
  resposta: string;
  /** Guia relacionado, para o botão "Ver o guia". */
  guia?: string;
}

export const FAQ: PerguntaFaq[] = [
  {
    pergunta: 'Por onde começo?',
    resposta:
      'Configure Meus dados (empresa e logo), cadastre quem assina em Funcionários e o cliente em Clientes. Depois cadastre o equipamento — é dele que tudo o mais depende.',
    guia: 'comecar',
  },
  {
    pergunta: 'Preciso cadastrar o equipamento antes de criar uma inspeção?',
    resposta:
      'Sim. A inspeção pertence a um equipamento: a tela de Inspeções pede que você escolha um antes de criar a rodada.',
    guia: 'equipamentos',
  },
  {
    pergunta: 'O que é um container de inspeção?',
    resposta:
      'É uma rodada de inspeção daquele equipamento. Dentro dele você marca quais ensaios serão feitos e guarda o que foi coletado em campo. As rodadas anteriores continuam inteiras.',
    guia: 'inspecoes',
  },
  {
    pergunta: 'Posso fazer a inspeção pelo celular?',
    resposta:
      'Sim — os formulários foram feitos para isso. E o salvamento funciona sem rede: o que você preencher offline sobe quando o sinal voltar.',
    guia: 'inspecoes',
  },
  {
    pergunta: 'Posso fechar uma inspeção e continuar depois?',
    resposta: 'Pode. O que foi salvo permanece, e o ensaio volta a abrir no ponto em que estava.',
    guia: 'inspecoes',
  },
  {
    pergunta: 'Marquei o ensaio na criação. Por que ele não aparece no relatório?',
    resposta:
      'Marcar o ensaio apenas o atribui ao container. Ele só chega ao documento depois de preenchido e SALVO no formulário.',
    guia: 'inspecoes',
  },
  {
    pergunta: 'Como gero um relatório?',
    resposta:
      'Relatórios → Criar relatório. O assistente pergunta o equipamento, quais folhas entram e qual inspeção fornece os dados de campo.',
    guia: 'relatorio',
  },
  {
    pergunta: 'De onde vêm os dados do relatório?',
    resposta:
      'Da sua empresa, do cadastro do cliente, da ficha do equipamento, do memorial, da categorização, do container de inspeção escolhido, dos certificados e do modal Configurações.',
    guia: 'de-onde-vem',
  },
  {
    pergunta: 'Qual a diferença entre rascunho e finalizado?',
    resposta:
      'Rascunho continua editável e não gera prazo nem entra no Portal. Finalizado é o documento oficial: fica arquivado e o conteúdo não muda mais.',
    guia: 'rascunho',
  },
  {
    pergunta: 'Posso editar um relatório depois de finalizado?',
    resposta:
      'Não. O que existe é Duplicar: nasce um relatório novo, editável, e o documento assinado continua intacto. Renomear é a única coisa que se pode mudar — é etiqueta de pasta, não conteúdo.',
    guia: 'rascunho',
  },
  {
    pergunta: 'Como adiciono uma foto e a legenda dela?',
    resposta:
      'Dentro do formulário do ensaio, em + Adicionar Foto. Cada foto tem um campo de texto logo abaixo — é ele que sai impresso sob a imagem. Depois, salve o formulário.',
    guia: 'fotos',
  },
  {
    pergunta: 'Quantas fotos cabem por folha?',
    resposta: 'Quatro. A quinta abre uma folha nova com o mesmo cabeçalho, e assim por diante.',
    guia: 'fotos',
  },
  {
    pergunta: 'Como cadastro um certificado de calibração do meu instrumento?',
    resposta:
      'Em Certificados. São três padrões: bloco padrão de espessura, manômetro padrão e válvula PSV padrão. Informe instrumento, nº, validade e anexe o PDF.',
    guia: 'certificados',
  },
  {
    pergunta: 'Cadastrei o certificado e ele não foi para o relatório. Por quê?',
    resposta:
      'Duas condições precisam valer ao mesmo tempo: o relatório tem de incluir a folha daquele ensaio, e a caixa "Injetar no final do relatório" no cartão do padrão tem de estar marcada.',
    guia: 'certificados',
  },
  {
    pergunta: 'Qual a diferença entre Calibrações e Certificados?',
    resposta:
      'Calibrações são os acessórios DO EQUIPAMENTO (o manômetro e a válvula instalados nele). Certificados são os instrumentos PADRÃO que você usa para medir. Um é o que se inspeciona; o outro é com o que se inspeciona.',
    guia: 'calibracoes',
  },
  {
    pergunta: 'Por que determinado prazo não aparece no Dashboard?',
    resposta:
      'Ou não há data cadastrada, ou o relatório ainda é rascunho. Rascunho não gera prazo — o Dashboard só conta documento finalizado.',
    guia: 'dashboard',
  },
  {
    pergunta: 'O que significam os chips 15, 30, 60 e 90 dias?',
    resposta:
      'São janelas de prazo, e são cumulativas: o que vence em 3 dias aparece em todas. O chip Vencidos isola o que já passou da data.',
    guia: 'dashboard',
  },
  {
    pergunta: 'Como funciona o prontuário?',
    resposta:
      'Você cria, preenche as seções, desenha o croqui (só vaso de pressão) e emite. Emitir de novo não sobrescreve: cria uma revisão nova, e a anterior continua existindo.',
    guia: 'prontuarios',
  },
  {
    pergunta: 'O que significa trancar um Registro de Segurança?',
    resposta:
      'Trancar entra o registro na numeração do livro e o torna definitivo: ele não pode mais ser editado nem apagado. Enquanto for rascunho, pode.',
    guia: 'livro',
  },
  {
    pergunta: 'Como cadastro um engenheiro para assinar?',
    resposta:
      'Cadastrar → Funcionários. Informe nome, CREA/registro, o tipo Engenheiro e envie a imagem da assinatura. Depois escolha-o no modal Configurações do relatório.',
    guia: 'funcionarios',
  },
  {
    pergunta: 'Como troco a logo da empresa?',
    resposta:
      'Em Meus dados. A logo nova passa a valer para os documentos seguintes; os já finalizados mantêm a que tinham na emissão.',
    guia: 'empresa',
  },
  {
    pergunta: 'O sistema calcula a categoria sozinho?',
    resposta:
      'Sim. Com o volume, a PMTA do memorial e a classe do fluido, o card Categoria NR-13 devolve o enquadramento, o grupo de risco e a categoria final.',
    guia: 'categoria',
  },
  {
    pergunta: 'Preenchi um campo nas Configurações e o documento não mudou.',
    resposta:
      'Clique em "Aplicar ao documento" no rodapé do modal. Ele grava e refaz a prévia — o campo passa a aparecer na folha.',
    guia: 'relatorio',
  },
  {
    pergunta: 'Posso trocar a placa de identificação por uma foto?',
    resposta:
      'Pode, e a troca vale só para aquele relatório. Um relatório novo do mesmo equipamento volta a trazer a placa reconstruída com os dados da ficha.',
    guia: 'equipamentos',
  },
  {
    pergunta: 'Escrevo as mesmas recomendações em todo relatório. Dá para guardar?',
    resposta:
      'Dá. Na barra do documento, ao lado de "O que falta", o botão Predefinições guarda conjuntos de recomendações da sua empresa e os aplica com um clique em qualquer relatório.',
    guia: 'de-onde-vem',
  },
  {
    pergunta: 'Posso cadastrar vários equipamentos de uma vez?',
    resposta:
      'Pode: a tela de Equipamentos aceita importação por planilha (.xlsx, .xls, .ods ou .csv). Também funciona arrastando o arquivo para cima da lista.',
    guia: 'equipamentos',
  },
  {
    pergunta: 'Meu cliente pode acompanhar os documentos dele?',
    resposta:
      'Pode. Em Clientes, cada empresa pode ganhar um login de Portal do Cliente: uma área somente-leitura com os equipamentos e documentos dela.',
    guia: 'acessos',
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
