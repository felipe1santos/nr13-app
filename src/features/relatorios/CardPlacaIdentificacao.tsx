import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { definirPlacaReal, lerPlacaReal, removerPlacaReal } from './placaIdentificacao';

/**
 * Fase 12B · trocar a placa RECONSTRUÍDA pela FOTO REAL da placa.
 *
 * ## O que este card decide
 *
 * Nada sobre o desenho: a folha de identificação sempre traz uma placa. Este
 * card escolhe QUAL — a reconstruída a partir da ficha, que é o padrão, ou a
 * fotografia da placa do equipamento, que prevalece quando existe.
 *
 * Remover a foto não deixa buraco: a reconstruída volta sozinha, porque ela é o
 * estado natural e não depende de nada além dos dados que já estão no sistema.
 *
 * ## Por que um card, e não um clique na folha
 *
 * A prévia da tela é montada com os templates de `public/arquivos-inspecao/`,
 * dentro de `<iframe>` — o desenho que aparece ali não é o do modelo Novo, que
 * só existe na hora de finalizar. Pendurar o clique dentro do iframe ligaria a
 * escolha da placa a uma folha que nem é a que vai sair no PDF. O card fica na
 * barra do documento, funciona no celular e não depende de qual folha está
 * visível.
 */
export default function CardPlacaIdentificacao({
  tag,
  desabilitado,
  onMudou,
}: {
  tag: string;
  desabilitado?: boolean;
  onMudou?: () => void;
}) {
  const [placa, setPlaca] = useState(() => lerPlacaReal(tag));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const entrada = useRef<HTMLInputElement>(null);

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o MESMO arquivo depois de remover
    if (!arquivo) return;
    setOcupado(true);
    setErro('');
    try {
      setPlaca(await definirPlacaReal(tag, arquivo));
      onMudou?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar a foto da placa.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setOcupado(true);
    setErro('');
    try {
      await removerPlacaReal(tag);
      setPlaca(null);
      onMudou?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível remover a foto da placa.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="placa-card no-print">
      <span className="placa-rotulo">
        <Icone nome="filetext" tam={13} /> Placa de identificação
      </span>
      <span className="placa-estado">
        {placa ? 'foto real do equipamento' : 'reconstruída com os dados da ficha'}
      </span>
      {!desabilitado && (
        <>
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            className="placa-entrada"
            onChange={(e) => void enviar(e)}
          />
          <button
            type="button"
            className="btn-secundario placa-btn"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
          >
            {ocupado ? 'Enviando…' : placa ? 'Trocar foto' : 'Usar foto real'}
          </button>
          {placa && (
            <button type="button" className="btn-secundario placa-btn" onClick={() => void remover()} disabled={ocupado}>
              Remover
            </button>
          )}
        </>
      )}
      {erro && <span className="placa-erro">{erro}</span>}
    </div>
  );
}
