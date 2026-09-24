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
import VidaRemanescente from '../features/equipamento/VidaRemanescente';
import PressoesDocumentacao from '../features/equipamento/PressoesDocumentacao';
import ProntuarioDoEquipamento from '../features/prontuarios/ProntuarioDoEquipamento';
import { formatarValor, rotuloSistemaCompleto } from '../calc/unidades';
import type { SistemaUnidade } from '../calc/unidades';
import MemorialLog from '../features/memorial/MemorialLog';
import { Icone } from '../components/Icone';
import './equipamento-page.css';
import FotoImg from '../components/FotoImg';
import { rotaMemorial } from '../app/rotas';
import { assinarDadosAlterados } from '../services/eventos';
import { resumoDaFicha } from '../features/equipamento/resumoFicha';

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
  // Contador de releitura: Categoria e Vida emitem `emitirDadosAlterados`
  // depois de gravar, e o resumo do topo relê as MESMAS chaves no próximo render.
  const [, setReleitura] = useState(0);
  useEffect(() => assinarDadosAlterados(() => setReleitura((n) => n + 1)), []);
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
            <h1 className="equipamento-tag-titulo">
              TAG: <span>{tag}</span>
            </h1>
            <button
              type="button"
              className="btn-excluir-equip"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={excluindo}
            >
              <Icone nome="trash" tam={13} /> {excluindo ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
          {info.descricao?.trim() && <p className="ficha-descricao">{info.descricao}</p>}

          <div className="ficha-chips">
            <span className={`ficha-chip ficha-chip-tipo ficha-chip-tipo-${info.tipo}`}>
              <span className="ficha-chip-rotulo">Tipo</span>
              <span className="ficha-chip-valor">{rotuloTipo}</span>
            </span>
            {/* INFORMAÇÃO, não controle (16/09/2026): nem select, nem select
                desabilitado, nem botão. A unidade se escolhe no cadastro. */}
            <span className="ficha-chip ficha-chip-unidade unidade-equip-box">
              <span className="ficha-chip-rotulo unidade-equip-rotulo">Unidade</span>
              <span className="ficha-chip-valor unidade-equip-valor">{rotuloSistemaCompleto(unidade)}</span>
            </span>
          </div>

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

          {/* RESUMO RÁPIDO — só REPETE o que as seções abaixo já mostram, das
              mesmas chaves (`resumoFicha.ts`). Nenhum cálculo, nenhuma gravação. */}
          <dl className="ficha-resumo" aria-label="Resumo do equipamento">
            {resumoDaFicha({ info, categoria, vida: ler(`nr13_vida_${tag}`), unidade }).map((it) => (
              <div key={it.chave} className={`ficha-resumo-item ficha-resumo-${it.chave}`}>
                <dt>{it.rotulo}</dt>
                <dd>{it.valor}</dd>
              </div>
            ))}
          </dl>

          {/* Rodapé do card: foto de identificação + o PRONTUÁRIO NR-13 vigente
              (um slot só — gerado ou anexado, a mesma fonte de /prontuarios). */}
          <div className="ficha-topo-rodape">
            <FotoIdentificacao tag={tag} />
            <ProntuarioDoEquipamento tag={tag} descricao={info?.descricao} />
          </div>
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
          <div className="bloco-header-acoes">
            <h3>Memorial de Cálculo</h3>
            <span className="ficha-natureza ficha-natureza-calculado" title="Resultado do cálculo técnico">
              Calculado
            </span>
          </div>
          <div className="memorial-body">
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

              {/* Hierarquia (Fase 4): com memorial salvo, ABRIR é a ação comum e
                  ganha o destaque; editar o cálculo fica discreto. Sem memorial, a
                  única ação possível é calcular — e ela vira a principal. O
                  fluxo não mudou: o mesmo modal e a mesma rota. */}
              <div className="ficha-memorial-acoes">
                {calculo?.memorialHTML || calculoGv?.memorialHTML ? (
                  <>
                    <button type="button" className="btn-ver-memorial" onClick={abrirMemorialCompleto}>
                      <Icone nome="filetext" tam={14} /> Ver Memorial Salvo
                    </button>
                    <Link to={rotaMemorial(tag)} className="btn-mem-edit">
                      <Icone nome="sigma" tam={13} /> Editar Memorial
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="ficha-memorial-vazio">Nenhum memorial salvo ainda.</span>
                    <Link to={rotaMemorial(tag)} className="btn-mem-edit btn-mem-edit-principal">
                      <Icone nome="sigma" tam={13} /> Calcular Memorial
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="equipamento-secao" data-secao="pressoes">
        {/* Pressões adotadas da documentação — logo abaixo do card Memorial. Exibe/edita na
            unidade do equipamento; grava em MPa dentro de nr13_info_<TAG>. Este bloco
            RECEBE o número que o engenheiro digita e o converte para MPa antes de
            gravar — por isso a unidade de ENTRADA tem de ser a gravada do
            equipamento, a mesma que a Categoria NR-13 recebe na linha acima. */}
        <PressoesDocumentacao tag={tag} info={info} unidade={unidade} onSalvo={setInfo} />
      </section>

      <section className="equipamento-secao" data-secao="vida">
        <VidaRemanescente tag={tag} info={info} />
      </section>

      {/* Os blocos grandes "Prontuário NR-13" e "Prontuário do Fabricante"
          saíram daqui (24/09/2026): o prontuário vigente mora no card do topo.
          O PDF do fabricante já enviado continua no bucket e na chave — aparece
          no slot como legado, em /prontuarios e no Portal. */}
      <section className="equipamento-secao" data-secao="dados">
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
