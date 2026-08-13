import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CardEquipamento from '../features/equipamento/CardEquipamento';
import ModalCriarEquipamento from '../features/equipamento/ModalCriarEquipamento';
import ModalImportarPlanilha from '../features/equipamento/ModalImportarPlanilha';
import { extensaoAceita } from '../features/equipamento/importarPlanilhaService';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EmpresaEquipamento, EquipamentoResumo } from '../features/equipamento/tipos';
import { ler } from '../services/storage';
import { isTrial } from '../services/auth';
import { MSG_BLOQUEIO_IMPORTACAO } from '../services/trial';
import { emitirAviso } from '../services/eventos';
import { formatarValor } from '../calc/unidades';
import { Icone } from '../components/Icone';
import FotoImg from '../components/FotoImg';
import '../features/equipamento/equipamento.css';
import '../features/equipamento/importar.css';
import './dashboard.css';
/* .lista-cards-horiz / .card-equipamento-horiz / .eq-* — classes globais já usadas em
   Inspeções, Relatórios e Prontuários; o modo lista desta tela reusa as mesmas. */
import './relatorios.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function empresaDe(tag: string): string {
  const emp = ler<EmpresaEquipamento>(`nr13_emp_${tag}`);
  return emp?.razaoSocial || emp?.nomeFantasia || '';
}

function resultadoDe(e: EquipamentoResumo): string {
  if (e.calculo?.resultado === 'APROVADO') return 'Aprovado';
  if (e.calculo?.resultado === 'REPROVADO') return 'Reprovado';
  return 'Pendente';
}

