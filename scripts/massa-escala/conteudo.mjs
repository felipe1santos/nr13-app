/**
 * Conteúdo das chaves da massa de escala. Funções PURAS: recebem o gerador
 * determinístico e devolvem o objeto — nada de rede, nada de relógio.
 *
 * O formato espelha `src/services/demoSeed.ts`, que é a referência viva de
 * "conjunto mínimo coerente de chaves por equipamento". Se o formato real
 * mudar, o gerador precisa acompanhar — massa com formato errado mediria uma
 * tela que não renderiza.
 */
import { inteiro, escolher, decimal, dataBR, dataISO, uuid } from './prng.mjs';

const FABRICANTES = ['Metalúrgica Andrade', 'Vasos Kramer S/A', 'Indústria Peixoto', 'CaldeMaq', 'Prisma Equipamentos'];
const MATERIAIS = ['ASTM A-285 Gr. C', 'ASTM A-516 Gr. 60', 'ASTM A-516 Gr. 70', 'SA-36'];
const LOCAIS = ['Casa de compressores', 'Oficina', 'Pátio industrial', 'Sala de utilidades', 'Área externa'];
const FLUIDOS = ['Ar comprimido', 'Vapor saturado', 'Água quente', 'Nitrogênio'];
const CIDADES = ['Vila Velha', 'Serra', 'Cariacica', 'Vitória', 'Guarapari'];

/** Cliente sintético — um por bloco de equipamentos, para os filtros terem o que agrupar. */
export function clienteDe(rnd, n) {
  const i = Math.floor(n / 25); // ~25 equipamentos por cliente
  return {
    id: `escala-cli-${i}`,
    razaoSocial: `Indústria Sintética ${i} Ltda`,
    nomeFantasia: `Sintética ${i}`,
    cnpj: `00.000.${String(i).padStart(3, '0')}/0001-00`,
    atividade: 'Metalurgia',
    endereco: `Rua Sintética, ${100 + i}`,
    bairro: 'Distrito Industrial',
    cidade: escolher(rnd, CIDADES),
    estado: 'ES',
    cep: '29100-000',
    telefone: '(27) 3000-0000',
    email: `contato${i}@sintetica.example`,
    contato: `Responsável ${i}`,
  };
}

export function info(rnd, tag, n) {
  const tipo = escolher(rnd, ['vaso', 'vaso', 'vaso', 'caldeira', 'autoclave']);
  return {
    tag,
    tipo,
    subtipo: '',
    descricao: `Equipamento sintético de escala nº ${n} — ${tipo}`,
    descricaoResumida: `Sintético ${n}`,
    fabricante: escolher(rnd, FABRICANTES),
    ano: String(inteiro(rnd, 1998, 2024)),
    numeroSerie: `SN-${String(n).padStart(6, '0')}`,
    codigoProjeto: tipo === 'caldeira' ? 'ASME Seção I' : 'ASME Seção VIII Divisão 1',
    edicao: '2004',
    localizacao: escolher(rnd, LOCAIS),
    fluido: escolher(rnd, FLUIDOS),
  };
}

export function emp(rnd, n) {
  const c = clienteDe(rnd, n);
  return {
    clienteId: c.id,
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia,
    cnpj: c.cnpj,
    atividade: c.atividade,
    endereco: c.endereco,
    bairro: c.bairro,
    cidade: c.cidade,
    estado: c.estado,
    cep: c.cep,
    telefone: c.telefone,
    email: c.email,
    contato: c.contato,
    localidade: c.cidade,
  };
}

export function cat(rnd) {
  const grupo = inteiro(rnd, 1, 5);
  const catFinal = escolher(rnd, ['I', 'II', 'III', 'IV', 'V']);
  return {
    grupo,
    catFinal,
    classe: escolher(rnd, ['A', 'B', 'C']),
    volumeM3: decimal(rnd, 0.2, 12, 3),
    pmtaMpa: decimal(rnd, 0.4, 3.2, 4),
    fluido: escolher(rnd, FLUIDOS),
    calculadoEm: dataISO(inteiro(rnd, 30, 900)),
  };
}

