import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from './Icone';
import FotoLista from './FotoLista';
import { useFocoPreso } from './useFocoPreso';
import { ler } from '../services/storage';
import { textoPrazo } from '../services/vencimentos';
import type { ItemVencimento } from '../services/vencimentos';
import { useFotoDaTag } from '../services/fotosEquipamentos';
import { listarHistorico } from '../features/relatorios/relatoriosService';
import { listarCalibracoes } from '../features/calibracoes/calibracaoService';
import { listarComponentes } from '../features/calibracoes/componentesService';
import { situacaoDoAcessorio, prazoDoCanto } from '../features/calibracoes/situacaoAcessorio';
import { definicaoDe } from '../features/calibracoes/instrumentos';
import { carregarEquipamento } from '../features/equipamento/equipamentoService';
import type { CategoriaSalva, EmpresaEquipamento, FotoEquipamento, InfoEquipamento } from '../features/equipamento/tipos';
import { rotaEquipamento } from '../app/rotas';
import './modal-detalhe-equipamento.css';

/**
 * Detalhe rápido do equipamento, aberto pela lista "Vencidos e a vencer" do
 * Dashboard — refeito do zero em 21/11/2026.
 *
 * Três blocos, do geral para o particular, todos compactos:
 *   1. o equipamento (2–3 linhas): foto, TAG, descrição, tipo, categoria,
 *      cliente, fabricante/ano/série — e a situação do prazo de inspeção;
 *   2. o último relatório (1–2 linhas) e a sua situação, com atalho;
 *   3. os acessórios — UMA linha por acessório: última calibração, o
 *      certificado, a situação e o atalho para a calibração.
 *
 * SEMEIA A TAG AO ABRIR. Com o boot leve (9G.3) o cache não tem a ficha de
 * equipamento nenhum; ler direto mostrava o modal vazio sem erro nenhum —
 * mesma regra da ficha (§3-ter): cache primeiro, servidor em seguida.
 */

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

type Tom = 'crit' | 'warn' | 'ok' | 'neutro';

function tomDoItem(item: ItemVencimento | undefined): Tom {
  if (!item || item.status === 'semPrazo') return 'neutro';
  return item.status;
}

