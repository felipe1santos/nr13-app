import { useEffect, useRef, useState } from 'react';
import { resolverFoto, type FotoArmazenada } from '../services/fotos';

/**
 * Exibe uma foto que pode estar em três lugares — cofre local, bucket ou
 * base64 legado — sem que a tela precise saber em qual.
 *
 * SÓ RESOLVE QUANDO ENTRA NA TELA. A lista de equipamentos do `cmam` tem 38
 * cards; resolver todos no mount dispararia 38 URLs assinadas e 38 downloads
 * para mostrar as quatro primeiras fotos. O `IntersectionObserver` com margem
 * de 300px começa o trabalho um pouco antes de a foto aparecer, então a rolagem
 * continua sem buraco visível, e o que está fora da tela não custa nada.
 */
export default function FotoImg({
  foto,
  alt = '',
  className,
  onClick,
  placeholder = 'Sem foto',
}: {
  foto: FotoArmazenada | string | null | undefined;
  alt?: string;
  className?: string;
  onClick?: () => void;
  placeholder?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  // Sem IntersectionObserver (navegador antigo), já nasce visível: melhor gastar
  // banda do que deixar a foto invisível para sempre.
  const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === 'undefined');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visivel) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);

    // REDE DE SEGURANÇA. O observer só dispara para elemento com área, e
    // enquanto a foto não resolve este `div` pode ter altura zero — foi o que
    // aconteceu na validação de 11/08/2026 na galeria do equipamento, onde o
    // CSS dimensiona o `<img>` e não o contêiner. Resultado: a foto existia,
    // tinha subido, e ficava esperando uma visibilidade que nunca chegava.
    // Passado o prazo, carrega assim mesmo: a economia de banda não vale uma
    // foto invisível.
    const prazo = window.setTimeout(() => setVisivel(true), 1200);
    return () => {
      obs.disconnect();
      window.clearTimeout(prazo);
    };
  }, [visivel]);

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    // O estado só muda quando a resolução RESPONDE. Zerar `falhou` aqui, de
    // forma síncrona, dispararia uma renderização em cascata a cada troca de
    // prop — e a resolução já devolve o veredito completo.
    void resolverFoto(foto).then((url) => {
      if (!vivo) return;
      setSrc(url);
      setFalhou(!url);
    });
    return () => {
      vivo = false;
    };
  }, [foto, visivel]);

  if (falhou || (visivel && src === null && foto == null)) {
    return (
      <div ref={ref} className={className} style={{ display: 'grid', placeItems: 'center', color: '#999', fontSize: 12 }}>
        {placeholder}
      </div>
    );
  }

  // `width/height: 100%` no contêiner: sem isso ele encolhe para zero enquanto a
  // imagem não chegou, o layout da galeria salta quando ela aparece e o próprio
  // observer perde a área que precisa para disparar.
  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 1 }}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--fundo-2, #eee)' }} aria-busy="true" />
      )}
    </div>
  );
}
