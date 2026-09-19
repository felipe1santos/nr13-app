/**
 * Revisão do engenheiro, fase 2 (D) · a linha do quadro 7.1.1 no celular.
 *
 * O inspetor não redigita número de certificado nem validade: escolhe a
 * calibração já registrada do instrumento (interna emitida, anterior à
 * emissão, ou de laboratório externo) — ou registra agora a do laboratório.
 * A escolha vira REFERÊNCIA + SNAPSHOT no checklist (`quadroInstrumentos.ts`).
 *
 * Divulgação progressiva: na linha, só o resumo e um botão; a lista e o
 * cadastro abrem em modal de tela cheia no celular (sem rolagem lateral).
 */
import { useMemo, useState } from 'react';
import { Icone } from '../../../components/Icone';
import { ler } from '../../../services/storage';
import ModalCalibracaoTerceiro from '../../calibracoes/ModalCalibracaoTerceiro';
import { definicaoDe, type TipoInstrumento } from '../../calibracoes/instrumentos';
import {
  opcoesParaLinha,
  rotuloOpcao,
  situacaoCalibracao,
  snapshotDaCalibracao,
  textoCertificado,
  type RefInstrumentoChecklist,
} from '../../calibracoes/quadroInstrumentos';
import type { DadosCalibracao } from '../../calibracoes/tipos';
import '../../relatorios/modalFiltrosRelatorios.css';
import '../../calibracoes/modalComponente.css';

const ROTULO_SITUACAO = {
  valida: 'Dentro da validade',
  vencida: 'VENCIDA na data da inspeção',
  reprovada: 'REPROVADA',
  sem_validade: 'Validade não informada',
} as const;

function emissorInterno(): string {
  const e = ler<{ razao?: string; fantasia?: string }>('nr13_minha_empresa');
  return (e?.razao || e?.fantasia || 'empresa executante').trim();
}

export default function SeletorCalibracaoInstrumento({
  tag,
  tipo,
  valor,
  dataInspecao,
  aoMudar,
}: {
  tag: string;
  tipo: TipoInstrumento;
  valor: RefInstrumentoChecklist | undefined;
  dataInspecao: string;
  aoMudar: (ref: RefInstrumentoChecklist | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [terceiro, setTerceiro] = useState(false);
  const [versao, setVersao] = useState(0);
  // `versao` relê a lista depois de registrar um certificado externo.
  const opcoes = useMemo(() => (aberto ? opcoesParaLinha(tag, tipo) : []), [aberto, tag, tipo, versao]); // eslint-disable-line react-hooks/exhaustive-deps

  function escolher(cal: DadosCalibracao) {
    aoMudar({
      ...(cal.componenteId ? { componenteId: cal.componenteId } : {}),
      calibracaoId: cal.id,
      snapshot: snapshotDaCalibracao(cal, emissorInterno()),
      selecionadoEm: new Date().toISOString(),
    });
    setAberto(false);
  }

  const situacao = valor?.snapshot ? situacaoCalibracao(valor.snapshot, dataInspecao) : null;

  return (
    <div className="seletor-cal">
      {valor?.snapshot ? (
        <div className={`seletor-cal-resumo situ-${situacao}`}>
          <span className="seletor-cal-cert">{textoCertificado(valor.snapshot)}</span>
          <span className="seletor-cal-situ">{situacao ? ROTULO_SITUACAO[situacao] : ''}</span>
        </div>
      ) : (
        <span className="seletor-cal-vazio">Nenhuma calibração vinculada</span>
      )}
      <div className="seletor-cal-acoes">
        <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setAberto(true)}>
          <Icone nome="link" tam={13} /> {valor ? 'Trocar' : 'Vincular calibração'}
        </button>
        {valor && (
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => aoMudar(null)} aria-label="Remover vínculo">
            <Icone nome="x" tam={13} />
          </button>
        )}
      </div>

      {aberto && !terceiro && (
        <div className="fj-modal-overlay" role="dialog" aria-modal="true" aria-label={`Calibração — ${definicaoDe(tipo).rotulo}`}>
          <div className="fj-modal-box mcomp-box">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Quadro de instrumentos</div>
                <h2>{definicaoDe(tipo).rotulo}</h2>
              </div>
              <button type="button" className="fj-modal-close" onClick={() => setAberto(false)} aria-label="Fechar">
                <Icone nome="x" tam={15} />
              </button>
            </div>
            <div className="mcomp-corpo">
              {opcoes.length === 0 ? (
                <p className="mcomp-ajuda">
                  Nenhuma calibração registrada para {definicaoDe(tipo).rotulo.toLowerCase()} neste equipamento.
                </p>
              ) : (
                <ul className="seletor-cal-lista" role="list">
                  {opcoes.map((o) => (
                    <li key={o.calibracao.id}>
                      <button
                        type="button"
                        className={`seletor-cal-opcao${valor?.calibracaoId === o.calibracao.id ? ' atual' : ''}`}
                        disabled={!o.selecionavel}
                        onClick={() => escolher(o.calibracao)}
                      >
                        <strong>{rotuloOpcao(o)}</strong>
                        <span>
                          {o.calibracao.dataCalibracao || '—'} → val. {o.calibracao.dataProxCalibracao || '—'}
                          {o.motivo ? ` · ${o.motivo}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mcomp-acoes">
              <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setAberto(false)}>
                Fechar
              </button>
              <button type="button" className="fj-btn fj-btn-primary" onClick={() => setTerceiro(true)}>
                <Icone nome="building" tam={13} /> Laboratório externo
              </button>
            </div>
          </div>
        </div>
      )}

      {terceiro && (
        <ModalCalibracaoTerceiro
          tag={tag}
          tipoInicial={tipo}
          aoFechar={() => setTerceiro(false)}
          aoSalvar={(cal) => {
            setTerceiro(false);
            setVersao((v) => v + 1);
            escolher(cal);
          }}
        />
      )}
    </div>
  );
}
