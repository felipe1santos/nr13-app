// Motor de assinatura das folhas do RELATÓRIO — modo CARIMBO (redesenho 14/07/2026).
// Em vez do bloco "Responsabilidade Técnica" ocupando meia folha (removido dos templates),
// a assinatura vira um carimbo compacto sobreposto à folha, logo acima do rodapé, nas folhas
// que incluem este script E que o assinante escolheu assinar (filtro por folhasRelatorio).
//
// FONTE DOS ASSINANTES (nesta ordem):
//   1. nr13_relatorio_meta_atual.assinantes — snapshot { engenheiro, tecnico } congelado na
//      geração do relatório (AssinanteSnapshot: nome, funcao, crea, assinatura, camposExtras,
//      folhasRelatorio). SÓ vale com ?ctx=rel na URL (folha rodando dentro do visualizador de
//      relatórios — mesmo padrão do rel-empresa.js): garante que relatório salvo NÃO muda quando
//      o usuário troca assinantes/funcionários depois, sem vazar a meta para outros contextos
//      (livro-registro avulso, certificados etc.).
//   2. Fora do ctx=rel (e como fallback quando a meta não traz assinantes):
//      nr13_assinantes_rel_<TAG> ({ engenheiroId, tecnicoId }) + nr13_lista_phs, ao vivo.
//
// REGRAS:
//   - Filtro POR FOLHA via folhasRelatorio: cada assinante carimba só as folhas listadas no seu
//     `folhasRelatorio` (nomes de template da lista de configuração). Folhas auto-injetadas
//     herdam a configuração da folha-pai (MAPA_PAI: checklist1/FOTOS-DOCUMENTACAO →
//     VERIFICACAO-DOCUMENTACAO, CHECKLIST-FOTOS → checklist3, *-FOTOS → folha-pai,
//     TERMO-ABERTURA → LIVRO-REGISTRO). Sem o campo: registro vivo cai na regra padrão por tipo
//     (Engenheiro assina todas, demais nenhuma); snapshot antigo (gravado antes do campo
//     existir) assina todas.
//   - CAPA.html, SUMARIO.html e CAPA-LIVRO-REGISTRO.html NUNCA recebem carimbo (exclusão dura,
//     mesmo que o script seja incluído por engano).
//   - TERMO-ABERTURA.html: só o engenheiro carimba (termo de abertura do livro), e ainda assim
//     só se ele assinar a chave LIVRO-REGISTRO.html.
//   - Sem nenhum assinante: nenhum carimbo (e o bloco fictício legado, se existir, é mantido).
//   - Blocos .resp-tecnica remanescentes (templates antigos em cache) são removidos ao carimbar.
//   - Idempotente e re-executado em DOMContentLoaded / load / pós-load, para cobrir templates
//     que montam páginas dinamicamente (CHECKLIST-FOTOS, MEMORIAL auto-paginado, *-FOTOS).
(function () {
  'use strict';

  function lerJSON(chave) {
    try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (_) { return null; }
  }

  function nomeFolhaAtual() {
    try {
      var p = decodeURIComponent(location.pathname);
      var partes = p.split('/');
      return partes[partes.length - 1] || '';
    } catch (_) { return ''; }
  }

  function ehArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function buscarPorId(lista, id) {
    if (id === null || id === undefined || id === '') return null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].id) === String(id)) return lista[i];
    }
    return null;
  }

  // Resolve { eng, tec } — snapshot da meta primeiro (SÓ com ?ctx=rel, mesmo padrão do
  // rel-empresa.js); fora do relatório ou meta sem assinantes: chaves vivas como fallback.
  function resolverAssinantes() {
    var params = new URLSearchParams(location.search);
    if (params.get('ctx') === 'rel') {
      var meta = lerJSON('nr13_relatorio_meta_atual');
      if (meta && meta.assinantes && typeof meta.assinantes === 'object' &&
          (meta.assinantes.engenheiro || meta.assinantes.tecnico)) {
        // Snapshot vazio (relatório gerado sem assinante escolhido) NÃO bloqueia o fallback
        // vivo — senão a folha fica sem carimbo mesmo com assinantes salvos para a TAG.
        return {
          eng: meta.assinantes.engenheiro || null,
          tec: meta.assinantes.tecnico || null,
        };
      }
    }
    var tag = params.get('tag') || '';
    var assinantes = lerJSON('nr13_assinantes_rel_' + tag) || {};
    if (!assinantes.engenheiroId && !assinantes.tecnicoId) return { eng: null, tec: null };
    var phs = lerJSON('nr13_lista_phs');
    if (!ehArray(phs)) phs = [];
    return {
      eng: buscarPorId(phs, assinantes.engenheiroId),
      tec: buscarPorId(phs, assinantes.tecnicoId),
    };
  }

  // Folhas que NUNCA recebem carimbo (defesa mesmo que o script seja incluído por engano).
  var FOLHAS_SEM_CARIMBO = ['CAPA.html', 'SUMARIO.html', 'CAPA-LIVRO-REGISTRO.html'];

  // Folhas auto-injetadas herdam a configuração de assinatura da folha-pai (a que aparece na
  // lista de configuração de folhasRelatorio).
  var MAPA_PAI = {
    'checklist1.html': 'VERIFICACAO-DOCUMENTACAO.html',
    'FOTOS-DOCUMENTACAO.html': 'VERIFICACAO-DOCUMENTACAO.html',
    'CHECKLIST-FOTOS.html': 'checklist3.html',
    'VISUAL-EXTERNO-FOTOS.html': 'VISUAL-EXTERNO.html',
    'VISUAL-INTERNO-FOTOS.html': 'VISUAL-INTERNO.html',
    'TESTE-HIDROSTATICO-FOTOS.html': 'TESTE-HIDROSTATICO.html',
    'TERMO-ABERTURA.html': 'LIVRO-REGISTRO.html',
  };

  // O assinante carimba a folha de chave `chave`?
  //   - folhasRelatorio (array de nomes de template) → só as folhas listadas;
  //   - sem o campo mas com `tipo` (registro vivo legado) → regra padrão: Engenheiro assina
  //     todas, os demais nenhuma;
  //   - sem nada (snapshot gravado antes do campo existir) → assina todas.
  function assinaFolha(func, chave) {
    if (!func) return false;
    if (ehArray(func.folhasRelatorio)) return func.folhasRelatorio.indexOf(chave) !== -1;
    if (func.tipo) return func.tipo === 'Engenheiro';
    return true;
  }

  function injetarCss() {
    if (document.getElementById('rel-assinatura-style')) return;
    var st = document.createElement('style');
    st.id = 'rel-assinatura-style';
    // Carimbo compacto: assinatura "apoiada" na linha (margem negativa), nome/cargo/CREA embaixo.
    // Posição fixa por folha: faixa acima do rodapé (rodapé fica em bottom:12mm nas folhas).
    st.textContent =
      '.rel-carimbos{position:absolute;left:15mm;right:15mm;bottom:31mm;display:flex;' +
      'justify-content:space-evenly;align-items:flex-end;gap:8mm;pointer-events:none;z-index:60}' +
      '.rel-carimbo{width:62mm;text-align:center;font-family:Arial,Helvetica,sans-serif}' +
      '.rel-carimbo-img{height:15mm;max-width:56mm;object-fit:contain;display:block;margin:0 auto -2.5mm}' +
      '.rel-carimbo-vazio{height:11mm}' +
      '.rel-carimbo-linha{border-top:1px solid #000;margin:0 4mm}' +
      '.rel-carimbo-nome{font-size:10px;font-weight:700;color:#000;margin-top:2px;line-height:1.25}' +
      '.rel-carimbo-cargo{font-size:8.5px;color:#222;line-height:1.25}' +
      '.rel-carimbo-crea{font-size:8.5px;color:#222;line-height:1.25}' +
      '.rel-carimbo-extra{font-size:8px;color:#333;line-height:1.25}';
    document.head.appendChild(st);
  }

  function el(classe, texto) {
    var d = document.createElement('div');
    d.className = classe;
    if (texto) d.textContent = texto;
    return d;
  }

  function criarCarimbo(func, cargoPadrao) {
    var box = el('rel-carimbo');
    if (func.assinatura) {
      var img = document.createElement('img');
      img.className = 'rel-carimbo-img';
      img.alt = 'Assinatura';
      img.src = func.assinatura;
      box.appendChild(img);
    } else {
      box.appendChild(el('rel-carimbo-vazio'));
    }
    box.appendChild(el('rel-carimbo-linha'));
    box.appendChild(el('rel-carimbo-nome', func.nome || ''));
    box.appendChild(el('rel-carimbo-cargo', func.funcao || cargoPadrao));
    if (func.crea) box.appendChild(el('rel-carimbo-crea', 'CREA/Registro: ' + func.crea));
    var extras = func.camposExtras;
    if (ehArray(extras)) {
      for (var i = 0; i < extras.length; i++) {
        var ex = extras[i] || {};
        if (!ex.rotulo || !ex.valor) continue;
        box.appendChild(el('rel-carimbo-extra', ex.rotulo + ': ' + ex.valor));
      }
    }
    return box;
  }

  // Remove blocos "Responsabilidade Técnica" legados (defesa contra template antigo em cache).
  function removerBlocosLegados() {
    var blocos = document.querySelectorAll('.resp-tecnica');
    for (var i = 0; i < blocos.length; i++) {
      if (blocos[i].parentNode) blocos[i].parentNode.removeChild(blocos[i]);
    }
  }

  function aplicar() {
    var folha = nomeFolhaAtual();
    if (FOLHAS_SEM_CARIMBO.indexOf(folha) !== -1) return; // capa/sumário: nunca carimbar
    // O carimbo é do CONTEXTO DO RELATÓRIO (?ctx=rel). Fora dele (rota /livro-registro,
    // certificados avulsos etc.) a folha mantém seus próprios blocos congelados — senão o
    // carimbo vivo sobrepõe entradas históricas do livro com o cadastro de hoje.
    // Exceção: TERMO-ABERTURA sempre carimba (comportamento antigo do termo no livro avulso).
    var ctxRel = new URLSearchParams(location.search).get('ctx') === 'rel';
    if (!ctxRel && folha !== 'TERMO-ABERTURA.html') return;
    var chave = MAPA_PAI[folha] || folha; // folha auto-injetada herda a config da folha-pai
    var r = resolverAssinantes();
    var eng = assinaFolha(r.eng, chave) ? r.eng : null;
    var tec = assinaFolha(r.tec, chave) ? r.tec : null;
    if (folha === 'TERMO-ABERTURA.html') tec = null; // termo: só o engenheiro
    try {
      // Diagnóstico (fica no console da folha, 1x): por que carimbou/não carimbou.
      if (jaLogou) throw 0;
      jaLogou = true;
      console.info('[rel-assinatura]', folha, 'chave=' + chave, 'ctxRel=' + ctxRel,
        'eng=' + (r.eng ? (r.eng.nome + (eng ? '' : ' (fora de folhasRelatorio)')) : 'nenhum'),
        'tec=' + (r.tec ? (r.tec.nome + (tec ? '' : ' (fora de folhasRelatorio)')) : 'nenhum'));
    } catch (_) { /* diagnóstico nunca quebra a folha */ }
    if (!eng && !tec) return; // sem assinantes: folha fica sem carimbo (fictício legado mantido)

    removerBlocosLegados();
    injetarCss();

    var paginas = document.querySelectorAll('.page, .pagina');
    for (var i = 0; i < paginas.length; i++) {
      var pg = paginas[i];
      if (pg.querySelector('.rel-carimbos')) continue; // idempotente (re-execuções)
      try {
        if (getComputedStyle(pg).position === 'static') pg.style.position = 'relative';
      } catch (_) { /* segue com o posicionamento atual */ }
      var wrap = el('rel-carimbos');
      if (eng) wrap.appendChild(criarCarimbo(eng, 'Engenheiro'));
      if (tec) wrap.appendChild(criarCarimbo(tec, 'Técnico'));
      pg.appendChild(wrap);
    }
  }

  var jaLogou = false; // diagnóstico 1x por folha (aplicar roda em 3 passadas)

  function aplicarSeguro() {
    try { aplicar(); } catch (_) { /* nunca quebra a folha */ }
  }

  // 3 passadas idempotentes: cobre páginas montadas no DOMContentLoaded de listeners anteriores,
  // imagens/late-DOM no load e qualquer montagem tardia logo após o load (antes da rasterização
  // de impressão, que espera load + 500ms).
  document.addEventListener('DOMContentLoaded', aplicarSeguro);
  window.addEventListener('load', function () {
    aplicarSeguro();
    setTimeout(aplicarSeguro, 300);
  });
})();
