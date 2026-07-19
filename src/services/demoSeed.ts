// Dados de demonstração injetados UMA vez na conta trial recém-ativada, para o
// lead testar dashboard, cards, categoria, vida remanescente e vencimentos sem
// cadastrar nada. Idempotente: a chave-marcador nr13_demo_seed impede repetição.
// Tudo vai pela API normal (salvar → app_storage da própria org; RLS isola).
import { ler, salvar } from './storage';
import type { Cliente, Funcionario, MinhaEmpresaDados } from '../features/cadastros/tipos';
import type {
  CategoriaSalva,
  CalculoSalvo,
  EmpresaEquipamento,
  InfoEquipamento,
} from '../features/equipamento/tipos';
import type { ContainerInspecao } from '../features/inspecoes/tipos';

const MARCADOR = 'nr13_demo_seed';
const TAG_VASO = 'DEMO-VP-01';
const TAG_COMP = 'DEMO-CP-01';

const CLIENTE_DEMO: Cliente = {
  id: 'demo-cli-01',
  razaoSocial: 'Metalúrgica Exemplo Ltda',
  nomeFantasia: 'Metalúrgica Exemplo',
  cnpj: '00.000.000/0001-00',
  atividade: 'Metalurgia',
  endereco: 'Rua das Indústrias, 100',
  bairro: 'Distrito Industrial',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '00000-000',
  telefone: '(11) 0000-0000',
  email: 'contato@exemplo.com.br',
  contato: 'João Exemplo',
  anotacoes: 'Cliente de demonstração criado automaticamente no período de teste.',
};

const PH_DEMO: Funcionario = {
  id: 'demo-ph-01',
  nome: 'Engenheiro de Exemplo',
  crea: '0000000000',
  tipo: 'Engenheiro',
  funcao: 'Engenheiro Mecânico',
};

function infoVaso(): InfoEquipamento {
  return {
    tag: TAG_VASO,
    tipo: 'vaso',
    subtipo: '',
    descricao: 'Vaso de pressão vertical — ar comprimido (demonstração)',
    descricaoResumida: 'Reservatório de ar comprimido',
    fabricante: 'Fabricante Exemplo S/A',
    ano: '2018',
    numeroSerie: 'VE-2018-001',
    codigoProjeto: 'ASME Seção VIII Divisão 1',
    edicao: '2004',
    localizacao: 'Casa de compressores',
  };
}

function infoCompressor(): InfoEquipamento {
  return {
    tag: TAG_COMP,
    tipo: 'vaso',
    subtipo: '',
    descricao: 'Reservatório do compressor de ar (demonstração)',
    descricaoResumida: 'Reservatório de compressor',
    fabricante: 'Compressores Exemplo',
    ano: '2020',
    numeroSerie: 'CE-2020-045',
    localizacao: 'Oficina',
  };
}

function empresaDoEquip(): EmpresaEquipamento {
  return {
    clienteId: CLIENTE_DEMO.id,
    razaoSocial: CLIENTE_DEMO.razaoSocial,
    nomeFantasia: CLIENTE_DEMO.nomeFantasia,
    cnpj: CLIENTE_DEMO.cnpj,
    atividade: CLIENTE_DEMO.atividade,
    endereco: CLIENTE_DEMO.endereco,
    bairro: CLIENTE_DEMO.bairro,
    cidade: CLIENTE_DEMO.cidade,
    localidade: CLIENTE_DEMO.cidade,
    cep: CLIENTE_DEMO.cep,
    telefone: CLIENTE_DEMO.telefone,
    estado: CLIENTE_DEMO.estado,
    contato: CLIENTE_DEMO.contato,
    email: CLIENTE_DEMO.email,
  };
}

// Ar comprimido (classe C), 2,5 m³ × 1,0 MPa → grupo 3, categoria III.
// Enquadramento em kPa×m³ (regra absoluta §4): 1000 × 2,5 = 2500 > 8.
function categoriaVaso(): CategoriaSalva {
  return {
    classe: 'C',
    grupo: 3,
    PV_cat: '2.50',
    PV_enq: '2500.00',
    isEnquadrado: true,
    catFinal: 'III',
    volInput: 2.5,
    presInput: 1,
    unidInput: 'SI',
    fluidoInput: 'C - Ar comprimido',
  };
}

function categoriaCompressor(): CategoriaSalva {
  return {
    classe: 'C',
    grupo: 5,
    PV_cat: '0.44',
    PV_enq: '441.00',
    isEnquadrado: true,
    catFinal: 'V',
    volInput: 0.5,
    presInput: 0.88,
    unidInput: 'SI',
    fluidoInput: 'C - Ar comprimido',
  };
}

