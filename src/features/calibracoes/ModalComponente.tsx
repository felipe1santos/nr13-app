/**
 * Cadastrar / editar um COMPONENTE do equipamento — a válvula ou o manômetro
 * que será calibrado.
 *
 * ## Por que virou modal
 *
 * O formulário nascia INLINE, embaixo do painel de componentes: clicar em
 * "+ Adicionar" empurrava os lotes para baixo e abria quatro campos numa faixa
 * que, no celular, ficava fora da primeira tela — o usuário clicava e nada
 * parecia acontecer. Modal central resolve as duas coisas: aparece onde o olho
 * está e não move o que estava embaixo.
 *
 * ## O que ele NÃO faz
 *
 * Não calibra nada e não emite certificado. Ele cadastra o componente — o
 * inventário que se calibra a cada inspeção. A regra continua a mesma:
 * `salvarComponente`, com a mesma validação de nome obrigatório.
 */
import { useEffect, useRef, useState } from 'react';
import FeedbackSalvamento, { useSalvamento } from '../../components/FeedbackSalvamento';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import type { ComponenteCal } from './componentesService';
import { PONTOS_NA_FOLHA } from './resultadosCalibracao';
import {
  UNIDADES,
  pontosDeTexto,
  textoDePontos,
  unidadeDoComponente,
} from './preencherCalibracao';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalComponente.css';

export default function ModalComponente({
  valor,
  aoSalvar,
  aoFechar,
}: {
  valor: ComponenteCal;
  aoSalvar: (c: ComponenteCal) => void | Promise<void>;
  aoFechar: () => void;
}) {
  const [c, setC] = useState<ComponenteCal>(valor);
  const salvamento = useSalvamento();
  const salvando = salvamento.salvando;
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ComponenteCal>(campo: K, v: ComponenteCal[K]) =>
    setC((atual) => ({ ...atual, [campo]: v }));

  // Foco no NOME, não no tipo: o tipo já vem escolhido e o nome é o que falta.
  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvando) {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  const podeSalvar = c.nome.trim() !== '';

  // 10/09/2026 · gravava e fechava, sem dizer nada — e a falha era engolida
  // pelo `finally`. Mesmo aviso do resto do sistema.
  async function salvar() {
    if (!podeSalvar) return;
    await salvamento.executar(async () => { await aoSalvar(c); });
  }

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !salvando && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Componente do equipamento"
    >
      <div className="fj-modal-box mcomp-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Calibrações</div>
            <h2>{valor.nome ? 'Editar componente' : 'Novo componente'}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mcomp-corpo">
          <p className="mcomp-ajuda">
            Cadastre a válvula ou o manômetro uma única vez. A cada inspeção, abra um lote e
            calibre os mesmos componentes — o histórico de cada um fica junto dele.
          </p>

          <div className="mcomp-grid">
            <label className="mcomp-campo">
              <span>Tipo</span>
              <select value={c.tipo} onChange={(e) => set('tipo', e.target.value as 'manometro' | 'psv')}>
                <option value="manometro">Manômetro</option>
                <option value="psv">Válvula de Segurança (PSV)</option>
              </select>
            </label>
            <label className="mcomp-campo">
              <span>Nome / identificação *</span>
              <input
                ref={primeiro}
                value={c.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Ex: PSV-01"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && podeSalvar) void salvar();
                }}
              />
            </label>
            <label className="mcomp-campo">
              <span>Fabricante</span>
              <input value={c.fabricante ?? ''} onChange={(e) => set('fabricante', e.target.value)} />
            </label>
            <label className="mcomp-campo">
              <span>Modelo</span>
              <input value={c.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)} />
            </label>
            <label className="mcomp-campo">
              <span>Nº de série</span>
              <input value={c.serie ?? ''} onChange={(e) => set('serie', e.target.value)} />
            </label>
          </div>

          {/* ── O QUE SE REPETE EM TODA CALIBRAÇÃO ──────────────────────────
              Guardado aqui, some do formulário de calibração: ele passa a
              nascer preenchido. Tudo opcional — quem não quiser cadastrar
              continua digitando na hora, como antes. */}
          <div className="mcomp-bloco">
            <div className="mcomp-bloco-titulo">
              <Icone nome="refresh" tam={13} />
              <span>Preenchimento automático das calibrações</span>
            </div>
            <p className="mcomp-bloco-ajuda">
              Estes dados não mudam de uma calibração para a outra. Preenchidos uma vez, aparecem
              prontos em todo certificado deste componente.
            </p>
            <div className="mcomp-grid">
              <label className="mcomp-campo">
                <span>Faixa / referência</span>
                <input
                  value={c.referencia ?? ''}
                  onChange={(e) => set('referencia', e.target.value)}
                  placeholder="Ex: 0 a 10 kgf/cm²"
                />
              </label>
              <label className="mcomp-campo">
                <span>Unidade</span>
                <select value={unidadeDoComponente(c)} onChange={(e) => set('unidade', e.target.value)}>
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              {c.tipo === 'manometro' ? (
                <label className="mcomp-campo mcomp-campo-full">
                  <span>Pontos de calibração</span>
                  <input
                    value={textoDePontos(c.pontos)}
                    onChange={(e) => set('pontos', pontosDeTexto(e.target.value))}
                    placeholder="Ex: 0, 2, 4, 6, 8, 10"
                  />
                  <em className="mcomp-dica">
                    {(c.pontos ?? []).length > PONTOS_NA_FOLHA
                      ? `O certificado imprime ${PONTOS_NA_FOLHA} pontos — os demais não entram no documento.`
                      : 'Separe por vírgula. É a coluna “valor do padrão” do certificado — vinha em branco e era digitada duas vezes, uma para cada sentido.'}
                  </em>
                </label>
              ) : (
                <label className="mcomp-campo">
                  <span>Pressão de ajuste</span>
                  <input
                    value={c.pressaoAjuste ?? ''}
                    onChange={(e) => set('pressaoAjuste', e.target.value)}
                    placeholder="Ex: 8,5"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="mcomp-foto">
            <input
              ref={arquivo}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                // A `fotoRef` do arquivo anterior morre junto: mantê-la faria
                // `salvarComponente` gravar a referência velha e descartar em
                // silêncio a foto que o usuário acabou de escolher.
                reader.onload = (ev) =>
                  setC((f) => ({ ...f, foto: String(ev.target?.result ?? ''), fotoRef: undefined }));
                reader.readAsDataURL(file);
              }}
            />
            <div className="mcomp-foto-caixa">
              {c.foto ? (
                <img src={c.foto} alt="" />
              ) : c.fotoRef ? (
                <FotoImg foto={{ ref: c.fotoRef }} alt={c.nome} placeholder="" variante="thumb" />
              ) : (
                <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={22} />
              )}
            </div>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => arquivo.current?.click()}>
              <Icone nome="camera" tam={13} /> {c.foto || c.fotoRef ? 'Trocar foto' : 'Foto (opcional)'}
            </button>
          </div>
        </div>

        <div className="mcomp-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-primary${salvando ? ' is-loading' : ''}`}
            onClick={() => void salvar()}
            disabled={!podeSalvar || salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar componente'}
          </button>
        </div>
      </div>

      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
    </div>
  );
}
