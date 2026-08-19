import { useState } from 'react';
import type { SubtipoAutoclave, SubtipoCaldeira, TipoEquipamento } from './tipos';
import { criarEquipamento, tagJaExiste } from './equipamentoService';
import './equipamento.css';
import { normalizarTag } from './tagNormalizada';

interface Props {
  onClose: () => void;
  onCriado: (tag: string) => void;
}

export default function ModalCriarEquipamento({ onClose, onCriado }: Props) {
  const [tag, setTag] = useState('');
  const [tipo, setTipo] = useState<TipoEquipamento>('vaso');
  const [subtipoAutoclave, setSubtipoAutoclave] = useState<SubtipoAutoclave>('cilindrica');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function resolverSubtipo(): SubtipoAutoclave | SubtipoCaldeira | '' {
    if (tipo === 'autoclave') return subtipoAutoclave;
    if (tipo === 'caldeira') return 'flamotubular';
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tagLimpa = normalizarTag(tag);
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
    } catch (e) {
      // O teto do trial chega como erro do serviço e vira mensagem na própria
      // caixa, no lugar onde o usuário está olhando.
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o equipamento.');
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
              <label className="radio-card">
                <input
                  type="radio"
                  name="subtipo"
                  checked={subtipoAutoclave === 'vertical'}
                  onChange={() => setSubtipoAutoclave('vertical')}
                />
                Vertical (tampo removível)
              </label>
            </fieldset>
          )}

          {tipo === 'caldeira' && (
            <fieldset className="tipo-equipamento-fieldset">
              <legend>Tipo de Caldeira</legend>
              <label className="radio-card">
                <input type="radio" name="subtipoCaldeira" checked readOnly />
                Flamotubular (ASME Sec. I)
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
