import { useMemo, useState } from 'react';
import { Icone } from '../../../components/Icone';
import {
  campoPredefinivel,
  gruposDeCampos,
  type CampoPredefinivel,
} from './camposPredefiniveis';
import { idsDoConjunto, nomeRepetido, type Predefinicao } from './modelo';

/**
 * O FORMULÁRIO de um conjunto — criar e editar são a mesma tela.
 *
 * ## Três blocos, nesta ordem
 *
 * 1. **Identificação** — nome e descrição. O nome é o que aparece na lista; a
 *    descrição é o "quando usar", que é a pergunta real de quem escolhe um
 *    conjunto três meses depois.
 * 2. **Campos** — a allowlist agrupada por seção do documento. Marcar a caixa
 *    abre o editor daquele valor logo abaixo, com o tipo certo: caixa de texto
 *    curta, área de texto longa ou lista de opções.
 * 3. **Resumo** — o que foi configurado, na ordem das folhas. É a conferência
 *    antes de salvar; sem ela, um conjunto de doze campos só se confere rolando
 *    o formulário inteiro de volta.
 *
 * ## Por que marcar e digitar são gestos separados
 *
 * Porque **valor vazio é um valor**. Um conjunto "Inspeção periódica sem
 * recomendações" declara as quatro linhas de recomendação com texto vazio, e
 * aplicá-lo limpa a tabela de propósito. Se a presença do campo fosse deduzida
 * do valor digitado, esse conjunto seria impossível de montar.
 */
