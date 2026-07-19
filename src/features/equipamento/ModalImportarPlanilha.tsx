import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import {
  analisarPlanilha,
  baixarModeloPlanilha,
  extensaoAceita,
  importarLinhas,
  type AnalisePlanilha,
  type LinhaProblema,
} from './importarPlanilhaService';
import './equipamento.css';
import './importar.css';

interface Props {
  /** Arquivo já solto na lista (drag-and-drop) — o modal abre direto na análise. */
  arquivoInicial?: File | null;
  onClose: () => void;
  /** Chamado ao fechar depois de ter criado ao menos um equipamento (recarrega a lista). */
  onImportado: () => void;
}

type Fase = 'intro' | 'analisando' | 'revisao' | 'importando' | 'concluido';

const DESCRICAO_COLUNAS: { nome: string; descricao: string; obrigatoria: boolean }[] = [
  { nome: 'tag', descricao: 'Identificação única do equipamento', obrigatoria: true },
  { nome: 'tipo', descricao: 'vaso, autoclave ou caldeira', obrigatoria: true },
  { nome: 'fabricante', descricao: 'Fabricante do equipamento', obrigatoria: true },
  { nome: 'numero_serie', descricao: 'Nº de série', obrigatoria: true },
  { nome: 'ano', descricao: 'Ano de fabricação', obrigatoria: true },
  { nome: 'cliente', descricao: 'Razão social do cliente', obrigatoria: true },
  { nome: 'pmta', descricao: 'PMTA adotada, em MPa', obrigatoria: false },
  { nome: 'volume', descricao: 'Volume', obrigatoria: false },
  { nome: 'diametro', descricao: 'Diâmetro', obrigatoria: false },
  { nome: 'comprimento', descricao: 'Comprimento', obrigatoria: false },
  { nome: 'material', descricao: 'Material do costado', obrigatoria: false },
  { nome: 'espessura', descricao: 'Espessura de parede', obrigatoria: false },
  { nome: 'local', descricao: 'Localização na planta', obrigatoria: false },
  { nome: 'fluido', descricao: 'Fluido de serviço', obrigatoria: false },
  { nome: 'pressao_projeto', descricao: 'Pressão de projeto', obrigatoria: false },
  { nome: 'temperatura', descricao: 'Temperatura de projeto', obrigatoria: false },
  { nome: 'codigo_projeto', descricao: 'Código de projeto (ex.: ASME VIII Div.1)', obrigatoria: false },
  { nome: 'observacoes', descricao: 'Texto livre — vira a descrição', obrigatoria: false },
];

const FORMATOS: { icone: 'planilha' | 'planilha-nuvem' | 'planilha-calc' | 'planilha-csv'; cor: string; rotulo: string }[] = [
  { icone: 'planilha', cor: '#1D7044', rotulo: 'Excel (.xlsx, .xls)' },
  { icone: 'planilha-nuvem', cor: '#1FA971', rotulo: 'Google Planilhas (exportar .xlsx)' },
  { icone: 'planilha-calc', cor: '#457DC1', rotulo: 'LibreOffice Calc (.ods)' },
  { icone: 'planilha-csv', cor: '#7A8790', rotulo: 'CSV (.csv)' },
];

