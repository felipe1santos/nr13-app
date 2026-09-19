/**
 * Reestruturação de Calibrações (19/09/2026) · o HISTÓRICO de um componente,
 * a um clique do acessório — sem descer lote por lote.
 *
 *   MANÔMETRO MAN-08
 *   18/09/2026 — Aprovado · Cert. CERT-123 · Emitido
 *   18/09/2025 — Aprovado · Cert. CERT-080
 */
import { useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisorCertificado } from './ModalDetalhesLote';
import type { ComponenteCal } from './componentesService';
import { definicaoDe } from './instrumentos';
import { historicoDoComponente } from './lote';
import { ehEmitido, ehInterna, ehTerceiro, type DadosCalibracao } from './tipos';
import { arquivoCalibracao } from './calibracaoService';
import { artefatoDaCalibracao } from './artefatoCalibracao';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalComponente.css';
import './modalLote.css';
import './janelaCalibracao.css';

function situacao(c: DadosCalibracao): { rotulo: string; classe: string } {
  if (ehTerceiro(c)) return { rotulo: `Lab. externo · ${c.laboratorio}`, classe: 'externo' };
  if (ehEmitido(c)) return { rotulo: 'Emitido', classe: 'emitido' };
  if (ehInterna(c) && c.status === 'rascunho') return { rotulo: 'Rascunho', classe: 'pendente' };
  return { rotulo: 'Registro anterior', classe: 'sem' };
}

export default function ModalHistoricoComponente({
  tag,
  componente,
  calibracoes,
  aoNovaCalibracao,
  aoContinuar,
  aoVerDados,
  aoEditarComponente,
  aoBaixarPdf,
  aoFechar,
}: {
  tag: string;
  componente: ComponenteCal;
  calibracoes: DadosCalibracao[];
  aoNovaCalibracao: () => void;
  aoContinuar: (cal: DadosCalibracao) => void;
  aoVerDados: (cal: DadosCalibracao) => void;
  aoEditarComponente: () => void;
  aoBaixarPdf: (cal: DadosCalibracao) => void | Promise<void>;
  aoFechar: () => void;
}) {
  const [vendo, setVendo] = useState<DadosCalibracao | null>(null);
  const def = definicaoDe(componente.tipo);
  const lista = historicoDoComponente(componente.id, calibracoes);

  return (
    <div className="fj-modal-overlay" role="dialog" aria-modal="true" aria-label={`Histórico de ${componente.nome}`}>
      <div className="fj-modal-box mcomp-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Histórico de calibrações · {tag}</div>
            <h2>
              {def.curto.toUpperCase()} — {componente.nome}
            </h2>
            <p className="mlote-sub">
              {[componente.fabricante, componente.modelo, componente.serie && `S/N ${componente.serie}`, componente.referencia]
                .filter(Boolean)
                .join(' · ') || 'sem dados de cadastro'}
            </p>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>
        <div className="mcomp-corpo">
          {lista.length === 0 ? (
            <p className="mcomp-ajuda">Nenhuma calibração registrada para este componente.</p>
          ) : (
            <ul className="escolha-comp hist-comp">
              {lista.map((c) => {
                const s = situacao(c);
                const temArquivo = !!artefatoDaCalibracao(c) || !!arquivoCalibracao(c);
                return (
                  <li key={c.id} className="escolha-comp-item hist-comp-item">
                    <span className="escolha-comp-linha">
                      <strong>
                        {c.dataCalibracao || c.criadoEm} —{' '}
                        {c.statusConclusao === 'aprovado' ? 'Aprovado' : c.statusConclusao === 'reprovado' ? 'Reprovado' : 'Sem conclusão'}
                      </strong>
                      <span className={`mlote-selo ${s.classe}`}>{s.rotulo}</span>
                    </span>
                    <span>
                      Cert. {c.numeroCertificado || 's/ nº'}
                      {c.dataProxCalibracao ? ` · próxima ${c.dataProxCalibracao}` : ''}
                    </span>
                    <span className="jcal-acoes-linha">
                      {ehInterna(c) && c.status === 'rascunho' && (
                        <button type="button" className="fj-btn fj-btn-primary" onClick={() => aoContinuar(c)}>
                          <Icone nome="pencil" tam={13} /> Continuar
                        </button>
                      )}
                      {temArquivo && (
                        <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setVendo(c)}>
                          <Icone nome="filetext" tam={13} /> {ehTerceiro(c) ? 'PDF do laboratório' : 'Ver certificado'}
                        </button>
                      )}
                      <button type="button" className="fj-btn fj-btn-ghost" onClick={() => aoVerDados(c)}>
                        <Icone nome="eye" tam={13} /> Dados
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mcomp-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoEditarComponente}>
            <Icone nome="pencil" tam={13} /> Editar componente
          </button>
          <button type="button" className="fj-btn fj-btn-primary" onClick={aoNovaCalibracao}>
            <Icone nome="plus" tam={13} /> Nova calibração
          </button>
        </div>
      </div>
      {vendo && (
        <VisorCertificado cal={vendo} tag={tag} aoFechar={() => setVendo(null)} aoBaixar={() => aoBaixarPdf(vendo)} />
      )}
    </div>
  );
}
