import { useCallback, useEffect, useState } from 'react';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import {
  carregarProntuario,
  excluirProntuario,
  gravarProntuarioAtual,
  salvarProntuario,
} from '../features/prontuarios/prontuarioService';
import type { DimensaoProntuario, ProntuarioDados } from '../features/prontuarios/tipos';
import { PAGINAS_PRONTUARIO } from '../features/prontuarios/tipos';
import { carregarMinhaEmpresa, listarClientes } from '../features/cadastros/cadastroService';
import type { Cliente } from '../features/cadastros/tipos';
import { carregarVaso } from '../features/memorial/vasoMemorialService';
import { carregarDadosCaldeira, carregarDadosAqua, carregarTiposCaldeira } from '../features/memorial/caldeiraMemorialService';
import { carregarDadosAutoclave } from '../features/memorial/autoclaveMemorialService';
import { ler, salvar } from '../services/storage';
import { listarContainers } from '../features/inspecoes/inspecaoService';
import type { ContainerInspecao } from '../features/inspecoes/tipos';
import type { EmpresaEquipamento, CategoriaSalva } from '../features/equipamento/tipos';
import CroquiVaso3D from '../features/prontuarios/CroquiVaso3D';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import '../pages/relatorios.css';
import './prontuarios.css';

type Tela = 'equipamentos' | 'formulario' | 'visualizador';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

function dadosPadrao(tag: string): ProntuarioDados {
  return {
    tag,
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    descricao: '',
    dataFabricacao: '',
    classeFluid: '',
    categoria: '',
    grupoPotencialRisco: '',
    modelo: '',
    caracteristicasFuncionais: '',
    codigoProjeto: '',
    anoEdicao: '',
    pressaoTH: '',
    pressaoMaxOp: '',
    pressaoProjeto: '',
    nroSerie: '',
    pmta: '',
    sobreespessura: '',
    tempProjeto: '',
    tipoTampos: '',
    fundoCorpo: '',
    tampa: '',
    manipulos: '',
    prisioneiros: '',
    aro: '',
    luvConexoes: '',
    dimensoes: [linhaVazia()],
    revisao: '',
    dataRevisao: '',
  };
}

function linhaVazia(): DimensaoProntuario {
  return { modelo: '', diametro: '', altura: '', espCorpo: '', espFundo: '', espTampa: '', volume: '' };
}

// ── Ensaio de espessura: extrai a grade de pontos + mínimos de um container e grava nas chaves
// que as folhas do prontuário leem (nr13_med_grid_<TAG> e nr13_med_esp_<TAG>). ──────────────
type MedidasUS = Record<string, Record<string, string>>;
const ANG_US = ['0', '90', '180', '270'];

function construirGridMinima(medidas: MedidasUS | undefined) {
  const med = medidas ?? {};
  const linha = (id: string) => ANG_US.map((a) => med[id]?.[a] ?? '');
  const grid = {
    ts: [linha('ts')],
    casco: [linha('c1'), linha('c2'), linha('c3'), linha('c4')],
    ti: [linha('ti')],
  };
  const minOf = (rows: string[][]) => {
    let m = Infinity;
    rows.forEach((r) =>
      r.forEach((v) => {
        const n = parseFloat(String(v).replace(',', '.'));
        if (Number.isFinite(n) && n > 0 && n < m) m = n;
      }),
    );
    return m === Infinity ? '' : String(m).replace('.', ',');
  };
  const minima = { sup: minOf(grid.ts), casco: minOf(grid.casco), inf: minOf(grid.ti) };
  return { grid, minima };
}

async function aplicarEnsaioEspessura(tag: string, container: ContainerInspecao | null): Promise<void> {
  const us = (container?.dados?.ultrassom as { medidas?: MedidasUS } | undefined) ?? undefined;
  const { grid, minima } = construirGridMinima(us?.medidas);
  await salvar(`nr13_med_grid_${tag}`, grid);
  await salvar(`nr13_med_esp_${tag}`, minima);
}

function containerTemEspessura(c: ContainerInspecao): boolean {
  return c.ensaios.includes('ultrassom');
}

function rotuloContainer(c: ContainerInspecao): string {
  const preenchido = !!(c.dados?.ultrassom as { medidas?: MedidasUS } | undefined)?.medidas;
  return `Inspeção de ${c.criadoEm}${preenchido ? '' : ' (vazio)'}`;
}

