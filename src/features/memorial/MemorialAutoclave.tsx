import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { AcoesMz, BarraResultadoMz, CampoMx, CartaoMemorialMz, SelectMx } from './EditorMz';
import MemorialVaso from './MemorialVaso';
import {
  calcularAutoclave,
  carregarDadosAutoclave,
  salvarDadosAutoclave,
  salvarResultadoAutoclave,
  type DadosAutoclave,
} from './autoclaveMemorialService';
import type { ResultadoCalculo } from '../../calc/tipos';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { emitirAviso } from '../../services/eventos';
import { avisarCamposFaltando, avisarGereOCalculo } from './avisoMemorial';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
import './memorial.css';

interface Props {
  tag: string;
  subtipo: 'retangular' | 'cilindrica' | 'vertical' | 'bancada';
}

export default function MemorialAutoclave(props: Props) {
  return <MemorialAutoclaveInner key={`${props.tag}-${props.subtipo}`} {...props} />;
}

function MemorialAutoclaveInner({ tag, subtipo }: Props) {
  const [aba, setAba] = useState<'principal' | 'geradorVapor'>('principal');
  const [dados, setDados] = useState<DadosAutoclave>(() => carregarDadosAutoclave(tag, subtipo));
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  // instante do último "Gerar Cálculo" — linha "Gerado em ..." no topo do terminal
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) setDirty(true);
    else montou.current = true;
  }, [dados]);

  // avisa ao sair (navegação interna ou fechar/recarregar) com memorial não salvo
  useAvisoSairSemSalvar(dirty);

  function set(chave: keyof DadosAutoclave, valor: number) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  // Campos não-numéricos (ex.: tipo_fundo da vertical).
  function setCampo(chave: keyof DadosAutoclave, valor: unknown) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  // Material é texto livre (vai para componentes[].material no RESUMO), não entra no cálculo.
  function setMaterial(valor: string) {
    setDados((d) => ({ ...d, material: valor }));
  }

  function handleCalcular() {
    setResultado(calcularAutoclave(subtipo, dados));
    setGeradoEm(new Date());
    setCalcCount((c) => c + 1);
    // cálculo gerado e ainda não salvo → alerta ao sair sem Salvar
    setDirty(true);
  }

  // Cabeçalho do terminal (padrão design/painel_pmta)

  async function salvar() {
    if (!resultado) { avisarGereOCalculo(); return; }
    const erros: string[] = [];
    if (!dados.pressao || Number(dados.pressao) <= 0) erros.push('Pressão de Projeto (P)');
    if (!dados.tensao || Number(dados.tensao) <= 0) erros.push('Tensão Admissível (S)');
    if (subtipo === 'bancada') {
      if (!dados.diametro || Number(dados.diametro) <= 0) erros.push('Diâmetro Interno (D)');
      if (!dados.t_costado || Number(dados.t_costado) <= 0) erros.push('Espessura medida do costado');
      if (!dados.t_fundo || Number(dados.t_fundo) <= 0) erros.push('Espessura medida do fundo');
      if (!dados.t_porta1 || Number(dados.t_porta1) <= 0) erros.push('Espessura da 1ª chapa da porta');
    } else if (subtipo === 'vertical') {
      if (!dados.diametro || Number(dados.diametro) <= 0) erros.push('Diâmetro Interno (D)');
      if (!dados.t_tampo || Number(dados.t_tampo) <= 0) erros.push('Espessura do tampo');
      if (!dados.t_costado || Number(dados.t_costado) <= 0) erros.push('Espessura do costado');
      if (!dados.t_fundo || Number(dados.t_fundo) <= 0) erros.push('Espessura do fundo');
      if (!dados.n_travas || Number(dados.n_travas) <= 0) erros.push('Quantidade de travas (N)');
    } else {
      if (!dados.espessura || Number(dados.espessura) <= 0) erros.push('Espessura real');
      if (!dados.espacamento || Number(dados.espacamento) <= 0) erros.push('Passo entre tirantes (a)');
    }
    if (erros.length > 0) {
      avisarCamposFaltando(erros);
      return;
    }
    setSalvando(true);
    try {
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarDadosAutoclave(tag, subtipo, dados);
        await salvarResultadoAutoclave(tag, subtipo, dados, resultado);
      }, { minimoMs: 1500 });
      setDirty(false);
      emitirAviso({
        variante: 'sucesso',
        titulo: 'Cálculo salvo',
        texto: 'O memorial de cálculo foi salvo com sucesso no sistema.',
      });
    } catch (e) {
      // Ver o mesmo bloco em `MemorialVaso`: erro de gravação não pode sair da
      // tela igual a um sucesso.
      emitirAviso({
        variante: 'erro',
        titulo: 'Não foi possível salvar',
        texto: `O memorial NÃO foi salvo: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSalvando(false);
    }
  }

  const abaLabel =
    subtipo === 'retangular'
      ? 'Autoclave Retangular'
      : subtipo === 'vertical'
        ? 'Autoclave Vertical'
        : subtipo === 'bancada'
          ? 'Autoclave de Bancada'
          : 'Autoclave Cilíndrica';

  return (
    <div>
      <div className="abas-caldeira cal4-abas mz-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'principal'} className={`aba-caldeira-btn ${aba === 'principal' ? 'ativa' : ''}`} onClick={() => setAba('principal')}>
          {abaLabel}
        </button>
        <button type="button" role="tab" aria-selected={aba === 'geradorVapor'} className={`aba-caldeira-btn ${aba === 'geradorVapor' ? 'ativa' : ''}`} onClick={() => setAba('geradorVapor')}>
          Gerador de Vapor
        </button>
      </div>

      {/* As DUAS abas ficam sempre montadas (display:none na inativa): trocar de aba não pode
          descartar campos digitados nem o cálculo gerado e ainda não salvo — o MemorialVaso
          (GV e corpo cilíndrico) guarda esse estado internamente e o unmount o perdia. */}
      <div style={{ display: aba === 'geradorVapor' ? undefined : 'none' }}>
        <MemorialVaso tag={tag} sufixo="gv" titulo="Memorial do Gerador de Vapor (ASME VIII — tratado como vaso)" />
      </div>
      <div style={{ display: aba === 'principal' ? undefined : 'none' }}>
      {subtipo === 'cilindrica' ? (
        <MemorialVaso
          tag={tag}
          sufixo="ac_corpo"
          titulo="Memorial do Casco e Tampos da Autoclave (ASME VIII Div.1)"
          imagemSrc="/icon/autoclave-cilindrico.png"
        />
      ) : (
        /* Cobalto · autoclave vertical e retangular no editor do protótipo:
           um cartão com os dados agrupados, o memorial em documento e a barra
           de resultado. Mesmos campos, mesmo cálculo, mesma gravação. */
        <div className="mz-wrap">
          <div className="mz">
            <section className="mz-card">
              <header className="mz-h">
                <h2>Dados técnicos — {abaLabel}</h2>
                <span className="mz-norma">ASME VIII Div. 1</span>
                <span className="grow" />
                <span className="mz-acoes-card">
                  <AcoesMz
                    status={resultado?.resultado ?? null}
                    aoGerar={handleCalcular}
                    aoSalvar={salvar}
                    podeSalvar={!!resultado}
                    salvando={salvando}
                    salvo={!!resultado && !dirty}
                  />
                </span>
              </header>
              <div className="mz-dados">
                {subtipo === 'bancada' ? (
                  <>
                    {/* 23/11/2026 · memorial do engenheiro (SERCON AHMC10). P = PMTA-alvo
                        (pressão de verificação); as hipóteses vêm sugeridas e o PLH confirma. */}
                    <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Projeto e material</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="P — pressão de verificação (PMTA-alvo)" unidade="MPa" obrigatorio valor={dados.pressao} onChange={(v) => set('pressao', Number(v))} dica="2,2 kgf/cm² = 0,2157 MPa" />
                      <CampoMx rotulo="D — diâmetro interno" unidade="mm" obrigatorio valor={dados.diametro} onChange={(v) => set('diametro', Number(v))} />
                      <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={dados.tensao} onChange={(v) => set('tensao', Number(v))} dica="Planilha: 115,14 MPa (hipótese SA-240 TP 304 — confirmar)" />
                      <CampoMx rotulo="CA — sobreespessura de corrosão" unidade="mm" aceitaZero valor={dados.ca ?? 0} onChange={(v) => set('ca', Number(v))} />
                      <CampoMx rotulo="Material" tipo="text" valor={dados.material} onChange={setMaterial} />
                      <CampoMx rotulo="Temperatura de projeto" unidade="°C" valor={dados.temperatura ?? ''} onChange={(v) => set('temperatura', Number(v))} />
                    </div>
                    <h4 className="mz-grupo"><Icone nome="box" tam={16} />Costado e fundo torisférico</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="t — espessura medida do costado" unidade="mm" obrigatorio valor={dados.t_costado} onChange={(v) => set('t_costado', Number(v))} />
                      <CampoMx rotulo="E — eficiência do costado" valor={dados.ef_costado ?? 0.7} onChange={(v) => set('ef_costado', Number(v))} />
                      <CampoMx rotulo="t — espessura medida do fundo" unidade="mm" obrigatorio valor={dados.t_fundo} onChange={(v) => set('t_fundo', Number(v))} />
                      <CampoMx rotulo="E — eficiência do fundo" valor={dados.ef_fundo ?? 0.7} onChange={(v) => set('ef_fundo', Number(v))} />
                      <CampoMx rotulo="L — raio da coroa" unidade="mm" valor={dados.l_coroa ?? ''} onChange={(v) => set('l_coroa', Number(v))} dica="Vazio = torisférico padrão (L = D)" />
                      <CampoMx rotulo="r — raio de concordância" unidade="mm" valor={dados.r_concordancia ?? ''} onChange={(v) => set('r_concordancia', Number(v))} dica="Vazio = torisférico padrão (r = 0,06·D)" />
                    </div>
                    <h4 className="mz-grupo"><Icone nome="tool" tam={16} />Porta plana reforçada (UG-34)</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="t₁ — 1ª chapa da porta" unidade="mm" obrigatorio valor={dados.t_porta1} onChange={(v) => set('t_porta1', Number(v))} />
                      <CampoMx rotulo="t₂ — 2ª chapa da porta" unidade="mm" aceitaZero valor={dados.t_porta2 ?? 0} onChange={(v) => set('t_porta2', Number(v))} dica="Só soma com ação conjunta comprovada; 0 = chapa única" />
                      <CampoMx rotulo="E — eficiência da porta" valor={dados.ef_porta ?? 0.7} onChange={(v) => set('ef_porta', Number(v))} />
                      <CampoMx rotulo="C — coeficiente UG-34" valor={dados.c_porta ?? 0.33} onChange={(v) => set('c_porta', Number(v))} />
                      <CampoMx rotulo="Nervuras — espessura b" unidade="mm" aceitaZero valor={dados.nerv_b ?? 0} onChange={(v) => set('nerv_b', Number(v))} />
                      <CampoMx rotulo="Nervuras — altura h" unidade="mm" aceitaZero valor={dados.nerv_h ?? 0} onChange={(v) => set('nerv_h', Number(v))} />
                      <CampoMx rotulo="Nervuras — quantidade n" aceitaZero valor={dados.nerv_n ?? 0} onChange={(v) => set('nerv_n', Number(v))} />
                      <CampoMx rotulo="Nervuras — comprimento livre L" unidade="mm" valor={dados.nerv_l ?? ''} onChange={(v) => set('nerv_l', Number(v))} dica="Vazio = raio interno (hipótese da planilha)" />
                      <CampoMx rotulo="Maior vão real medido" unidade="mm" valor={dados.vao_real ?? ''} onChange={(v) => set('vao_real', Number(v))} dica="Maior dimensão livre entre nervuras/travessas; vazio = vão conservador 2·R·sen(π/n)" />
                    </div>
                  </>
                ) : subtipo === 'vertical' ? (
                  <>
                    <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Projeto e material</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="P — pressão de projeto" unidade="MPa" obrigatorio valor={dados.pressao} onChange={(v) => set('pressao', Number(v))} />
                      <CampoMx rotulo="D — diâmetro interno" unidade="mm" obrigatorio valor={dados.diametro} onChange={(v) => set('diametro', Number(v))} />
                      <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={dados.tensao} onChange={(v) => set('tensao', Number(v))} />
                      <CampoMx rotulo="E — eficiência de junta" valor={dados.eficiencia ?? 1} onChange={(v) => set('eficiencia', Number(v))} />
                      <CampoMx rotulo="CA — corrosão admissível" unidade="mm" valor={dados.ca} onChange={(v) => set('ca', Number(v))} />
                      <CampoMx rotulo="Material" tipo="text" valor={dados.material} onChange={setMaterial} />
                      <CampoMx rotulo="Temperatura de projeto" unidade="°C" valor={dados.temperatura ?? ''} onChange={(v) => set('temperatura', Number(v))} />
                    </div>
                    <h4 className="mz-grupo"><Icone nome="box" tam={16} />Espessuras</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="t_tampo — esp. do tampo" unidade="mm" obrigatorio valor={dados.t_tampo} onChange={(v) => set('t_tampo', Number(v))} />
                      <CampoMx rotulo="t_costado — esp. do costado" unidade="mm" obrigatorio valor={dados.t_costado} onChange={(v) => set('t_costado', Number(v))} />
                      <CampoMx rotulo="t_fundo — esp. do fundo" unidade="mm" obrigatorio valor={dados.t_fundo} onChange={(v) => set('t_fundo', Number(v))} />
                      <CampoMx rotulo="C — fator UG-34" valor={dados.c_fator ?? 0.33} onChange={(v) => set('c_fator', Number(v))} />
                      <SelectMx
                        rotulo="Tipo de fundo"
                        valor={(dados.tipo_fundo as string) ?? 'plano'}
                        onChange={(v) => setCampo('tipo_fundo', v)}
                        opcoes={[
                          { value: 'plano', label: 'Plano (UG-34)' },
                          { value: 'conico', label: 'Cônico (UG-32g)' },
                          // 23/11/2026 · pedido do engenheiro: o torisférico faltava.
                          { value: 'torisferico', label: 'Torisférico (UG-32e)' },
                        ]}
                      />
                      {dados.tipo_fundo === 'conico' && (
                        <CampoMx rotulo="α — semiângulo do cone" unidade="°" valor={dados.alfa ?? 15} onChange={(v) => set('alfa', Number(v))} />
                      )}
                      {dados.tipo_fundo === 'torisferico' && (
                        <>
                          <CampoMx
                            rotulo="L — raio da coroa"
                            unidade="mm"
                            valor={dados.l_coroa ?? ''}
                            onChange={(v) => set('l_coroa', Number(v))}
                            dica="Vazio = torisférico padrão (L = D)"
                          />
                          <CampoMx
                            rotulo="r — raio de concordância"
                            unidade="mm"
                            valor={dados.r_concordancia ?? ''}
                            onChange={(v) => set('r_concordancia', Number(v))}
                            dica="Vazio = torisférico padrão (r = 0,06·D)"
                          />
                        </>
                      )}
                    </div>
                    <h4 className="mz-grupo"><Icone nome="tool" tam={16} />Travas do tampo</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="N — quantidade de travas" obrigatorio valor={dados.n_travas} onChange={(v) => set('n_travas', Number(v))} />
                      <CampoMx rotulo="d — diâmetro da trava" unidade="mm" valor={dados.d_trava} onChange={(v) => set('d_trava', Number(v))} />
                      <CampoMx rotulo="S_trava — tensão adm. da trava" unidade="MPa" valor={dados.tensao_trava} onChange={(v) => set('tensao_trava', Number(v))} />
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Projeto e material</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="P — pressão de projeto" unidade="MPa" obrigatorio valor={dados.pressao} onChange={(v) => set('pressao', Number(v))} />
                      <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={dados.tensao} onChange={(v) => set('tensao', Number(v))} />
                      <CampoMx rotulo="Material" tipo="text" valor={dados.material} onChange={setMaterial} />
                      <CampoMx rotulo="Tensão de escoamento (opcional)" unidade="MPa" valor={dados.sigma_escoamento ?? 0} onChange={(v) => set('sigma_escoamento', Number(v))} />
                    </div>
                    <h4 className="mz-grupo"><Icone nome="tool" tam={16} />Placa estaiada (UG-47)</h4>
                    <div className="mx-grid c3">
                      <CampoMx rotulo="C — coef. UG-47 (2,1 ou 2,2)" valor={dados.c_stay ?? 2.1} onChange={(v) => set('c_stay', Number(v))} />
                      <CampoMx rotulo="a — passo entre tirantes" unidade="mm" obrigatorio valor={dados.espacamento} onChange={(v) => set('espacamento', Number(v))} />
                      <CampoMx rotulo="t_real — espessura real" unidade="mm" obrigatorio valor={dados.espessura} onChange={(v) => set('espessura', Number(v))} />
                      <CampoMx rotulo="d — diâmetro do tirante" unidade="mm" valor={dados.diametro_tirante} onChange={(v) => set('diametro_tirante', Number(v))} />
                    </div>
                  </>
                )}
                <p className="mx-aviso">
                  <Icone nome="alerttri" tam={15} />
                  <span>Campo obrigatório vazio: o cálculo usa valores padrão até você preencher.</span>
                </p>
              </div>
            </section>

            <CartaoMemorialMz
              log={resultado?.log ?? []}
              calcCount={calcCount}
              sub={
                geradoEm
                  ? `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${dados.material ? ` · Material ${dados.material}` : ''} · NR-13 / ASME VIII Div.1`
                  : ''
              }
              placeholder="Preencha os dados estruturais do equipamento e clique em Gerar Cálculo para ver o memorial técnico desta geometria."
              aoGerar={handleCalcular}
            />
          </div>

          <BarraResultadoMz
            temResultado={!!resultado}
            status={resultado?.resultado ?? null}
            itens={[
              { rotulo: 'PMTA', valor: resultado?.pmta ? String(resultado.pmta).replace('.', ',') : '—', un: 'MPa', classe: 'pet' },
              {
                rotulo: subtipo === 'vertical' ? 'Esp. mín. do tampo' : 'Esp. mínima',
                valor: resultado?.t_min ? String(resultado.t_min).replace('.', ',') : '—',
                un: 'mm',
              },
            ]}
          />
        </div>
      )}
      </div>
    </div>
  );
}
