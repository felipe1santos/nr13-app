/**
 * Reestruturação de Calibrações (19/09/2026) · NOVA CALIBRAÇÃO, passo 2:
 * qual acessório deste equipamento vai ser calibrado.
 *
 * Lista os componentes já cadastrados com a última calibração de cada um. O
 * que ainda não existe se cadastra AQUI (o mesmo `ModalComponente` do cadastro
 * mestre), sem sair do fluxo — e volta já selecionado.
 */
import { useState } from 'react';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import ModalComponente from './ModalComponente';
import { fotoDoComponente, type ComponenteCal } from './componentesService';
import { definicaoDe } from './instrumentos';
import { historicoDoComponente } from './lote';
import type { DadosCalibracao } from './tipos';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalComponente.css';
import './janelaCalibracao.css';

export default function ModalEscolherComponente({
  tag,
  componentes,
  calibracoes,
  aoCadastrar,
  aoEscolher,
  aoVoltar,
  aoFechar,
}: {
  tag: string;
  componentes: ComponenteCal[];
  calibracoes: DadosCalibracao[];
  aoCadastrar: (c: ComponenteCal) => Promise<void>;
  aoEscolher: (c: ComponenteCal) => void;
  aoVoltar: () => void;
  aoFechar: () => void;
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novo, setNovo] = useState<ComponenteCal | null>(null);
  const escolhido = componentes.find((c) => c.id === selecionado) ?? null;

  return (
    <div className="fj-modal-overlay" role="dialog" aria-modal="true" aria-label="Escolher o componente">
      <div className="fj-modal-box mcomp-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Nova calibração · {tag}</div>
            <h2>O que será calibrado?</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>
        <div className="mcomp-corpo">
          {componentes.length === 0 ? (
            <p className="mcomp-ajuda">Nenhum acessório cadastrado neste equipamento ainda.</p>
          ) : (
            <ul className="escolha-comp" role="listbox" aria-label="Componentes">
              {componentes.map((c) => {
                const ultima = historicoDoComponente(c.id, calibracoes)[0];
                const def = definicaoDe(c.tipo);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selecionado === c.id}
                      className={`escolha-comp-item${selecionado === c.id ? ' atual' : ''}`}
                      onClick={() => setSelecionado(c.id)}
                      onDoubleClick={() => aoEscolher(c)}
                    >
                      <span className="escolha-comp-linha">
                        <span className="escolha-comp-foto" aria-hidden>
                          {fotoDoComponente(c) ? (
                            <FotoImg foto={fotoDoComponente(c)} alt="" placeholder="" variante="thumb" />
                          ) : (
                            <Icone nome={def.icone} tam={18} />
                          )}
                        </span>
                        <strong>
                          {def.curto.toUpperCase()} — {c.nome}
                        </strong>
                      </span>
                      <span>
                        {[c.fabricante, c.modelo, c.serie && `S/N ${c.serie}`, c.referencia].filter(Boolean).join(' · ') ||
                          'sem dados de cadastro'}
                      </span>
                      <span>
                        {ultima
                          ? `Última calibração: ${ultima.dataCalibracao || ultima.criadoEm} · ${ultima.numeroCertificado || 's/ nº'}`
                          : 'Nunca calibrado'}
                        {!def.modeloInterno && ' · calibração por laboratório externo'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="jcal-acoes-linha">
            <button
              type="button"
              className="fj-btn fj-btn-ghost"
              onClick={() =>
                setNovo({
                  id: `comp-${Date.now()}`,
                  tipo: 'manometro',
                  nome: '',
                  criadoEm: new Date().toLocaleDateString('pt-BR'),
                })
              }
            >
              <Icone nome="plus" tam={13} /> Cadastrar novo componente
            </button>
          </div>
        </div>
        <div className="mcomp-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoVoltar}>
            <Icone nome="arrowleft" tam={13} /> Trocar equipamento
          </button>
          <button
            type="button"
            className="fj-btn fj-btn-primary"
            disabled={!escolhido}
            onClick={() => escolhido && aoEscolher(escolhido)}
          >
            Continuar
          </button>
        </div>
      </div>

      {novo && (
        <ModalComponente
          valor={novo}
          aoFechar={() => setNovo(null)}
          aoSalvar={async (c) => {
            await aoCadastrar(c);
            setSelecionado(c.id);
            setNovo(null);
          }}
        />
      )}
    </div>
  );
}
