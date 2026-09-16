/**
 * Memorial de cálculo — `/equipamento/:tag/memorial`.
 *
 * ## A MESMA PORTA DA FICHA (16/09/2026)
 *
 * Esta tela tinha o padrão antigo da ficha: `carregarInfo(tag)` do cache e, não
 * achando, `navigate('/equipamentos')` num efeito. Chegando pela ficha ela
 * funcionava — a ficha já havia semeado a TAG —, mas a URL direta, a aba nova e
 * o F5 dentro do memorial devolviam o usuário para a lista, em silêncio. É o
 * mesmo defeito do §3-ter do CLAUDE.md, na tela vizinha.
 *
 * A correção NÃO é uma segunda implementação: a porta (`PortaEquipamento.tsx`)
 * e a regra de dados (`aberturaFicha.ts`) são as MESMAS da ficha. Duas cópias
 * divergiriam na primeira mudança.
 *
 * O CÁLCULO não muda nada: `MemorialVaso`/`MemorialAutoclave`/`MemorialCaldeira`
 * recebem a mesma TAG e leem as mesmas chaves — que agora estão no cache porque
 * a porta as semeou antes de montar.
 */
import { Link, useParams } from 'react-router-dom';
import MemorialVaso from '../features/memorial/MemorialVaso';
import MemorialAutoclave from '../features/memorial/MemorialAutoclave';
import MemorialCaldeira from '../features/memorial/MemorialCaldeira';
import '../features/memorial/memorial.css';
import { rotaEquipamento } from '../app/rotas';
import { TelaAbertura } from '../features/equipamento/PortaEquipamento';
import { useAberturaEquipamento } from '../features/equipamento/usarAberturaEquipamento';
import type { InfoEquipamento } from '../features/equipamento/tipos';

export default function Memorial() {
  const { tag = '' } = useParams<{ tag: string }>();
  // key={tag}: trocar de equipamento remonta a porta, e o estado nasce do cache
  // daquela TAG.
  return <PortaMemorial key={tag} tag={tag} />;
}

function PortaMemorial({ tag }: { tag: string }) {
  const { abertura, tentarDeNovo } = useAberturaEquipamento(tag);

  if (abertura.estado !== 'encontrado') {
    return (
      <TelaAbertura
        abertura={abertura}
        tag={tag}
        onTentar={tentarDeNovo}
        classeDaPagina="memorial-page"
      />
    );
  }

  // A TAG RESOLVIDA, não a da URL: as chaves do memorial se montam com a chave
  // real (ver a segunda tentativa de `abrirFicha`).
  return <MemorialView tag={abertura.tag} info={abertura.info} />;
}

function MemorialView({ tag, info }: { tag: string; info: InfoEquipamento }) {
  return (
    <div className="memorial-page">
      <div className="memorial-page-header">
        <Link to={rotaEquipamento(tag)} className="btn-voltar-memorial">
          ← Voltar para Lista
        </Link>
        <div>
          <h1>{tag} — Calculadora de Memorial</h1>
          <p className="equipamento-subtitulo">
            {info.tipo === 'vaso'
              ? 'Vaso de Pressão'
              : info.tipo === 'autoclave'
                ? `Autoclave (${info.subtipo})`
                : 'Caldeira'}
          </p>
        </div>
      </div>

      {info.tipo === 'vaso' && <MemorialVaso tag={tag} />}
      {info.tipo === 'autoclave' && (
        <MemorialAutoclave tag={tag} subtipo={(info.subtipo as 'retangular' | 'cilindrica' | 'vertical') || 'cilindrica'} />
      )}
      {info.tipo === 'caldeira' && <MemorialCaldeira tag={tag} />}
    </div>
  );
}
