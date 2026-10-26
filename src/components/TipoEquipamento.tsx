/**
 * Tipo de equipamento com IDENTIDADE (v5, 25/10/2026): ícone + texto na cor do
 * tipo — vaso em azul, caldeira em vermelho (a chama), autoclave em roxo.
 *
 * A cor fica no ícone e no texto, nunca no fundo da linha: vermelho de caldeira
 * não pode ser lido como status crítico, e status continua sendo selo com
 * texto. Tipo desconhecido sai neutro, com o nome que veio.
 */
import type { CSSProperties } from 'react';
import { Icone } from './Icone';
import type { NomeIcone } from './Icone';
import FotoImg from './FotoImg';
import type { RefFoto } from '../services/fotos';

export const ICONE_TIPO: Record<string, NomeIcone> = {
  vaso: 'cylinder',
  caldeira: 'flame',
  autoclave: 'autoclave',
};

export const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

export function TipoEquipamento({ tipo, tam = 13, className = '' }: { tipo: string | null; tam?: number; className?: string }) {
  const t = tipo ?? '';
  const conhecido = t in ICONE_TIPO;
  return (
    <span className={`tipo-eq${conhecido ? ` ${t}` : ''}${className ? ` ${className}` : ''}`}>
      <Icone nome={ICONE_TIPO[t] ?? 'box'} tam={tam} />
      {ROTULO_TIPO[t] ?? (t || 'Equipamento')}
    </span>
  );
}

/**
 * Miniatura do equipamento: a foto de capa (referência do bucket, resolvida
 * sob demanda e só quando aparece na tela) ou, sem foto, o ícone do tipo num
 * quadrado na cor do tipo — nunca um buraco cinza escrito "Sem foto".
 */
export function MiniaturaEquipamento({
  tipo,
  fotoRef,
  tag,
  className = '',
  style,
}: {
  tipo: string | null;
  fotoRef: RefFoto | null;
  tag: string;
  className?: string;
  style?: CSSProperties;
}) {
  const t = tipo ?? '';
  return (
    <span className={`mini-eq${t in ICONE_TIPO ? ` ${t}` : ''}${className ? ` ${className}` : ''}`} style={style}>
      {fotoRef ? (
        <FotoImg foto={{ ref: fotoRef }} alt={`Foto do equipamento ${tag}`} variante="thumb" placeholder="" />
      ) : (
        <Icone nome={ICONE_TIPO[t] ?? 'box'} tam={20} />
      )}
    </span>
  );
}
