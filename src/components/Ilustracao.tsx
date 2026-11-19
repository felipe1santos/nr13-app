/**
 * Ilustrações do redesign Cobalto (18/11/2026). Aparecem SÓ em estado vazio,
 * busca sem resultado e confirmação — nunca disputam espaço com dado.
 *
 * Arquivos em public/ilustracoes/ (WebP sem fundo, recortados rente).
 * Licença: Freepik/Magnific Premium — o dono confirmou a licença para uso em
 * produção. Imagem decorativa: `alt=""`, o texto ao lado já diz tudo.
 */
const ARQUIVOS = {
  relatorio: { src: '/ilustracoes/ilus-A1-prancheta-aprovada.webp', w: 412, h: 440 },
  certificado: { src: '/ilustracoes/ilus-A2-certificado-selo.webp', w: 440, h: 406 },
  conquista: { src: '/ilustracoes/ilus-A3-conquista-roseta.webp', w: 440, h: 428 },
  busca: { src: '/ilustracoes/ilus-A4-pensativo-busca.webp', w: 395, h: 440 },
  aprovado: { src: '/ilustracoes/ilus-A5-aprovacao-joinha.webp', w: 440, h: 265 },
  assinatura: { src: '/ilustracoes/ilus-A6-assinando-documento.webp', w: 440, h: 342 },
} as const;

export type NomeIlustracao = keyof typeof ARQUIVOS;

export function Ilustracao({ nome, largura = 180, className }: { nome: NomeIlustracao; largura?: number; className?: string }) {
  const a = ARQUIVOS[nome];
  return (
    <img
      className={`vz-img${className ? ` ${className}` : ''}`}
      src={a.src}
      alt=""
      width={a.w}
      height={a.h}
      style={{ width: largura, height: 'auto' }}
      loading="lazy"
      decoding="async"
    />
  );
}
