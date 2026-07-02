import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { carregarInfo } from '../features/equipamento/equipamentoService';
import MemorialVaso from '../features/memorial/MemorialVaso';
import MemorialAutoclave from '../features/memorial/MemorialAutoclave';
import MemorialCaldeira from '../features/memorial/MemorialCaldeira';
import '../features/memorial/memorial.css';

export default function Memorial() {
  const { tag = '' } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const info = carregarInfo(tag);

  useEffect(() => {
    if (!info) navigate('/dashboard');
  }, [info, navigate]);

  if (!info) return <p>Carregando...</p>;

  return (
    <div className="memorial-page">
      <div className="memorial-page-header">
        <Link to={`/equipamento/${tag}`} className="btn-voltar-memorial">
          ← Voltar para Lista
        </Link>
        <div>
          <h1>{tag} — Calculadora de Memorial</h1>
          <p className="equipamento-subtitulo">
            {info.tipo === 'vaso'
              ? 'Vaso de Pressão'
              : info.tipo === 'autoclave'
                ? `Autoclave (${info.subtipo})`
                : `Caldeira (${info.subtipo || 'flamotubular'})`}
          </p>
        </div>
      </div>

      {info.tipo === 'vaso' && <MemorialVaso tag={tag} />}
      {info.tipo === 'autoclave' && (
        <MemorialAutoclave tag={tag} subtipo={(info.subtipo as 'retangular' | 'cilindrica' | 'vertical') || 'cilindrica'} />
      )}
      {info.tipo === 'caldeira' && info.subtipo === 'eletrica' && (
        <MemorialVaso tag={tag} sufixo="celetrica" titulo="Caldeira Elétrica — Memorial (ASME VIII)" />
      )}
      {info.tipo === 'caldeira' && info.subtipo !== 'eletrica' && (
        <MemorialCaldeira
          tag={tag}
          subtipo={
            info.subtipo === 'aquatubular' || info.subtipo === 'vertical' || info.subtipo === 'mista'
              ? info.subtipo
              : 'flamotubular'
          }
        />
      )}
    </div>
  );
}
