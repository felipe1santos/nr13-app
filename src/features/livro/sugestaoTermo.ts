/**
 * O termo SUGERIDO de um formulário de registro — uma regra só para o modal (a
 * prévia e o campo) e para a página (o que é gravado ao salvar).
 *
 * Eram duas cópias da mesma chamada a `termoSugerido`; com a abertura de livro
 * a regra ganhou um ramo, e duas cópias com um ramo cada é como a prévia passa
 * a mostrar uma coisa e o registro a gravar outra.
 */
import { dadosAberturaDoCache, ehAbertura, termoDeAbertura, type DadosAberturaEquipamento } from './aberturaLivro';
import type { FormOcorrencia } from './formRegistro';
import { descricaoCombinada, termoSugerido } from './termoRegistro';
import { tipoDaTag } from '../equipamento/perfilEquipamento';

export function sugestaoDoFormulario(
  form: FormOcorrencia,
  ctx: { tag: string; empresa: string; abertura?: DadosAberturaEquipamento | null },
): string {
  if (ehAbertura(form.tipoOcorrencia)) {
    return termoDeAbertura({
      data: form.data,
      motivo: form.motivoAbertura,
      equipamento: ctx.abertura ?? dadosAberturaDoCache(ctx.tag),
    });
  }
  return termoSugerido({
    tipo: form.tipoOcorrencia,
    data: form.data,
    empresa: ctx.empresa,
    relatorioCodigo: form.relatorioCodigo,
    apto: form.apto,
    descricao: descricaoCombinada(form.oQueFoiFeito, form.descricao),
    tipoEquipamento: tipoDaTag(ctx.tag),
  });
}