export function calc(rnd) {
  const pmta = decimal(rnd, 0.4, 3.2, 4);
  const material = escolher(rnd, MATERIAIS);
  return {
    pmta,
    pth: Number((pmta * 1.3).toFixed(4)),
    resultado: escolher(rnd, ['APROVADO', 'APROVADO', 'APROVADO', 'REPROVADO']),
    memorialHTML: `<p>Memorial sintético — material ${material}.</p>`,
    logCalculo: ['Cálculo sintético gerado pela massa de escala da Fase 8.'],
    componentes: [
      {
        nome: 'Casco cilíndrico',
        pmtaMpa: pmta,
        tReqMm: decimal(rnd, 3, 9, 2),
        tNom: decimal(rnd, 5, 14, 2),
        E: 0.85,
        S: 108.3,
        D: inteiro(rnd, 400, 2000),
        raio: inteiro(rnd, 200, 1000),
        ca: 1,
        material,
      },
      {
        nome: 'Tampo toroesférico',
        pmtaMpa: Number((pmta * 1.05).toFixed(4)),
        tReqMm: decimal(rnd, 3, 9, 2),
        tNom: decimal(rnd, 5, 14, 2),
        E: 0.85,
        S: 108.3,
        D: inteiro(rnd, 400, 2000),
        raio: inteiro(rnd, 200, 1000),
        ca: 1,
        material,
      },
    ],
  };
}

/** `nr13_fotos_<TAG>` no formato pós-Fase 5: referência + miniatura, sem base64. */
export function fotos(rnd, org, tag, caminhoFoto, bytesFoto, bytesThumb) {
  return [
    {
      id: uuid(rnd),
      isCapa: true,
      descricao: 'Vista geral (sintética)',
      ref: {
        bucket: 'inspecao',
        path: caminhoFoto,
        mimeType: 'image/jpeg',
        tamanho: bytesFoto,
        thumb: {
          bucket: 'inspecao',
          path: caminhoFoto.replace(/\.jpg$/, '.thumb.jpg'),
          mimeType: 'image/jpeg',
          tamanho: bytesThumb,
        },
      },
    },
  ];
}

/** Alimenta o painel de vencimentos — é o que torna a lista mais cara de montar. */
export function vida(rnd) {
  const tAtual = decimal(rnd, 5.5, 9.5, 2);
  return {
    entrada: {
      tAtual,
      dataAtual: dataBR(inteiro(rnd, 30, 400)),
      tAnterior: Number((tAtual + 0.1).toFixed(2)),
      dataAnterior: dataBR(inteiro(rnd, 401, 900)),
      tRequerida: decimal(rnd, 3, 5, 2),
    },
    taxaMmAno: decimal(rnd, 0.02, 0.3, 3),
    sobremetalMm: decimal(rnd, 1, 4, 2),
    vidaAnos: decimal(rnd, 5, 40, 1),
    prazoNR13Anos: null,
    proximaInspecaoAnos: inteiro(rnd, 1, 6),
    avisos: ['Massa sintética da Fase 8.'],
    calculadoEm: dataISO(inteiro(rnd, 30, 400)),
  };
}

export function docs(rnd) {
  return [
    {
      id: uuid(rnd),
      nome: 'Inspeção sintética',
      criadoEm: dataBR(inteiro(rnd, 30, 400)),
      ensaios: ['checklist', 'visual_externo'],
      dados: {},
    },
  ];
}

/**
 * `nr13_rel_<id>_<TAG>` — formato da Fase 7B: snapshot com REFERÊNCIA, sem
 * base64. Copiar o formato legado (base64 embutido) inflaria a massa em 40×
 * e mediria um sistema que não existe mais.
 */
const DOCUMENTOS_TIPICOS = [
  'CAPA.html', 'SUMARIO.html', 'PLACA.html', 'CLASSIFICACAO-RISCO.html', 'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html', 'MEMORIAL.html', 'INSPECOES.html', 'VERIFICACAO-DOCUMENTACAO.html',
  'checklist2.html', 'checklist3.html', 'CONCLUSAO.html', 'LIVRO-REGISTRO.html',
];

