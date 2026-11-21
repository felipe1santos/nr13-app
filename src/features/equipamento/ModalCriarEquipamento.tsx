import { useState } from 'react';
import type { SubtipoAutoclave, SubtipoCaldeira, TipoEquipamento } from './tipos';
import { criarEquipamento, tagJaExiste } from './equipamentoService';
import { FATORES_CONVERSAO, rotuloSistemaCompleto, type SistemaUnidade } from '../../calc/unidades';
import { Icone } from '../../components/Icone';
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
  // A unidade nasce com o equipamento (16/09/2026) e deixa de ser trocável no
  // cartão. O valor inicial é SI porque era o recuo que o sistema já aplicava a
  // todo equipamento sem preferência gravada — não é opção nova.
  const [unidade, setUnidade] = useState<SistemaUnidade>('SI');
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
      await criarEquipamento(tagLimpa, tipo, resolverSubtipo(), unidade);
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
    // O fundo NAO fecha: cadastro sendo digitado. Ver `modaisComEdicao.test.ts`.
    <div className="modal-overlay">
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

          {/* UNIDADE (21/11/2026): três opções em cartão, não um select. Ela não
              se altera depois de criada (§4), então a escolhida fica em VERMELHO
              sólido — não pode passar despercebida. Rádio nativo por baixo: o
              leitor de tela anuncia "marcado" e as setas trocam a opção. */}
          <fieldset className="tipo-equipamento-fieldset unidade-criacao" aria-describedby="unidade-criacao-ajuda">
            <legend>Unidade de medida *</legend>
            {(Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]).map((u) => (
              <label key={u} className={`radio-card unidade-criacao-opcao${unidade === u ? ' marcada' : ''}`}>
                <input
                  type="radio"
                  name="unidade"
                  value={u}
                  checked={unidade === u}
                  onChange={() => setUnidade(u)}
                />
                <span className="unidade-criacao-rotulo">{rotuloSistemaCompleto(u)}</span>
                {unidade === u && <Icone nome="check" tam={15} className="unidade-criacao-check" />}
              </label>
            ))}
            <small id="unidade-criacao-ajuda" className="campo-ajuda unidade-criacao-ajuda">
              Define como as grandezas técnicas deste equipamento aparecem na ficha e na documentação.{' '}
              <b>Não pode ser alterada depois de criado o equipamento.</b>
            </small>
          </fieldset>

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