function getLabelsDimensoes(tipo: string, subtipo: string): Record<keyof DimensaoProntuario, string> {
  if (tipo === 'autoclave' && subtipo === 'retangular') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Largura interna (mm)',
      altura: 'Altura interna (mm)',
      espCorpo: 'Esp. Corpo (mm)',
      espFundo: 'Profundidade (mm)',
      espTampa: 'Esp. Porta/Tampa (mm)',
      volume: 'Volume (L)',
    };
  }
  if (tipo === 'autoclave') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Ø Câmara (mm)',
      altura: 'Compr. Câmara (mm)',
      espCorpo: 'Esp. Corpo (mm)',
      espFundo: 'Esp. Fundo (mm)',
      espTampa: 'Esp. Tampa/Porta (mm)',
      volume: 'Volume (L)',
    };
  }
  if (tipo === 'caldeira') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Ø Externo Corpo (mm)',
      altura: 'Comprimento Total (mm)',
      espCorpo: 'Esp. Costado (mm)',
      espFundo: 'Esp. Tampo (mm)',
      espTampa: 'Esp. Espelho (mm)',
      volume: subtipo === 'aquatubular' ? 'Prod. Vapor (kg/h)' : 'Volume d\'água (L)',
    };
  }
  return {
    modelo: 'Modelo / Fabricante',
    diametro: 'Ø Diâm. Interno (mm)',
    altura: 'Alt. Corpo (mm)',
    espCorpo: 'Esp. Chapa Corpo (mm)',
    espFundo: 'Esp. Chapa Fundo (mm)',
    espTampa: 'Esp. Tampa (mm)',
    volume: 'Volume (L)',
  };
}

