import type { DadosCalibracao, DadosManometro, DadosPSV, LinhaResultado } from './tipos';
import '../inspecoes/visualizador.css';

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

export default function VisualizadorCalibracao({ dados }: { dados: DadosCalibracao }) {
  const isMano = dados.tipo === 'manometro';
  const mano = dados as DadosManometro;
  const psv = dados as DadosPSV;

  return (
    <div>
      <Secao titulo="Identificação do Certificado">
        <div className="viz-grid-2">
          <Campo label="Nome / Item" valor={dados.nome} />
          <Campo label="Nº do Certificado" valor={dados.numeroCertificado} />
          <Campo label="Data de Emissão" valor={dados.dataEmissao} />
          <Campo label="Tipo" valor={isMano ? 'Manômetro' : 'Válvula de Segurança (PSV)'} />
        </div>
      </Secao>

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
        {isMano ? (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <TabelaResultados titulo="Sentido Crescente (kgf/cm²)" linhas={mano.crescente} />
              <TabelaResultados titulo="Sentido Decrescente (kgf/cm²)" linhas={mano.decrescente} />
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
            <Campo label="Pressão de Abertura" valor={psv.pressaoAbertura} />
            <Campo label="Pressão de Ajuste" valor={psv.pressaoAjuste} />
            <Campo label="Fechamento" valor={psv.fechamento} />
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
