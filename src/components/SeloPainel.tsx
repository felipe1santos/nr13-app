/**
 * Fase 9 · 9D.5 — a PROCEDÊNCIA do painel de vencimentos, dita na tela.
 *
 * Exigência do dono no desenho (§15): o painel não pode apresentar informação
 * antiga como se tivesse acabado de ser consultada. Vale para os três casos
 * em que a tela sabe menos do que parece:
 *
 *   · veio do servidor  → a HORA em que ele agregou;
 *   · lista truncada    → quantas linhas ficaram de fora (nunca em silêncio);
 *   · sem resposta      → o painel diz que não sabe, e não "está tudo em dia".
 *
 * Sem `boot_v9` este componente não desenha nada: o painel é calculado no
 * aparelho, na hora, e não há procedência a explicar.
 */
import type { PainelVencimentos } from '../services/vencimentosServidor';

export default function SeloPainel({
  painel,
}: {
  painel: PainelVencimentos & { carregando?: boolean };
}) {
  if (painel.fonte !== 'servidor') return null;

  if (painel.erro) {
    return (
      <div className="fj-selo-painel erro" role="status">
        Sem resposta do servidor — os números abaixo não puderam ser conferidos.
      </div>
    );
  }

  if (painel.carregando) {
    return (
      <div className="fj-selo-painel" role="status">
        Consultando os prazos…
      </div>
    );
  }

  const hora = painel.em?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fj-selo-painel" role="status">
      {hora ? `Dados de ${hora}` : 'Dados do servidor'}
      {painel.truncado && (
        <>
          {' · '}
          <b>{painel.restantes}</b> {painel.restantes === 1 ? 'item' : 'itens'} além dos mais
          urgentes não estão na lista
        </>
      )}
    </div>
  );
}