export function relatorio(rnd, { id, tag, org, pdfPath, pdfBytes, logoPath, assinaturaPath, i }) {
  const emissao = dataBR(inteiro(rnd, 30, 700));
  const interna = dataBR(-inteiro(rnd, 30, 1400));
  const externa = dataBR(-inteiro(rnd, 30, 900));
  const geradoEm = dataISO(inteiro(rnd, 30, 700));
  // Campos e proporções conferidos contra um registro REAL da Fase 7B
  // (`nr13_rel_REL-1787282922043_ZZ-FASE3`, 2.461 B): meta 1.524 · documentos 273 ·
  // assinantes 658 · empresa 253 · pdfRef 166. Massa com formato errado mede errado.
  return {
    id,
    tagVaso: tag,
    nome: `Relatorio_Inspecao_Periodica_${tag}.pdf`,
    tipo: 'Inspeção Periódica',
    data: emissao,
    status: 'salvo',
    geradoEm,
    paginas: inteiro(rnd, 5, 30),
    pdfPendente: false,
    pendente: false,
    documentos: DOCUMENTOS_TIPICOS,
    pdfRef: { bucket: 'inspecao', path: pdfPath, mimeType: 'application/pdf', tamanho: pdfBytes },
    sha256: 'f8'.repeat(32),
    livroCorte: { indice: inteiro(rnd, 0, 4), sha256: 'a8'.repeat(16), lacradaEm: geradoEm },
    meta: {
      codigo: id,
      emissao,
      validade: externa,
      execucaoInspecao: emissao,
      proximaInspecaoInterna: interna,
      proximaInspecaoExterna: externa,
      validadeValvula: '',
      tipoInspecao: 'Inspeção Periódica',
      phNome: 'Engenheiro Sintético',
      phCrea: 'CREA-ES 000000',
      tecnicoNome: '',
      documentos: DOCUMENTOS_TIPICOS,
      empresa: {
        razao: 'Empresa Sintética de Escala Ltda',
        fantasia: 'Sintética Escala',
        cnpj: '00.000.000/0001-00',
        telefone: '(27) 3000-0000',
        endereco: 'Rua Sintética, 100 — Vila Velha/ES',
        logoRef: { bucket: 'inspecao', path: logoPath, mimeType: 'image/jpeg', tamanho: 4408 },
      },
      assinantes: {
        engenheiro: {
          id: `escala-ph-${org.slice(0, 8)}`,
          nome: 'Engenheiro Sintético',
          funcao: 'Engenheiro Mecânico',
          crea: 'CREA-ES 000000',
          tipo: 'Engenheiro',
          camposExtras: [{ rotulo: 'CRQ', valor: '000000' }],
          folhasRelatorio: DOCUMENTOS_TIPICOS,
          assinaturaRef: { bucket: 'inspecao', path: assinaturaPath, mimeType: 'image/png', tamanho: 14557 },
        },
        tecnico: null,
        assinanteTermoLivro: 'engenheiro',
      },
      certCalibracoes: [],
      rastreabIds: [],
    },
  };
}

/**
 * Item do `nr13_historico_indice_<TAG>` — é o que a lista, o Dashboard,
 * `listarVencimentos` e o Portal leem. Os 18 campos são os do registro real.
 */
export function itemIndice(rel) {
  return {
    id: rel.id,
    tagVaso: rel.tagVaso,
    nome: rel.nome,
    tipo: rel.tipo,
    data: rel.data,
    status: rel.status,
    codigo: rel.meta.codigo,
    emissao: rel.meta.emissao,
    validade: rel.meta.validade,
    execucaoInspecao: rel.meta.execucaoInspecao,
    proximaInspecaoInterna: rel.meta.proximaInspecaoInterna,
    proximaInspecaoExterna: rel.meta.proximaInspecaoExterna,
    validadeValvula: rel.meta.validadeValvula,
    pdfRef: rel.pdfRef,
    sha256: rel.sha256,
    geradoEm: rel.geradoEm,
    paginas: rel.paginas,
    pdfPendente: rel.pdfPendente,
  };
}

/**
 * Todas as chaves de UM equipamento. Devolve pares `[chave, valor]` já
 * serializados — o gerador só precisa enfileirar.
 */
export function chavesDoEquipamento(rnd, { org, tag, n, perfil, relatoriosPorEquipamento, caminhos }) {
  const pares = [];
  const add = (chave, valor) => pares.push([chave, JSON.stringify(valor)]);

  add(`nr13_info_${tag}`, info(rnd, tag, n));
  add(`nr13_emp_${tag}`, emp(rnd, n));
  add(`nr13_cat_${tag}`, cat(rnd));
  add(`nr13_calc_${tag}`, calc(rnd));
  add(`nr13_fotos_${tag}`, fotos(rnd, org, tag, caminhos.foto, caminhos.bytesFoto, caminhos.bytesThumb));
  add(`nr13_vida_${tag}`, vida(rnd));
  add(`nr13_pref_unidade_${tag}`, 'SI');
  add(`nr13_docs_${tag}`, docs(rnd));

  const indice = [];
  for (let i = 0; i < relatoriosPorEquipamento; i++) {
    const id = `REL-F8-${n}-${i}`;
    const rel = relatorio(rnd, {
      id,
      tag,
      org,
      pdfPath: caminhos.pdf(i),
      pdfBytes: caminhos.bytesPdf,
      logoPath: caminhos.logo,
      assinaturaPath: caminhos.assinatura,
      i,
    });
    add(`nr13_rel_${id}_${tag}`, rel);
    indice.push(itemIndice(rel));
  }
  if (indice.length) add(`nr13_historico_indice_${tag}`, indice);

  return pares;
}
