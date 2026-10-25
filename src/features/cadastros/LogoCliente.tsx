import { useState } from 'react';
import { faviconDe } from '../../services/googlePlaces';
import type { Cliente } from './tipos';

/** Logo do cliente: favicon salvo, ou derivado do website, ou vazio (inicial no fallback). */
function logoDe(c: Cliente): string {
  return c.logoUrl || (c.website ? faviconDe(c.website) : '');
}

/**
 * Logo pequena do cliente, ou a inicial num quadrado neutro. Saiu de
 * `Empresas.tsx` para servir também o modal do cliente (v4).
 */
export default function LogoCliente({ cliente, tam = 28, classe = 'cli-logo' }: { cliente: Cliente; tam?: number; classe?: string }) {
  const [erro, setErro] = useState(false);
  const url = logoDe(cliente);
  return (
    <span className={classe} style={{ width: tam, height: tam }} aria-hidden="true">
      {url && !erro ? (
        <img src={url} alt="" onError={() => setErro(true)} />
      ) : (
        (cliente.nomeFantasia || cliente.razaoSocial || '?').slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
