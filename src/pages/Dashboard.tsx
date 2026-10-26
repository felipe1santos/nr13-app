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
  const tabela = listaExpandida ? filtrados : filtrados.slice(0, 6);
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

  /** "Ver todos os vencidos": a lista já está nesta tela — filtra e rola até ela. */
  function verVencidos() {
    setFiltroPrazo('vencidos');
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
    <div className="dash-page painel-compacto">
      {/* ===== KPIs: um dominante + quatro secundários numa faixa ===== */}
      <div className="pc-kpis">
        <section className={`pc-kpi-dom pc-${tomDominante}`} aria-labelledby="pc-kpi-dom-rot">
          <div className="pc-kpi-rot" id="pc-kpi-dom-rot">
            <Icone nome={tomDominante === 'ok' ? 'checkcircle' : tomDominante === 'crit' ? 'alerttri' : 'cloudoff'} tam={14} />
            Vencidos
          </div>
          <div className="pc-kpi-val">{textoContador(nVencidos)}</div>
          <div className="pc-kpi-txt">
            {nVencidos === undefined ? (
              'Sem resposta do servidor — o número não pôde ser conferido.'
            ) : nVencidos === 0 ? (
              'Nenhum prazo vencido entre inspeções, calibrações e certificados.'
            ) : primeiroVencido ? (
              /* "1 equipamento vencido" era mentira desde que a lista passou a
                 agregar certificados de padrão (07/09/2026): o texto nomeia a
                 CATEGORIA do primeiro item, como o banner fazia. */
              <>
                {vencidos.length === 1
                  ? `1 ${ROTULO_ORIGEM[primeiroVencido.origem].toLowerCase()} vencid${primeiroVencido.origem === 'inspecao' ? 'a' : 'o'}: `
                  : 'O mais antigo: '}
                <b className="mono">{primeiroVencido.tag}</b> · {primeiroVencido.tipoEquip}
                {primeiroVencido.pertenceA ? ` · pertence a ${primeiroVencido.pertenceA}` : ''} ·{' '}
                {textoPrazo(primeiroVencido).toLowerCase()}
              </>
            ) : (
              'Requer ação imediata.'
            )}
          </div>
          {primeiroVencido && (nVencidos ?? 0) > 0 && (
            <div className="pc-kpi-acoes">
              <button type="button" className="pc-link" onClick={() => irParaItem(primeiroVencido)}>
                {primeiroVencido.origem === 'certificado' ? 'Ver certificados' : 'Ver equipamento'}
                <Icone nome="arrowright" tam={13} />
              </button>
              {(nVencidos ?? 0) > 1 && (
                <button type="button" className="pc-link" onClick={verVencidos}>
                  Ver os {nVencidos} vencidos
                </button>
              )}
            </div>
          )}
        </section>

        <section className="pc-kpi-sec" aria-label="Indicadores">
          <div>
            <div className="pc-kpi-rot">Equipamentos cadastrados</div>
            <div className="pc-kpi-val">{textoContador(kpis.total)}</div>
            <div className="pc-kpi-txt">ativos sob NR-13</div>
          </div>
          <div>
            <div className="pc-kpi-rot">A vencer em 30 dias</div>
            <div className="pc-kpi-val">{textoContador(kpis.aVencer30)}</div>
            {/* A janela de 30 dias conta TAMBÉM os certificados dos padrões
                (07/09/2026). Dizer só "inspeções e calibrações" descreveria um
                número que já não é esse. */}
            <div className="pc-kpi-txt">inspeções, calibrações e certificados</div>
          </div>
          <div>
            <div className="pc-kpi-rot">Taxa de conformidade</div>
            {/* Conformidade indefinida = o painel não pôde ser lido. Mostrar
                100 % aqui seria a mentira mais cara desta tela. */}
            <div className="pc-kpi-val">
              {kpis.conformidade === undefined ? '—' : kpis.conformidade.toLocaleString('pt-BR')}
              <span className="pc-kpi-unid">%</span>
            </div>
            {/* O texto diz o ESCOPO da métrica: ela mede os itens COM PRAZO
                deste painel, não a conformidade normativa da planta. */}
            <div className="pc-kpi-txt">
              {kpis.conformidade === undefined ? 'sem resposta do servidor' : 'dos prazos deste painel em dia'}
            </div>
          </div>
          <div>
            <div className="pc-kpi-rot">Serviços no mês</div>
            <div className="pc-kpi-val">{resumoAgenda.quantidade}</div>
            <div className="pc-kpi-txt">
              previsto {formatarBRL(resumoAgenda.previsto)} · realizado {formatarBRL(resumoAgenda.realizado)}
            </div>
          </div>
        </section>
      </div>
      {/* O selo de procedência fica DEPOIS dos indicadores, numa linha fina:
          diz a hora do agregado, o truncamento e a falha. */}
      <SeloPainel painel={painel} />

      <div className="dash-cols">
        <div className="dash-col">
          {/* O card "Minha Empresa" saiu daqui em 12/08/2026: virou o item "Meus dados"
              do menu, apontando para a MESMA tela /minha-empresa. */}
          <section className="fj-panel pc-painel" ref={painelPrazos} aria-labelledby="pc-prazos-tit">
            <div className="pc-painel-hd">
              {/* O título não diz "Equipamentos" desde 07/09/2026: a lista
                  agrega inspeção do equipamento, calibração do acessório e
                  certificado do padrão de bancada. */}
              <h2 id="pc-prazos-tit">Prazos e vencimentos</h2>
              <div className="pc-seg" role="group" aria-label="Janela de prazo">
                {FILTROS_PRAZO.map(([valor, rotulo]) => (
                  <button
                    key={String(valor)}
                    type="button"
                    aria-pressed={filtroPrazo === valor}
                    onClick={() => setFiltroPrazo(valor)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            {/* ESTADO VAZIO SÓ DEPOIS DE CONFERIR (§21 da rodada, 07/09/2026).
                "Nenhum prazo cadastrado" é uma AFIRMAÇÃO sobre a organização, e
                foi ela que escondeu o certificado do usuário. Enquanto a consulta
                não voltou inteira — carregando, com erro, ou com os certificados
                não conferidos — a tela diz o que não sabe, e nunca "não há". */}
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
                Nenhum item {filtroPrazo === 'vencidos' ? 'vencido' : `vencido ou vencendo em até ${filtroPrazo} dias`}.
              </div>
            ) : (
              <div className="fj-table-wrap">
                <table className="fj-table">
                  <thead>
                    {/* col-ultima: escondida neste painel de meia largura (ver
                        dashboard-novo.css). Continua na tela cheia de /vencimentos. */}
                    <tr><th>Tag</th><th>Origem</th><th className="col-ultima">Última</th><th>Vencimento</th><th>Prazo</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {/* Certificado de padrão não tem ficha de equipamento: a
                        linha leva para Certificados, que é onde ele se resolve.
                        Ver `irParaItem`. */}
                    {tabela.map((it, i) => (
                      <tr
                        key={`${it.tag}${i}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          it.origem === 'certificado'
                            ? navigate('/certificados')
                            : setModalTag(it.pertenceA ?? it.tag)
                        }
                      >
                        {/* data-rot: rótulo de cada campo quando a tabela vira cartão no
                            celular (forja.css) — sem cabeçalho, três datas seguidas não
                            dizem qual é a última inspeção e qual é o vencimento. */}
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
                        {/* `folgado`: mais de 60 dias até vencer — sem mudar o
                            cálculo de status, que vem do motor de vencimentos. */}
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
            {filtrados.length > 6 && (
              <div className="fj-panel-foot">
                <button type="button" className="fj-link" onClick={() => setListaExpandida((v) => !v)}>
                  {listaExpandida ? 'Recolher lista' : `Ver todos os vencimentos (${filtrados.length})`}
                  <Icone nome={listaExpandida ? 'chevup' : 'chevdown'} tam={13} />
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="dash-col">
          <section className="fj-panel pc-painel" aria-labelledby="pc-agenda-tit">
            <div className="pc-painel-hd">
              <h2 id="pc-agenda-tit">Próximos serviços</h2>
              <button type="button" className="pc-link" onClick={() => navigate('/agenda')}>
                Abrir agenda <Icone nome="arrowright" tam={13} />
              </button>
            </div>
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
          </section>
        </div>
      </div>

      {modalTag && (
        <ModalDetalheEquipamento tag={modalTag} itens={itens} onClose={() => setModalTag(null)} />
      )}
    </div>
  );
}
