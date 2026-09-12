import { useState } from 'react';
import { Icone } from '../../../components/Icone';
import {
  itensQueSeraoEscritos,
  type ModoAplicacao,
  type PlanoAplicacao,
} from './aplicacao';
import type { Predefinicao } from './modelo';

/**
 * REVISAR ANTES DE APLICAR.
 *
 * ## A tela que a regra exige
 *
 * Clicar em "Usar" não escreve nada. Esta tela é o passo entre a escolha e o
 * ato, e ela existe por dois motivos diferentes:
 *
 * - **o que entra é texto técnico num documento assinado.** Quem aplica precisa
 *   ver a frase inteira, não o nome do conjunto;
 * - **o relatório pode já ter conteúdo.** Onde há conflito, a linha mostra o que
 *   está escrito HOJE ao lado do que a predefinição propõe, e o modo padrão
 *   (`vazios`) NÃO toca nesses campos. Sobrescrever é uma escolha que o usuário
 *   faz olhando para os dois textos.
 *
 * ## O estado `ausente`
 *
 * Campo que a predefinição declara e este relatório não desenha — folha de
 * teste hidrostático não selecionada, por exemplo. Ele aparece na lista,
 * riscado, com o motivo. Sem isso o contador diria "8 campos preenchidos" e o
 * documento mostraria três: a falha silenciosa que este sistema já pagou caro
 * (§2-ter do CLAUDE.md).
 */
