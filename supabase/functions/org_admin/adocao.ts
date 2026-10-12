// QUANDO a org_admin pode ADOTAR um usuário que já existe no Auth (12/10/2026).
//
// A adoção existe para UMA situação: a tentativa anterior de criar o sub-login
// gravou o usuário no Auth e falhou antes de gravar o perfil — a retentativa
// recebe "already registered" e precisa terminar o serviço em vez de travar.
//
// O que quebrou: a regra antiga adotava QUALQUER perfil da mesma organização.
// O mestre `gabriel.dadona` criou o acesso ao Portal de um cliente com o
// PRÓPRIO e-mail; o próprio mestre é "da organização", foi adotado, virou
// `papel='cliente'` e teve a senha trocada pela do formulário — todo login
// passou a cair no Portal, sem caminho de volta pela tela. A cláusula do
// "mestre órfão" (criado_por nulo, org própria) tinha o mesmo defeito em
// escala maior: é exatamente o formato de QUALQUER conta independente.
//
// Regra: só se adota o que comprovadamente é sobra de uma tentativa desta
// organização para o MESMO papel. Todo o resto é "use outro e-mail".
//
// Sem imports: roda no Deno da Edge e no vitest (`orgAdminAdocao.test.ts`).

export interface PerfilExistente {
  org_id: string | null;
  papel: string | null;
  cliente_id: string | null;
}

export interface PedidoAdocao {
  /** id do usuário que já existe no Auth com o e-mail pedido */
  existenteId: string;
  /** user_metadata desse usuário (a origem gravada na criação, Fase 0 D-24) */
  metadata: Record<string, unknown> | null | undefined;
  /** perfil dele em `profiles`, ou null se não existe */
  perfil: PerfilExistente | null;
  /** quem está chamando (o mestre) e a organização dele */
  chamadorId: string;
  orgId: string;
  /** o que está sendo criado */
  papel: string;
  clienteId: string | null;
  /** linhas em app_storage gravadas sob o id do existente como organização */
  linhasDeDados: number;
}

export type DecisaoAdocao = { adotar: true } | { adotar: false; erro: string };

const OUTRO_EMAIL = 'Use outro e-mail.';

export function decidirAdocao(p: PedidoAdocao): DecisaoAdocao {
  if (p.existenteId === p.chamadorId) {
    return {
      adotar: false,
      erro: 'Este é o e-mail do seu próprio login principal e não pode ser usado num acesso. ' + OUTRO_EMAIL,
    };
  }

  const perfil = p.perfil;

  // Sem perfil: o Auth tem o usuário, `profiles` não. Só é nosso se a criação
  // foi desta organização — a metadata da origem diz isso.
  if (!perfil) {
    if (p.metadata?.nr13_org_id === p.orgId) return { adotar: true };
    return { adotar: false, erro: 'Este e-mail já pertence a outra conta. ' + OUTRO_EMAIL };
  }

  // Dono de organização (mestre da própria org) nunca é adotado, nem com
  // metadata — conta principal não vira sub-login de ninguém.
  if (perfil.papel === 'mestre' && perfil.org_id === p.existenteId) {
    // Exceção estreita: o trigger antigo criava o perfil como mestre antes do
    // upsert. Só é sobra se a metadata aponta ESTA org E o papel pedido, e se
    // a "organização" dele não tem dado nenhum.
    const sobra =
      p.metadata?.nr13_org_id === p.orgId &&
      p.metadata?.nr13_papel === p.papel &&
      p.linhasDeDados === 0;
    if (sobra) return { adotar: true };
    return { adotar: false, erro: 'Este e-mail é de uma conta principal. ' + OUTRO_EMAIL };
  }

  if (perfil.org_id !== p.orgId) {
    return { adotar: false, erro: 'Este e-mail já pertence a outra conta. ' + OUTRO_EMAIL };
  }

  // Da mesma organização: retentativa do MESMO acesso, nunca conversão de um
  // login em outro (funcionário virando portal, gerente virando cliente...).
  const mesmoAcesso =
    perfil.papel === p.papel && (p.papel !== 'cliente' || perfil.cliente_id === p.clienteId);
  if (mesmoAcesso) return { adotar: true };
  return {
    adotar: false,
    erro: 'Este e-mail já é de outro acesso da sua organização. ' + OUTRO_EMAIL,
  };
}
