import { useRef } from 'react';
import { Icone } from '../../components/Icone';
import { useFocoPreso } from '../../components/useFocoPreso';
import AvatarPessoa from './AvatarPessoa';
import { folhasEfetivas } from './folhasDoAssinante';
import type { Funcionario } from './tipos';

/**
 * VER o funcionário sem abrir o formulário (13/09/2026).
 *
 * ## O que resolve
 *
 * O card da lista mostra nome, tipo, CREA e se há assinatura. Todo o resto —
 * a rubrica, a função impressa, as informações adicionais e, sobretudo, **quais
 * folhas aquela pessoa assina** — só aparecia dentro de "Editar". Quem queria
 * apenas conferir precisava abrir o formulário, e um formulário aberto é um
 * formulário que se altera sem querer: um clique numa caixa de folha muda quem
 * carimba o próximo documento.
 *
 * Este diálogo é só leitura. Não tem input, não tem Salvar e não grava nada.
 *
 * ## A parte que não pode mentir
 *
 * `folhasProntuario` e `folhasRelatorio` ausentes **não** significam "nenhuma
 * folha": significam a regra padrão do motor de assinatura — Engenheiro assina
 * todas, Inspetor nenhuma (ver `defaultFolhas*` em `Funcionarios.tsx`). Um
 * cadastro antigo mostraria "0 folhas" e o documento sairia carimbado mesmo
 * assim, que é o pior tipo de tela: a que desmente o papel.
 *
 * Por isso a seção mostra o que REALMENTE vale hoje e diz de onde isso vem —
 * escolha do cadastro ou regra padrão.
 */
export default function ModalVerFuncionario({
  funcionario,
  folhasProntuario,
  folhasRelatorio,
  rotulosProntuario,
  rotulosRelatorio,
  onEditar,
  onFechar,
}: {
  funcionario: Funcionario;
  /** Todas as folhas assináveis do prontuário, na ordem das folhas. */
  folhasProntuario: readonly string[];
  /** Todas as folhas assináveis do relatório, na ordem do documento. */
  folhasRelatorio: readonly string[];
  rotulosProntuario: Record<string, string>;
  rotulosRelatorio: Record<string, string>;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);

  const f = funcionario;
  const extras = (f.camposExtras ?? []).filter((c) => (c.rotulo ?? '').trim() || (c.valor ?? '').trim());

  return (
    <div className="verfunc-overlay" onClick={onFechar}>
      <div
        ref={caixa}
        className="verfunc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Dados de ${f.nome}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="verfunc-cab">
          <AvatarPessoa nome={f.nome} />
          <div className="verfunc-cab-txt">
            <h3>{f.nome}</h3>
            <p>
              {f.tipo}
              {f.crea.trim() && <> · {f.crea}</>}
            </p>
          </div>
          <button type="button" className="verfunc-x" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="verfunc-corpo">
          <section className="verfunc-secao">
            <h4>Assinatura</h4>
            {f.assinatura ? (
              <div className="verfunc-rubrica">
                <img src={f.assinatura} alt={`Assinatura de ${f.nome}`} />
              </div>
            ) : (
              /* O aviso é deliberado: sem rubrica o motor de assinatura carimba
                 a folha com nome e registro, mas sem a imagem — e quem confere
                 antes de emitir precisa saber disso aqui, não no PDF. */
              <p className="verfunc-vazio">
                <Icone nome="alerttri" tam={13} /> Sem assinatura cadastrada — as folhas saem com o
                nome e o registro, sem a rubrica.
              </p>
            )}
          </section>

          <section className="verfunc-secao">
            <h4>Identificação</h4>
            <dl className="verfunc-dados">
              <Dado rotulo="Tipo" valor={f.tipo} />
              <Dado rotulo="CREA / Registro" valor={f.crea} />
              <Dado
                rotulo="Função (exibida na assinatura)"
                valor={f.funcao}
                vazio="não informada — a folha usa o tipo do profissional"
              />
            </dl>
          </section>

          {extras.length > 0 && (
            <section className="verfunc-secao">
              <h4>Informações adicionais do assinante</h4>
              <dl className="verfunc-dados">
                {extras.map((c, i) => (
                  <Dado key={i} rotulo={c.rotulo || '(sem rótulo)'} valor={c.valor} />
                ))}
              </dl>
            </section>
          )}

          <Folhas
            titulo="Assina no prontuário"
            escolhidas={f.folhasProntuario}
            todas={folhasProntuario}
            rotulos={rotulosProntuario}
            tipo={f.tipo}
          />
          <Folhas
            titulo="Assina no relatório"
            escolhidas={f.folhasRelatorio}
            todas={folhasRelatorio}
            rotulos={rotulosRelatorio}
            tipo={f.tipo}
          />
        </div>

        <footer className="verfunc-rodape">
          <span className="verfunc-espaco" />
          <button type="button" className="btn-secundario" onClick={onFechar}>
            Fechar
          </button>
          <button type="button" className="btn-primario" onClick={onEditar}>
            <Icone nome="pencil" tam={13} /> Editar
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Uma linha rótulo/valor. Valor ausente vira um texto que EXPLICA a ausência. */
function Dado({ rotulo, valor, vazio }: { rotulo: string; valor?: string; vazio?: string }) {
  const v = (valor ?? '').trim();
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd className={v ? '' : 'e-vazio'}>{v || vazio || 'não informado'}</dd>
    </div>
  );
}

/**
 * As folhas que este profissional assina, e DE ONDE vem essa lista.
 *
 * `escolhidas === undefined` é cadastro que nunca passou pela tela de folhas —
 * vale a regra padrão do motor. Mostrar a lista efetiva sem dizer isso faria
 * parecer escolha do usuário; dizer "nenhuma" seria pior ainda, porque o
 * documento sai carimbado.
 */
function Folhas({
  titulo,
  escolhidas,
  todas,
  rotulos,
  tipo,
}: {
  titulo: string;
  escolhidas?: string[];
  todas: readonly string[];
  rotulos: Record<string, string>;
  tipo: Funcionario['tipo'];
}) {
  const { lista, origem } = folhasEfetivas(escolhidas, todas, tipo);
  const doPadrao = origem === 'padrao';

  return (
    <section className="verfunc-secao">
      <h4>
        {titulo}
        <span className="verfunc-contagem">
          {lista.length} de {todas.length}
        </span>
      </h4>

      {doPadrao && (
        <p className="verfunc-nota">
          <Icone nome="info" tam={12} /> Nunca configurado neste cadastro — vale a regra padrão do
          sistema: engenheiro assina todas, inspetor nenhuma.
        </p>
      )}

      {lista.length === 0 ? (
        <p className="verfunc-vazio">Não assina nenhuma folha.</p>
      ) : (
        <ul className="verfunc-folhas">
          {lista.map((a) => (
            <li key={a}>
              <Icone nome="check" tam={12} /> {rotulos[a] ?? a}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
