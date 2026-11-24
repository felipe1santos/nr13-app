/**
 * Peças do EDITOR DE MEMORIAL no desenho do protótipo Cobalto (mz-*),
 * compartilhadas por caldeira e autoclave. Só apresentação: nenhuma regra de
 * cálculo, de validação ou de gravação mora aqui.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import MemorialLog from './MemorialLog';
import './memorialEditor.css';

export type StatusMz = 'APROVADO' | 'REPROVADO' | 'PENDENTE' | null | undefined;

/** Só dígitos, UM separador decimal (vírgula ou ponto) e o sinal no início. */
export function limparDecimal(t: string): string {
  let s = t.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, '');
  const i = s.search(/[.,]/);
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '');
  return s;
}

/** "1,1" → "1.1"; "1," → "1." (o `Number` lê 1, e a tela segue mostrando "1,"). */
export function paraPonto(t: string): string {
  return t.replace(',', '.');
}

const vazioNum = (v: unknown) => v === undefined || v === null || v === '' || !(Number(v) > 0);

/** Campo numérico/texto com unidade dentro da caixa e aviso de obrigatório. */
export function CampoMx({
  rotulo,
  unidade,
  valor,
  onChange,
  obrigatorio = false,
  aceitaZero = false,
  tipo = 'number',
  cheio = false,
  dica,
}: {
  rotulo: string;
  unidade?: string;
  valor: unknown;
  onChange: (v: string) => void;
  obrigatorio?: boolean;
  /** Temperatura: 0 é valor válido; só o vazio avisa. */
  aceitaZero?: boolean;
  tipo?: 'number' | 'text';
  cheio?: boolean;
  dica?: string;
}) {
  const v = valor === undefined || valor === null ? '' : String(valor);
  const warn = obrigatorio && (aceitaZero ? v === '' : vazioNum(v));
  // 23/11/2026 · VÍRGULA DECIMAL. Com `type="number"` o navegador descartava a
  // vírgula digitada: "1,1" virava 11 — 11 MPa no memorial, dez vezes a pressão.
  // O campo agora é texto com teclado decimal; o que se digita fica na tela
  // como foi digitado ("1,1") e o que sobe ao memorial vai com PONTO ("1.1"),
  // que é o que o cálculo (`Number`) entende.
  const [texto, setTexto] = useState(() => (tipo === 'number' ? v.replace('.', ',') : v));
  useEffect(() => {
    if (tipo !== 'number') {
      setTexto(v);
      return;
    }
    // Só reescreve a tela quando o valor mudou POR FORA (carregar, limpar);
    // "1," enquanto se digita vale 1 e não pode virar "1" no meio da digitação.
    setTexto((atual) => (paraPonto(atual) !== '' && Number(paraPonto(atual)) === Number(v) ? atual : v.replace('.', ',')));
  }, [v, tipo]);
  return (
    <label className={`mx-c${warn ? ' warn' : ''}${cheio ? ' full' : ''}`} title={dica}>
      <span>
        {rotulo}
        {warn && (
          <span className="mx-warn" title="Obrigatório sem valor válido">
            <Icone nome="alerttri" tam={14} />
          </span>
        )}
      </span>
      <input
        type="text"
        inputMode={tipo === 'number' ? 'decimal' : undefined}
        value={tipo === 'number' ? texto : v}
        onChange={(e) => {
          if (tipo !== 'number') {
            onChange(e.target.value);
            return;
          }
          const digitado = limparDecimal(e.target.value);
          setTexto(digitado);
          onChange(paraPonto(digitado));
        }}
      />
      {unidade && <em>{unidade}</em>}
    </label>
  );
}

