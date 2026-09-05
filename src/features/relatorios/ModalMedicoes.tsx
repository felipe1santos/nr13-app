import { useMemo, useState } from 'react';
import { textoDoErro } from '../../services/textoDoErro';
import {
  REGIOES,
  carregarMedicoes,
  minimoDaRegiao,
  numeroDaCelula,
  salvarMedicoes,
  type GradeMedicoes,
  type Regiao,
} from './medicoesEspessura';

const TITULO: Record<Regiao, string> = {
  ts: 'Tampo superior',
  casco: 'Casco',
  ti: 'Tampo inferior',
};

/**
 * Fase 13C · a grade de espessuras, em React.
 *
 * Substitui a edição por `contenteditable` da folha `ULTRASSOM.html`. Mesma
 * grade, mesmos pontos, mesmas colunas, mesmas chaves — o que muda é onde se
 * digita.
 *
 * ## Detalhes que não são enfeite
 *
 * - **o mínimo aparece na tela**: é ele que vai para `nr13_med_esp_` e alimenta
 *   a caracterização. Na folha, esse número só existia depois de salvar;
 * - **campo vazio em amarelo**: mesma regra visual da 12B, agora nativa;
 * - **`inputMode="decimal"`**: no celular abre o teclado numérico, que é onde a
 *   medição é digitada;
 * - **valor inválido fica em vermelho e NÃO é apagado**: apagar o que o
 *   inspetor digitou seria pior do que mostrar que está errado.
 */
export default function ModalMedicoes({
  tag,
  onFechar,
  onSalvou,
}: {
  tag: string;
  onFechar: () => void;
  onSalvou?: () => void;
}) {
  const inicial = useMemo(() => carregarMedicoes(tag), [tag]);
  const [grade, setGrade] = useState<GradeMedicoes>(inicial.grade);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sujo, setSujo] = useState(false);

  function alterar(regiao: Regiao, linha: number, coluna: number, valor: string) {
    setGrade((g) => {
      const r = g[regiao];
      const linhas = r.linhas.map((l, i) => (i === linha ? l.map((c, j) => (j === coluna ? valor : c)) : l));
      return { ...g, [regiao]: { ...r, linhas } };
    });
    setSujo(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      await salvarMedicoes(tag, grade);
      setSujo(false);
      onSalvou?.();
      onFechar();
    } catch (e) {
      // O erro da fila é um OBJETO, não um Error: sem este tratamento a tela
      // mostrava "[object Object]" (13C).
      setErro(textoDoErro(e, 'Não foi possível salvar as medições.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-content med-modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Medições de espessura — {tag}</h3>
          <button type="button" className="btn-close-modal" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="med-ajuda">
          Os valores vão para o relatório e para o prontuário. O <strong>menor valor de cada região</strong> é o
          que alimenta a caracterização do equipamento.
        </p>

        <div className="modal-body med-corpo">
          {REGIOES.map((regiao) => {
            const r = grade[regiao];
            const pontos = inicial.pontos.filter((p) => p.regiao === regiao);
            if (pontos.length === 0) return null;
            const minimo = minimoDaRegiao(r);
            return (
              <section key={regiao} className="med-secao">
                <div className="med-secao-topo">
                  <h4>{TITULO[regiao]}</h4>
                  <span className="med-minimo">
                    menor valor: <strong>{minimo === '' ? '—' : `${minimo} mm`}</strong>
                  </span>
                </div>
                <div className="med-tabela-rolagem">
                  <table className="med-tabela">
                    <thead>
                      <tr>
                        <th scope="col">Ponto</th>
                        {r.angulos.map((a) => (
                          <th key={a} scope="col">
                            {a}°
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pontos.map((ponto, i) => (
                        <tr key={ponto.id}>
                          <th scope="row">{ponto.rotulo}</th>
                          {r.angulos.map((a, j) => {
                            const valor = r.linhas[i]?.[j] ?? '';
                            const invalido = valor.trim() !== '' && numeroDaCelula(valor) === null;
                            return (
                              <td key={a}>
                                <input
                                  className={`med-celula${valor.trim() === '' ? ' vazia' : ''}${invalido ? ' invalida' : ''}`}
                                  value={valor}
                                  inputMode="decimal"
                                  aria-label={`${ponto.rotulo}, ${a} graus`}
                                  onChange={(e) => alterar(regiao, i, j, e.target.value)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        {erro && <p className="med-erro">{erro}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secundario" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" onClick={() => void salvar()} disabled={salvando || !sujo}>
            {salvando ? 'Salvando…' : 'Salvar medições'}
          </button>
        </div>
      </div>
    </div>
  );
}
