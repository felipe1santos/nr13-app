/**
 * "Classificação NR-13 da caldeira" — substitui, SÓ PARA CALDEIRA, a
 * calculadora de vaso (classe de fluido × P·V → I a V) da ficha (23/11/2026).
 *
 * Linha de montagem do engenheiro: ① VOLUME (corpo + tampo 1 + tampo 2, em m³
 * e em litros, com o resultado ao lado), ② ESPESSURA MENSURADA (máxima e
 * mínima por região, da última medição de espessura — leitura, nunca input),
 * ③ CLASSIFICAÇÃO (a NR-13 se aplica? → categoria A ou B, com o item).
 *
 * Grava só o grupo `volume` da `nr13_ficha_caldeira_<TAG>` (relida antes de
 * mesclar — a seção "Dados da Caldeira" grava a mesma chave). A categoria é
 * derivada na hora: nada vai para `nr13_cat_`.
 */
import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { emitirDadosAlterados } from '../../services/eventos';
import { carregarInfo, salvarInfo } from '../equipamento/equipamentoService';
import type { InfoEquipamento } from '../equipamento/tipos';
import { listarContainers } from '../inspecoes/inspecaoService';
import {
  CAMPOS_VOLUME,
  TIPOS_TAMPO_CALDEIRA,
  ROTULO_BASE,
  classificacaoDaFicha,
  type BasePressao,
  type VolumeParte,
} from './classificacaoCaldeira';
import { carregarDadosCaldeira, comValorCaldeira, salvarDadosCaldeira, valorCaldeira, type DadosCaldeira } from './dadosCaldeira';
import { extremosCaldeira, temMedicaoCaldeira, type MedicaoCaldeira } from './medicaoCaldeira';
import { avaliacaoVinteECincoAnos, prazoMaximoCaldeira } from './prazosCaldeira';
import { ler } from '../../services/storage';
import './classificacaoCaldeira.css';

function lerCalculoPmta(tag: string): string | null {
  try {
    return ler<{ pmta?: string }>(`nr13_calc_${tag}`)?.pmta ?? null;
  } catch {
    return null;
  }
}