export function SelectMx({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: string;
  opcoes: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="mx-c">
      <span>{rotulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Selo da situação no topo (Aguardando / Aprovado / Pendente / Reprovado). */
export function SeloStatusMz({ status }: { status: StatusMz }) {
  return (
    <span className={`mx-st ${status ? status.toLowerCase() : 'aguardando'}`}>
      {status === 'APROVADO' ? 'Aprovado' : status === 'REPROVADO' ? 'Reprovado' : status === 'PENDENTE' ? 'Pendente' : 'Aguardando cálculo'}
    </span>
  );
}

/** Gerar cálculo + Salvar memorial (barra do topo ou cabeçalho do cartão). */
export function AcoesMz({
  status,
  aoGerar,
  aoSalvar,
  podeSalvar,
  salvando,
  salvo,
}: {
  status: StatusMz;
  aoGerar: () => void;
  aoSalvar: () => void;
  podeSalvar: boolean;
  salvando: boolean;
  salvo: boolean;
}) {
  return (
    <>
      <SeloStatusMz status={status} />
      <button type="button" className="btn btn-sec mz-gerar" onClick={aoGerar}>
        <Icone nome="calculator" tam={17} />
        Gerar cálculo
      </button>
      <button type="button" className={`btn btn-pri ${salvando ? 'is-loading' : ''}`} onClick={aoSalvar} disabled={!podeSalvar || salvando}>
        <Icone nome="check" tam={16} />
        {salvando ? 'Salvando...' : salvo ? 'Salvo' : 'Salvar memorial'}
      </button>
    </>
  );
}

/** O memorial em documento, largura total. */
export function CartaoMemorialMz({
  log,
  calcCount,
  sub,
  placeholder,
  filtros,
  filtro,
  aoFiltro,
  aoGerar,
}: {
  log: string[];
  calcCount: number;
  sub: string;
  placeholder: string;
  filtros?: { id: string; label: string }[];
  filtro?: string;
  aoFiltro?: (id: string) => void;
  aoGerar: () => void;
}) {
  return (
    <section className="mz-card mz-memo">
      <header className="mz-h">
        <h2>Memorial</h2>
        {sub && <span className="mz-gerado">{sub}</span>}
        <span className="grow" />
        {calcCount > 0 && filtros && filtros.length > 1 && aoFiltro && (
          <>
            <span className="mz-exib">Exibindo</span>
            <select className="mz-filtro" aria-label="Componente exibido" value={filtro} onChange={(e) => aoFiltro(e.target.value)}>
              {filtros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </>
        )}
      </header>
      <div className="mz-memo-c">
        <MemorialLog key={`${calcCount}-${filtro ?? ''}`} log={log} animado={calcCount > 0} showPlaceholder={calcCount === 0} placeholder={placeholder} />
        {calcCount === 0 && (
          <div className="mz-vazio-acao">
            <button type="button" className="btn-novo sq" onClick={aoGerar}>
              <Icone nome="calculator" tam={18} />
              Gerar cálculo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** A barra fina de resultado, presa ao pé da tela. */
export function BarraResultadoMz({ itens, status, temResultado }: { itens: { rotulo: string; valor: string; un?: string; classe?: string }[]; status: StatusMz; temResultado: boolean }) {
  return (
    <div className="mz-barra">
      {temResultado ? (
        <>
          {itens.map((i) => (
            <span key={i.rotulo}>
              <em>{i.rotulo}</em>
              <b className={i.classe}>{i.valor}</b>
              {i.un && <small>{i.un}</small>}
            </span>
          ))}
          <span className="grow" />
          <span className={`eres ${status === 'APROVADO' ? 'ok' : status === 'PENDENTE' ? 'off' : 'crit'}`}>
            {status === 'APROVADO' ? 'Aprovado' : status === 'PENDENTE' ? 'Pendente' : 'Reprovado'}
          </span>
        </>
      ) : (
        <span className="mz-barra-vazia">
          <Icone nome="info" tam={16} />
          Resultado aparece aqui depois de gerar o cálculo
        </span>
      )}
    </div>
  );
}

/** A janela de um elemento (casca: cabeçalho colorido, corpo, rodapé). */
export function ModalElementoMz({
  cor,
  titulo,
  subtitulo,
  rotuloSalvar,
  onCancelar,
  onSalvar,
  children,
}: {
  cor: string;
  titulo: string;
  subtitulo: ReactNode;
  rotuloSalvar: string;
  onCancelar: () => void;
  onSalvar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocoPreso(ref, onCancelar);
  // Sem onClick no fundo: o elemento tem dados digitados (modal com edição só
  // fecha por X, Cancelar, Salvar ou Esc).
  return (
    <div className="mzm-ov mzm-overlay">
      <div ref={ref} className={`mzm ${cor}`} role="dialog" aria-modal="true" aria-labelledby="mzm-tit">
        <header className="mzm-h">
          <span className="cor" />
          <div className="t">
            <h2 id="mzm-tit">{titulo}</h2>
            <small>{subtitulo}</small>
          </div>
          <button type="button" className="ibtn" onClick={onCancelar} aria-label="Fechar">
            <Icone nome="x" tam={18} />
          </button>
        </header>
        <div className="mzm-c">{children}</div>
        <footer className="mzm-f">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sec" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="btn mz-salvar" onClick={onSalvar}>
            <Icone nome="check" tam={16} />
            {rotuloSalvar}
          </button>
        </footer>
      </div>
    </div>
  );
}
