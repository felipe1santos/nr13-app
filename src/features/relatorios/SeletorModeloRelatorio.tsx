import { useState } from 'react';
import { MODELOS_VISIVEIS, definirModeloDaEmpresa, modeloDaEmpresa, type ModeloDocumento } from './modeloDocumento';

/**
 * Fase 12B · a escolha do MODELO do relatório, na tela da empresa.
 *
 * ## Vocabulário
 *
 * A tela diz **Clássico** e **Novo**. Não diz raster, vetorial, motor nem
 * engine — esses são nomes do código. Quem opera o sistema escolhe um desenho,
 * não uma implementação.
 *
 * ## Por que a escolha grava na hora
 *
 * A configuração é da ORGANIZAÇÃO e não faz parte do formulário de cadastro da
 * empresa (razão social, CNPJ, endereço). Enfiá-la no mesmo "Editar → Salvar"
 * faria uma coisa depender da outra: quem só quisesse trocar o modelo teria de
 * abrir a edição do cadastro inteiro, e um cancelamento desfaria as duas.
 *
 * ## A prévia
 *
 * São dois SVG inline de ~20 linhas cada — sem imagem, sem download, sem
 * requisição. Uma prévia que custasse peso na página contradiria o motivo de o
 * modelo Novo existir.
 *
 * ## Por que hoje aparece UM modelo
 *
 * A lista vem de `MODELOS_VISIVEIS`, e o Clássico está fora dela: ele só existe
 * pelo gerador raster, que fotografa cada folha. Oferecê-lo faria o usuário
 * escolher, sem saber, entre um documento e a fotografia de um documento. O
 * componente NÃO foi simplificado para um modelo só — quando o layout Clássico
 * vetorial existir, basta ele voltar a `MODELOS_OFERECIDOS` e a escolha
 * reaparece inteira, com a prévia que já está escrita aqui.
 */
export default function SeletorModeloRelatorio() {
  const [modelo, setModelo] = useState<ModeloDocumento>(() => modeloDaEmpresa());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function escolher(novo: ModeloDocumento) {
    if (novo === modelo || salvando) return;
    const anterior = modelo;
    setModelo(novo); // otimista: o clique responde na hora
    setSalvando(true);
    setErro('');
    try {
      await definirModeloDaEmpresa(novo);
    } catch (e) {
      setModelo(anterior); // não fingir que gravou
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a escolha.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="cad-card modelo-card">
      <div className="cad-secao-titulo">Modelo do relatório</div>
      <p className="modelo-ajuda">
        Vale para os <strong>próximos</strong> relatórios desta empresa. Relatórios já finalizados e
        rascunhos em andamento mantêm o modelo com que foram criados.
      </p>

      <div className="modelo-opcoes">
        {MODELOS_VISIVEIS.map((m) => (
          <button
            key={m.valor}
            type="button"
            className={`modelo-opcao${modelo === m.valor ? ' is-ativo' : ''}`}
            onClick={() => void escolher(m.valor)}
            disabled={salvando}
            aria-pressed={modelo === m.valor}
          >
            <span className="modelo-radio" aria-hidden="true" />
            <span className="modelo-texto">
              <strong>{m.rotulo}</strong>
              <span>{m.descricao}</span>
            </span>
            <PreviaModelo modelo={m.valor} />
          </button>
        ))}
      </div>

      {MODELOS_VISIVEIS.length === 1 && (
        <p className="modelo-estado">
          Outros modelos aparecem aqui quando ficarem disponíveis.
        </p>
      )}
      {salvando && <p className="modelo-estado">Salvando…</p>}
      {erro && <p className="modelo-erro">{erro}</p>}
    </div>
  );
}

/**
 * Miniatura de uma folha A4 em cada padrão. Não é screenshot do gerador — é um
 * esquema: o Clássico com blocos densos e moldura cheia, o Novo com respiro,
 * cabeçalho leve e tipografia maior.
 */
function PreviaModelo({ modelo }: { modelo: ModeloDocumento }) {
  const classico = modelo === 'classico';
  return (
    <svg className="modelo-previa" viewBox="0 0 60 84" role="img" aria-label={`Prévia do modelo ${classico ? 'Clássico' : 'Novo'}`}>
      <rect x="0.5" y="0.5" width="59" height="83" rx="2" fill="#fff" stroke="#c9cdd3" />
      {classico ? (
        <>
          <rect x="4" y="4" width="52" height="10" fill="none" stroke="#8a9099" strokeWidth="0.8" />
          <rect x="4" y="4" width="14" height="10" fill="#e6e8eb" stroke="#8a9099" strokeWidth="0.8" />
          {[18, 24, 30, 36, 42, 48, 54, 60, 66].map((y) => (
            <rect key={y} x="4" y={y} width="52" height="4" fill="none" stroke="#b3b8bf" strokeWidth="0.6" />
          ))}
          <rect x="4" y="72" width="52" height="8" fill="none" stroke="#8a9099" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <rect x="6" y="6" width="16" height="4" rx="1" fill="#d97706" />
          <rect x="6" y="13" width="34" height="2.4" rx="1.2" fill="#3f4650" />
          <line x1="6" y1="19" x2="54" y2="19" stroke="#e2e5e9" strokeWidth="0.8" />
          {[24, 31, 38].map((y) => (
            <g key={y}>
              <rect x="6" y={y} width="22" height="2" rx="1" fill="#9aa1ab" />
              <rect x="32" y={y} width="22" height="2" rx="1" fill="#c6cad0" />
            </g>
          ))}
          <rect x="6" y="46" width="48" height="16" rx="1.5" fill="#f4f5f7" stroke="#e2e5e9" strokeWidth="0.7" />
          <rect x="6" y="66" width="30" height="2" rx="1" fill="#c6cad0" />
          <line x1="6" y1="76" x2="54" y2="76" stroke="#e2e5e9" strokeWidth="0.8" />
        </>
      )}
    </svg>
  );
}