export default function EditorPredefinicao({
  inicial,
  lista,
  ocupado,
  erro,
  onSalvar,
  onCancelar,
}: {
  inicial: Predefinicao;
  /** Os outros conjuntos — só para avisar de nome repetido. */
  lista: Predefinicao[];
  ocupado?: boolean;
  erro?: string;
  onSalvar: (p: Predefinicao) => void;
  onCancelar: () => void;
}) {
  const [p, setP] = useState<Predefinicao>(inicial);
  const grupos = useMemo(() => gruposDeCampos(), []);
  const ids = idsDoConjunto(p);
  const repetido = nomeRepetido(lista, p);
  const podeSalvar = p.nome.trim() !== '' && ids.length > 0 && !ocupado;

  function alternar(campo: CampoPredefinivel, marcado: boolean) {
    setP((atual) => {
      const campos = { ...atual.campos };
      if (marcado) campos[campo.id] = campos[campo.id] ?? valorInicial();
      else delete campos[campo.id];
      return { ...atual, campos };
    });
  }

  function definir(id: string, valor: string) {
    setP((atual) => ({ ...atual, campos: { ...atual.campos, [id]: valor } }));
  }

  return (
    <>
      <div className="predef-corpo predef-form">
        <fieldset className="predef-bloco">
          <legend>Identificação</legend>
          <label className="predef-campo">
            <span>
              Nome do conjunto <b aria-hidden="true">*</b>
            </span>
            <input
              value={p.nome}
              maxLength={80}
              disabled={ocupado}
              placeholder="Ex.: Não conformidade — vaso de pressão"
              onChange={(e) => setP({ ...p, nome: e.target.value })}
            />
          </label>
          {repetido && (
            <p className="predef-aviso">
              <Icone nome="alerttri" tam={13} /> Já existe outro conjunto com este nome. Dois rótulos
              iguais na lista ficam indistinguíveis na hora de aplicar.
            </p>
          )}
          <label className="predef-campo">
            <span>Descrição (opcional)</span>
            <input
              value={p.descricao}
              maxLength={160}
              disabled={ocupado}
              placeholder="Ex.: usar quando houver intervenção antes da próxima inspeção."
              onChange={(e) => setP({ ...p, descricao: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="predef-bloco">
          <legend>Campos do conjunto</legend>
          <p className="predef-bloco-nota">
            Marque os campos que esta predefinição deve preencher. Só aparecem aqui os campos de
            texto que você escreve à mão no relatório — dados da ficha, cálculos, medições,
            inspeção de campo e assinaturas não podem ser predefinidos.
          </p>

          {grupos.map((g) => (
            <div className="predef-grupo" key={g.nome}>
              <h5>{g.nome}</h5>
              <ul className="predef-campos">
                {g.campos.map((c) => {
                  const marcado = Object.prototype.hasOwnProperty.call(p.campos, c.id);
                  return (
                    <li key={c.id} className={marcado ? 'is-marcado' : ''}>
                      <label className="predef-check">
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={ocupado}
                          onChange={(e) => alternar(c, e.target.checked)}
                        />
                        <span className="predef-check-txt">
                          {c.rotulo}
                          {c.ajuda && <em>{c.ajuda}</em>}
                        </span>
                      </label>
                      {marcado && (
                        <EditorValor
                          campo={c}
                          valor={p.campos[c.id] ?? ''}
                          ocupado={ocupado}
                          onValor={(v) => definir(c.id, v)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </fieldset>

        <fieldset className="predef-bloco">
          <legend>Resumo da predefinição</legend>
          {ids.length === 0 ? (
            <p className="predef-bloco-nota">Nenhum campo selecionado ainda.</p>
          ) : (
            <>
              <p className="predef-resumo-cab">
                <strong>{p.nome.trim() || 'Sem nome'}</strong>
                <span>
                  {ids.length} campo{ids.length === 1 ? '' : 's'} configurado
                  {ids.length === 1 ? '' : 's'}
                </span>
              </p>
              <dl className="predef-resumo-lista">
                {ids.map((id) => (
                  <div key={id}>
                    <dt>{campoPredefinivel(id)?.rotulo ?? id}</dt>
                    <dd className={(p.campos[id] ?? '').trim() === '' ? 'e-vazio' : ''}>
                      {(p.campos[id] ?? '').trim() === ''
                        ? 'deixar em branco no documento'
                        : p.campos[id]}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </fieldset>

        {erro && <p className="med-erro">{erro}</p>}
      </div>

      <footer className="predef-rodape">
        <button type="button" className="fj-btn fj-btn-ghost" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </button>
        <span className="predef-espaco" />
        <button
          type="button"
          className={`fj-btn fj-btn-primary${ocupado ? ' is-loading' : ''}`}
          disabled={!podeSalvar}
          onClick={() => onSalvar(p)}
        >
          {ocupado ? 'Salvando…' : 'Salvar predefinição'}
        </button>
      </footer>
    </>
  );
}

/**
 * O editor de UM valor, no tipo do campo.
 *
 * Transformar tudo em área de texto seria mais curto de escrever e pior de
 * usar: um prazo ("30 dias") numa caixa de seis linhas convida a escrever um
 * parágrafo que não cabe na célula da tabela, e uma resposta SIM/NÃO digitada à
 * mão chega ao papel como "sim", "Sim" ou "S" conforme o dia.
 */
function EditorValor({
  campo,
  valor,
  ocupado,
  onValor,
}: {
  campo: CampoPredefinivel;
  valor: string;
  ocupado?: boolean;
  onValor: (v: string) => void;
}) {
  if (campo.tipo === 'opcao') {
    return (
      <div className="predef-valor">
        <select value={valor} disabled={ocupado} onChange={(e) => onValor(e.target.value)}>
          <option value="">— deixar em branco —</option>
          {(campo.opcoes ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (campo.tipo === 'textoLongo') {
    return (
      <div className="predef-valor">
        <textarea
          rows={3}
          value={valor}
          disabled={ocupado}
          placeholder="Escreva o texto que deve ir para este campo."
          onChange={(e) => onValor(e.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="predef-valor">
      <input
        value={valor}
        disabled={ocupado}
        placeholder="Valor deste campo"
        onChange={(e) => onValor(e.target.value)}
      />
    </div>
  );
}

/** Marcar a caixa não escolhe valor nenhum: o campo nasce vazio e o usuário escreve. */
function valorInicial(): string {
  return '';
}
