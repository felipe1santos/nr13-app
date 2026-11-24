import { Fragment } from 'react';
import { ITENS_INSPECAO_PRESSOSTATO, ehInterna, ehTerceiro, rotuloOrigem, type DadosCalibracao, type DadosManometro, type DadosPSV, type DadosTerceiro, type LinhaResultado } from './tipos';
import { definicaoDe, ehMedicaoPorPontos } from './instrumentos';
import { diferencialDoCertificado } from './metrologiaChaveamento';
import '../inspecoes/visualizador.css';
import { UNIDADE_PADRAO } from './preencherCalibracao';

function Campo({ label, valor }: { label: string; valor?: string }) {
  if (!valor) return null;
  return (
    <div className="viz-campo">
      <span className="viz-label">{label}</span>
      <span className="viz-valor">{valor}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="viz-secao">
      <div className="viz-secao-titulo">{titulo}</div>
      {children}
    </div>
  );
}

function TabelaResultados({ titulo, linhas }: { titulo: string; linhas: LinhaResultado[] }) {
  const preenchidas = (linhas ?? []).filter((l) => l.vc || l.vi);
  if (preenchidas.length === 0) return null;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="viz-secao-titulo" style={{ fontSize: 12 }}>{titulo}</div>
      <table className="viz-table">
        <thead>
          <tr>
            <th>Valor Convencional</th>
            <th>Valor Nominal</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {preenchidas.map((l, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center' }}>{l.vc || '—'}</td>
              <td style={{ textAlign: 'center' }}>{l.vi || '—'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: '#0033a2' }}>{l.erro || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { aprovado: 'Aprovado', reprovado: 'Reprovado', '': 'Pendente' };

/** Fase 2 (D) · o registro de uma calibração de laboratório externo — só dados, nenhuma folha nossa. */
function VisualizadorTerceiro({ dados }: { dados: DadosTerceiro }) {
  return (
    <div>
      <Secao titulo="Certificado do laboratório externo">
        <div className="viz-grid-2">
          <Campo label="Laboratório" valor={dados.laboratorio} />
          <Campo label="Responsável no laboratório" valor={dados.responsavelExterno} />
          <Campo label="Nº do Certificado" valor={dados.numeroCertificado} />
          <Campo label="Data da Calibração" valor={dados.dataCalibracao} />
          <Campo label="Validade" valor={dados.dataProxCalibracao} />
          <Campo label="Conclusão" valor={dados.statusConclusao ? STATUS_LABEL[dados.statusConclusao] : 'Não informada'} />
          <Campo label="PDF original" valor={dados.pdfExternoRef?.path ? (dados.pdfExternoNome || 'anexado') : 'não anexado'} />
          <Campo label="SHA-256 do PDF" valor={dados.pdfExternoSha256} />
        </div>
      </Secao>
      <Secao titulo="Instrumento">
        <div className="viz-grid-2">
          <Campo label="Tipo" valor={definicaoDe(dados.tipo).rotulo} />
          <Campo label="Identificação" valor={dados.instrumento} />
          <Campo label="Fabricante" valor={dados.fabricante} />
          <Campo label="Modelo" valor={dados.modelo} />
          <Campo label="Nº de série" valor={dados.serie} />
          <Campo label="Faixa" valor={dados.referencia} />
          <Campo label="Unidade" valor={dados.unidade} />
        </div>
      </Secao>
      <Secao titulo="Observações">
        <div className="viz-grid-2">
          <Campo label="Observações" valor={dados.observacoes || '—'} />
        </div>
      </Secao>
    </div>
  );
}

export default function VisualizadorCalibracao({ dados }: { dados: DadosCalibracao }) {
  if (ehTerceiro(dados)) return <VisualizadorTerceiro dados={dados} />;
  // Manômetro e malha de pressão (transmissor, 24/11/2026): resultado por pontos.
  const isMano = ehMedicaoPorPontos(dados.tipo);
  const mano = dados as DadosManometro;
  const psv = dados as DadosPSV;
  // A unidade é do INSTRUMENTO (cadastro do componente), não do equipamento:
  // é a escala em que a leitura foi feita. Estava escrita "(kgf/cm²)" à mão nos
  // dois títulos. Registro anterior a 10/09/2026 não tem unidade — o certificado
  // desses registros sempre saiu com kgf/cm², e é o que continua aparecendo.
  const u = dados.unidade?.trim() || UNIDADE_PADRAO;
  const comU = (v?: string) => (v && v.trim() && dados.unidade?.trim() ? `${v} ${u}` : v);

  return (
    <div>
      <Secao titulo="Identificação do Certificado">
        <div className="viz-grid-2">
          <Campo label="Nome / Item" valor={dados.nome} />
          <Campo label="Nº do Certificado" valor={dados.numeroCertificado} />
          <Campo label="Data de Emissão" valor={dados.dataEmissao} />
          <Campo label="Tipo" valor={definicaoDe(dados.tipo).rotulo} />
          <Campo label="Origem" valor={rotuloOrigem(dados)} />
          <Campo
            label="Situação"
            valor={ehInterna(dados) ? (dados.status === 'emitido' ? 'Emitido' : dados.status === 'rascunho' ? 'Rascunho' : 'Registro anterior à emissão') : ''}
          />
        </div>
      </Secao>

      {ehInterna(dados) && (
        <Secao titulo="Responsável pela calibração">
          <div className="viz-grid-2">
            <Campo label="Nome" valor={dados.responsavel?.nome || 'Não definido'} />
            <Campo label="Função" valor={dados.responsavel?.funcao} />
            <Campo label="Registro profissional" valor={dados.responsavel?.registro} />
            <Campo
              label="Assinatura"
              valor={dados.responsavel ? (dados.responsavel.assinaturaRef?.path || dados.responsavel.assinatura ? 'cadastrada' : 'sem imagem no cadastro') : ''}
            />
          </div>
        </Secao>
      )}

      <Secao titulo="1. Cliente / Solicitante">
        <div className="viz-grid-2">
          <Campo label="Empresa" valor={dados.empresa} />
          <Campo label="Endereço" valor={dados.endereco} />
        </div>
      </Secao>

      <Secao titulo="2. Item Calibrado">
        <div className="viz-grid-2">
          <Campo label="Instrumento" valor={dados.instrumento} />
          <Campo label="Fabricante" valor={dados.fabricante} />
          <Campo label="Modelo" valor={dados.modelo} />
          <Campo label="Lote / Série" valor={dados.serie} />
          <Campo label="Referência" valor={dados.referencia} />
          <Campo label="Data da Calibração" valor={dados.dataCalibracao} />
          <Campo label="Próxima Calibração" valor={dados.dataProxCalibracao} />
        </div>
      </Secao>

      <Secao titulo="Condições Ambientais">
        <div className="viz-grid-2">
          <Campo label="Temperatura do Ar" valor={dados.tempAr} />
          <Campo label="Umidade Relativa" valor={dados.umidade} />
          <Campo label="Local" valor={dados.local} />
        </div>
      </Secao>

      <Secao titulo="Padrões e Rastreabilidade">
        <div className="viz-grid-2">
          <Campo label="Instrumento Padrão" valor={dados.padraoInst} />
          <Campo label="Nº Série" valor={dados.padraoSerie} />
          <Campo label="Nº Certificado" valor={dados.padraoCert} />
          <Campo label="Validade" valor={dados.padraoVal} />
        </div>
      </Secao>

      <Secao titulo="Resultados Obtidos">
        {dados.tipo === 'pressostato' || dados.tipo === 'termostato' ? (
          // Pressostato (23/11/2026) e termostato (24/11/2026): set point, os dois
          // ensaios, o bloco metrológico do modelo do engenheiro e a inspeção visual.
          <>
            <div className="viz-grid-2">
              <Campo label="Local / TAG do instrumento" valor={dados.localInstrumento} />
              <Campo label="Set point (range)" valor={comU(dados.setPoint)} />
              <Campo
                label={dados.diferencial ? 'Diferencial' : 'Diferencial (média dos ensaios)'}
                valor={comU(diferencialDoCertificado(dados.diferencial, dados.ensaios) ?? '')}
              />
              <Campo label="Incerteza da medição (%)" valor={dados.incertezaMedicao} />
              <Campo label="Erro fiducial (%)" valor={dados.erroFiducial} />
              <Campo label="Fator k" valor={dados.fatorK} />
              <Campo label="Veff" valor={dados.veff} />
              <Campo label="Fluido de ensaio" valor={dados.fluido} />
              <Campo label="Tempo de ensaio (min)" valor={dados.tempoMin} />
              {(dados.ensaios ?? []).map((e, i) => (
                <Fragment key={i}>
                  <Campo label={`${i + 1}º ensaio — desarme`} valor={comU(e.desarme)} />
                  <Campo label={`${i + 1}º ensaio — rearme`} valor={comU(e.rearme)} />
                </Fragment>
              ))}
            </div>
            <div className="viz-grid-2" style={{ marginTop: 8 }}>
              {ITENS_INSPECAO_PRESSOSTATO.map((it) => {
                const c = dados.inspecaoVisual?.[it.id];
                return (
                  <Campo
                    key={it.id}
                    label={`Inspeção visual — ${it.rotulo}`}
                    valor={c === 'aprovado' ? 'Aprovado' : c === 'reprovado' ? 'Reprovado' : ''}
                  />
                );
              })}
            </div>
          </>
        ) : isMano ? (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <TabelaResultados titulo={`Sentido Crescente (${u})`} linhas={mano.crescente} />
              <TabelaResultados titulo={`Sentido Decrescente (${u})`} linhas={mano.decrescente} />
            </div>
            <div className="viz-grid-2" style={{ marginTop: 8 }}>
              <Campo label="Incerteza (Crescente)" valor={mano.incertezaC} />
              <Campo label="Coef. k (Crescente)" valor={mano.coefC} />
              <Campo label="Incerteza (Decrescente)" valor={mano.incertezaD} />
              <Campo label="Coef. k (Decrescente)" valor={mano.coefD} />
            </div>
          </>
        ) : (
          <div className="viz-grid-2">
            <Campo label="Pressão de Abertura" valor={comU(psv.pressaoAbertura)} />
            <Campo label="Pressão de Ajuste" valor={comU(psv.pressaoAjuste)} />
            <Campo label="Fechamento" valor={comU(psv.fechamento)} />
            <Campo label="Incerteza de Medição" valor={psv.incerteza} />
            <Campo label="Coeficiente k" valor={psv.coef} />
          </div>
        )}
      </Secao>

      <Secao titulo="Conclusão Técnica">
        <div className="viz-grid-2">
          <Campo label="Status" valor={STATUS_LABEL[dados.statusConclusao] ?? 'Pendente'} />
          <Campo label="Motivo / Complemento" valor={dados.textoMotivo} />
        </div>
      </Secao>
    </div>
  );
}
