import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CalculoSalvo, CategoriaSalva, FotoEquipamento, InfoEquipamento } from '../features/equipamento/tipos';
import { carregarInfo, carregarUnidade, salvarUnidade } from '../features/equipamento/equipamentoService';
import { excluirVaso, ler } from '../services/storage';
import SeletorUnidade from '../features/equipamento/SeletorUnidade';
import DadosEquipamento from '../features/equipamento/DadosEquipamento';
import DadosEmpresa from '../features/equipamento/DadosEmpresa';
import Galeria from '../features/equipamento/Galeria';
import CategoriaNR13 from '../features/categoria/CategoriaNR13';
import BadgeTipoEquipamento from '../features/equipamento/BadgeTipoEquipamento';
import ArquivosInspecao from '../features/inspecoes/ArquivosInspecao';
import { formatarValor } from '../calc/unidades';
import type { SistemaUnidade } from '../calc/unidades';
import MemorialLog from '../features/memorial/MemorialLog';
import './equipamento-page.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

export default function Equipamento() {
  const { tag = '' } = useParams<{ tag: string }>();
  // key={tag} força remontar tudo ao trocar de equipamento, então o estado abaixo
  // pode usar inicialização lazy em vez de useEffect+setState.
  return <EquipamentoView key={tag} tag={tag} />;
}

