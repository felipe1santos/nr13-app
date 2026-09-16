import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CalculoSalvo, CategoriaSalva, FotoEquipamento, InfoEquipamento } from '../features/equipamento/tipos';
import { carregarInfo, carregarUnidade } from '../features/equipamento/equipamentoService';
import { TelaAbertura } from '../features/equipamento/PortaEquipamento';
import { useAberturaEquipamento } from '../features/equipamento/usarAberturaEquipamento';
import { excluirVaso, ler } from '../services/storage';
import DadosEquipamento from '../features/equipamento/DadosEquipamento';
import DadosEmpresa from '../features/equipamento/DadosEmpresa';
import FotoIdentificacao from '../features/equipamento/FotoIdentificacao';
import CategoriaNR13 from '../features/categoria/CategoriaNR13';
import BadgeTipoEquipamento from '../features/equipamento/BadgeTipoEquipamento';
import VidaRemanescente from '../features/equipamento/VidaRemanescente';
import PressoesDocumentacao from '../features/equipamento/PressoesDocumentacao';
import ProntuarioFabricante from '../features/equipamento/ProntuarioFabricante';
import { formatarValor, rotuloSistemaCompleto } from '../calc/unidades';
import type { SistemaUnidade } from '../calc/unidades';
import MemorialLog from '../features/memorial/MemorialLog';
import { Icone } from '../components/Icone';
import './equipamento-page.css';
import FotoImg from '../components/FotoImg';
import { rotaMemorial } from '../app/rotas';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/**
 * A PORTA DE ENTRADA DA FICHA (16/09/2026).
 *
 * Aqui não se navega para lugar nenhum. O componente antigo fazia
 * `if (!info) navigate('/equipamentos')` num efeito: com o boot leve (9G.3) o
 * cache nasce SEM nenhuma `nr13_info_`, então todo clique num cartão abria a
 * ficha e voltava para a lista — o "piscou e voltou". O cache virou atalho, e
 * quem resolve a ficha é `abrirFicha` (ver `aberturaFicha.ts`).
 *
 * Os quatro estados são desenhados, e nenhum deles é um redirecionamento:
 * carregando, encontrado, ausente e indisponível. Redirecionar em silêncio é o
 * que fazia o usuário achar que o clique não funcionou.
 */
export default function Equipamento() {
  const { tag = '' } = useParams<{ tag: string }>();
  // key={tag}: trocar de equipamento REMONTA a porta, e o estado abaixo nasce
  // do cache daquela TAG. Sem isso, a ficha anterior ficaria na tela enquanto a
  // nova carrega — e pior, um `setState` dentro do efeito para consertar isso.
  return <PortaFicha key={tag} tag={tag} />;
}

function PortaFicha({ tag }: { tag: string }) {
  // A porta é a MESMA do Memorial (`PortaEquipamento.tsx`): a lógica de
  // resolver a TAG e os estados desenhados moram num lugar só.
  const { abertura, tentarDeNovo } = useAberturaEquipamento(tag);

  if (abertura.estado !== 'encontrado') {
    return (
      <TelaAbertura
        abertura={abertura}
        tag={tag}
        onTentar={tentarDeNovo}
        classeDaPagina="equipamento-page"
      />
    );
  }

  // A TAG RESOLVIDA, não a da URL: `abrirFicha` pode ter casado pela forma
  // normalizada, e as chaves da ficha se montam com a chave real.
  return <EquipamentoView key={abertura.tag} tag={abertura.tag} />;
}