export default function Prontuarios() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [tag, setTag] = useState('');
  const [dados, setDados] = useState<ProntuarioDados>(dadosPadrao(''));
  const [versao, setVersao] = useState(0);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrarCroqui3D, setMostrarCroqui3D] = useState(false);
  const [tipoEquip, setTipoEquip] = useState('vaso');
  const [subtipoEquip, setSubtipoEquip] = useState('');
  const [visualizandoSemSalvar, setVisualizandoSemSalvar] = useState(false);
  const [containers, setContainers] = useState<ContainerInspecao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [imprimindo, setImprimindo] = useState(false);

  async function prepararEImprimir() {
    setImprimindo(true);
    try {
      await imprimirRelatorio('.prontuario-preview');
    } finally {
      setImprimindo(false);
    }
  }

  // Pré-rasteriza as folhas do prontuário em #print-root assim que o visualizador carrega (e a cada
  // nova versão). Assim o Ctrl+P nativo e o botão imprimem as imagens prontas — 1 folha por A4, sem
  // o navegador quebrar os iframes. Limpa ao sair do visualizador.
  useEffect(() => {
    if (tela !== 'visualizador') return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.prontuario-preview');
    if (!preview) return;
    const iframes = Array.from(preview.querySelectorAll('iframe'));
    const aguardarIframes = Promise.all(
      iframes.map((f) =>
        f.contentDocument && f.contentDocument.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true })),
      ),
    );
    aguardarIframes
      .then(() => new Promise((r) => setTimeout(r, 500))) // deixa imagens/croqui/fontes assentarem
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.prontuario-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [tela, versao]);

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    carregarEquipamentos();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    setClientes(listarClientes());
  }, [carregarEquipamentos]);

  function abrirEquipamento(eq: EquipamentoResumo) {
    const existente = carregarProntuario(eq.tag);
    setTag(eq.tag);
    setTipoEquip(eq.info.tipo);
    setSubtipoEquip(eq.info.subtipo || '');
    setConfirmandoExcluir(false);
    const conts = listarContainers(eq.tag);
    setContainers(conts);

    {
      // O prefill do memorial roda SEMPRE (novo ou existente) para que os campos derivados do
      // memorial/equipamento (materiais, espessuras, pressões, categoria…) sejam puxados mesmo em
      // prontuários antigos salvos com o memorial vazio/quebrado. Edições manuais do usuário são
      // preservadas no merge abaixo (o valor salvo vence; o memorial só preenche o que está vazio).
      const base = dadosPadrao(eq.tag);
      const preenchidos = new Set<string>();
      const dimPreenh = new Set<string>();
      const dimLine = linhaVazia();

      // helpers que marcam campos como auto-preenchidos
      function pb<K extends keyof ProntuarioDados>(k: K, v: ProntuarioDados[K]) {
        if (v != null && v !== '') { base[k] = v; preenchidos.add(k as string); }
      }
      function pd(k: keyof DimensaoProntuario, v: string) {
        if (v !== '') { dimLine[k] = v; dimPreenh.add(k as string); }
      }
      const str = (v: unknown): string => (v != null && v !== '' ? String(v) : '');

      // ─── Equipamento ───
      pb('descricao', eq.info.descricao || ROTULO_TIPO[eq.info.tipo] || '');
      pb('dataFabricacao', eq.info.ano || '');
      pb('nroSerie', eq.info.numeroSerie || eq.info.tag || eq.tag);
      pb('modelo', eq.info.fabricante || '');
      pb('categoria', eq.categoria?.catFinal ?? '');

      // ─── Categoria ───
      const cat = ler<CategoriaSalva>(`nr13_cat_${eq.tag}`);
      if (cat) {
        pb('classeFluid', cat.fluidoInput ? cat.fluidoInput.slice(4) : cat.classe);
        pb('grupoPotencialRisco', String(cat.grupo));
      }

      // ─── Cálculo (PMTA / PTH) ───
      if (eq.calculo) {
        const pmtaNum = parseFloat(eq.calculo.pmta);
        const pthNum = parseFloat(eq.calculo.pth || '0');
        pb('pmta', formatarValor(pmtaNum, eq.unidade));
        pb('pressaoProjeto', formatarValor(pmtaNum, eq.unidade));
        pb('pressaoMaxOp', formatarValor(pmtaNum, eq.unidade));
        if (pthNum > 0) pb('pressaoTH', formatarValor(pthNum, eq.unidade));
      }

      // ─── Minha empresa (emissora) ───
      const minhaEmp = carregarMinhaEmpresa();
      if (minhaEmp.logo) base.logo = minhaEmp.logo;
      pb('minhaEmpresaNome', minhaEmp.razao || minhaEmp.fantasia || '');
      pb('minhaEmpresaCnpj', minhaEmp.cnpj || '');
      pb('minhaEmpresaEndereco', minhaEmp.endereco || '');
      pb('minhaEmpresaCidade', minhaEmp.cidade || '');
      pb('minhaEmpresaEstado', minhaEmp.estado || '');
      pb('minhaEmpresaTelefone', minhaEmp.telefone || '');

      // ─── Dimensão: modelo e volume da categoria ───
      pd('modelo', eq.info.fabricante || '');
      if (cat && cat.volInput > 0) pd('volume', (cat.volInput * 1000).toFixed(0));

      // ─── Dados do memorial por tipo ───
      const ROTULO_TAMPO_VASO: Record<string, string> = {
        eliptico: 'Elíptico 2:1 (UG-32d)',
        toroesferico: 'Torisférico ASME F&D (UG-32e)',
        esferico: 'Hemiesférico (UG-32b)',
        plano: 'Plano Soldado (UG-34)',
        planoAparafusado: 'Plano Aparafusado (UG-34)',
        cone: 'Cônico (UG-32g)',
      };

      if (eq.info.tipo === 'vaso') {
        pb('codigoProjeto', 'ASME Seção VIII Divisão 1');
        pb('anoEdicao', '2021');
        const v = carregarVaso(eq.tag);
        if (v.D) pd('diametro', str(v.D));
        if (v.componentes.length > 0) {
          const casco = v.componentes.find((c) => c.id === 'casco');
          const t1 = v.componentes.find((c) => c.id === 'tampo1');
          const t2 = v.componentes.find((c) => c.id === 'tampo2');
          if (casco) {
            if (casco.dados.t_comercial) pd('espCorpo', str(casco.dados.t_comercial));
            if (casco.dados.ca) pb('sobreespessura', str(casco.dados.ca) + ' mm');
            if (casco.dados.temp) pb('tempProjeto', str(casco.dados.temp) + ' °C');
            if (casco.dados.mat) pb('fundoCorpo', casco.dados.mat);
          }
          if (t1?.dados.t_comercial) pd('espFundo', str(t1.dados.t_comercial));
          if (t2?.dados.t_comercial) pd('espTampa', str(t2.dados.t_comercial));
          const rots = [t1, t2].filter(Boolean).map((c) => ROTULO_TAMPO_VASO[c!.tipo] || c!.tipo);
          if (rots.length) pb('tipoTampos', rots.join(' / '));
          if (t1?.dados.mat) pb('tampa', t1.dados.mat);
        }
      }

      if (eq.info.tipo === 'autoclave') {
        pb('codigoProjeto', 'ASME Seção VIII Divisão 1');
        pb('anoEdicao', '2021');
        if (eq.info.subtipo === 'cilindrica') {
          // O memorial da autoclave cilíndrica é, na prática, o MemorialVaso salvo em ac_corpo —
          // fonte primária. nr13_autoclave_dados_cilindrica só é fallback (pode ser default).
          const v = carregarVaso(eq.tag, 'ac_corpo');
          const dac = carregarDadosAutoclave(eq.tag, 'cilindrica');
          const casco = v.componentes.find((c) => c.id === 'casco');
          const t1 = v.componentes.find((c) => c.id === 'tampo1');
          const t2 = v.componentes.find((c) => c.id === 'tampo2');
          if (v.D) pd('diametro', str(v.D));
          else if (dac.diametro) pd('diametro', str(dac.diametro));
          if (casco?.dados.t_comercial) pd('espCorpo', str(casco.dados.t_comercial));
          else if (dac.espessura) pd('espCorpo', str(dac.espessura));
          if (casco?.dados.ca) pb('sobreespessura', str(casco.dados.ca) + ' mm');
          else if (dac.ca) pb('sobreespessura', str(dac.ca) + ' mm');
          if (casco?.dados.mat) pb('fundoCorpo', casco.dados.mat);
          if (casco?.dados.temp) pb('tempProjeto', str(casco.dados.temp) + ' °C');
          if (t1?.dados.t_comercial) pd('espFundo', str(t1.dados.t_comercial));
          if (t2?.dados.t_comercial) pd('espTampa', str(t2.dados.t_comercial));
          const rots = [t1, t2].filter(Boolean).map((c) => ROTULO_TAMPO_VASO[c!.tipo] || c!.tipo);
          if (rots.length) pb('tipoTampos', rots.join(' / '));
          if (t1?.dados.mat) pb('tampa', t1.dados.mat);
        } else {
          const dac = carregarDadosAutoclave(eq.tag, 'retangular');
          if (dac.espessura) { pd('espCorpo', str(dac.espessura)); pd('espFundo', str(dac.espessura)); pd('espTampa', str(dac.espessura)); }
        }
      }

      if (eq.info.tipo === 'caldeira') {
        pb('codigoProjeto', 'ASME Seção I — Power Boilers');
        pb('anoEdicao', '2021');
        const ROTULO_TAMPO_CALD: Record<string, string> = {
          tampoAbaulado: 'Abaulado (PG-29.1)', tampoElipsoidal: 'Elipsoidal 2:1 (PG-29.7)',
          tampoPlano: 'Plano (PG-31)', espelhoEstaiado: 'Espelho Estaiado (PG-46.1)',
          espelhoNaoEstaiado: 'Espelho Não-Estaiado (PG-31)',
        };
        if (eq.info.subtipo === 'aquatubular') {
          const tubSup = carregarDadosAqua(eq.tag, 'tubulaoSup');
          if (tubSup.diametro_externo) pd('diametro', str(tubSup.diametro_externo));
          if (tubSup.t_comercial) pd('espCorpo', str(tubSup.t_comercial));
          if (tubSup.temperatura) pb('tempProjeto', str(tubSup.temperatura) + ' °C');
          if (tubSup.ca) pb('sobreespessura', str(tubSup.ca) + ' mm');
          const fundoElip = carregarDadosAqua(eq.tag, 'fundoEliptico');
          if (fundoElip.t_comercial) pd('espFundo', str(fundoElip.t_comercial));
          pb('tipoTampos', 'Fundo Elíptico 2:1 / Torisférico ASME F&D');
        } else {
          const tipos = carregarTiposCaldeira(eq.tag);
          const costado = carregarDadosCaldeira(eq.tag, 'costado');
          const tampo = carregarDadosCaldeira(eq.tag, 'tampo');
          const espelho = carregarDadosCaldeira(eq.tag, 'espelho');
          if (costado.diametro_externo) pd('diametro', str(costado.diametro_externo));
          if (costado.t_comercial) pd('espCorpo', str(costado.t_comercial));
          if (costado.temperatura) pb('tempProjeto', str(costado.temperatura) + ' °C');
          if (costado.ca) pb('sobreespessura', str(costado.ca) + ' mm');
          if (tampo.t_comercial) pd('espFundo', str(tampo.t_comercial));
          if (espelho.t_comercial) pd('espTampa', str(espelho.t_comercial));
          pb('tipoTampos', [ROTULO_TAMPO_CALD[tipos.tampo] || tipos.tampo, ROTULO_TAMPO_CALD[tipos.espelho] || tipos.espelho].join(' / '));
        }
      }

      base.dimensoes = [dimLine];

      // ─── Empresa proprietária ───
      const empTag = ler<EmpresaEquipamento>(`nr13_emp_${eq.tag}`);
      if (empTag) {
        if (empTag.clienteId) base.empresaClienteId = empTag.clienteId;
        pb('empresaRazaoSocial', empTag.razaoSocial || '');
        pb('empresaCnpj', empTag.cnpj || '');
        pb('empresaEndereco', empTag.endereco || '');
        pb('empresaCidade', empTag.cidade || empTag.localidade || '');
        pb('empresaEstado', empTag.estado || '');
        pb('empresaTelefone', empTag.telefone || '');
      }

      // Merge gap-fill: parte do memorial (base) e sobrepõe os valores não-vazios já salvos pelo
      // usuário (existente vence). Assim campos vazios recebem o memorial sem apagar edições.
      let finais = base;
      if (existente) {
        finais = { ...base };
        (Object.keys(existente) as (keyof ProntuarioDados)[]).forEach((k) => {
          if (k === 'dimensoes') return;
          const val = existente[k];
          if (val != null && val !== '') (finais as unknown as Record<string, unknown>)[k] = val;
        });
        const dimsTemDado = existente.dimensoes?.some((l) =>
          Object.values(l).some((c) => c !== '' && c != null),
        );
        finais.dimensoes = dimsTemDado ? existente.dimensoes : base.dimensoes;
      }

      setDados(finais);
      setMostrarCroqui3D(false);
      gravarProntuarioAtual(finais);
      // Re-aplica a grade de espessura do ensaio escolhido (ou limpa se nenhum) para os iframes.
      const contSel = finais.containerEnsaioId ? conts.find((c) => c.id === finais.containerEnsaioId) ?? null : null;
      void aplicarEnsaioEspessura(eq.tag, contSel);
      if (existente) {
        setVersao((v) => v + 1);
        setVisualizandoSemSalvar(false);
        setTela('visualizador');
      } else {
        setTela('formulario');
      }
    }
  }

  function set<K extends keyof ProntuarioDados>(campo: K, valor: ProntuarioDados[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function setDim(i: number, campo: keyof DimensaoProntuario, valor: string) {
    setDados((d) => {
      const dims = [...(d.dimensoes ?? [])];
      if (!dims[i]) dims[i] = linhaVazia();
      dims[i] = { ...dims[i], [campo]: valor };
      return { ...d, dimensoes: dims };
    });
  }

  function preencherEmpresaProprietaria(clienteId: string) {
    const c = clientes.find((x) => x.id === clienteId);
    const novo: ProntuarioDados = { ...dados, empresaClienteId: clienteId || undefined };
    if (c) {
      novo.empresaRazaoSocial = c.razaoSocial || c.nomeFantasia || '';
      novo.empresaCnpj = c.cnpj || '';
      novo.empresaEndereco = [c.endereco, c.bairro].filter(Boolean).join(' - ');
      novo.empresaCidade = c.cidade || '';
      novo.empresaEstado = c.estado || '';
      novo.empresaTelefone = c.telefone || '';
    }
    setDados(novo);
    gravarProntuarioAtual(novo);
  }

  function selecionarEnsaio(id: string) {
    set('containerEnsaioId', id || undefined);
    const cont = id ? containers.find((c) => c.id === id) ?? null : null;
    const novo = { ...dados, containerEnsaioId: id || undefined };
    gravarProntuarioAtual(novo);
    void aplicarEnsaioEspessura(tag, cont);
  }

  function visualizar() {
    gravarProntuarioAtual(dados);
    setVersao((v) => v + 1);
    setVisualizandoSemSalvar(true);
    setTela('visualizador');
  }

  async function salvar() {
    setSalvando(true);
    try {
      salvarProntuario(tag, dados);
      gravarProntuarioAtual(dados);
      setVersao((v) => v + 1);
      setVisualizandoSemSalvar(false);
      setTela('visualizador');
    } finally {
      setSalvando(false);
    }
  }

  function handleExcluir() {
    if (!confirmandoExcluir) { setConfirmandoExcluir(true); return; }
    excluirProntuario(tag);
    setConfirmandoExcluir(false);
    setDados(dadosPadrao(tag));
    setTela('formulario');
  }

  // Dimensões do primeiro elemento para croqui 3D
  const dim0 = dados.dimensoes?.[0];
  const croquiD = parseFloat(dim0?.diametro || '0');
  const croquiH = parseFloat(dim0?.altura || '0');

  return (
    <div className="prontuarios-page">
      <h1>Prontuários</h1>

      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <h3>Equipamentos Cadastrados</h3>
          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentos.map((eq) => {
                const temPront = carregarProntuario(eq.tag) !== null;
                return (
                  <button
                    type="button"
                    key={eq.tag}
                    className="card-equipamento-horiz"
                    onClick={() => abrirEquipamento(eq)}
                  >
                    <div className="card-eq-info" style={{ flex: 1 }}>
                      <div className="eq-col">
                        <span className="eq-tag">{eq.tag}</span>
                        <span className="eq-tipo">{ROTULO_TIPO[eq.info.tipo]}</span>
                      </div>
                      <div className="eq-col">
                        <span className="eq-label">Categoria</span>
                        <span className="eq-value">{eq.categoria?.catFinal ?? '—'}</span>
                      </div>
                      <div className="eq-col">
                        <span className="eq-label">PMTA</span>
                        <span className="eq-value">
                          {eq.calculo ? formatarValor(parseFloat(eq.calculo.pmta), eq.unidade) : '—'}
                        </span>
                      </div>
                    </div>
                    <span className={`badge-relatorios ${temPront ? 'tem' : ''}`}>
                      {temPront ? 'Prontuário OK' : 'Sem Prontuário'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tela === 'formulario' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => setTela('equipamentos')}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header" style={{ marginBottom: 16 }}>
            <h3>Novo Prontuário — {tag}</h3>
          </div>

          {/* Empresa Proprietária — editável */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Empresa Proprietária</div>
            <div className="pront-form-grid cols-1">
              <div className="pront-campo">
                <label>Selecionar Empresa Cadastrada (preenche automático)</label>
                {clientes.length > 0 ? (
                  <select
                    value={dados.empresaClienteId ?? ''}
                    onChange={(e) => preencherEmpresaProprietaria(e.target.value)}
                  >
                    <option value="">— Selecione um cliente cadastrado —</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razaoSocial || c.nomeFantasia || c.cnpj || c.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="dashboard-vazio" style={{ margin: 0, fontSize: 13 }}>
                    Nenhum cliente cadastrado. Cadastre em "Clientes" para puxar automaticamente.
                  </p>
                )}
              </div>
            </div>
            <div className="pront-form-grid">
              <div className="pront-campo pront-campo-full">
                <label>Razão Social</label>
                <input value={dados.empresaRazaoSocial ?? ''} onChange={(e) => set('empresaRazaoSocial', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>CNPJ</label>
                <input value={dados.empresaCnpj ?? ''} onChange={(e) => set('empresaCnpj', e.target.value)} />
              </div>
              <div className="pront-campo pront-campo-full">
                <label>Endereço</label>
                <input value={dados.empresaEndereco ?? ''} onChange={(e) => set('empresaEndereco', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Cidade</label>
                <input value={dados.empresaCidade ?? ''} onChange={(e) => set('empresaCidade', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Estado</label>
                <input value={dados.empresaEstado ?? ''} onChange={(e) => set('empresaEstado', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Telefone</label>
                <input value={dados.empresaTelefone ?? ''} onChange={(e) => set('empresaTelefone', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Ensaios / Containers de Inspeção — fonte da medição de espessura */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Ensaios / Containers Salvos</div>
            <div className="pront-form-grid cols-1">
              <div className="pront-campo">
                <label>Medição de Espessura (Ultrassom) — puxar do container de inspeção</label>
                {containers.filter(containerTemEspessura).length > 0 ? (
                  <select
                    value={dados.containerEnsaioId ?? ''}
                    onChange={(e) => selecionarEnsaio(e.target.value)}
                  >
                    <option value="">— Nenhum (não puxar espessura) —</option>
                    {containers.filter(containerTemEspessura).map((c) => (
                      <option key={c.id} value={c.id}>
                        {rotuloContainer(c)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="dashboard-vazio" style={{ margin: 0, fontSize: 13 }}>
                    Nenhum container com Medição de Espessura salvo para este equipamento. Crie a
                    inspeção em "Inspeções" e preencha o Ultrassom.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Identificação */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Identificação do Vaso de Pressão</div>
            <div className="pront-form-grid cols-1">
              <div className="pront-campo">
                <label>Descrição</label>
                <input value={dados.descricao} onChange={(e) => set('descricao', e.target.value)} />
              </div>
            </div>
            <div className="pront-form-grid">
              <div className="pront-campo">
                <label>Data de Fabricação</label>
                <input value={dados.dataFabricacao} onChange={(e) => set('dataFabricacao', e.target.value)} placeholder="DD/MM/AAAA" />
              </div>
              <div className="pront-campo">
                <label>Classe do Fluído</label>
                <input value={dados.classeFluid} onChange={(e) => set('classeFluid', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Categoria do Vaso</label>
                <input value={dados.categoria} onChange={(e) => set('categoria', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Grupo de Potencial de Risco</label>
                <input value={dados.grupoPotencialRisco} onChange={(e) => set('grupoPotencialRisco', e.target.value)} />
              </div>
              <div className="pront-campo pront-campo-full">
                <label>Modelo</label>
                <input value={dados.modelo} onChange={(e) => set('modelo', e.target.value)} />
              </div>
              <div className="pront-campo pront-campo-full">
                <label>Características Funcionais</label>
                <input value={dados.caracteristicasFuncionais} onChange={(e) => set('caracteristicasFuncionais', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Dados do Projeto */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Dados do Projeto</div>
            <div className="pront-form-grid cols-3">
              <div className="pront-campo">
                <label>Código do Projeto</label>
                <input value={dados.codigoProjeto} onChange={(e) => set('codigoProjeto', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Ano de Edição</label>
                <input value={dados.anoEdicao} onChange={(e) => set('anoEdicao', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Pressão de Teste Hidrostático</label>
                <input value={dados.pressaoTH} onChange={(e) => set('pressaoTH', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Pressão Máxima de Operação</label>
                <input value={dados.pressaoMaxOp} onChange={(e) => set('pressaoMaxOp', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Pressão de Projeto (PMTA)</label>
                <input value={dados.pressaoProjeto} onChange={(e) => set('pressaoProjeto', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Nº de Série</label>
                <input value={dados.nroSerie} onChange={(e) => set('nroSerie', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>PMTA</label>
                <input value={dados.pmta} onChange={(e) => set('pmta', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Sobreespessura para Corrosão</label>
                <input value={dados.sobreespessura} onChange={(e) => set('sobreespessura', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Materiais */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Especificações dos Materiais</div>
            <div className="pront-form-grid">
              <div className="pront-campo">
                <label>Temperatura de Projeto</label>
                <input value={dados.tempProjeto} onChange={(e) => set('tempProjeto', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Tipo de Tampos</label>
                <input value={dados.tipoTampos} onChange={(e) => set('tipoTampos', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Fundo / Corpo</label>
                <input value={dados.fundoCorpo} onChange={(e) => set('fundoCorpo', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Tampa</label>
                <input value={dados.tampa} onChange={(e) => set('tampa', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Manípulos de Fechamento</label>
                <input value={dados.manipulos} onChange={(e) => set('manipulos', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Prisioneiros de Fechamento</label>
                <input value={dados.prisioneiros} onChange={(e) => set('prisioneiros', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Aro</label>
                <input value={dados.aro} onChange={(e) => set('aro', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Luvas, Tubos, Conexões</label>
                <input value={dados.luvConexoes} onChange={(e) => set('luvConexoes', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Dimensões + Croqui 3D */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Dimensões e Croqui 3D</div>

            {/* Linha única de dimensões adaptada por tipo de equipamento */}
            {(() => {
              const lbls = getLabelsDimensoes(tipoEquip, subtipoEquip);
              const dim = dados.dimensoes?.[0] ?? linhaVazia();
              const campos = ['modelo', 'diametro', 'altura', 'espCorpo', 'espFundo', 'espTampa', 'volume'] as const;
              return (
                <div className="pront-form-grid pront-dim-linha" style={{ padding: '4px 14px 12px' }}>
                  {campos.map((c) => (
                    <div key={c} className="pront-campo">
                      <label>{lbls[c]}</label>
                      <input value={dim[c]} onChange={(e) => setDim(0, c, e.target.value)} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Croqui 3D */}
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Croqui
                </span>
                {tipoEquip === 'vaso' ? (
                  <button
                    type="button"
                    className="btn-secundario"
                    style={{ fontSize: 12 }}
                    onClick={() => setMostrarCroqui3D((v) => !v)}
                  >
                    {mostrarCroqui3D ? 'Ocultar Gerador 3D' : '⬡ Gerar Croqui 3D'}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    ⬡ Gerador 3D — Em Breve
                  </span>
                )}
                {dados.croqui && !mostrarCroqui3D && (
                  <button type="button" className="btn-remover" style={{ fontSize: 11 }} onClick={() => set('croqui', undefined)}>
                    Remover croqui
                  </button>
                )}
              </div>

              {dados.croqui && !mostrarCroqui3D && (
                <div className="pront-upload-preview">
                  <img src={dados.croqui} alt="Croqui" />
                </div>
              )}

              {tipoEquip === 'vaso' && mostrarCroqui3D && (
                <CroquiVaso3D
                  tipo={tipoEquip}
                  subtipo={subtipoEquip}
                  diametro={croquiD}
                  altura={croquiH}
                  onCaptura={(b64) => {
                    set('croqui', b64);
                    setMostrarCroqui3D(false);
                  }}
                />
              )}
            </div>
          </div>

          {/* Revisão */}
          <div className="pront-form-secao">
            <div className="pront-form-secao-titulo">Revisão</div>
            <div className="pront-form-grid">
              <div className="pront-campo">
                <label>Revisão</label>
                <input value={dados.revisao} onChange={(e) => set('revisao', e.target.value)} />
              </div>
              <div className="pront-campo">
                <label>Data de Revisão</label>
                <input value={dados.dataRevisao} onChange={(e) => set('dataRevisao', e.target.value)} placeholder="DD/MM/AAAA" />
              </div>
            </div>
          </div>

          <div className="pront-acoes-criar">
            <button type="button" className="btn-secundario" onClick={() => setTela('equipamentos')}>
              Cancelar
            </button>
            <button type="button" className="btn-secundario" onClick={visualizar}>
              Pré-visualizar
            </button>
            <button type="button" className={`btn-primario ${salvando ? 'is-loading' : ''}`} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Prontuário'}
            </button>
          </div>
        </div>
      )}

      {tela === 'visualizador' && (
        <>
          <div className="bloco-dados">
            <div className="meta-breadcrumb">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setTela(visualizandoSemSalvar ? 'formulario' : 'equipamentos')}
              >
                {visualizandoSemSalvar ? '← Voltar para Edição' : '← Voltar'}
              </button>
              <strong>{tag}{visualizandoSemSalvar ? ' — Pré-visualização (não salvo)' : ''}</strong>
            </div>
            <div className="meta-card-header">
              <h3>Prontuário — {tag}</h3>
              <div className="pront-visualizador-acoes">
                {visualizandoSemSalvar ? (
                  <button type="button" className={`btn-primario ${salvando ? 'is-loading' : ''}`} onClick={salvar} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar Definitivamente'}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-secundario" onClick={() => setTela('formulario')}>
                      Editar
                    </button>
                    <button type="button" className="btn-secundario" onClick={prepararEImprimir} disabled={imprimindo}>
                      {imprimindo ? 'Preparando…' : 'Imprimir'}
                    </button>
                    {confirmandoExcluir ? (
                      <>
                        <button type="button" className="btn-remover" onClick={handleExcluir}>
                          Confirmar Exclusão
                        </button>
                        <button type="button" className="btn-secundario" onClick={() => setConfirmandoExcluir(false)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn-remover" onClick={handleExcluir}>
                        Excluir Prontuário
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="prontuario-preview">
            {PAGINAS_PRONTUARIO.map((doc, i) => (
              <div key={`${doc}-${i}-${versao}`} className="pagina-relatorio-a4">
                <iframe
                  src={`/arquivos-prontuario/${doc}?tag=${tag}&page=${i + 1}&total=${PAGINAS_PRONTUARIO.length}`}
                  scrolling="no"
                  title={doc}
                  onLoad={(e) => {
                    const ifrDoc = (e.target as HTMLIFrameElement).contentDocument;
                    if (ifrDoc) ifrDoc.designMode = 'on';
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
