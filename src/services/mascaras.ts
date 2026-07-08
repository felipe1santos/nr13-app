/**
 * Máscara de data dd/mm/aaaa: insere as barras conforme o usuário digita.
 * Só dígitos contam (barras digitadas/faltando são normalizadas), máximo 8.
 */
export function mascararData(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