function calculoVaso(): CalculoSalvo & { componentes: Record<string, unknown>[] } {
  return {
    pmta: '1.000',
    pth: '1.300',
    ecasco: '4.75',
    resultado: 'APROVADO',
    memorialHTML:
      '<h3>Memorial de demonstração</h3>' +
      '<p>Vaso de pressão DEMO-VP-01 — ASME VIII Div. 1 (UG-27).</p>' +
      '<p>Casco cilíndrico: D = 800 mm; t nominal = 8,0 mm; t requerida = 4,75 mm; ' +
      'material ASTM A-285 Gr. C; E = 0,85; PMTA = 1,00 MPa; PTH = 1,30 MPa.</p>' +
      '<p><em>Dados ilustrativos do período de teste — calcule um memorial real em ' +
      '"Equipamentos → Memorial".</em></p>',
    logCalculo: ['Demonstração: valores ilustrativos, não usar em documentação real.'],
    componentes: [
      {
        id: 'casco',
        nome: 'Casco cilíndrico',
        tipo: 'casco',
        pmtaMpa: 1,
        tReqMm: 4.75,
        tNom: 8,
        E: 0.85,
        S: 118,
        D: 800,
        raio: 400,
        ca: 1,
        material: 'ASTM A-285 Gr. C',
      },
    ],
  };
}

// Formato de nr13_vida_<TAG> (VidaRemanescente.tsx — não alterar).
function vidaVaso(): Record<string, unknown> {
  return {
    entrada: { tAtual: 7.9, dataAtual: '15/06/2026', tAnterior: 8.0, dataAnterior: '15/06/2025', tRequerida: 4.75 },
    taxaMmAno: 0.1,
    sobremetalMm: 3.15,
    vidaAnos: 31.5,
    prazoNR13Anos: null,
    proximaInspecaoAnos: 4,
    avisos: ['Dados de demonstração.'],
    calculadoEm: new Date().toISOString(),
  };
}

function containerDemo(): ContainerInspecao {
  return {
    id: 'demo-cont-01',
    nome: 'Inspeção de exemplo',
    criadoEm: '15/06/2026',
    ensaios: ['checklist', 'visual_externo', 'visual_interno'],
    dados: {},
  };
}

// Roda após a ativação do trial. Nunca sobrescreve dados já existentes.
export async function injetarDadosDemo(empresaNome: string): Promise<void> {
  if (ler(MARCADOR)) return;

  const minhaEmpresa = ler<MinhaEmpresaDados>('nr13_minha_empresa');
  if (!minhaEmpresa || (!minhaEmpresa.razao && !minhaEmpresa.fantasia)) {
    await salvar('nr13_minha_empresa', {
      ...(minhaEmpresa ?? {}),
      razao: empresaNome || 'Minha Empresa (teste)',
      fantasia: empresaNome || 'Minha Empresa (teste)',
    } satisfies MinhaEmpresaDados);
  }

  const clientes = ler<Cliente[]>('nr13_clientes') ?? [];
  if (!clientes.some((c) => c.id === CLIENTE_DEMO.id)) {
    await salvar('nr13_clientes', [...clientes, CLIENTE_DEMO]);
  }

  const phs = ler<Funcionario[]>('nr13_lista_phs') ?? [];
  if (!phs.some((f) => f.id === PH_DEMO.id)) {
    await salvar('nr13_lista_phs', [...phs, PH_DEMO]);
  }

  if (!ler(`nr13_info_${TAG_VASO}`)) {
    await salvar(`nr13_info_${TAG_VASO}`, infoVaso());
    await salvar(`nr13_emp_${TAG_VASO}`, empresaDoEquip());
    await salvar(`nr13_cat_${TAG_VASO}`, categoriaVaso());
    await salvar(`nr13_calc_${TAG_VASO}`, calculoVaso());
    await salvar(`nr13_vida_${TAG_VASO}`, vidaVaso());
    await salvar(`nr13_docs_${TAG_VASO}`, [containerDemo()]);
  }

  if (!ler(`nr13_info_${TAG_COMP}`)) {
    await salvar(`nr13_info_${TAG_COMP}`, infoCompressor());
    await salvar(`nr13_emp_${TAG_COMP}`, empresaDoEquip());
    await salvar(`nr13_cat_${TAG_COMP}`, categoriaCompressor());
  }

  await salvar(MARCADOR, { v: 1, em: new Date().toISOString() });
}
