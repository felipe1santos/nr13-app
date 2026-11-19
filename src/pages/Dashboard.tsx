import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import ModalDetalheEquipamento from '../components/ModalDetalheEquipamento';
import {
  ROTULO_TIPO_NOTA,
  dataDeISO,
  dataISO,
  listarNotas,
  statusDe,
} from '../features/agenda/notasAgenda';
import { formatarBRL, resumoDoMes } from '../features/agenda/faturamento';
import './agenda.css';
import { FILTROS_PRAZO, FILTRO_PRAZO_PADRAO, noFiltroPrazo, textoPrazo } from '../services/vencimentos';
import type { FiltroPrazo, ItemVencimento } from '../services/vencimentos';
import { usePainelVencimentos, textoContador } from '../services/vencimentosServidor';
import SeloPainel from '../components/SeloPainel';
import { CartaoPortalCliente, CartaoRealizadoMes, CartaoVencimentosMes } from '../features/dashboard/GraficosPainel';
import './dashboard-novo.css';
import { rotaEquipamento } from '../app/rotas';

const ICONE_TIPO: Record<string, Parameters<typeof Icone>[0]['nome']> = {
  'Vaso de Pressão': 'cylinder',
  Caldeira: 'flame',
  Autoclave: 'box',
  'Manômetro': 'manometro',
  'Válvula de Segurança': 'valvula-psv',
  // Os PADRÕES de bancada (07/09/2026). Ícone do instrumento onde ele existe,
  // e o de documento no resto: a linha é sobre o CERTIFICADO dele.
  'Manômetro padrão': 'manometro',
  'Válvula PSV padrão': 'valvula-psv',
  'Bloco padrão de espessura': 'sigma',
  'Pressostato padrão': 'gauge',
  'Termostato padrão': 'gauge',
  'Manovacuômetro padrão': 'manometro',
  'Termômetro padrão': 'gauge',
  'Instrumento padrão': 'filetext',
};

/**
 * A CATEGORIA de cada linha, dita em voz alta (07/09/2026).
 *
 * A lista deixou de ser só de equipamento: um certificado de padrão e a
 * calibração do manômetro instalado no vaso viram linhas vizinhas, com prazos
 * parecidos e nomes parecidos. Sem o rótulo, o usuário não sabe se precisa
 * chamar o laboratório ou parar o equipamento.
 */
const ROTULO_ORIGEM: Record<ItemVencimento['origem'], string> = {
  inspecao: 'Inspeção',
  calibracao: 'Calibração',
  certificado: 'Certificado',
};

/** Abas de origem do quadro de prazos ('' = todas). */
const ORIGENS: ReadonlyArray<readonly ['' | ItemVencimento['origem'], string]> = [
  ['', 'Todos'],
  ['inspecao', 'Inspeções'],
  ['calibracao', 'Calibrações'],
  ['certificado', 'Certificados'],
];
const MESES_DASH = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function ChipOrigem({ origem }: { origem: ItemVencimento['origem'] }) {
  return <span className={`orig-chip orig-${origem}`}>{ROTULO_ORIGEM[origem]}</span>;
}

