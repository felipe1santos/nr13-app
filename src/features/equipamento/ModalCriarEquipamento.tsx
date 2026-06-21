import { useState } from 'react';
import type { SubtipoAutoclave, TipoEquipamento } from './tipos';
import { criarEquipamento, tagJaExiste } from './equipamentoService';
import './equipamento.css';

type SubtipoCaldeira = 'flamotubular' | 'aquatubular';

interface Props {
  onClose: () => void;
  onCriado: (tag: string) => void;
}

export default function ModalCriarEquipamento({ onClose, onCriado }: Props) {
  const [tag, setTag] = useState('');
  const [tipo, setTipo] = useState<TipoEquipamento>('vaso');
  const [subtipoAutoclave, setSubtipoAutoclave] = useState<SubtipoAutoclave>('cilindrica');
  const [subtipoCaldeira, setSubtipoCaldeira] = useState<SubtipoCaldeira>('flamotubular');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function resolverSubtipo(): SubtipoAutoclave | SubtipoCaldeira | '' {
    if (tipo === 'autoclave') return subtipoAutoclave;
    if (tipo === 'caldeira') return subtipoCaldeira;
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tagLimpa = tag.trim().toUpperCase();
    if (!tagLimpa) {
      setErro('Informe a TAG do equipamento.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (await tagJaExiste(tagLimpa)) {
        setErro(`Já existe um equipamento com a TAG "${tagLimpa}".`);
        return;
      }
      await criarEquipamento(tagLimpa, tipo, resolverSubtipo());
      onCriado(tagLimpa);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Criar Equipamento</h3>
          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label>
            TAG do equipamento
            <input
              type="text"
              placeholder="Ex.: V-200"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              autoFocus
            />
          </label>

          <fieldset className="tipo-equipamento-fieldset">
            <legend>Tipo de equipamento</legend>
            <label className="radio-card">
              <input type="radio" name="tipo" checked={tipo === 'vaso'} onChange={() => setTipo('vaso')} />
              Vaso de Pressão
            </label>
            <label className="radio-card">
              <input type="radio" name="tipo" checked={tipo === 'autoclave'} onChange={() => setTipo('autoclave')} />
              Autoclave
            </label>
            <label className="radio-card">
              <input type="radio" name="tipo" checked={tipo === 'caldeira'} onChange={() => setTipo('caldeira')} />
              Caldeira
            </label>
          </fieldset>

          {tipo === 'autoclave' && (
            <fieldset className="tipo-equipamento-fieldset">
              <legend>Subtipo do Autoclave</legend>
              <label className="radio-card">
                <input
                  type="radio"
                  name="subtipo"
                  checked={subtipoAutoclave === 'cilindrica'}
                  onChange={() => setSubtipoAutoclave('cilindrica')}
                />
                Cilíndrica
              </label>
              <label className="radio-card">
                <input
                  type="radio"
                  name="subtipo"
                  checked={subtipoAutoclave === 'retangular'}
                  onChange={() => setSubtipoAutoclave('retangular')}
                />
                Retangular
              </label>
            </fieldset>
          )}

          {tipo === 'caldeira' && (
            <fieldset className="tipo-equipamento-fieldset">
              <legend>Tipo de Caldeira</legend>
              <label className="radio-card">
                <input
                  type="radio"
                  name="subtipoCaldeira"
                  checked={subtipoCaldeira === 'flamotubular'}
                  onChange={() => setSubtipoCaldeira('flamotubular')}
                />
                Flamotubular (ASME Sec. I)
              </label>
              <label className="radio-card">
                <input
                  type="radio"
                  name="subtipoCaldeira"
                  checked={subtipoCaldeira === 'aquatubular'}
                  onChange={() => setSubtipoCaldeira('aquatubular')}
                />
                Aquatubular (ASME VIII Div. 1)
              </label>
            </fieldset>
          )}

          {erro && <p className="erro-form">{erro}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar Equipamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