export default function Equipamentos() {
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [arquivoSolto, setArquivoSolto] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erroArrasto, setErroArrasto] = useState<string | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Preferência de visualização é de sessão/tela — não persiste em localStorage de propósito.
  const [visao, setVisao] = useState<'grade' | 'lista'>('grade');
  const [busca, setBusca] = useState('');
  const [fEmpresa, setFEmpresa] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fResultado, setFResultado] = useState('');
  const navigate = useNavigate();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setEquipamentos(await listarEquipamentos());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount padrão (sem lib de cache/query nesta app) — setState ocorre dentro de
    // carregar(), de forma assíncrona, não sincronamente no corpo do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const empresas = useMemo(
    () => [...new Set(equipamentos.map((e) => empresaDe(e.tag)).filter(Boolean))].sort(),
    [equipamentos],
  );
  const categorias = useMemo(
    () => [...new Set(equipamentos.map((e) => e.categoria?.catFinal).filter(Boolean) as string[])].sort(),
    [equipamentos],
  );

  const filtrados = useMemo(
    () =>
      equipamentos.filter((e) => {
        const q = busca.trim().toLowerCase();
        const nome = `${e.tag} ${e.info.descricao ?? ''} ${ROTULO_TIPO[e.info.tipo] ?? ''}`.toLowerCase();
        if (q && !nome.includes(q)) return false;
        if (fEmpresa && empresaDe(e.tag) !== fEmpresa) return false;
        if (fTipo && e.info.tipo !== fTipo) return false;
        if (fCategoria && e.categoria?.catFinal !== fCategoria) return false;
        if (fResultado && resultadoDe(e) !== fResultado) return false;
        return true;
      }),
    [equipamentos, busca, fEmpresa, fTipo, fCategoria, fResultado],
  );

  const temFiltro = busca || fEmpresa || fTipo || fCategoria || fResultado;

  function limparFiltros() {
    setBusca('');
    setFEmpresa('');
    setFTipo('');
    setFCategoria('');
    setFResultado('');
  }

  function handleCriado(tag: string) {
    setModalAberto(false);
    navigate(`/equipamento/${tag}`);
  }

  function abrirImportacao() {
    // Importação em massa é recurso de assinante — trial cadastra manualmente.
    if (isTrial()) {
      emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_IMPORTACAO });
      return;
    }
    setArquivoSolto(null);
    setErroArrasto(null);
    setImportAberto(true);
  }

  function fecharImportacao() {
    setImportAberto(false);
    setArquivoSolto(null);
  }

  async function concluirImportacao() {
    setImportAberto(false);
    setArquivoSolto(null);
    await carregar();
  }

  /* Drag-and-drop real sobre a área da lista (não existia no app até aqui). */
  function aoArrastarSobre(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setArrastando(true);
  }

  function aoSairDoArrasto(e: React.DragEvent) {
    // ignora as transições entre filhos: só sai quando o ponteiro deixa o container
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setArrastando(false);
  }

  function aoSoltar(e: React.DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (isTrial()) {
      setErroArrasto(MSG_BLOQUEIO_IMPORTACAO);
      return;
    }
    const arquivo = e.dataTransfer.files?.[0];
    if (!arquivo) return;
    if (!extensaoAceita(arquivo.name)) {
      setErroArrasto(`"${arquivo.name}" não é uma planilha. Use .xlsx, .xls, .ods ou .csv.`);
      return;
    }
    setErroArrasto(null);
    setArquivoSolto(arquivo);
    setImportAberto(true);
  }

  return (
    <div className="dashboard-page">
      <div className="fj-page-head equip-head">
        <div className="equip-head-esq">
          <div className="sub">
            {equipamentos.length} equipamento{equipamentos.length !== 1 ? 's' : ''} cadastrado{equipamentos.length !== 1 ? 's' : ''}
          </div>
          <div className="equip-visao" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={`equip-visao-btn${visao === 'grade' ? ' ativo' : ''}`}
              onClick={() => setVisao('grade')}
              aria-pressed={visao === 'grade'}
              title="Ver em grade"
            >
              <Icone nome="grid" tam={15} />
            </button>
            <button
              type="button"
              className={`equip-visao-btn${visao === 'lista' ? ' ativo' : ''}`}
              onClick={() => setVisao('lista')}
              aria-pressed={visao === 'lista'}
              title="Ver em lista"
            >
              <Icone nome="filetext" tam={15} />
            </button>
          </div>
        </div>
        <div className="equip-head-acoes">
          <button
            type="button"
            className={`fj-btn fj-btn-ghost${temFiltro ? ' filtro-ativo' : ''}`}
            onClick={() => setFiltrosAbertos((a) => !a)}
          >
            <Icone nome="filter" tam={14} /> Filtrar{temFiltro ? ' •' : ''} <Icone nome={filtrosAbertos ? 'chevup' : 'chevdown'} tam={12} />
          </button>
          {!isTrial() && (
            <button type="button" className="fj-btn fj-btn-ghost" onClick={abrirImportacao}>
              <Icone nome="planilha" tam={14} /> Importar planilha
            </button>
          )}
          <button type="button" className="fj-btn fj-btn-primary" onClick={() => setModalAberto(true)}>
            <Icone nome="plus" tam={14} /> Criar equipamento
          </button>
        </div>
      </div>

      {filtrosAbertos && (
        <div className="fj-toolbar">
          <div className="fj-search-box">
            <Icone nome="search" tam={15} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por tag ou nome do equipamento…"
            />
          </div>
          <select className="fj-fselect" value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)}>
            <option value="">Empresa · Todas</option>
            {empresas.map((emp) => (
              <option key={emp} value={emp}>{emp}</option>
            ))}
          </select>
          <select className="fj-fselect" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Tipo · Todos</option>
            <option value="vaso">Vaso de Pressão</option>
            <option value="caldeira">Caldeira</option>
            <option value="autoclave">Autoclave</option>
          </select>
          <select className="fj-fselect" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
            <option value="">Categoria · Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select className="fj-fselect" value={fResultado} onChange={(e) => setFResultado(e.target.value)}>
            <option value="">Resultado · Todos</option>
            <option>Aprovado</option>
            <option>Reprovado</option>
            <option>Pendente</option>
          </select>
          {temFiltro && (
            <button type="button" className="fj-link" onClick={limparFiltros}>Limpar filtros</button>
          )}
        </div>
      )}

      {!carregando && equipamentos.length > 0 && (
        <div className="equip-result-count">{filtrados.length} de {equipamentos.length} equipamentos</div>
      )}

      {erroArrasto && (
        <p className="erro-form" style={{ marginBottom: 12 }}>{erroArrasto}</p>
      )}

      <div
        className="equip-dropzone"
        onDragOver={aoArrastarSobre}
        onDragEnter={aoArrastarSobre}
        onDragLeave={aoSairDoArrasto}
        onDrop={aoSoltar}
      >
        {arrastando && (
          <div className="equip-drop-overlay">
            <Icone nome="planilha" tam={26} />
            Solte a planilha para importar os equipamentos
          </div>
        )}

        {carregando ? (
          <p style={{ color: 'var(--muted)' }}>Carregando...</p>
        ) : equipamentos.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="box" tam={22} /></div>
            <div className="fj-empty-title">Nenhum equipamento cadastrado ainda</div>
            Clique em "Criar equipamento" para começar — ou arraste uma planilha aqui para importar
            vários de uma vez.
          </div>
        ) : filtrados.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="search" tam={22} /></div>
            <div className="fj-empty-title">Nenhum equipamento encontrado</div>
            Ajuste ou limpe os filtros para ver os equipamentos.
          </div>
        ) : visao === 'lista' ? (
          <div className="lista-cards-horiz equip-lista">
            {filtrados.map((e) => (
              <button
                type="button"
                key={e.tag}
                className="card-equipamento-horiz"
                onClick={() => navigate(`/equipamento/${e.tag}`)}
              >
                <div className="card-eq-img">
                  {e.fotoCapa ? (
                    <FotoImg foto={e.fotoCapa} alt={`Foto do equipamento ${e.tag}`} />
                  ) : (
                    <span className="card-eq-img-vazio">{e.tag.slice(0, 2)}</span>
                  )}
                </div>
                <div className="card-eq-info">
                  <div className="eq-col">
                    <span className="eq-tag">{e.tag}</span>
                    <span className="eq-tipo">{ROTULO_TIPO[e.info.tipo] ?? e.info.tipo}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">Categoria</span>
                    <span className="eq-value">{e.categoria?.catFinal ?? '—'}</span>
                  </div>
                  <div className="eq-col">
                    <span className="eq-label">PMTA</span>
                    <span className="eq-value">
                      {e.calculo ? formatarValor(parseFloat(e.calculo.pmta), e.unidade) : '—'}
                    </span>
                  </div>
                  <div className="eq-col eq-col-empresa">
                    <span className="eq-label">Empresa</span>
                    <span className="eq-value">{empresaDe(e.tag) || '—'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="vasos-grid">
            {filtrados.map((item) => (
              <CardEquipamento key={item.tag} item={item} />
            ))}
          </div>
        )}
      </div>

      {modalAberto && <ModalCriarEquipamento onClose={() => setModalAberto(false)} onCriado={handleCriado} />}
      {importAberto && (
        <ModalImportarPlanilha
          arquivoInicial={arquivoSolto}
          onClose={fecharImportacao}
          onImportado={concluirImportacao}
        />
      )}
    </div>
  );
}