function EquipamentoView({ tag }: { tag: string }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<InfoEquipamento | null>(() => carregarInfo(tag));
  // `unidade` = unidade em PRÉ-VISUALIZAÇÃO (converte toda a ficha ao vivo).
  // `unidadeSalva` = unidade fixada/persistida. Só persiste ao clicar em "Salvar".
  const [unidade, setUnidade] = useState<SistemaUnidade>(() => carregarUnidade(tag));
  const [unidadeSalva, setUnidadeSalva] = useState<SistemaUnidade>(() => carregarUnidade(tag));
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  const [unidadeToast, setUnidadeToast] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [modalMemorial, setModalMemorial] = useState(false);
  const [calculo, setCalculo] = useState<CalculoSalvo | null>(() => ler<CalculoSalvo>(`nr13_calc_${tag}`));
  const categoria = ler<CategoriaSalva>(`nr13_cat_${tag}`);
  const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
  const fotoCapa = fotos.find((f) => f.isCapa) || fotos[0] || null;

  useEffect(() => {
    if (!info) navigate('/dashboard');
  }, [info, navigate]);

  useEffect(() => {
    function atualizarCalculo() {
      setCalculo(ler<CalculoSalvo>(`nr13_calc_${tag}`));
    }
    window.addEventListener('focus', atualizarCalculo);
    return () => window.removeEventListener('focus', atualizarCalculo);
  }, [tag]);

  // Trocar a unidade só pré-visualiza (converte toda a ficha ao vivo). Não persiste até "Salvar".
  function trocarUnidade(u: SistemaUnidade) {
    setUnidade(u);
  }

  async function salvarUnidadeSelecionada() {
    setSalvandoUnidade(true);
    try {
      await salvarUnidade(tag, unidade);
      setUnidadeSalva(unidade);
      setUnidadeToast(true);
      window.setTimeout(() => setUnidadeToast(false), 1800);
    } finally {
      setSalvandoUnidade(false);
    }
  }

  async function excluirEquipamento() {
    if (!window.confirm(`Excluir o equipamento ${tag}? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await excluirVaso(tag);
      navigate('/dashboard');
    } finally {
      setExcluindo(false);
    }
  }

  if (!info) return <p>Carregando...</p>;

  const pmtaMpaRaw = calculo ? parseFloat(calculo.pmta) : NaN;
  const pmtaMpa = Number.isFinite(pmtaMpaRaw) ? pmtaMpaRaw : null;
  const rotuloTipo = ROTULO_TIPO[info.tipo] + (info.subtipo && info.subtipo !== 'flamotubular' ? ` (${info.subtipo})` : '');

  return (
    <div className="equipamento-page">
      <div className="bloco-dados equipamento-header-card">
        <div className="equipamento-header-info">
          <div className="equipamento-header-topo">
            <div className="equipamento-tag-linha">
              <h1 className="equipamento-tag-titulo">
                TAG: <span>{tag}</span>
              </h1>
              <BadgeTipoEquipamento tipo={info.tipo} label={rotuloTipo} />
            </div>
            <div className="seletor-unidade-box">
              <label>Unidade de Medida:</label>
              <SeletorUnidade unidade={unidade} onChange={trocarUnidade} />
              {unidade !== unidadeSalva && (
                <button
                  type="button"
                  className={`btn-primario btn-salvar-unidade ${salvandoUnidade ? 'is-loading' : ''}`}
                  onClick={salvarUnidadeSelecionada}
                  disabled={salvandoUnidade}
                >
                  {salvandoUnidade ? 'Salvando...' : '💾 Salvar'}
                </button>
              )}
              {unidadeToast && <span className="unidade-salva-ok">✓ Unidade fixada</span>}
            </div>
          </div>

          <button type="button" className="btn-excluir-equip" onClick={excluirEquipamento} disabled={excluindo}>
            🗑 {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>

          <div className="equipamento-quick-grid">
            <div className="quick-item">
              <span className="quick-label">Tipo</span>
              <span className="quick-valor">{ROTULO_TIPO[info.tipo]}</span>
            </div>
            <div className="quick-item">
              <span className="quick-label">Fabricante</span>
              <span className="quick-valor">{info.fabricante || '—'}</span>
            </div>
            <div className="quick-item">
              <span className="quick-label">Categoria</span>
              <span className="quick-valor">{categoria?.catFinal ?? '—'}</span>
            </div>
            <div className="quick-item">
              <span className="quick-label">Volume</span>
              <span className="quick-valor">{categoria ? `${categoria.volInput} m³` : '—'}</span>
            </div>
            <div className="quick-item">
              <span className="quick-label">PMTA</span>
              <span className="quick-valor">{pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}</span>
            </div>
          </div>

          <Galeria tag={tag} />
        </div>

        <div className="equipamento-foto-principal">
          {fotoCapa ? (
            <img src={fotoCapa.src} alt={`Foto de ${tag}`} />
          ) : (
            <div className="equipamento-foto-vazia">Sem Foto</div>
          )}
        </div>
      </div>

      <section className="equipamento-secao">
        {/* Categoria de risco NUNCA segue o preview de unidade — usa a unidade fixada (regra NR-13:
            o enquadramento exige a base de unidade própria). */}
        <CategoriaNR13 tag={tag} unidade={unidadeSalva} />
      </section>

      <section className="equipamento-secao">
        <ArquivosInspecao tag={tag} />
      </section>

      <section className="equipamento-secao">
        <div className="bloco-dados bloco-memorial-resumo">
          <h3>Memorial de Cálculo</h3>
          <Link to={`/equipamento/${tag}/memorial`} className="btn-secundario-claro">
            Editar Memorial de Cálculo
          </Link>

          <div className="memorial-resumo-grid">
            <div className="resultado-item">
              <span className="lbl-view">PMTA Final</span>
              <span className="val-view accent" style={{ fontSize: 16 }}>
                {pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">PTH (1,3×PMTA)</span>
              <span className="val-view">
                {calculo?.pth ? formatarValor(parseFloat(calculo.pth), unidade) : '—'}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Resultado</span>
              <span className={`val-view ${calculo?.resultado === 'REPROVADO' ? 'val-erro' : ''}`}>
                {calculo?.resultado ?? '—'}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Volume</span>
              <span className="val-view">{categoria ? `${categoria.volInput} m³` : '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Esp. Mín. Casco</span>
              <span className="val-view">{calculo?.ecasco ? `${calculo.ecasco} mm` : '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Esp. Mín. Tampo</span>
              <span className="val-view">{calculo?.etampo ? `${calculo.etampo} mm` : '—'}</span>
            </div>
          </div>

          {calculo?.memorialHTML ? (
            <button type="button" className="btn-ver-memorial" onClick={() => setModalMemorial(true)}>
              Ver Memorial Completo
            </button>
          ) : (
            <span className="btn-ver-memorial" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              Ver Memorial Completo
            </span>
          )}
        </div>
      </section>

      <section className="equipamento-secao">
        <div className="bloco-dados">
          <h3>Dados do Equipamento e Empresa</h3>
          <div className="bloco-dados-split">
            <DadosEquipamento info={info} onSalvo={setInfo} />
            <DadosEmpresa tag={tag} />
          </div>
        </div>
      </section>

      {modalMemorial && calculo && (
        <div className="modal-memorial-overlay" onClick={() => setModalMemorial(false)}>
          <div className="modal-memorial-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-memorial-header">
              <span>Memorial de Cálculo — TAG: {tag}</span>
              <button type="button" className="modal-memorial-fechar" onClick={() => setModalMemorial(false)}>
                ✕
              </button>
            </div>
            <div className="modal-memorial-corpo">
              {calculo.logCalculo && calculo.logCalculo.length > 0 ? (
                <MemorialLog log={calculo.logCalculo} />
              ) : (
                <div className="modal-memorial-sem-log">
                  Recalcule o memorial para exibir as expressões algébricas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
