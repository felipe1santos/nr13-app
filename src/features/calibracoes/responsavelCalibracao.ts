import { ler } from '../../services/storage';
import { visiveis } from '../../services/colecoes';
import type { Funcionario } from '../cadastros/tipos';
import type { DadosCalibracao, ResponsavelCalibracao } from './tipos';
import { ehInterna } from './tipos';

/**
 * Revisão do engenheiro, fase 2 (C.2) · o RESPONSÁVEL PELA CALIBRAÇÃO.
 *
 * A fonte é o cadastro de Funcionários (`nr13_lista_phs`) — a mesma que assina
 * relatório e prontuário. Nada de assinatura nova: reusa nome, função, CREA e a
 * rubrica (`assinaturaRef`, endereçada pelo conteúdo no bucket).
 */
export function listarResponsaveis(): Funcionario[] {
  // SELECTOR: passa por `visiveis`, a porta unica do tombstone. Funcionario
  // excluido nao pode continuar oferecido como responsavel.
  return visiveis(ler<Funcionario[]>('nr13_lista_phs') ?? []).filter((f) => (f?.nome ?? '').trim() !== '');
}

/**
 * O snapshot que vai para o registro da calibração. Com referência no bucket,
 * congela SÓ a referência (a dataURL sai — ela voltaria a pesar no
 * `app_storage`); sem referência, congela a dataURL, como `snapshotAssinantes`.
 */
export function snapshotResponsavel(f: Funcionario): ResponsavelCalibracao {
  const rubrica = f.assinaturaRef?.path
    ? { assinaturaRef: f.assinaturaRef }
    : f.assinatura
      ? { assinatura: f.assinatura }
      : {};
  return {
    id: f.id,
    nome: (f.nome ?? '').trim(),
    funcao: (f.funcao ?? '').trim() || (f.tipo === 'Engenheiro' ? 'Engenheiro' : f.tipo === 'Inspetor' ? 'Inspetor' : ''),
    registro: (f.crea ?? '').trim(),
    ...rubrica,
  };
}

/** O responsável tem imagem de assinatura (referência ou dataURL)? */
export function temRubrica(r: ResponsavelCalibracao | null | undefined): boolean {
  return !!(r?.assinaturaRef?.path || (r?.assinatura ?? '').startsWith('data:'));
}

/**
 * O que IMPEDE a emissão. Lista vazia = pode emitir.
 *
 * Emitir sem responsável é exatamente o "certificado sem ninguém que responda
 * por ele" que a revisão proibiu — bloqueia, com o motivo escrito. A falta da
 * IMAGEM da rubrica não bloqueia (o nome, a função e o registro identificam o
 * responsável), mas aparece como aviso em `avisosEmissao`.
 */
export function pendenciasEmissao(cal: DadosCalibracao): string[] {
  if (!ehInterna(cal)) return ['Calibração de laboratório externo não gera certificado interno.'];
  const out: string[] = [];
  if (cal.status === 'emitido') out.push('Este certificado já foi emitido.');
  if (!cal.responsavel?.nome?.trim()) out.push('Escolha o responsável pela calibração.');
  if (!cal.numeroCertificado?.trim()) out.push('Informe o nº do certificado.');
  if (!cal.dataCalibracao?.trim()) out.push('Informe a data da calibração.');
  if (!cal.statusConclusao) out.push('Informe a conclusão técnica (aprovado/reprovado).');
  return out;
}

export function avisosEmissao(cal: DadosCalibracao): string[] {
  if (!ehInterna(cal)) return [];
  const out: string[] = [];
  if (cal.responsavel && !temRubrica(cal.responsavel)) {
    out.push('O responsável não tem assinatura cadastrada: o certificado sai com nome e registro, sem a rubrica.');
  }
  if (cal.responsavel && !cal.responsavel.registro) {
    out.push('O responsável não tem registro profissional (CREA) cadastrado.');
  }
  return out;
}