/** Situação com ÍCONE + TEXTO — a cor nunca é o único sinal. */
function Selo({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  const icone = tom === 'crit' ? 'alerttri' : tom === 'warn' ? 'clock' : tom === 'ok' ? 'checkcircle' : 'info';
  return (
    <span className={`mdq-selo ${tom}`}>
      <Icone nome={icone} tam={12} />
      {children}
    </span>
  );
}

interface Props {
  tag: string;
  itens: ItemVencimento[];
  onClose: () => void;
}

export default function ModalDetalheEquipamento({ tag, itens, onClose }: Props) {
  const navigate = useNavigate();
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onClose);

  // Cache primeiro (abre na hora se a TAG já passou por este aparelho); a
  // semeadura traz o resto e a versão força a releitura.
  const [versao, setVersao] = useState(0);
  const [buscando, setBuscando] = useState(true);
  useEffect(() => {
    let vivo = true;
    void carregarEquipamento(tag)
      .catch(() => undefined)
      .finally(() => {
        if (!vivo) return;
        setBuscando(false);
        setVersao((v) => v + 1);
      });
    return () => {
      vivo = false;
    };
  }, [tag]);

  const dados = useMemo(() => {
    void versao; // releitura depois da semeadura
    const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
    const cat = ler<CategoriaSalva>(`nr13_cat_${tag}`);
    const emp = ler<EmpresaEquipamento>(`nr13_emp_${tag}`);
    const ultimoRel = listarHistorico(tag)[0] ?? null;
    const cals = listarCalibracoes(tag);
    const acessorios = listarComponentes(tag).map((c) => ({ c, s: situacaoDoAcessorio(c, cals) }));
    // A foto da FICHA (a marcada como capa, senão a primeira) — a mesma que a
    // ficha e a capa do relatório mostram. Vem com a semeadura da TAG.
    const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
    const capa = fotos.find((f) => f.isCapa && f.ref?.path) ?? fotos.find((f) => f.ref?.path) ?? null;
    return { info, cat, emp, ultimoRel, acessorios, fotoFicha: capa?.ref ?? null };
  }, [tag, versao]);
  const { info, cat, emp, ultimoRel, acessorios, fotoFicha } = dados;

  const foto = useFotoDaTag(tag);
  const itemEquip = itens.find((i) => i.origem === 'inspecao' && i.tag === tag);
  const tomEquip = tomDoItem(itemEquip);
  const tipoRotulo = info ? (ROTULO_TIPO[info.tipo] ?? 'Equipamento') : 'Equipamento';
  const cliente = emp?.nomeFantasia || emp?.razaoSocial || '';
  const semDados = !info && !buscando;

  const ficha = [
    info?.fabricante && `Fabricante ${info.fabricante}`,
    info?.ano && `Ano ${info.ano}`,
    info?.numeroSerie && `Série ${info.numeroSerie}`,
  ].filter(Boolean) as string[];

  function ir(rota: string) {
    onClose();
    navigate(rota);
  }

  return (
    <div className="fj-modal-overlay mdq-fundo" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={caixa} className="mdq" role="dialog" aria-modal="true" aria-labelledby="mdq-tag">
        {/* ── 1 · O equipamento ───────────────────────────────────────────── */}
        <header className="mdq-topo">
          <span className="mdq-foto">
            {/* A foto do equipamento no lugar do ícone: a da ficha primeiro,
                a da projeção do servidor se a ficha ainda não chegou. */}
            <FotoLista tipo={info?.tipo ?? foto?.tipo ?? null} fotoRef={fotoFicha ?? foto?.fotoRef ?? null} />
          </span>
          <div className="mdq-id">
            <div className="mdq-linha1">
              <h2 id="mdq-tag">{tag}</h2>
              <Selo tom={tomEquip}>
                {itemEquip && itemEquip.status !== 'semPrazo' ? textoPrazo(itemEquip) : 'Sem prazo de inspeção'}
              </Selo>
            </div>
            <p className="mdq-desc">
              {info?.descricao?.trim() || tipoRotulo}
              {cliente && <span className="mdq-cli"> · {cliente}</span>}
            </p>
            <div className="mdq-chips">
              <span className="mdq-chip">{tipoRotulo}{info?.subtipo ? ` · ${info.subtipo}` : ''}</span>
              {cat?.catFinal && <span className="mdq-chip cat">Cat. {cat.catFinal}</span>}
              {ficha.map((f) => (
                <span key={f} className="mdq-chip claro">{f}</span>
              ))}
            </div>
          </div>
          <button type="button" className="mdq-fechar" onClick={onClose} aria-label="Fechar">
            <Icone nome="x" tam={16} />
          </button>
        </header>

        <div className="mdq-corpo">
          {semDados && (
            <p className="mdq-aviso" role="status">
              Não foi possível carregar a ficha deste equipamento agora. Abra a ficha completa para tentar de novo.
            </p>
          )}

          {/* ── 2 · Último relatório ─────────────────────────────────────── */}
          <section className="mdq-sec" aria-labelledby="mdq-rel-tit">
            <h3 id="mdq-rel-tit">Último relatório</h3>
            {ultimoRel ? (
              <div className="mdq-rel">
                <span className="mdq-rel-ic" aria-hidden="true"><Icone nome="pdf" tam={16} /></span>
                <div className="mdq-rel-txt">
                  <b>{ultimoRel.codigo || ultimoRel.nome}</b>
                  <span>
                    {ultimoRel.tipo}
                    {ultimoRel.execucaoInspecao && ` · executado em ${ultimoRel.execucaoInspecao}`}
                    {(ultimoRel.proximaInspecaoExterna || ultimoRel.proximaInspecaoInterna) &&
                      ` · próxima ${ultimoRel.proximaInspecaoExterna ? `externa ${ultimoRel.proximaInspecaoExterna}` : ''}${ultimoRel.proximaInspecaoExterna && ultimoRel.proximaInspecaoInterna ? ', ' : ''}${ultimoRel.proximaInspecaoInterna ? `interna ${ultimoRel.proximaInspecaoInterna}` : ''}`}
                  </span>
                </div>
                <Selo tom={tomEquip}>{tomEquip === 'crit' ? 'Vencido' : tomEquip === 'warn' ? 'Vence em breve' : tomEquip === 'ok' ? 'Em dia' : 'Sem prazo'}</Selo>
                <button
                  type="button"
                  className="mdq-ir"
                  title="Abrir o relatório"
                  onClick={() => ir(`/relatorios?q=${encodeURIComponent(ultimoRel.codigo || tag)}`)}
                >
                  <Icone nome="arrowright" tam={15} />
                </button>
              </div>
            ) : (
              <p className="mdq-vazio">{buscando ? 'Carregando…' : 'Nenhum relatório salvo para este equipamento.'}</p>
            )}
          </section>

          {/* ── 3 · Acessórios ───────────────────────────────────────────── */}
          <section className="mdq-sec" aria-labelledby="mdq-ac-tit">
            <h3 id="mdq-ac-tit">
              Acessórios <span className="mdq-n">{acessorios.length}</span>
            </h3>
            {acessorios.length === 0 ? (
              <p className="mdq-vazio">{buscando ? 'Carregando…' : 'Nenhum acessório cadastrado.'}</p>
            ) : (
              <ul className="mdq-acs">
                {acessorios.map(({ c, s }) => {
                  const def = definicaoDe(c.tipo);
                  const tom: Tom = !s.ultima
                    ? 'warn'
                    : s.selo === 'vencido' || s.selo === 'reprovado'
                      ? 'crit'
                      : s.selo === 'em-dia'
                        ? 'ok'
                        : 'neutro';
                  const rotSelo = !s.ultima
                    ? 'Requer calibração'
                    : s.selo === 'vencido'
                      ? 'Vencido'
                      : s.selo === 'reprovado'
                        ? 'Reprovado'
                        : s.selo === 'em-dia'
                          ? 'Em dia'
                          : 'Sem prazo';
                  const cert =
                    s.certificado === 'emitido'
                      ? 'certificado emitido'
                      : s.certificado === 'externo'
                        ? 'laboratório externo'
                        : s.certificado === 'anterior'
                          ? 'certificado não emitido'
                          : null;
                  return (
                    <li key={c.id}>
                      <span className="mdq-ac-ic" aria-hidden="true"><Icone nome={def.icone} tam={15} /></span>
                      <span className="mdq-ac-nome">
                        <b>{c.nome?.trim() || def.rotulo}</b>
                        {c.serie && <small> · SN {c.serie}</small>}
                      </span>
                      <span className="mdq-ac-cal">
                        {s.ultima ? (
                          <>
                            {s.ultima.dataCalibracao || '—'}
                            {cert && <small> · {cert}</small>}
                          </>
                        ) : (
                          <small>nunca calibrado</small>
                        )}
                      </span>
                      <span className="mdq-ac-prazo">{s.ultima ? prazoDoCanto(s.dias) : ''}</span>
                      <Selo tom={tom}>{rotSelo}</Selo>
                      <button
                        type="button"
                        className="mdq-ir"
                        title="Ir para a calibração"
                        onClick={() => ir(`/calibracoes?tag=${encodeURIComponent(tag)}`)}
                      >
                        <Icone nome="arrowright" tam={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <footer className="mdq-rodape">
          <button type="button" className="mdq-btn sec" onClick={() => ir(`/calibracoes?tag=${encodeURIComponent(tag)}`)}>
            <Icone nome="sliders" tam={14} /> Calibrações
          </button>
          <button type="button" className="mdq-btn pri" onClick={() => ir(rotaEquipamento(tag))}>
            Abrir ficha completa <Icone nome="arrowright" tam={14} />
          </button>
        </footer>
      </div>
    </div>
  );
}