export default function RevisaoAplicacao({
  predefinicao,
  plano,
  ocupado,
  erro,
  onAplicar,
  onVoltar,
}: {
  predefinicao: Predefinicao;
  plano: PlanoAplicacao;
  ocupado?: boolean;
  erro?: string;
  onAplicar: (modo: ModoAplicacao) => void;
  onVoltar: () => void;
}) {
  const [modo, setModo] = useState<ModoAplicacao>('vazios');
  const escritos = itensQueSeraoEscritos(plano, modo);

  return (
    <>
      <div className="predef-corpo predef-revisao">
        <div className="predef-rev-cab">
          <h4>{predefinicao.nome}</h4>
          {predefinicao.descricao && <p>{predefinicao.descricao}</p>}
        </div>

        <ul className="predef-rev-contagem">
          <li className="e-ok">
            <strong>{plano.totalVazios}</strong> campo{plano.totalVazios === 1 ? '' : 's'} vazio
            {plano.totalVazios === 1 ? '' : 's'}
          </li>
          {plano.totalConflitos > 0 && (
            <li className="e-conflito">
              <strong>{plano.totalConflitos}</strong> já {plano.totalConflitos === 1 ? 'possui' : 'possuem'}{' '}
              conteúdo
            </li>
          )}
          {plano.totalIguais > 0 && (
            <li>
              <strong>{plano.totalIguais}</strong> já {plano.totalIguais === 1 ? 'está' : 'estão'} com
              este valor
            </li>
          )}
          {plano.totalProtegidos > 0 && (
            <li className="e-protegido">
              <strong>{plano.totalProtegidos}</strong>{' '}
              {plano.totalProtegidos === 1 ? 'vem' : 'vêm'} da inspeção e{' '}
              {plano.totalProtegidos === 1 ? 'prevalece' : 'prevalecem'}
            </li>
          )}
          {plano.totalAusentes > 0 && (
            <li>
              <strong>{plano.totalAusentes}</strong> não {plano.totalAusentes === 1 ? 'existe' : 'existem'}{' '}
              neste relatório
            </li>
          )}
        </ul>

        {plano.totalConflitos > 0 && (
          <fieldset className="predef-modos">
            <legend>
              {plano.totalConflitos} campo{plano.totalConflitos === 1 ? '' : 's'} já{' '}
              {plano.totalConflitos === 1 ? 'possui' : 'possuem'} conteúdo. O que fazer com{' '}
              {plano.totalConflitos === 1 ? 'ele' : 'eles'}?
            </legend>
            <label className={modo === 'vazios' ? 'is-ativo' : ''}>
              <input
                type="radio"
                name="modo-predef"
                checked={modo === 'vazios'}
                disabled={ocupado}
                onChange={() => setModo('vazios')}
              />
              <span>
                <strong>Preencher apenas os campos vazios</strong>
                <em>O que já está escrito permanece como está.</em>
              </span>
            </label>
            <label className={modo === 'substituir' ? 'is-ativo' : ''}>
              <input
                type="radio"
                name="modo-predef"
                checked={modo === 'substituir'}
                disabled={ocupado}
                onChange={() => setModo('substituir')}
              />
              <span>
                <strong>
                  Substituir também {plano.totalConflitos === 1 ? 'o campo' : 'os campos'} já
                  {plano.totalConflitos === 1 ? ' preenchido' : ' preenchidos'}
                </strong>
                <em>O texto atual desses campos é trocado pelo da predefinição.</em>
              </span>
            </label>
          </fieldset>
        )}

        <ul className="predef-rev-lista">
          {plano.itens.map((it) => {
            const vai = escritos.some((e) => e.id === it.id);
            return (
              <li key={it.id} className={`e-${it.estado}${vai ? ' vai-escrever' : ''}`}>
                <div className="predef-rev-nome">
                  <Icone
                    nome={
                      vai
                        ? 'check'
                        : it.estado === 'protegido'
                          ? 'cadeado'
                          : it.estado === 'ausente'
                            ? 'alerttri'
                            : 'x'
                    }
                    tam={12}
                  />
                  <span>{it.rotulo}</span>
                  {it.estado === 'ausente' && <em>não existe neste relatório</em>}
                  {it.estado === 'igual' && <em>já está com este valor</em>}
                  {it.estado === 'conflito' && !vai && <em>mantido como está</em>}
                  {/* O estado que NENHUM modo alcança. A frase diz de onde veio o
                      dado, porque "protegido" sozinho não explica nada a quem
                      esperava ver o campo preenchido. */}
                  {it.estado === 'protegido' && (
                    <em>preenchido pel{it.fonte === 'container de inspeção' ? 'a inspeção de campo' : 'o sistema'} — prevalece</em>
                  )}
                </div>

                {it.estado === 'protegido' ? (
                  <p className="predef-rev-valor predef-rev-protegido">{it.atual}</p>
                ) : it.estado === 'conflito' ? (
                  <div className="predef-rev-troca">
                    <div className="predef-rev-antes">
                      <span>valor atual</span>
                      <p>{it.atual}</p>
                    </div>
                    <Icone nome="arrowright" tam={13} />
                    <div className="predef-rev-depois">
                      <span>valor da predefinição</span>
                      <p>{it.novo.trim() === '' ? '— em branco —' : it.novo}</p>
                    </div>
                  </div>
                ) : (
                  it.estado !== 'ausente' && (
                    <p className="predef-rev-valor">
                      {it.novo.trim() === '' ? '— em branco —' : it.novo}
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>

        <p className="predef-bloco-nota">
          Os valores entram somente neste rascunho e continuam editáveis. A ficha do equipamento, a
          inspeção de campo e os cadastros do sistema não são alterados.
        </p>

        {erro && <p className="med-erro">{erro}</p>}
      </div>

      <footer className="predef-rodape">
        <button type="button" className="fj-btn fj-btn-ghost" onClick={onVoltar} disabled={ocupado}>
          Voltar
        </button>
        <span className="predef-espaco" />
        <button
          type="button"
          className={`fj-btn fj-btn-primary${ocupado ? ' is-loading' : ''}`}
          disabled={ocupado || escritos.length === 0}
          onClick={() => onAplicar(modo)}
        >
          {ocupado
            ? 'Aplicando…'
            : escritos.length === 0
              ? 'Nada a preencher'
              : `Aplicar em ${escritos.length} campo${escritos.length === 1 ? '' : 's'}`}
        </button>
      </footer>
    </>
  );
}