/** Situação com ÍCONE + TEXTO: a cor sozinha não pode ser o único sinal. */
function BadgeStatus({ status }: { status: ItemVencimento['status'] }) {
  if (status === 'crit') return <span className="fj-badge crit"><Icone nome="alerttri" tam={12} /> Crítico</span>;
  if (status === 'warn') return <span className="fj-badge warn"><Icone nome="clock" tam={12} /> Atenção</span>;
  if (status === 'ok') return <span className="fj-badge ok"><Icone nome="checkcircle" tam={12} /> Operacional</span>;
  return <span className="fj-badge neutro">Sem prazo</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [listaExpandida, setListaExpandida] = useState(false);
  const [modalTag, setModalTag] = useState<string | null>(null);
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>(FILTRO_PRAZO_PADRAO);
  const [origem, setOrigem] = useState<'' | ItemVencimento['origem']>('');
  const painelPrazos = useRef<HTMLElement>(null);

  // Fase 10A · a Agenda saiu do Dashboard e virou tela própria. O que ficou
  // aqui é RESUMO: previsto, realizado, quantidade e os próximos compromissos.
  // As notas são chave essencial do boot leve — não custam requisição nenhuma.
  const notasAgenda = useMemo(() => listarNotas(), []);
  const resumoAgenda = useMemo(() => {
    const agora = new Date();
    return resumoDoMes(notasAgenda, agora.getFullYear(), agora.getMonth());
  }, [notasAgenda]);
  const proximosServicos = useMemo(() => {
    const hojeIso = dataISO(new Date());
    return notasAgenda
      .filter((n) => n.data >= hojeIso && statusDe(n) !== 'cancelado')
      .slice(0, 3);
  }, [notasAgenda]);

  // Recalcula ao montar, ao receber nr13:dados-alterados (mesma aba, ex.: relatório salvo)
  // e sempre que a janela volta ao foco (outra aba/janela).
  //
  // Fase 9 · o painel pode vir do cache local (caminho de sempre) ou do
  // agregado do servidor, sob a flag `boot_v9`. Os KPIs vêm junto porque no
  // caminho do servidor eles são CONTADORES da organização — a lista é
  // truncada, e contar nela mostraria "3 vencidos" numa conta com 300.
  const painel = usePainelVencimentos();
  const itens = painel.itens;
  const kpis = painel.kpis;

  const vencidos = itens.filter((i) => i.status === 'crit');
  const comPrazo = itens.filter((i) => i.status !== 'semPrazo');
  // A consulta só está COMPLETA quando o agregado respondeu e os certificados
  // dos padrões foram conferidos. Enquanto não estiver, a lista não pode
  // afirmar ausência — ver o estado vazio, mais abaixo.
  const consultaIncompleta =
    painel.carregando || painel.erro === true || painel.certificadosOk === false;
  // A regra vive em `vencimentos.ts` (função pura, com teste) — aqui só se
  // aplica. Ela era três ternários dentro do JSX, e por isso nunca teve teste.
  const filtrados = comPrazo.filter((i) => noFiltroPrazo(i, filtroPrazo));
  // Aba de origem: recorte SÓ de exibição sobre a mesma lista já filtrada.
  const porOrigem = origem ? filtrados.filter((i) => i.origem === origem) : filtrados;
  const contarOrigem = (o: '' | ItemVencimento['origem']) => (o ? filtrados.filter((i) => i.origem === o).length : filtrados.length);
  const tabela = listaExpandida ? porOrigem : porOrigem.slice(0, 6);
  const primeiroVencido = vencidos[0];

  /**
   * Onde o usuário resolve ESTE prazo.
   *
   * Certificado de padrão não pertence a equipamento: a "TAG" da linha é o nº
   * do certificado, e mandar isso para `/equipamento/<tag>` abria uma ficha
   * que não existe. Ele se resolve na tela de Certificados.
   */
  function irParaItem(it: ItemVencimento) {
    if (it.origem === 'certificado') {
      navigate('/certificados');
      return;
    }
    navigate(rotaEquipamento(it.pertenceA ?? it.tag));
  }

  /** "Ver" de uma janela de prazo: filtra o quadro e rola até ele. */
  function verJanela(j: FiltroPrazo) {
    setFiltroPrazo(j);
    setOrigem('');
    setListaExpandida(true);
    painelPrazos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Ver todos os vencidos": a lista já está nesta tela — filtra e rola até ela. */
  function verVencidos() {
    setFiltroPrazo('vencidos');
    setOrigem('');
    setListaExpandida(true);
    painelPrazos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // O KPI dominante é o de VENCIDOS (Forja Compacto, 25/10/2026). Ele absorveu
  // o banner vermelho de largura total que vinha acima dos cartões: o mesmo
  // fato — quantos vencidos e qual o primeiro —, sem um bloco de cor chapada.
  // Contador INDEFINIDO é "o servidor não respondeu", não zero (gate offline 9F.5).
  const nVencidos = kpis.vencidos;
  const tomDominante = nVencidos === undefined ? 'neutro' : nVencidos > 0 ? 'crit' : 'ok';

  return (
    <div className="dash-page dash2">
      {/* ===== ABAS (padrão Indicadores do SimplesDental) =====
          Só navegação: cada aba leva à tela que já existe. À direita, a
          procedência do painel (hora do agregado, truncamento, falha). */}
      <nav className="dash2-abas" aria-label="Painéis">
        <button type="button" className="on" aria-current="page">Indicadores</button>
        <button type="button" onClick={() => navigate('/relatorios')}>Relatórios</button>
        <button type="button" onClick={() => navigate('/agenda')}>Agenda</button>
        <button type="button" onClick={() => navigate('/vencimentos')}>Vencimentos</button>
        <span className="grow" />
        <SeloPainel painel={painel} />
      </nav>

      <div className="dash2-corpo">
        {/* ===== TRÊS INDICADORES ===== */}
        <div className="dash2-kpis">
          <section className={`dash2-kpi pc-${tomDominante}`} aria-labelledby="dash2-venc">
            <span className="dash2-kpi-ic crit">
              <Icone nome={tomDominante === 'ok' ? 'checkcircle' : tomDominante === 'crit' ? 'alerttri' : 'cloudoff'} tam={26} />
            </span>
            <div className="dash2-kpi-txt">
              <div className="dash2-kpi-n">
                <b>{textoContador(nVencidos)}</b>
                {(nVencidos ?? 0) > 0 && (
                  <button type="button" className="dash2-ver" onClick={verVencidos}>Ver</button>
                )}
              </div>
              <div className="dash2-kpi-rot" id="dash2-venc">Prazos vencidos</div>
              <div className="dash2-kpi-sub">
                {nVencidos === undefined ? (
                  'Sem resposta do servidor — o número não pôde ser conferido.'
                ) : nVencidos === 0 ? (
                  'Nenhum prazo vencido entre inspeções, calibrações e certificados.'
                ) : primeiroVencido ? (
                  /* O texto nomeia a CATEGORIA do primeiro item: a lista agrega
                     inspeção, calibração e certificado de padrão. */
                  <>
                    {vencidos.length === 1
                      ? `1 ${ROTULO_ORIGEM[primeiroVencido.origem].toLowerCase()} vencid${primeiroVencido.origem === 'inspecao' ? 'a' : 'o'}: `
                      : 'O mais antigo: '}
                    <button type="button" className="dash2-link" onClick={() => irParaItem(primeiroVencido)}>
                      {primeiroVencido.tag}
                    </button>{' '}
                    · {textoPrazo(primeiroVencido).toLowerCase()}
                  </>
                ) : (
                  'Requer ação imediata.'
                )}
              </div>
            </div>
          </section>

          <section className="dash2-kpi" aria-labelledby="dash2-30">
            <span className="dash2-kpi-ic warn"><Icone nome="clock" tam={26} /></span>
            <div className="dash2-kpi-txt">
              <div className="dash2-kpi-n">
                <b>{textoContador(kpis.aVencer30)}</b>
                {kpis.aVencer30 !== undefined && (
                  <button type="button" className="dash2-ver" onClick={() => verJanela(30)}>Ver</button>
                )}
              </div>
              {/* A janela de 30 dias conta TAMBÉM os certificados dos padrões. */}
              <div className="dash2-kpi-rot" id="dash2-30">Vencendo nos próximos 30 dias</div>
              <div className="dash2-kpi-sub">inspeções, calibrações e certificados</div>
            </div>
          </section>

          <section className="dash2-kpi" aria-labelledby="dash2-eq">
            <span className="dash2-kpi-ic info"><Icone nome="box" tam={26} /></span>
            <div className="dash2-kpi-txt">
              <div className="dash2-kpi-n">
                <b>{textoContador(kpis.total)}</b>
                {kpis.total !== undefined && (
                  <button type="button" className="dash2-ver" onClick={() => navigate('/equipamentos')}>Ver</button>
                )}
              </div>
              <div className="dash2-kpi-rot" id="dash2-eq">Equipamentos cadastrados sob NR-13</div>
            </div>
          </section>
        </div>

        {/* ===== PRAZOS E VENCIMENTOS ===== */}
        <section className="fj-panel pc-painel dash2-card" ref={painelPrazos} aria-labelledby="pc-prazos-tit">
          <div className="dash2-card-hd">
            {/* O título não diz "Equipamentos": a lista agrega inspeção do
                equipamento, calibração do acessório e certificado do padrão. */}
            <h2 id="pc-prazos-tit">Prazos e vencimentos</h2>
          </div>
          <div className="dash2-filtro">
            <label>
              Exibindo prazos
              <select
                value={String(filtroPrazo)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFiltroPrazo(v === 'vencidos' ? 'vencidos' : (Number(v) as FiltroPrazo));
                }}
              >
                {FILTROS_PRAZO.map(([valor, rotulo]) => (
                  <option key={String(valor)} value={String(valor)}>
                    {valor === 'vencidos' ? 'só os vencidos' : `vencendo em até ${rotulo}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dash2-origens" role="group" aria-label="Origem do prazo">
            {ORIGENS.map(([valor, rotulo]) => (
              <button key={valor} type="button" aria-pressed={origem === valor} onClick={() => setOrigem(valor)}>
                {rotulo} <span>{contarOrigem(valor)}</span>
              </button>
            ))}
          </div>
          {/* ESTADO VAZIO SÓ DEPOIS DE CONFERIR (§21 da rodada, 07/09/2026).
              "Nenhum prazo cadastrado" é uma AFIRMAÇÃO sobre a organização.
              Enquanto a consulta não voltou inteira, a tela diz o que não sabe. */}
          {consultaIncompleta ? (
            <div className="fj-empty">
              <div className="fj-empty-ic"><Icone nome="cloudoff" tam={22} /></div>
              <div className="fj-empty-title">
                {painel.carregando ? 'Consultando os prazos…' : 'Prazos não conferidos'}
              </div>
              {painel.carregando
                ? 'Um instante — o painel está sendo montado a partir dos dados da organização.'
                : 'O servidor não respondeu por completo. Recarregue a página: nada foi apagado, e esta lista não representa a organização.'}
            </div>
          ) : comPrazo.length === 0 ? (
            <div className="fj-empty">
              <div className="fj-empty-ic"><Icone nome="calendar" tam={22} /></div>
              <div className="fj-empty-title">Nenhum prazo cadastrado</div>
              Calcule a Vida Remanescente na ficha do equipamento, cadastre calibrações ou registre a validade dos certificados dos padrões para acompanhar os vencimentos aqui.
            </div>
          ) : tabela.length === 0 ? (
            <div className="fj-empty">
              <div className="fj-empty-ic"><Icone nome="filter" tam={22} /></div>
              <div className="fj-empty-title">Nada neste filtro</div>
              Nenhum item {filtroPrazo === 'vencidos' ? 'vencido' : `vencido ou vencendo em até ${filtroPrazo} dias`}
              {origem ? ` entre ${ROTULO_ORIGEM[origem].toLowerCase()}s` : ''}.
            </div>
          ) : (
            <div className="fj-table-wrap">
              <table className="fj-table dash2-tabela">
                <thead>
                  <tr><th>Tag</th><th>Origem</th><th className="col-ultima">Última</th><th>Vencimento</th><th>Prazo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {/* Certificado de padrão não tem ficha de equipamento: a linha
                      leva para Certificados, onde ele se resolve. */}
                  {tabela.map((it, i) => (
                    <tr
                      key={`${it.tag}${i}`}
                      className={i % 2 ? 'z' : undefined}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        it.origem === 'certificado'
                          ? navigate('/certificados')
                          : setModalTag(it.pertenceA ?? it.tag)
                      }
                    >
                      <td className="cel-titulo">
                        <div className="fj-tag-cell">
                          <div className="fj-tag-ico"><Icone nome={ICONE_TIPO[it.tipoEquip] ?? 'box'} tam={15} /></div>
                          <div>
                            <div className="fj-tag-code">{it.tag}</div>
                            <div className="fj-eq-name">
                              {it.tipoEquip}
                              {it.pertenceA ? ` · pertence a ${it.pertenceA}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-rot="Origem"><ChipOrigem origem={it.origem} /></td>
                      <td className="mono col-ultima" data-rot="Última">{it.ultima ? it.ultima.toLocaleDateString('pt-BR') : <span className="fj-dash">—</span>}</td>
                      <td className="mono" data-rot="Vencimento">{it.vencimento ? it.vencimento.toLocaleDateString('pt-BR') : <span className="fj-dash">—</span>}</td>
                      <td className={`fj-days ${it.status === 'crit' ? 'crit' : it.status === 'warn' ? 'warn' : ''}`} data-rot="Prazo">
                        <span className={`fj-prazo${(it.dias ?? 0) > 60 ? ' folgado' : ''}`}>{textoPrazo(it)}</span>
                      </td>
                      <td data-rot="Status"><BadgeStatus status={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {porOrigem.length > 6 && (
            <div className="fj-panel-foot">
              <button type="button" className="fj-link" onClick={() => setListaExpandida((v) => !v)}>
                {listaExpandida ? 'Recolher lista' : `Ver todos os vencimentos (${porOrigem.length})`}
                <Icone nome={listaExpandida ? 'chevup' : 'chevdown'} tam={13} />
              </button>
            </div>
          )}
        </section>

        {/* ===== FATURAMENTO DA AGENDA (mês corrente) ===== */}
        <section className="fj-panel dash2-card" aria-labelledby="dash2-fat">
          <div className="dash2-card-hd">
            <h2 id="dash2-fat">Faturamento da agenda</h2>
            <span className="dash2-mes">{MESES_DASH[new Date().getMonth()]} {new Date().getFullYear()}</span>
          </div>
          <div className="dash2-fat">
            <BarraFaturamento
              rotulo="Realizado"
              tom="ok"
              valor={resumoAgenda.realizado}
              total={resumoAgenda.realizado + resumoAgenda.previsto}
              nota={`${resumoAgenda.concluidos} serviço${resumoAgenda.concluidos === 1 ? '' : 's'} concluído${resumoAgenda.concluidos === 1 ? '' : 's'}`}
              extra={`Total do mês: ${formatarBRL(resumoAgenda.realizado + resumoAgenda.previsto)}`}
            />
            <BarraFaturamento
              rotulo="Previsto"
              tom="info"
              valor={resumoAgenda.previsto}
              total={resumoAgenda.realizado + resumoAgenda.previsto}
              nota={`${resumoAgenda.agendados} serviço${resumoAgenda.agendados === 1 ? '' : 's'} agendado${resumoAgenda.agendados === 1 ? '' : 's'}`}
              /* Valor não informado NÃO é zero: sem esta linha, um mês de
                 serviços sem preço passaria por mês sem faturamento. */
              extra={resumoAgenda.semValor > 0 ? `${resumoAgenda.semValor} sem valor informado` : undefined}
            />
            {resumoAgenda.cancelados > 0 && (
              <div className="dash2-fat-canc">
                {resumoAgenda.cancelados} serviço{resumoAgenda.cancelados === 1 ? '' : 's'} cancelado{resumoAgenda.cancelados === 1 ? '' : 's'} · fora das contas
              </div>
            )}
          </div>
        </section>

        {/* ===== OPERAÇÃO ===== */}
        <section className="fj-panel dash2-card" aria-labelledby="dash2-op">
          <div className="dash2-card-hd">
            <h2 id="dash2-op">Operação</h2>
          </div>
          <ul className="dash2-op">
            <li>
              <div><b>{textoContador(kpis.total)}</b><small>Equipamentos cadastrados</small></div>
              <button type="button" className="dash2-ver" onClick={() => navigate('/equipamentos')}>Ver</button>
            </li>
            <li>
              {/* Conformidade indefinida = o painel não pôde ser lido. Mostrar
                  100 % aqui seria a mentira mais cara desta tela. O texto diz o
                  ESCOPO: os itens COM PRAZO deste painel. */}
              <div>
                <b>{kpis.conformidade === undefined ? '—' : `${kpis.conformidade.toLocaleString('pt-BR')}%`}</b>
                <small>{kpis.conformidade === undefined ? 'Taxa de conformidade · sem resposta do servidor' : 'Taxa de conformidade · prazos deste painel em dia'}</small>
              </div>
              <button type="button" className="dash2-ver" onClick={() => navigate('/vencimentos')}>Ver</button>
            </li>
            <li>
              <div><b>{resumoAgenda.quantidade}</b><small>Serviços no mês</small></div>
              <button type="button" className="dash2-ver" onClick={() => navigate('/agenda')}>Ver</button>
            </li>
          </ul>
          <div className="dash2-prox">
            <h3>Próximos serviços</h3>
            {proximosServicos.length === 0 ? (
              <div className="pc-vazio">Nada agendado daqui para frente.</div>
            ) : (
              <ul className="pc-agenda">
                {proximosServicos.map((n) => {
                  const d = dataDeISO(n.data);
                  return (
                    <li key={n.id}>
                      <div className="pc-agenda-dia">
                        <b>{d.getDate()}</b>
                        <small>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small>
                      </div>
                      <div className="pc-agenda-txt">{n.titulo}</div>
                      <span className="fj-badge info2">{ROTULO_TIPO_NOTA[n.tipo]}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Cobalto: os gráficos do protótipo — das MESMAS fontes da tela. */}
        <CartaoRealizadoMes notas={notasAgenda} />
        <CartaoVencimentosMes itens={itens} conformidade={kpis.conformidade} />
        <CartaoPortalCliente />
      </div>

      {modalTag && (
        <ModalDetalheEquipamento tag={modalTag} itens={itens} onClose={() => setModalTag(null)} />
      )}
    </div>
  );
}

/** Uma barra do faturamento: rótulo, valor e a fração do total do mês. */
function BarraFaturamento({
  rotulo,
  tom,
  valor,
  total,
  nota,
  extra,
}: {
  rotulo: string;
  tom: 'ok' | 'info';
  valor: number;
  total: number;
  nota: string;
  extra?: string;
}) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className={`dash2-barra ${tom}`}>
      <div className="dash2-barra-top">
        <span className="rot">{rotulo}</span>
        <span className="nota">{nota}</span>
      </div>
      <b>{formatarBRL(valor)}</b>
      <div className="trilho" role="img" aria-label={`${rotulo}: ${pct}% do total do mês`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {extra && <div className="extra">{extra}</div>}
    </div>
  );
}
