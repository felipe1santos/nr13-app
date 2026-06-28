import type { FormularioEnsaio } from './tipos';

// ── tipos locais (mirrors das interfaces em cada formulário) ─────────────────

interface DadosChecklist {
  dataInspecao: string;
  inspetor: string;
  respostas: Record<string, string>;
  instrumentos: Record<string, boolean>;
  fotos: { base64: string; descricao: string }[];
  fotosDocumentacao?: { base64: string; descricao: string }[];
}

interface DadosVisual {
  contratante: string;
  rastreabilidade: string;
  endereco: string;
  dataInspecao: string;
  serie: string;
  tipoEquipamento: string;
  fabricante: string;
  itens: Record<string, string>;
  itemObs: Record<string, string>;
  observacoes: string;
  conclusao: string;
  fotos: { base64: string; descricao: string }[];
}

interface DadosUltrassom {
  equipamento: string;
  area: string;
  espNomCasco: string;
  ano: string;
  material: string;
  aparelho: string;
  acoplante: string;
  tempSup: string;
  estadoSup: string;
  cabecote: string;
  velSonica: string;
  medidas: Record<string, Record<string, string>>;
}

interface DadosTH {
  cliente: string;
  docNum: string;
  equipamento: string;
  dataTeste: string;
  pressaoProj: string;
  pressaoTeste: string;
  fluido: string;
  curva: { tempo: string; pressao: string }[];
  fotos: { base64: string; descricao: string }[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Campo({ label, valor }: { label: string; valor?: string }) {
  if (!valor) return null;
  return (
    <div className="viz-campo">
      <span className="viz-label">{label}</span>
      <span className="viz-valor">{valor}</span>
    </div>
  );
}

function SecaoViz({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="viz-secao">
      <div className="viz-secao-titulo">{titulo}</div>
      {children}
    </div>
  );
}

function GaleriaFotos({ fotos, titulo = 'Registro Fotográfico' }: { fotos: { base64: string; descricao: string }[]; titulo?: string }) {
  if (!fotos || fotos.length === 0) return null;
  return (
    <SecaoViz titulo={titulo}>
      <div className="fotos-formulario-grid">
        {fotos.map((f, i) => (
          <div key={i} className="foto-formulario-item">
            <img src={f.base64} alt={f.descricao || `Foto ${i + 1}`} />
            {f.descricao && (
              <div style={{ padding: '6px 8px', fontSize: 12, color: '#374151', borderTop: '1px solid #e5e7eb' }}>
                {f.descricao}
              </div>
            )}
          </div>
        ))}
      </div>
    </SecaoViz>
  );
}

// ── badge SIM/NÃO/N.A. ───────────────────────────────────────────────────────

function BadgeResposta({ val }: { val: string }) {
  const cor =
    val === 'sim' || val === 'Sim' || val === 'Existe'
      ? { bg: '#dcfce7', color: '#15803d' }
      : val === 'nao' || val === 'Não' || val === 'Não identificado'
        ? { bg: '#fee2e2', color: '#b91c1c' }
        : { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{ background: cor.bg, color: cor.color, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
      {val === 'sim' ? 'SIM' : val === 'nao' ? 'NÃO' : val}
    </span>
  );
}

// ── CHECKLIST ────────────────────────────────────────────────────────────────

const DOCS_5_1 = [
  { id: 'v51-registro-seguranca', texto: 'Registro de segurança' },
  { id: 'v51-desenho-conjunto', texto: 'Desenho do conjunto geral' },
  { id: 'v51-prontuario', texto: 'Prontuário' },
  { id: 'v51-memoria-calculo', texto: 'Memória de cálculo da PMTA' },
  { id: 'v51-relatorio-insp-inicial', texto: 'Relatório de inspeção inicial' },
  { id: 'v51-projeto-instalacao', texto: 'Projeto de instalação' },
  { id: 'v51-manual-operacao', texto: 'Manual de operação (cat. I e II)' },
  { id: 'v51-operador-qualificado', texto: 'Operador qualificado (cat. I e II)' },
  { id: 'v51-comprovante-estagio', texto: 'Comprovante de estágio supervisionado' },
  { id: 'v51-laudo-th', texto: 'Laudo de teste hidrostático/pneumático' },
  { id: 'v51-cert-calibracao', texto: 'Certificados de calibração dos disp. de segurança' },
  { id: 'v51-programa-inspecoes', texto: 'Programa de inspeções com datas limites' },
  { id: 'v51-recomendacoes-anteriores', texto: 'Recomendações de inspeções anteriores' },
  { id: 'v51-mapa-espessuras', texto: 'Mapa de medição de espessuras por ultrassom' },
  { id: 'v51-art-assinada', texto: 'A.R.T assinada do profissional habilitado' },
];

const PERGUNTAS_5_2 = [
  { id: 'chk-pv8', texto: 'PV > 8 (se enquadra na NR-13)?' },
  { id: 'chk-rgi', texto: 'Risco grave e iminente?' },
  { id: 'chk-placa', texto: 'Possui placa de identificação completa?' },
  { id: 'chk-categoria', texto: 'Identificação e categoria visíveis?' },
  { id: 'chk-prontuario', texto: 'Possui prontuário?' },
  { id: 'chk-caract-prontuario', texto: 'Características conferem com prontuário?' },
  { id: 'chk-livro', texto: 'Possui livro de registro de segurança NR-13?' },
  { id: 'chk-local-inst', texto: 'Local de instalação:' },
  { id: 'chk-exig-inst', texto: 'Atende exigências do local (NR-13)?' },
  { id: 'chk-ex-int', texto: 'Examinado internamente?' },
  { id: 'chk-int-ok', texto: 'Satisfaz condições de segurança (exame interno)?' },
  { id: 'chk-caract-exame', texto: 'Caracterização confere com prontuário (exame)?' },
  { id: 'chk-th-feito', texto: 'Teste hidrostático realizado?' },
  { id: 'chk-psv', texto: 'Possui válvula/dispositivo de segurança?' },
  { id: 'chk-lacre-psv', texto: 'Possui lacre/aviso de bloqueio inadvertido?' },
  { id: 'chk-vacuo', texto: 'Trabalha em vácuo?' },
  { id: 'chk-quebra-vacuo', texto: 'Possui quebra-vácuo?' },
  { id: 'chk-psv-ok', texto: 'Todas as válvulas de segurança examinadas?' },
  { id: 'chk-anomalia', texto: 'Foi observada alguma anomalia?' },
  { id: 'chk-inst-ok', texto: 'Instrumentos em boas condições operacionais?' },
  { id: 'chk-ensaios-compl', texto: 'Realizados ensaios complementares?' },
];

const INSTRUMENTOS_NOMES: Record<string, string> = {
  'inst-man': 'Manômetro',
  'inst-term': 'Termômetro',
  'inst-vac': 'Vacuômetro',
  'inst-press': 'Pressostato',
  'inst-trans': 'Transmissor de pressão',
  'inst-nenhum': 'Não possui nenhum instrumento',
};

function ViewChecklist({ dados }: { dados: DadosChecklist }) {
  const insts = Object.entries(dados.instrumentos || {})
    .filter(([k, v]) => v && !k.endsWith('-cal'))
    .map(([k]) => INSTRUMENTOS_NOMES[k] ?? k);

  return (
    <>
      <SecaoViz titulo="Dados Gerais">
        <div className="viz-grid-2">
          <Campo label="Data da Inspeção" valor={dados.dataInspecao} />
          <Campo label="Inspecionado por" valor={dados.inspetor} />
        </div>
      </SecaoViz>

      <SecaoViz titulo="5.1 — Verificação da Documentação">
        <table className="viz-table">
          <tbody>
            {DOCS_5_1.map((d) => {
              const resp = dados.respostas?.[d.id];
              if (!resp) return null;
              return (
                <tr key={d.id}>
                  <td>{d.texto}</td>
                  <td><BadgeResposta val={resp} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SecaoViz>

      <SecaoViz titulo="5.2 — Resultados da Inspeção">
        <table className="viz-table">
          <tbody>
            {PERGUNTAS_5_2.map((p) => {
              const resp = dados.respostas?.[p.id];
              if (!resp) return null;
              return (
                <tr key={p.id}>
                  <td>{p.texto}</td>
                  <td><BadgeResposta val={resp} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SecaoViz>

      {insts.length > 0 && (
        <SecaoViz titulo="Instrumentos de Controle">
          <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {insts.map((n) => <li key={n} style={{ fontSize: 13 }}>{n}</li>)}
          </ul>
        </SecaoViz>
      )}

      <GaleriaFotos fotos={dados.fotosDocumentacao ?? []} titulo="Registro Fotográfico da Documentação" />
      <GaleriaFotos fotos={dados.fotos ?? []} />
    </>
  );
}

// ── VISUAL EXTERNO / INTERNO ─────────────────────────────────────────────────

const ITENS_VE = [
  'Juntas, conexões e vedações',
  'Elementos de fixação',
  'Cordões de solda',
  'Estruturas de apoio, suporte e içamento',
  'Estrutura física do equipamento',
  'Dispositivo(s) de drenagem',
  'Acúmulo residual ou material',
  'Proteção contra eletricidade estática',
  'Iluminação',
  'Dispositivo(s) de alívio de pressão',
  'Indicador(es) de pressão',
  'Sistema contra bloqueio inadvertido de dispositivo(s) de segurança',
  'Placa de identificação',
  'Acessibilidade e localização do equipamento',
  'Ventilação',
];

const ITENS_VI = [
  'Condição geral das paredes internas',
  'Presença de trincas ou fissuras',
  'Incrustações ou depósitos internos',
  'Erosão ou desgaste da superfície interna',
  'Integridade das soldas internas',
  'Estado das conexões e bocais internos',
  'Revestimento interno (quando aplicável)',
  'Corrosão sob tensão (SCC)',
  'Suportes e estruturas internas',
  'Limpeza interna',
  'Marcas de desgaste ou abrasão',
  'Pontos de corrosão localizada (pite)',
  'Integridade do fundo e tampos internos',
  'Bocas de inspeção e tampas de acesso',
  'Iluminação interna para inspeção',
];

function ViewVisual({ dados, titulo, itens }: { dados: DadosVisual; titulo: string; itens: string[] }) {
  return (
    <>
      <SecaoViz titulo="Dados Gerais">
        <div className="viz-grid-2">
          <Campo label="Contratante" valor={dados.contratante} />
          <Campo label="Rastreabilidade" valor={dados.rastreabilidade} />
          <Campo label="Endereço" valor={dados.endereco} />
          <Campo label="Data da Inspeção" valor={dados.dataInspecao} />
          <Campo label="T.A.G. / Identificação" valor={dados.tipoEquipamento} />
          <Campo label="Nº de Série" valor={dados.serie} />
          <Campo label="Fabricante" valor={dados.fabricante} />
        </div>
      </SecaoViz>

      <SecaoViz titulo={`Itens de Verificação — ${titulo}`}>
        <table className="viz-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>Nº</th>
              <th>Item</th>
              <th style={{ width: 60 }}>Resultado</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, i) => {
              const n = String(i + 1);
              const val = dados.itens?.[n] ?? '';
              const obs = dados.itemObs?.[n] ?? '';
              return (
                <tr key={n} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                  <td style={{ textAlign: 'center', color: '#6b7280', fontSize: 11 }}>{n}</td>
                  <td style={{ fontSize: 12 }}>{item}</td>
                  <td style={{ textAlign: 'center' }}>
                    {val ? <BadgeResposta val={val} /> : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11, color: '#374151' }}>{obs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SecaoViz>

      {dados.observacoes && (
        <SecaoViz titulo="Observações Gerais">
          <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>{dados.observacoes}</p>
        </SecaoViz>
      )}

      {dados.conclusao && (
        <SecaoViz titulo="Conclusão Técnica">
          <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>{dados.conclusao}</p>
        </SecaoViz>
      )}

      <GaleriaFotos fotos={dados.fotos ?? []} />
    </>
  );
}

// ── ULTRASSOM ────────────────────────────────────────────────────────────────

const COMPONENTES_US = [
  { id: 'ts', nome: 'Tampo Superior' },
  { id: 'c1', nome: 'Casco 1' },
  { id: 'c2', nome: 'Casco 2' },
  { id: 'c3', nome: 'Casco 3' },
  { id: 'c4', nome: 'Casco 4' },
  { id: 'ti', nome: 'Tampo Inferior' },
];
const ANGULOS = ['0', '90', '180', '270'];

function ViewUltrassom({ dados }: { dados: DadosUltrassom }) {
  const temMedidas = COMPONENTES_US.some((c) => ANGULOS.some((a) => dados.medidas?.[c.id]?.[a]));

  return (
    <>
      <SecaoViz titulo="Equipamento e Condições">
        <div className="viz-grid-2">
          <Campo label="Equipamento" valor={dados.equipamento} />
          <Campo label="Área" valor={dados.area} />
          <Campo label="Esp. Nominal Casco" valor={dados.espNomCasco ? `${dados.espNomCasco} mm` : undefined} />
          <Campo label="Ano de Fabricação" valor={dados.ano} />
          <Campo label="Material" valor={dados.material} />
          <Campo label="Aparelho" valor={dados.aparelho} />
          <Campo label="Acoplante" valor={dados.acoplante} />
          <Campo label="Temp. Superfície" valor={dados.tempSup} />
          <Campo label="Estado Superfície" valor={dados.estadoSup} />
          <Campo label="Cabeçote" valor={dados.cabecote} />
          <Campo label="Vel. Sônica" valor={dados.velSonica ? `${dados.velSonica} m/s` : undefined} />
        </div>
      </SecaoViz>

      {temMedidas && (
        <SecaoViz titulo="Medições de Espessura (mm)">
          <table className="viz-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>0°</th>
                <th>90°</th>
                <th>180°</th>
                <th>270°</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTES_US.map((c) => {
                const row = dados.medidas?.[c.id] ?? {};
                if (!ANGULOS.some((a) => row[a])) return null;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{c.nome}</td>
                    {ANGULOS.map((a) => (
                      <td key={a} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0033a2' }}>
                        {row[a] || '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SecaoViz>
      )}
    </>
  );
}

// ── TESTE HIDROSTÁTICO ───────────────────────────────────────────────────────

function ViewTH({ dados }: { dados: DadosTH }) {
  const curvaPreenchida = (dados.curva ?? []).filter((l) => l.tempo || l.pressao);
  return (
    <>
      <SecaoViz titulo="Dados do Teste">
        <div className="viz-grid-2">
          <Campo label="Cliente" valor={dados.cliente} />
          <Campo label="Nº Documento" valor={dados.docNum} />
          <Campo label="Equipamento" valor={dados.equipamento} />
          <Campo label="Data do Teste" valor={dados.dataTeste} />
          <Campo label="Pressão de Projeto" valor={dados.pressaoProj} />
          <Campo label="Pressão de Teste" valor={dados.pressaoTeste} />
          <Campo label="Fluido" valor={dados.fluido} />
        </div>
      </SecaoViz>

      {curvaPreenchida.length > 0 && (
        <SecaoViz titulo="Curva de Pressão">
          <table className="viz-table">
            <thead>
              <tr>
                <th>Tempo (min)</th>
                <th>Pressão</th>
              </tr>
            </thead>
            <tbody>
              {curvaPreenchida.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center' }}>{l.tempo || '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#0033a2' }}>{l.pressao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SecaoViz>
      )}

      <GaleriaFotos fotos={dados.fotos ?? []} />
    </>
  );
}

// ── EXPORTAÇÃO PRINCIPAL ─────────────────────────────────────────────────────

interface Props {
  formulario: FormularioEnsaio;
  dados: unknown;
  tag: string;
}

export default function VisualizadorFormulario({ formulario, dados }: Props) {
  if (!dados) return <p style={{ padding: 20, color: '#6b7280' }}>Nenhum dado registrado para este formulário.</p>;

  switch (formulario) {
    case 'checklist':
      return <ViewChecklist dados={dados as DadosChecklist} />;
    case 'visual_externo':
      return <ViewVisual dados={dados as DadosVisual} titulo="Inspeção Visual Externa" itens={ITENS_VE} />;
    case 'visual_interno':
      return <ViewVisual dados={dados as DadosVisual} titulo="Inspeção Visual Interna" itens={ITENS_VI} />;
    case 'ultrassom':
      return <ViewUltrassom dados={dados as DadosUltrassom} />;
    case 'th':
      return <ViewTH dados={dados as DadosTH} />;
    default:
      return <p style={{ padding: 20, color: '#6b7280' }}>Visualização não disponível para este tipo.</p>;
  }
}
