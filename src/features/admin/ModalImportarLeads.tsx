import { useRef, useState } from 'react';
import {
  analisarPlanilhaLeads,
  baixarModeloPlanilhaLeads,
  importarLeads,
  type AnalisePlanilhaLeads,
  type LinhaLeadProblema,
} from '../../services/leadsImportados';

interface Props {
  /** E-mails já cadastrados (leads importados + leads do trial), em minúsculas. */
  emailsExistentes: Set<string>;
  onClose: () => void;
  onImportado: (msg: string) => void;
}

type Fase = 'intro' | 'analisando' | 'revisao' | 'importando' | 'concluido';

function ListaProblemas({ titulo, itens }: { titulo: string; itens: LinhaLeadProblema[] }) {
  if (itens.length === 0) return null;
  return (
    <details className="admin-imp-problemas">
      <summary>
        {titulo} ({itens.length})
      </summary>
      <ul>
        {itens.map((p) => (
          <li key={`${p.linha}-${p.email}`}>
            Linha {p.linha} — {p.email}: {p.motivo}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Importação de leads por planilha (.xlsx/.xls/.ods/.csv) no painel Admin. */
export default function ModalImportarLeads({ emailsExistentes, onClose, onImportado }: Props) {
  const [fase, setFase] = useState<Fase>('intro');
  const [erro, setErro] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnalisePlanilhaLeads | null>(null);
  const [resultado, setResultado] = useState<{ criados: number; falhas: LinhaLeadProblema[] } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function analisar(arquivo: File) {
    setFase('analisando');
    setErro(null);
    try {
      setAnalise(await analisarPlanilhaLeads(arquivo, emailsExistentes));
      setFase('revisao');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler a planilha.');
      setFase('intro');
    }
  }

  async function confirmarImportacao() {
    if (!analise || analise.validas.length === 0) return;
    setFase('importando');
    try {
      const r = await importarLeads(analise.validas);
      setResultado(r);
      setFase('concluido');
      onImportado(
        `${r.criados} lead(s) importado(s).` +
          (r.falhas.length ? ` ${r.falhas.length} falha(s).` : ''),
      );
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao importar.');
      setFase('revisao');
    }
  }

  return (
    <div className="admin-email-overlay" role="dialog" aria-modal="true">
      <div className="admin-email-modal" style={{ maxWidth: 520 }}>
        <h3>Importar leads por planilha</h3>

        {fase === 'intro' && (
          <>
            <p className="admin-email-sub">
              Preencha o modelo com <strong>nome, email, telefone, empresa e origem</strong> (uma
              linha por lead — só o e-mail é obrigatório) e importe todos de uma vez. Formatos:
              .xlsx, .xls, .ods, .csv.
            </p>
            <button type="button" className="admin-imp-modelo" onClick={baixarModeloPlanilhaLeads}>
              ⬇ Baixar modelo da planilha (.xlsx)
            </button>
            <div
              className={`admin-imp-drop${arrastando ? ' arrastando' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void analisar(f);
              }}
              onClick={() => inputRef.current?.click()}
            >
              Arraste a planilha preenchida aqui
              <span>ou clique para escolher o arquivo</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.ods,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analisar(f);
                e.target.value = '';
              }}
            />
            {erro && <p className="admin-erro" style={{ marginTop: 10 }}>{erro}</p>}
          </>
        )}

        {fase === 'analisando' && <p className="admin-email-sub">Lendo a planilha…</p>}

        {fase === 'revisao' && analise && (
          <>
            <p className="admin-email-sub">
              {analise.totalLinhas} linha(s) lida(s): <strong>{analise.validas.length} nova(s)</strong>
              {analise.duplicadas.length > 0 && <> · {analise.duplicadas.length} já cadastrada(s) (ignoradas)</>}
              {analise.rejeitadas.length > 0 && <> · {analise.rejeitadas.length} com problema</>}
            </p>
            <ListaProblemas titulo="Já cadastradas — não serão importadas" itens={analise.duplicadas} />
            <ListaProblemas titulo="Com problema — não serão importadas" itens={analise.rejeitadas} />
            {erro && <p className="admin-erro" style={{ marginTop: 10 }}>{erro}</p>}
            <div className="admin-email-acoes">
              <button type="button" className="cancelar" onClick={() => setFase('intro')}>
                Escolher outro arquivo
              </button>
              <button
                type="button"
                className="enviar"
                disabled={analise.validas.length === 0}
                onClick={() => void confirmarImportacao()}
              >
                Importar {analise.validas.length} lead(s)
              </button>
            </div>
          </>
        )}

        {fase === 'importando' && <p className="admin-email-sub">Importando…</p>}

        {fase === 'concluido' && resultado && (
          <>
            <p className="admin-email-sub">
              <strong>{resultado.criados} lead(s) importado(s) com sucesso.</strong>
            </p>
            <ListaProblemas titulo="Falharam" itens={resultado.falhas} />
            <div className="admin-email-acoes">
              <button type="button" className="enviar" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}

        {(fase === 'intro' || fase === 'revisao') && (
          <button type="button" className="admin-imp-fechar" onClick={onClose} title="Fechar">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
