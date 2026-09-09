import { useMemo, useState } from 'react';
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

function BadgeStatus({ status }: { status: ItemVencimento['status'] }) {
  if (status === 'crit') return <span className="fj-badge crit">Crítico</span>;
  if (status === 'warn') return <span className="fj-badge warn">Atenção</span>;
  if (status === 'ok') return <span className="fj-badge ok">Operacional</span>;
  return <span className="fj-badge neutro">Sem prazo</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [alertaDispensado, setAlertaDispensado] = useState(
    () => sessionStorage.getItem('nr13_alerta_dispensado') === '1',
  );
  const [listaExpandida, setListaExpandida] = useState(false);
  const [modalTag, setModalTag] = useState<string | null>(null);
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>(FILTRO_PRAZO_PADRAO);

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

  function dispensarAlerta() {
    sessionStorage.setItem('nr13_alerta_dispensado', '1');
    setAlertaDispensado(true);
  }

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

  return (
    <div className="dash-page">
      {/* ===== BANNER CRÍTICO ===== */}
      {primeiroVencido && !alertaDispensado && (
        <div className="alert-banner">
          <div className="alert-ic-wrap">
            <Icone nome="alerttri" tam={20} style={{ stroke: '#fff' }} />
            <span className="pulse-dot" />
          </div>
          <div className="alert-body">
            {/* "1 equipamento vencido" era mentira desde que a lista passou a
                agregar certificados de padrão (07/09/2026): o primeiro
                vencido desta conta é um certificado de PSV padrão, que não é
                equipamento nenhum. O texto agora nomeia a categoria do item
                que está no banner. */}
            <div className="alert-title">
              {vencidos.length === 1
                ? `1 ${ROTULO_ORIGEM[primeiroVencido.origem].toLowerCase()} vencid${primeiroVencido.origem === 'inspecao' ? 'a' : 'o'} requer atenção imediata`
                : `${vencidos.length} itens vencidos requerem atenção imediata`}
            </div>
            <div className="alert-sub">
              <b>{primeiroVencido.tag}</b> · {primeiroVencido.tipoEquip}
              {primeiroVencido.pertenceA ? ` · pertence a ${primeiroVencido.pertenceA}` : ''} ·{' '}
              {textoPrazo(primeiroVencido).toLowerCase()}
            </div>
          </div>
          <div className="alert-actions">
            <button type="button" className="btn-alert" onClick={() => irParaItem(primeiroVencido)}>
              {primeiroVencido.origem === 'certificado' ? 'Ver certificados' : 'Ver equipamento'}{' '}
              <Icone nome="arrowright" tam={13} />
            </button>
            <button type="button" className="btn-alert-ghost" title="Dispensar" onClick={dispensarAlerta}>
              <Icone nome="x" tam={15} />
            </button>
          </div>
        </div>
      )}

      {/* ===== KPIs =====
           Compactos desde 07/09/2026: o pedido do dono era ganhar altura acima
           da dobra sem perder informação. O que saiu foi ESPAÇO (padding,
           respiros, a pílula do rodapé), não conteúdo — rótulo, número e
           legenda continuam os quatro. O filete colorido à esquerda substitui
           a cor de fundo: dá identidade a cada card sem pintar a tela. */}
      <div className="fj-kpi-row">
        <div className="fj-kpi k-azul">
          <div>
            <div className="fj-kpi-label">Equipamentos cadastrados</div>
            <div className="fj-kpi-value">{textoContador(kpis.total)}</div>
            <div className="fj-kpi-delta flat">ativos sob NR-13</div>
          </div>
          <div className="fj-kpi-icon">
            <Icone nome="box" tam={17} />
          </div>
        </div>
        <div className="fj-kpi k-ambar">
          <div>
            <div className="fj-kpi-label">Próximos a vencer <span className="mono" style={{ fontSize: 10 }}>(30d)</span></div>
            <div className="fj-kpi-value">{textoContador(kpis.aVencer30)}</div>
            {/* A legenda mudou junto com a regra: a janela de 30 dias passou a
                contar TAMBÉM os certificados dos padrões (07/09/2026). Dizer só
                "inspeções e calibrações" descreveria um número que já não é
                esse. */}
            <div className="fj-kpi-delta flat">inspeções, calibrações e certificados</div>
          </div>
          <div className="fj-kpi-icon">
            <Icone nome="calendar" tam={17} />
          </div>
        </div>
        <div className="fj-kpi k-vermelho">
          <div>
            <div className="fj-kpi-label">Vencidos</div>
            <div className="fj-kpi-value">{textoContador(kpis.vencidos)}</div>
            <div className={`fj-kpi-delta ${(kpis.vencidos ?? 0) > 0 ? 'down' : 'up'}`}>
              {/* Contador INDEFINIDO é "o servidor não respondeu", não zero. O
                  `?? 0` daqui fazia o número exibir "—" e a legenda logo abaixo
                  afirmar "nenhum vencido" — a única frase da tela que não se
                  pode dizer sem ter contado. Visto no gate offline da 9F.5. */}
              {kpis.vencidos === undefined
                ? 'sem resposta do servidor'
                : kpis.vencidos > 0
                  ? 'ação imediata'
                  : 'nenhum vencido'}
            </div>
          </div>
          <div className="fj-kpi-icon">
            <Icone nome="alerttri" tam={17} />
          </div>
        </div>
        <div className="fj-kpi k-verde">
          <div>
            <div className="fj-kpi-label">Taxa de conformidade</div>
            {/* Conformidade indefinida = o painel não pôde ser lido. Mostrar
                100 % aqui seria a mentira mais cara desta tela. */}
            <div className="fj-kpi-value">
              {kpis.conformidade === undefined ? '—' : kpis.conformidade.toLocaleString('pt-BR')}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>%</span>
            </div>
            {/* O texto diz o ESCOPO da métrica (§13 da rodada): ela mede os
                itens COM PRAZO deste painel — inspeções, calibrações e
                certificados —, não a conformidade normativa da planta. */}
            <div className={`fj-kpi-delta ${(kpis.conformidade ?? 0) >= 90 ? 'up' : 'down'}`}>
              <Icone nome="trendup" tam={11} />{' '}
              {kpis.conformidade === undefined ? 'sem resposta do servidor' : 'dos prazos deste painel em dia'}
            </div>
          </div>
          <div className="fj-kpi-icon">
            <Icone nome="checkcircle" tam={17} />
          </div>
        </div>
      </div>
      {/* O selo de procedência desceu para DEPOIS dos indicadores e virou uma
          linha fina: no topo ele criava uma faixa vazia entre o cabeçalho da
          página e os cards. Continua dizendo a hora do agregado, o
          truncamento e a falha — só não ocupa mais uma faixa inteira. */}
      <SeloPainel painel={painel} />

      {/* ===== COLUNAS (mockup): esquerda = Minha Empresa + Prazos; direita = Agenda + Alertas.
           Cada coluna empilha seus painéis de forma independente — sem buraco quando o
           calendário é mais alto que o card da empresa. ===== */}
      <div className="dash-cols">
        <div className="dash-col">
        {/* O card "Minha Empresa" saiu daqui em 12/08/2026: virou o item "Meus dados"
            do menu, acima do Dashboard, apontando para a MESMA tela /minha-empresa.
            Nada de dado mudou de lugar — só a porta de entrada. */}
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              {/* O título deixou de dizer "Equipamentos" em 07/09/2026: a lista
                  agrega inspeção do equipamento, calibração do acessório e
                  certificado do padrão de bancada — e certificado de padrão
                  não é equipamento nenhum. */}
              <div className="fj-eyebrow">Prazos</div>
              <h2>Prazos e vencimentos</h2>
            </div>
            {(kpis.vencidos ?? 0) > 0 && <span className="fj-badge crit">{kpis.vencidos} vencido{(kpis.vencidos ?? 0) > 1 ? 's' : ''}</span>}
          </div>
          <div className="prazo-filtros">
            {FILTROS_PRAZO.map(([valor, rotulo]) => (
              <button
                key={String(valor)}
                type="button"
                className={`prazo-chip${filtroPrazo === valor ? ' ativo' : ''}${valor === 'vencidos' ? ' venc' : ''}`}
                onClick={() => setFiltroPrazo(valor)}
              >
                {rotulo}
              </button>
            ))}
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
                      {/* `folgado`: mais de 60 dias até vencer. Selo azul, para o olho
                          separar o que está tranquilo do que pede agenda — sem mudar o
                          cálculo de status, que continua vindo do motor de vencimentos. */}
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
          <div className="fj-panel-foot">
            <button type="button" className="fj-link" onClick={() => setListaExpandida((v) => !v)}>
              {listaExpandida ? 'Recolher lista' : `Ver todos os vencimentos (${filtrados.length})`}
              <Icone nome={listaExpandida ? 'chevup' : 'chevdown'} tam={13} />
            </button>
          </div>
        </div>
        </div>

        <div className="dash-col">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Agenda</div>
              <h2>Serviços do mês</h2>
            </div>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => navigate('/agenda')}>
              <Icone nome="calendar" tam={14} /> Abrir Agenda
            </button>
          </div>
          <div className="ag-resumo">
            <div className="ag-resumo-linhas">
              <div className="ag-resumo-item previsto">
                <div className="ag-resumo-rot">Previsto</div>
                <div className="ag-resumo-num">{formatarBRL(resumoAgenda.previsto)}</div>
              </div>
              <div className="ag-resumo-item realizado">
                <div className="ag-resumo-rot">Realizado</div>
                <div className="ag-resumo-num">{formatarBRL(resumoAgenda.realizado)}</div>
              </div>
              <div className="ag-resumo-item">
                <div className="ag-resumo-rot">Serviços</div>
                <div className="ag-resumo-num">{resumoAgenda.quantidade}</div>
              </div>
            </div>
            <div className="ag-resumo-proximos">
              {proximosServicos.length === 0 ? (
                <div className="agenda-vazia" style={{ padding: '6px 0' }}>
                  Nada agendado daqui para frente.
                </div>
              ) : (
                proximosServicos.map((n) => (
                  <div key={n.id} className="ag-resumo-proximo">
                    <span className="data">{dataDeISO(n.data).toLocaleDateString('pt-BR')}</span>
                    <span className="titulo">{n.titulo}</span>
                    <span className="fj-badge info2">{ROTULO_TIPO_NOTA[n.tipo]}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {modalTag && (
        <ModalDetalheEquipamento tag={modalTag} itens={itens} onClose={() => setModalTag(null)} />
      )}
    </div>
  );
}
