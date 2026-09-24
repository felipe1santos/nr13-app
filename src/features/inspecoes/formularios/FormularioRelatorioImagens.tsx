import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';
import EditorFotosDescritas from '../EditorFotosDescritas';
import ModalDocumentoEnsaio from '../ModalDocumentoEnsaio';
import { normalizarFotos, pendenciasParaEmissao, type FotoDescrita } from '../fotosDescritas';

/**
 * RELATÓRIO DE IMAGENS (Fase 5, 24/09/2026) — o ensaio feito só de fotos
 * descritas.
 *
 * O que ele guarda é o que o técnico produz em campo e nada mais: data do
 * registro, observação geral e as fotos. Dados do EQUIPAMENTO (TAG, tipo,
 * fabricante, cliente) NÃO são copiados para cá — o documento os lê da ficha
 * na hora de gerar, das mesmas chaves do relatório NR-13. Copiar seria abrir
 * uma segunda verdade que envelhece quando a ficha muda.
 *
 * O rascunho pode ficar incompleto (autosave de sempre). A regra de emissão —
 * ao menos uma foto, todas descritas — só é cobrada no documento.
 */
export interface DadosRelatorioImagens {
  dataRegistro: string;
  observacoes: string;
  fotos: FotoDescrita[];
}

function dadosPadraoImagens(): DadosRelatorioImagens {
  return {
    dataRegistro: new Date().toISOString().split('T')[0],
    observacoes: '',
    fotos: [],
  };
}

export default function FormularioRelatorioImagens({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosRelatorioImagens>(() => {
    const salvo = carregarDadosFormulario<Partial<DadosRelatorioImagens>>(tag, containerId, 'imagens');
    const base = dadosPadraoImagens();
    return {
      dataRegistro: salvo?.dataRegistro ?? base.dataRegistro,
      observacoes: salvo?.observacoes ?? base.observacoes,
      fotos: normalizarFotos(salvo?.fotos),
    };
  });
  useAutosaveFormulario(tag, containerId, 'imagens', dados);
  const salvamento = useSalvamento();
  const [documentoAberto, setDocumentoAberto] = useState(false);
  const pendencias = pendenciasParaEmissao(dados.fotos);

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'imagens', dados));
  }

  async function salvarEVisualizar() {
    // O documento lê do CONTAINER gravado; abrir antes de gravar mostraria a
    // versão anterior das legendas.
    try {
      await salvarDadosFormulario(tag, containerId, 'imagens', dados);
    } catch {
      // A falha aparece no botão Salvar; o documento abre com o que há.
    }
    setDocumentoAberto(true);
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Dados do registro</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Equipamento, cliente e empresa saem da ficha de <strong>{tag}</strong> — não é preciso digitar de novo.
        </p>
        <div className="form-grid">
          <label>
            Data do registro
            <input
              type="date"
              value={dados.dataRegistro}
              onChange={(e) => setDados((d) => ({ ...d, dataRegistro: e.target.value }))}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Observação geral (opcional)
            <textarea
              rows={3}
              value={dados.observacoes}
              onChange={(e) => setDados((d) => ({ ...d, observacoes: e.target.value }))}
              placeholder="Contexto do registro fotográfico, se houver"
            />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>
          Imagens ({dados.fotos.length} {dados.fotos.length === 1 ? 'imagem' : 'imagens'})
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Cada imagem tem a sua descrição. A numeração segue a ordem da lista — use ↑ ↓ para reordenar.
        </p>
        <EditorFotosDescritas
          fotos={dados.fotos}
          escopo={`${tag}/imagens`}
          destacarSemDescricao
          alterar={(atualizar) => setDados((d) => ({ ...d, fotos: atualizar(normalizarFotos(d.fotos)) }))}
        />
        {pendencias.length > 0 && dados.fotos.length > 0 && (
          <p className="efd-aviso" style={{ marginTop: 8 }} data-teste="pendencias-imagens">
            Para emitir o documento: {pendencias.map((p) => p.mensagem).join(' ')}
          </p>
        )}
      </div>

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-secundario" onClick={() => void salvarEVisualizar()}>
          Visualizar documento
        </button>
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvamento.salvando}>
          {salvamento.salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
      {documentoAberto && (
        <ModalDocumentoEnsaio
          tag={tag}
          containerId={containerId}
          formulario="imagens"
          onFechar={() => setDocumentoAberto(false)}
        />
      )}
    </>
  );
}
