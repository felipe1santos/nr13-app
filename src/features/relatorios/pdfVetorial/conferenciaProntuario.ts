import type { ModeloProntuario } from './modeloProntuario';

/**
 * Fase 12 · a conferência campo a campo do PRONTUÁRIO.
 *
 * Mesma ideia da `conferencia.ts` do relatório: em vez de olhar dois PDFs lado
 * a lado e confiar no olho, cada campo do documento é listado POR NOME, e o que
 * sai em branco sai em branco com nome. É assim que "nenhuma perda de conteúdo"
 * deixa de ser opinião.
 *
 * O que se conta aqui é o que o documento MOSTRA — não o que existe no banco.
 * Campo vazio no cadastro aparece como vazio nos dois motores, e isso não é
 * perda; perda seria um campo preenchido que o vetorial não imprime.
 */
export interface ConferenciaProntuario {
  total: number;
  preenchidos: number;
  vazios: string[];
}

export function conferirCamposProntuario(m: ModeloProntuario): ConferenciaProntuario {
  const campos: [string, unknown][] = [
    ['TAG', m.tag],
    ['tipo de equipamento', m.tipoEquipamento],
    ['número do prontuário', m.numero],
    ['data de emissão', m.emissao],
    ['revisão', m.revisao],
    ['data da revisão', m.dataRevisao],

    ['razão social da executante', m.empresa.razao],
    ['endereço da executante', m.empresa.endereco],
    ['contato da executante', m.empresa.contato],
    ['logo da executante', m.empresa.logo],

    ['contratante', m.cliente.razao],
    ['CNPJ do contratante', m.cliente.cnpj],
    ['endereço do contratante', m.cliente.endereco],

    ...Object.entries(m.identificacao).map(([k, v]) => [`identificação · ${k}`, v] as [string, unknown]),
    ...Object.entries(m.construtivos).map(([k, v]) => [`construtivo · ${k}`, v] as [string, unknown]),
    ...Object.entries(m.operacionais).map(([k, v]) => [`operacional · ${k}`, v] as [string, unknown]),

    ['categoria · P(kPa)×V', m.categoria.kpaVolume],
    ['categoria · enquadramento', m.categoria.resultadoKpa],
    ['categoria · P(MPa)×V', m.categoria.mpaVolume],
    ['categoria · grupo de risco', m.categoria.resultadoMpa],
    ['categoria · classe do fluido', m.categoria.classeFluido],
    ['categoria · categoria final', m.categoria.categoria],

    ['PMTA (MPa)', m.pressoes[0]?.mpa],
    ['PMTA (kgf/cm²)', m.pressoes[0]?.kgf],
    ['PTH (MPa)', m.pressoes[1]?.mpa],
    ['componentes do memorial', m.componentes.length ? m.componentes : null],
    ['linhas da memória de cálculo', m.memorial.length ? m.memorial : null],

    ['ultrassom · componente', m.ultrassom.componente],
    ['ultrassom · aparelho', m.ultrassom.aparelho],
    ['ultrassom · acoplante', m.ultrassom.acoplante],
    ['ultrassom · cabeçote', m.ultrassom.cabecote],
    ['ultrassom · velocidade sônica', m.ultrassom.velSonica],
    ['ultrassom · temperatura da superfície', m.ultrassom.tempSup],
    ['ultrassom · estado da superfície', m.ultrassom.estadoSup],
    ['ultrassom · pontos de medição', m.ultrassom.pontos.length ? m.ultrassom.pontos : null],
    ['ultrassom · instrumento padrão', m.ultrassom.instrumento.padrao],
    ['ultrassom · nº de série do padrão', m.ultrassom.instrumento.serie],
    ['ultrassom · certificado do padrão', m.ultrassom.instrumento.certificado],
    ['ultrassom · validade do padrão', m.ultrassom.instrumento.validade],

    ['croqui · vista longitudinal', m.croqui.longitudinal],
    ['croqui · vista transversal', m.croqui.transversal],
    ['croqui · detalhe do tampo', m.croqui.detalheTampo],
    ['dimensões reais', m.dimensoes.length ? m.dimensoes : null],
    ['folha de dados', Object.values(m.folhaDados).some((v) => v !== null) ? m.folhaDados : null],

    ['procedimentos de inspeção', m.procedimentos],
    ['dispositivos de segurança', m.dispositivos],
    ['pontos de atenção', m.atencao],

    ['assinantes', m.assinantes.length ? m.assinantes : null],
    ['rubrica do engenheiro', m.assinantes[0]?.rubrica ?? null],
  ];

  const vazios = campos
    .filter(([, v]) => v === null || v === undefined || (typeof v === 'string' && v.trim() === ''))
    .map(([nome]) => nome);

  return { total: campos.length, preenchidos: campos.length - vazios.length, vazios };
}