function ListaProblemas({ titulo, itens }: { titulo: string; itens: LinhaProblema[] }) {
  if (itens.length === 0) return null;
  return (
    <>
      <p className="imp-lista-titulo">{titulo}</p>
      <div className="imp-lista">
        <ul>
          {itens.map((p) => (
            <li key={`${p.linha}-${p.tag}`}>
              <span className="imp-lista-linha">Linha {p.linha}</span>
              <span className="imp-lista-tag">{p.tag}</span>
              <span className="imp-lista-motivo">{p.motivo}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Ilustração da planilha esperada (SVG inline, desenhado à mão). */
function IlustracaoPlanilha() {
  const colunas = ['tag', 'tipo', 'fabricante', 'ano'];
  const exemplo = ['V-101', 'vaso', 'Metalúrgica…', '2018'];
  const larguras = [62, 52, 96, 44];
  const x0 = 14;
  const xs: number[] = [];
  let acc = x0;
  for (const w of larguras) {
    xs.push(acc);
    acc += w;
  }
  const larguraTotal = acc - x0;

  return (
    <div className="imp-ilustra">
      <svg viewBox="0 0 300 176" role="img" aria-label="Exemplo de planilha com cabeçalho e uma linha preenchida">
        {/* folha */}
        <rect x="4" y="8" width="292" height="160" rx="8" fill="#FFFFFF" stroke="#E4E1D8" strokeWidth="1.5" />
        {/* régua de colunas A, B, C… */}
        {xs.map((x, i) => (
          <g key={`reg-${colunas[i]}`}>
            <rect x={x} y={22} width={larguras[i]} height={16} fill="#F2EFE7" stroke="#E4E1D8" strokeWidth="1" />
            <text x={x + larguras[i] / 2} y={33} textAnchor="middle" fontSize="9" fill="#7A8790" fontFamily="IBM Plex Mono, monospace">
              {String.fromCharCode(65 + i)}
            </text>
          </g>
        ))}
        {/* linha de cabeçalho esperada */}
        {xs.map((x, i) => (
          <g key={`cab-${colunas[i]}`}>
            <rect x={x} y={38} width={larguras[i]} height={24} fill="#FFF1E6" stroke="#FF7A1A" strokeWidth="1.2" />
            <text x={x + 6} y={54} fontSize="9.5" fill="#D9640C" fontFamily="IBM Plex Mono, monospace" fontWeight="700">
              {colunas[i]}
            </text>
          </g>
        ))}
        {/* linha de exemplo */}
        {xs.map((x, i) => (
          <g key={`ex-${colunas[i]}`}>
            <rect x={x} y={62} width={larguras[i]} height={24} fill="#FFFFFF" stroke="#E4E1D8" strokeWidth="1" />
            <text x={x + 6} y={78} fontSize="9.5" fill="#2D3339" fontFamily="IBM Plex Mono, monospace">
              {exemplo[i]}
            </text>
          </g>
        ))}
        {/* linhas vazias */}
        {[86, 110].map((y) =>
          xs.map((x, i) => (
            <rect key={`v-${y}-${colunas[i]}`} x={x} y={y} width={larguras[i]} height={24} fill="#FBFAF7" stroke="#E4E1D8" strokeWidth="1" />
          )),
        )}
        {/* reticências indicando continuação das colunas */}
        <text x={x0 + larguraTotal + 10} y={54} fontSize="12" fill="#7A8790">…</text>
        {/* chamada do cabeçalho */}
        <text x={x0} y={150} fontSize="9.5" fill="#7A8790" fontFamily="IBM Plex Sans, sans-serif">
          Linha 1 = cabeçalho · linha 2 em diante = equipamentos
        </text>
        <path d={`M${x0 + 4} 144 L${x0 + 4} 62`} stroke="#FF7A1A" strokeWidth="1" strokeDasharray="3 3" fill="none" />
      </svg>
      <p className="imp-ilustra-legenda">
        A ordem das colunas não importa. Acentos, maiúsculas e espaços nos títulos são normalizados —
        “Nº Série”, “numero serie” e “numero_serie” contam como a mesma coluna.
      </p>
    </div>
  );
}

export default function ModalImportarPlanilha({ arquivoInicial, onClose, onImportado }: Props) {
  const [fase, setFase] = useState<Fase>('intro');
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [analise, setAnalise] = useState<AnalisePlanilha | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, tag: '' });
  const [criados, setCriados] = useState<string[]>([]);
  const [falhas, setFalhas] = useState<LinhaProblema[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const iniciadoRef = useRef(false);

  const processar = useCallback(async (arquivo: File) => {
    setErro(null);
    setNomeArquivo(arquivo.name);
    if (!extensaoAceita(arquivo.name)) {
      setErro('Formato não suportado. Envie um arquivo .xlsx, .xls, .ods ou .csv.');
      setFase('intro');
      return;
    }
    setFase('analisando');
    try {
      const resultado = await analisarPlanilha(arquivo);
      setAnalise(resultado);
      setFase('revisao');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler a planilha.');
      setFase('intro');
    }
  }, []);

  // Arquivo vindo do drag-and-drop sobre a lista: analisa assim que o modal monta.
  useEffect(() => {
    if (!arquivoInicial || iniciadoRef.current) return;
    iniciadoRef.current = true;
    // setState acontece dentro de processar(), de forma assíncrona.
    void processar(arquivoInicial);
  }, [arquivoInicial, processar]);

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (arquivo) void processar(arquivo);
  }

  function aoSoltar(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(false);
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) void processar(arquivo);
  }

  async function confirmarImportacao() {
    if (!analise) return;
    setFase('importando');
    setProgresso({ feitos: 0, total: analise.validas.length, tag: analise.validas[0]?.tag ?? '' });
    const resultado = await importarLinhas(analise.validas, (feitos, total, tag) => {
      setProgresso({ feitos, total, tag });
    });
    setCriados(resultado.criados);
    setFalhas(resultado.falhas);
    setFase('concluido');
  }

  function fechar() {
    if (criados.length > 0) onImportado();
    else onClose();
  }

  const pct = progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0;
  const ocupado = fase === 'analisando' || fase === 'importando';

  return (
    <div className="modal-overlay" onClick={ocupado ? undefined : fechar}>
      <div className="modal-content imp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Importar equipamentos por planilha</h3>
          {!ocupado && (
            <button type="button" className="btn-close-modal" onClick={fechar} aria-label="Fechar">
              ×
            </button>
          )}
        </div>

        <div className="modal-body">
          {/* ─────────── instruções ─────────── */}
          {(fase === 'intro' || fase === 'analisando') && (
            <div className="imp-body">
              <div className="imp-col">
                <p className="imp-intro">
                  Envie uma planilha com um equipamento por linha. O sistema valida tudo antes de
                  gravar e mostra um relatório com o que entrou e o que ficou de fora.
                  <strong> Equipamentos já cadastrados nunca são sobrescritos.</strong>
                </p>

                <h4>Colunas</h4>
                <table className="imp-tabela">
                  <thead>
                    <tr>
                      <th>Coluna</th>
                      <th>Conteúdo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DESCRICAO_COLUNAS.map((c) => (
                      <tr key={c.nome} className={c.obrigatoria ? 'imp-obrig' : undefined}>
                        <td className="imp-col-nome">
                          {c.nome}
                          {c.obrigatoria ? ' *' : ''}
                        </td>
                        <td>{c.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="imp-legenda">
                  * Colunas obrigatórias (destacadas). As demais são opcionais e podem faltar.
                </p>

                <h4>Formatos aceitos</h4>
                <div className="imp-formatos">
                  {FORMATOS.map((f) => (
                    <span className="imp-formato" key={f.rotulo}>
                      <Icone nome={f.icone} tam={18} style={{ color: f.cor }} />
                      {f.rotulo}
                    </span>
                  ))}
                </div>
              </div>

              <div className="imp-col">
                <IlustracaoPlanilha />

                <div
                  className={`imp-drop${arrastando ? ' is-over' : ''}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={aoSoltar}
                >
                  {fase === 'analisando' ? (
                    <>
                      <span className="spinner" />
                      <div className="imp-drop-titulo">Lendo {nomeArquivo}…</div>
                    </>
                  ) : (
                    <>
                      <Icone nome="upload" tam={22} style={{ margin: '0 auto', color: 'var(--amber-deep)' }} />
                      <div className="imp-drop-titulo">Arraste a planilha aqui</div>
                      <div className="imp-drop-sub">ou clique para escolher um arquivo</div>
                    </>
                  )}
                </div>
                <input
                  ref={inputRef}
                  className="imp-input-file"
                  type="file"
                  accept=".xlsx,.xls,.ods,.csv"
                  onChange={aoEscolherArquivo}
                />
              </div>
            </div>
          )}

          {/* ─────────── revisão ─────────── */}
          {fase === 'revisao' && analise && (
            <>
              <div className="imp-arquivo">
                <Icone nome="planilha" tam={18} style={{ color: '#1D7044' }} />
                <span className="imp-arquivo-nome">{nomeArquivo}</span>
                <span style={{ color: 'var(--muted)' }}>· {analise.totalLinhas} linha(s) lida(s)</span>
              </div>

              {analise.colunasObrigatoriasFaltando.length > 0 && (
                <div className="imp-aviso">
                  Colunas obrigatórias ausentes: {analise.colunasObrigatoriasFaltando.join(', ')}. As
                  linhas afetadas foram rejeitadas ou ficarão com esses campos vazios.
                </div>
              )}

              <div className="imp-resumo">
                <div className="imp-chip imp-chip-ok">
                  <strong>{analise.validas.length}</strong>
                  <span>prontos para criar</span>
                </div>
                <div className="imp-chip imp-chip-warn">
                  <strong>{analise.duplicadas.length}</strong>
                  <span>TAG duplicada</span>
                </div>
                <div className="imp-chip imp-chip-erro">
                  <strong>{analise.rejeitadas.length}</strong>
                  <span>rejeitados</span>
                </div>
              </div>

              <ListaProblemas titulo="Pulados por TAG duplicada" itens={analise.duplicadas} />
              <ListaProblemas titulo="Rejeitados" itens={analise.rejeitadas} />

              {analise.validas.length === 0 && (
                <p className="erro-form">Nenhuma linha válida para importar.</p>
              )}
            </>
          )}

          {/* ─────────── importando ─────────── */}
          {fase === 'importando' && (
            <div className="imp-progresso">
              <div className="imp-progresso-trilho">
                <div className="imp-progresso-barra" style={{ width: `${pct}%` }} />
              </div>
              <div className="imp-progresso-txt">
                <span>
                  criando {Math.min(progresso.feitos + 1, progresso.total)} de {progresso.total}
                  {progresso.tag && (
                    <>
                      {' — '}
                      <span className="imp-progresso-tag">{progresso.tag}</span>
                    </>
                  )}
                </span>
                <span>{pct}%</span>
              </div>
            </div>
          )}

          {/* ─────────── concluído ─────────── */}
          {fase === 'concluido' && analise && (
            <>
              <div className="imp-resumo">
                <div className="imp-chip imp-chip-ok">
                  <strong>{criados.length}</strong>
                  <span>criados</span>
                </div>
                <div className="imp-chip imp-chip-warn">
                  <strong>{analise.duplicadas.length}</strong>
                  <span>pulados (TAG duplicada)</span>
                </div>
                <div className="imp-chip imp-chip-erro">
                  <strong>{analise.rejeitadas.length + falhas.length}</strong>
                  <span>rejeitados</span>
                </div>
              </div>

              <ListaProblemas titulo="Pulados por TAG duplicada" itens={analise.duplicadas} />
              <ListaProblemas titulo="Rejeitados" itens={[...analise.rejeitadas, ...falhas]} />
            </>
          )}

          {erro && <p className="erro-form">{erro}</p>}

          <div className="modal-actions">
            {(fase === 'intro' || fase === 'analisando') && (
              <button type="button" className="btn-secundario imp-btn-modelo" onClick={baixarModeloPlanilha}>
                <Icone nome="download" tam={14} /> Baixar modelo
              </button>
            )}
            {fase === 'revisao' && (
              <button type="button" className="btn-secundario" onClick={() => setFase('intro')}>
                Escolher outro arquivo
              </button>
            )}
            {fase !== 'importando' && fase !== 'concluido' && (
              <button type="button" className="btn-secundario" onClick={fechar} disabled={ocupado}>
                Cancelar
              </button>
            )}
            {fase === 'revisao' && (
              <button
                type="button"
                className="btn-primario"
                onClick={confirmarImportacao}
                disabled={!analise || analise.validas.length === 0}
              >
                Importar {analise?.validas.length ?? 0} equipamento(s)
              </button>
            )}
            {fase === 'concluido' && (
              <button type="button" className="btn-primario" onClick={fechar}>
                Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