const m3 = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
const litros = (n: number | null) =>
  n === null ? '—' : (n * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** A medição de caldeira do container mais recente que tem uma. */
function ultimaMedicao(tag: string): { medicao: MedicaoCaldeira; container: string } | null {
  let lista: ReturnType<typeof listarContainers> = [];
  try {
    lista = listarContainers(tag);
  } catch {
    return null;
  }
  for (let i = lista.length - 1; i >= 0; i--) {
    const us = lista[i].dados?.ultrassom as { caldeira?: MedicaoCaldeira } | undefined;
    if (us?.caldeira && temMedicaoCaldeira(us.caldeira)) return { medicao: us.caldeira, container: lista[i].nome };
  }
  return null;
}

function Origem({ p }: { p: VolumeParte }) {
  if (p.fonte === 'informado') return <small className="cc-origem">informado</small>;
  if (p.fonte === 'calculado') return <small className="cc-origem">calculado</small>;
  return null;
}

export default function SecaoClassificacaoCaldeira({
  tag,
  info,
  onInfo,
}: {
  tag: string;
  info: InfoEquipamento;
  /** A ficha recebe o `nr13_info_` regravado (a escolha da pressão mora nele). */
  onInfo?: (i: InfoEquipamento) => void;
}) {
  const [dados, setDados] = useState<DadosCaldeira>(() => carregarDadosCaldeira(tag));
  const [local, setLocal] = useState<DadosCaldeira>(dados);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const fonte = editando ? local : dados;
  const calc = useMemo(() => lerCalculoPmta(tag), [tag]);
  const { volume, classificacao } = classificacaoDaFicha(fonte, info, calc);
  const [gravandoBase, setGravandoBase] = useState(false);

  // A escolha PMO × PMTA mora no `nr13_info_` (mudar a chave reprojeta o catálogo).
  // Relê antes de gravar: outra seção da ficha pode ter gravado a mesma chave.
  async function escolherBase(base: BasePressao) {
    if (gravandoBase || (info.pressaoClassificacao ?? 'pmo') === base) return;
    setGravandoBase(true);
    try {
      const atual = carregarInfo(tag) ?? info;
      const novo: InfoEquipamento = { ...atual, pressaoClassificacao: base };
      await salvarInfo(novo);
      onInfo?.(novo);
      emitirDadosAlterados();
    } catch (e) {
      setErro(`Não foi possível salvar a escolha da pressão: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGravandoBase(false);
    }
  }
  const medicao = useMemo(() => ultimaMedicao(tag), [tag]);
  const extremos = medicao ? extremosCaldeira(medicao.medicao).filter((e) => e.leituras > 0) : [];

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      // Relê e mescla SÓ o grupo `volume`: "Dados da Caldeira" grava a mesma chave.
      const atual = carregarDadosCaldeira(tag);
      const novo: DadosCaldeira = { ...atual, volume: (local.volume ?? {}) as Record<string, string> };
      await salvarDadosCaldeira(tag, novo);
      setDados(novo);
      setLocal(novo);
      setEditando(false);
      emitirDadosAlterados();
    } catch (e) {
      setErro(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  const campo = (chave: string, rotulo: string, unidade: string) => (
    <label className="cc-campo">
      <span>{rotulo}</span>
      <span className="cc-entrada">
        <input
          inputMode="decimal"
          value={valorCaldeira(local, chave)}
          onChange={(e) => setLocal((l) => comValorCaldeira(l, chave, e.target.value))}
        />
        <em>{unidade}</em>
      </span>
    </label>
  );

  const tampoTipo = (chave: string) => (
    <label className="cc-campo">
      <span>Tipo</span>
      <select value={valorCaldeira(local, chave)} onChange={(e) => setLocal((l) => comValorCaldeira(l, chave, e.target.value))}>
        <option value="">—</option>
        {TIPOS_TAMPO_CALDEIRA.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.rotulo}
          </option>
        ))}
      </select>
    </label>
  );

  const linhaVolume = (rotulo: string, p: VolumeParte) => (
    <tr>
      <th scope="row">{rotulo}</th>
      <td className="num">{m3(p.m3)} <small>m³</small></td>
      <td className="num">{litros(p.m3)} <small>L</small></td>
      <td><Origem p={p} /></td>
    </tr>
  );

  const linhaDesconto = (rotulo: string, p: VolumeParte) => (
    <tr className="cc-desconto">
      <th scope="row">{rotulo}</th>
      <td className="num">− {m3(p.m3)} <small>m³</small></td>
      <td className="num">− {litros(p.m3)} <small>L</small></td>
      <td><small className="cc-origem">desconto</small></td>
    </tr>
  );

  const c = classificacao;
  const vinteCinco = avaliacaoVinteECincoAnos(info.ano, new Date().getFullYear());
  const tomResultado = c.categoria ? 'ok' : c.situacao === 'indefinida' ? 'pendente' : 'fora';

  return (
    <div className={`bloco-categoria cc${editando ? ' ficha-editando' : ''}`}>
      <div className="bloco-header-acoes">
        <h3>Classificação NR-13 da caldeira</h3>
        {!editando && (
          <button
            type="button"
            className="btn-editar-pencil"
            onClick={() => {
              const atual = carregarDadosCaldeira(tag);
              setDados(atual);
              setLocal(atual);
              setEditando(true);
            }}
            title="Editar volume da caldeira"
            aria-label="Editar volume da caldeira"
          >
            <Icone nome="pencil" tam={14} />
          </button>
        )}
      </div>

      {/* ① VOLUME */}
      <section className="cc-etapa">
        <h4><span className="cc-num">1</span> Volume</h4>
        {editando && (
          <div className="cc-form">
            <fieldset>
              <legend>Corpo</legend>
              {campo(CAMPOS_VOLUME.corpoDiametro, 'Ø interno', 'mm')}
              {campo(CAMPOS_VOLUME.corpoComprimento, 'Comprimento', 'mm')}
              {campo(CAMPOS_VOLUME.corpoLitros, 'ou volume', 'L')}
            </fieldset>
            <fieldset>
              <legend>Tampo 1</legend>
              {tampoTipo(CAMPOS_VOLUME.tampo1Tipo)}
              {campo(CAMPOS_VOLUME.tampo1Diametro, 'Ø interno', 'mm')}
              {campo(CAMPOS_VOLUME.tampo1Litros, 'ou volume', 'L')}
            </fieldset>
            <fieldset>
              <legend>Tampo 2</legend>
              {tampoTipo(CAMPOS_VOLUME.tampo2Tipo)}
              {campo(CAMPOS_VOLUME.tampo2Diametro, 'Ø interno', 'mm')}
              {campo(CAMPOS_VOLUME.tampo2Litros, 'ou volume', 'L')}
            </fieldset>
            <fieldset>
              <legend>Tubos de gases (desconto)</legend>
              {campo(CAMPOS_VOLUME.tubosQuantidade, 'Quantidade', 'un')}
              {campo(CAMPOS_VOLUME.tubosDiametroExterno, 'Ø externo', 'mm')}
              {campo(CAMPOS_VOLUME.tubosComprimento, 'Comprimento', 'mm')}
              <p className="cc-dica">Comprimento vazio = o do corpo.</p>
            </fieldset>
            <fieldset>
              <legend>Fornalha (desconto, opcional)</legend>
              {campo(CAMPOS_VOLUME.fornalhaDiametroExterno, 'Ø externo', 'mm')}
              {campo(CAMPOS_VOLUME.fornalhaComprimento, 'Comprimento', 'mm')}
            </fieldset>
            <fieldset>
              <legend>Total</legend>
              {campo(CAMPOS_VOLUME.totalLitros, 'Volume total informado', 'L')}
              <p className="cc-dica">Da placa ou do manual. Quando preenchido, vale no lugar da soma.</p>
            </fieldset>
          </div>
        )}
        <table className="cc-tabela">
          <thead>
            <tr><th scope="col">Parte</th><th scope="col">m³</th><th scope="col">Litros</th><th scope="col"></th></tr>
          </thead>
          <tbody>
            {linhaVolume('Corpo', volume.corpo)}
            {linhaVolume('Tampo 1', volume.tampo1)}
            {linhaVolume('Tampo 2', volume.tampo2)}
            {volume.tubos.m3 !== null && linhaDesconto('Tubos (desconto)', volume.tubos)}
            {volume.fornalha.m3 !== null && linhaDesconto('Fornalha (desconto)', volume.fornalha)}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{m3(volume.totalM3)} <small>m³</small></td>
              <td className="num">{litros(volume.totalM3)} <small>L</small></td>
              <td>{volume.fonteTotal === 'informado' ? <small className="cc-origem">informado</small> : null}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* ② ESPESSURA MENSURADA */}
      <section className="cc-etapa">
        <h4><span className="cc-num">2</span> Espessura mensurada</h4>
        {extremos.length === 0 ? (
          <p className="cc-vazio">Nenhuma medição de espessura de caldeira registrada nas inspeções desta TAG.</p>
        ) : (
          <>
            <table className="cc-tabela">
              <thead>
                <tr><th scope="col">Região</th><th scope="col">Máxima (mm)</th><th scope="col">Mínima (mm)</th></tr>
              </thead>
              <tbody>
                {extremos.map((e) => (
                  <tr key={e.regiao}>
                    <th scope="row">{e.titulo}</th>
                    <td className="num">{mm(e.maxima)}</td>
                    <td className="num">{mm(e.minima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cc-dica">Da inspeção “{medicao!.container}”.</p>
          </>
        )}
      </section>

      {/* ③ CLASSIFICAÇÃO */}
      <section className="cc-etapa">
        <h4><span className="cc-num">3</span> Classificação</h4>
        <div className="cc-base" role="radiogroup" aria-label="Pressão usada para classificar">
          <span className="cc-base-rot">Pressão para classificar</span>
          {(['pmo', 'pmta'] as BasePressao[]).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={c.base === b}
              className={`cc-base-op${c.base === b ? ' on' : ''}`}
              disabled={gravandoBase}
              onClick={() => void escolherBase(b)}
              title={b === 'pmo' ? 'Pressão de operação — a que a NR-13 13.4.1.1 usa' : 'PMTA — adotada, ou a calculada no memorial'}
            >
              {b === 'pmo' ? 'PMO (norma)' : 'PMTA'}
            </button>
          ))}
        </div>
        {c.naoCategorizado && (
          <p className="cc-nao-cat" role="alert">
            <Icone nome="alerttri" tam={14} /> {c.naoCategorizado}
          </p>
        )}
        <div className={`cc-resultado ${tomResultado}`}>
          <div className="cc-cat">
            <span className="lbl-view">Categoria</span>
            <strong>{c.categoria ?? (c.situacao === 'indefinida' ? '—' : 'N/C')}</strong>
          </div>
          <div className="cc-explica">
            <p>{c.explicacao}</p>
            <small>
              {c.item} · classificada pela {ROTULO_BASE[c.base]}
              {c.pressaoKgf !== null ? ` (${c.pressaoKgf.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kgf/cm² · ${Math.round(c.pressaoKpa!)} kPa)` : ''}
            </small>
          </div>
        </div>
        {c.categoria && prazoMaximoCaldeira(c.categoria) && (
          <p className="cc-dica">
            Inspeção periódica (exames interno e externo): prazo máximo de {prazoMaximoCaldeira(c.categoria)!.meses} meses
            (NR-13 {prazoMaximoCaldeira(c.categoria)!.item}); maior só nas condições do 13.4.4.4 c/d e do 13.4.4.5 (SPIE).
          </p>
        )}
        {vinteCinco?.exige && (
          <p className="cc-falta">
            <Icone nome="alerttri" tam={13} /> Caldeira com {vinteCinco.idade} anos de uso: na próxima inspeção cabe a
            avaliação de integridade com maior abrangência, para vida remanescente e novos prazos (NR-13 13.4.4.6).
          </p>
        )}
        {c.faltas.length > 0 && (
          <p className="cc-falta">
            <Icone nome="alerttri" tam={13} /> Falta: {c.faltas.join(' · ')}
          </p>
        )}
        <p className="cc-dica">
          A NR-13 se aplica a caldeiras acima de 0,61 kgf/cm² (13.2.1 a) e com volume a partir de 100 L (13.2.2 k).
          Categoria A: igual ou acima de 19,98 kgf/cm²; B: abaixo disso (13.4.1.1). A norma classifica pela pressão de
          operação (PMO); o engenheiro pode adotar a PMTA.
        </p>
      </section>

      {editando && (
        <>
          {erro && <p role="alert" className="cc-erro">{erro}</p>}
          <div className="ficha-acoes-edicao">
            <button type="button" className="btn-primario" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar volume'}
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setLocal(dados);
                setEditando(false);
                setErro('');
              }}
              disabled={salvando}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
