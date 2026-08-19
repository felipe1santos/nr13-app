import { Link, useOutletContext } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import { montarAtivos } from '../../features/portal/portalService';
import type { ContextoPortal } from './PortalLayout';
import FotoImg from '../../components/FotoImg';
import { rotaPortalAtivo } from '../../app/rotas';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

// Lista de ativos do cliente (somente leitura). Clique → detalhe com documentos.
export default function PortalAtivos() {
  const { tags } = useOutletContext<ContextoPortal>();
  const ativos = montarAtivos(tags);

  return (
    <div className="portal-pagina">
      <h1>Seus equipamentos</h1>
      <p className="portal-hint">
        {ativos.length === 0
          ? 'Nenhum equipamento vinculado ao seu acesso ainda. Fale com a empresa executante.'
          : `${ativos.length} equipamento(s) sob inspeção NR-13.`}
      </p>
      <div className="portal-grid-ativos">
        {ativos.map((a) => (
          <Link key={a.tag} to={rotaPortalAtivo(a.tag)} className="portal-card-ativo">
            <div className="portal-card-foto">
              {a.fotoCapa ? <FotoImg foto={a.fotoCapa} alt={a.tag} /> : <span className="portal-card-sem-foto"><Icone nome="box" tam={22} /></span>}
            </div>
            <div className="portal-card-info">
              <span className="portal-card-tag">{a.tag}</span>
              <span className="portal-card-tipo">
                {ROTULO_TIPO[a.info?.tipo ?? ''] ?? 'Equipamento'}
                {a.info?.subtipo ? ` (${a.info.subtipo})` : ''}
              </span>
              {a.info?.descricao && <span className="portal-card-desc">{a.info.descricao}</span>}
              <div className="portal-card-badges">
                {a.categoria && <span className="portal-badge">Categoria {a.categoria}</span>}
                {a.pmta && <span className="portal-badge">PMTA {a.pmta} MPa</span>}
                {a.resultado && (
                  <span className={`portal-badge ${a.resultado === 'APROVADO' ? 'ok' : a.resultado === 'REPROVADO' ? 'erro' : ''}`}>
                    {a.resultado}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