function EquipamentoView({ tag }: { tag: string }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<InfoEquipamento | null>(() => carregarInfo(tag));
  // A unidade do EQUIPAMENTO, escolhida na CRIAÇÃO e nunca mais trocada
  // (16/09/2026). Havia aqui uma "pré-visualização" com select e um botão
  // "Salvar" que regravava `nr13_pref_unidade_<TAG>` — o único caminho de UI
  // que alterava a unidade depois de criado o equipamento, e com ele a unidade
  // em que a ficha RECEBE pressões e o relatório SAI. Sem prévia, existe uma
  // unidade só: a gravada.
  const unidade: SistemaUnidade = carregarUnidade(tag);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [modalMemorial, setModalMemorial] = useState(false);
  const [calculo, setCalculo] = useState<CalculoSalvo | null>(() => ler<CalculoSalvo>(`nr13_calc_${tag}`));
  // GV do autoclave: memorial salvo à parte (nr13_calc_gv_<TAG>) — exibido junto no modal.
  const [calculoGv, setCalculoGv] = useState<CalculoSalvo | null>(() => ler<CalculoSalvo>(`nr13_calc_gv_${tag}`));
  const categoria = ler<CategoriaSalva>(`nr13_cat_${tag}`);
  const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
  const fotoCapa = fotos.find((f) => f.isCapa) || fotos[0] || null;

  useEffect(() => {
    function atualizarCalculo() {
      setCalculo(ler<CalculoSalvo>(`nr13_calc_${tag}`));
      setCalculoGv(ler<CalculoSalvo>(`nr13_calc_gv_${tag}`));
    }
    window.addEventListener('focus', atualizarCalculo);
    return () => window.removeEventListener('focus', atualizarCalculo);
  }, [tag]);

  function abrirMemorialCompleto() {
    setModalMemorial(true);
  }

  // O confirm NATIVO do navegador saiu daqui (14/08/2026): era a única
  // confirmação do sistema fora do padrão `fj-modal-*`, e um diálogo modal do
  // navegador congela a página inteira enquanto está aberto. Excluir equipamento
  // é irreversível, então vai de modal — não de confirmação inline, que é o
  // padrão para itens de lista (funcionários, clientes).
  async function excluirEquipamento() {
    setConfirmandoExclusao(false);
    setExcluindo(true);
    try {
      await excluirVaso(tag);
      navigate('/equipamentos');
    } finally {
      setExcluindo(false);
    }
  }

  // Guarda defensiva: quem monta esta view é a porta de entrada acima, que só o
  // faz com a ficha já no cache. Sem navegação — a ficha não devolve ninguém
  // para a lista por causa de cache.
  if (!info) return <p>Carregando…</p>;

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
            {/* INFORMAÇÃO, não controle (16/09/2026): nem select, nem select
                desabilitado, nem botão. A unidade se escolhe no cadastro. */}
            <div className="unidade-equip-box">
              <span className="unidade-equip-rotulo">Unidade de medida</span>
              <span className="unidade-equip-valor">{rotuloSistemaCompleto(unidade)}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-excluir-equip"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={excluindo}
          >
            <Icone nome="trash" tam={13} /> {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>

          {confirmandoExclusao && (
            <div
              className="fj-modal-overlay"
              onClick={(e) => e.target === e.currentTarget && setConfirmandoExclusao(false)}
            >
              <div className="fj-modal-box" style={{ maxWidth: 460 }}>
                <div className="fj-modal-head">
                  <div>
                    <div className="fj-eyebrow">Excluir equipamento</div>
                    <h2>{tag}</h2>
                  </div>
                  <button
                    type="button"
                    className="fj-modal-close"
                    onClick={() => setConfirmandoExclusao(false)}
                    aria-label="Fechar"
                  >
                    <Icone nome="x" tam={15} />
                  </button>
                </div>
                <div style={{ padding: '4px 16px 16px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 14 }}>
                    Isso apaga a ficha, o memorial, as inspeções, os relatórios e os prontuários
                    deste equipamento. <b>Não é possível desfazer.</b>
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted, #555)' }}>
                    O Livro de Registro de Segurança permanece arquivado no servidor — registro
                    emitido não pode ser apagado.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => setConfirmandoExclusao(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-excluir-equip"
                      onClick={() => void excluirEquipamento()}
                      disabled={excluindo}
                    >
                      {excluindo ? 'Excluindo...' : 'Excluir equipamento'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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

          <FotoIdentificacao tag={tag} />
        </div>

        <div className="equipamento-foto-principal">
          {fotoCapa ? (
            <FotoImg foto={{ ref: fotoCapa.ref, base64: fotoCapa.src }} alt={`Foto de ${tag}`} />
          ) : (
            <div className="equipamento-foto-vazia">Sem Foto</div>
          )}
        </div>
      </div>

      <section className="equipamento-secao">
        {/* Categoria de risco recebe a unidade GRAVADA do equipamento (regra NR-13:
            o enquadramento exige a base de unidade própria). Desde 16/09/2026 não
            existe mais prévia de unidade na ficha — a gravada é a única. */}
        <CategoriaNR13 tag={tag} unidade={unidade} />
      </section>

      <section className="equipamento-secao">
        <div className="bloco-dados bloco-memorial-resumo">
          <h3>Memorial de Cálculo</h3>
          <div className="memorial-body">
            <Link to={rotaMemorial(tag)} className="btn-mem-edit">
              <span className="btn-mem-edit-icone">
                <Icone nome="sigma" tam={24} />
              </span>
              <span className="txt">Editar Memorial<br />de Cálculo</span>
              <span className="sub">Abrir calculadora</span>
            </Link>

            <div className="mem-stats-wrap">
              <div className="memorial-resumo-grid">
            <div className="resultado-item">
              <span className="lbl-view">PMTA Calculada</span>
              <span className="val-view accent" style={{ fontSize: 16 }}>
                {pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">{info.tipo === 'caldeira' ? 'PTH (1,5×PMTA)' : 'PTH (1,3×PMTA)'}</span>
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

              {calculo?.memorialHTML || calculoGv?.memorialHTML ? (
                <button type="button" className="btn-ver-memorial" onClick={abrirMemorialCompleto}>
                  Ver Memorial Completo →
                </button>
              ) : (
                <span className="btn-ver-memorial" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                  Ver Memorial Completo →
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="equipamento-secao">
        {/* Pressões adotadas da documentação — logo abaixo do card Memorial. Exibe/edita na
            unidade do equipamento; grava em MPa dentro de nr13_info_<TAG>. Este bloco
            RECEBE o número que o engenheiro digita e o converte para MPa antes de
            gravar — por isso a unidade de ENTRADA tem de ser a gravada do
            equipamento, a mesma que a Categoria NR-13 recebe na linha acima. */}
        <PressoesDocumentacao tag={tag} info={info} unidade={unidade} onSalvo={setInfo} />
      </section>

      <section className="equipamento-secao">
        <VidaRemanescente tag={tag} info={info} />
      </section>

      <section className="equipamento-secao">
        {/* PDF do prontuário original do fabricante (nr13_pront_fab_<TAG>) */}
        <ProntuarioFabricante tag={tag} />
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

      {modalMemorial && (calculo || calculoGv) && (
        <div className="modal-memorial-overlay" onClick={() => setModalMemorial(false)}>
          <div className="modal-memorial-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-memorial-header">
              <span>Memorial de Cálculo — TAG: {tag}</span>
              <button type="button" className="modal-memorial-fechar" onClick={() => setModalMemorial(false)}>
                ✕
              </button>
            </div>
            <div className="modal-memorial-corpo">
              {(() => {
                // Corpo principal + GV do autoclave (quando salvo) — o GV entra logo abaixo,
                // com um banner separador, igual à ordem das folhas MEMORIAL do relatório.
                const logGv = calculoGv?.logCalculo ?? [];
                const logCombinado = [
                  ...(calculo?.logCalculo ?? []),
                  ...(logGv.length > 0
                    ? [
                        '// ====================================================',
                        '// MEMORIAL DE CÁLCULO: GERADOR DE VAPOR (GV)',
                        '// ====================================================',
                        ...logGv,
                      ]
                    : []),
                ];
                return logCombinado.length > 0 ? (
                  <MemorialLog log={logCombinado} />
                ) : (
                  <div className="modal-memorial-sem-log">
                    Recalcule o memorial para exibir as expressões algébricas.
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
