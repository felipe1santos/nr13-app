// Assinaturas REAIS das folhas do prontuário (motor de assinatura).
// Lê nr13_assinantes_pront_<TAG> ({ engenheiroId, tecnicoId }) + nr13_lista_phs e substitui,
// em runtime, o conteúdo fictício do bloco canônico (idêntico nas 6 folhas):
//   .resp-tecnica > .resp-grid > 2x .resp-col (col 1 = engenheiro, col 2 = técnico)
// COMPATIBILIDADE: se a chave de assinantes não existir OU ambos os ids forem null,
// NÃO faz nada (as folhas mantêm o exemplo fictício estático).
// Regra "assina esta folha": nome do arquivo atual ∈ funcionario.folhasProntuario.
// folhasProntuario AUSENTE (registro antigo): Engenheiro assina todas; Inspetor nenhuma.
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

  function buscarPorId(lista, id) {
    if (id === null || id === undefined || id === '') return null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].id) === String(id)) return lista[i];
    }
    return null;
  }

  function assinaFolha(func, folha) {
    if (!func) return false;
    var folhas = func.folhasProntuario;
    if (folhas === undefined || folhas === null) {
      // Registro antigo, sem o campo: engenheiro assina todas; inspetor nenhuma.
      return func.tipo === 'Engenheiro';
    }
    if (!folha || Object.prototype.toString.call(folhas) !== '[object Array]') return false;
    for (var i = 0; i < folhas.length; i++) {
      if (folhas[i] === folha) return true;
    }
    return false;
  }

  function injetarCss() {
    if (document.getElementById('pront-assinatura-style')) return;
    var st = document.createElement('style');
    st.id = 'pront-assinatura-style';
    // Assinatura real GRANDE (bem maior que o svg de exemplo de 44px), centrada sobre a linha;
    // margem negativa deixa o traço "apoiado" na linha como assinatura de caneta.
    st.textContent =
      '.rubrica-img{height:72px;max-width:320px;object-fit:contain;display:block;margin:0 auto -6px}' +
      '.rubrica-vazia{height:66px}' + // mesma altura útil da imagem (72 - 6 de sobreposição): linhas das 2 colunas alinham

      '.resp-extra{font-size:9px;color:#333}';
    document.head.appendChild(st);
  }

  function criarImgAssinatura(dataUrl) {
    var img = document.createElement('img');
    img.className = 'rubrica-img';
    img.alt = 'Assinatura';
    img.src = dataUrl;
    return img;
  }

  function criarEspacoVazio() {
    var div = document.createElement('div');
    div.className = 'rubrica-vazia';
    return div;
  }

  // Troca o placeholder de rubrica (svg de exemplo ou .resp-espaco) pela assinatura real
  // (imagem) ou por um espaço em branco da mesma altura, mantendo a .resp-linha embaixo.
  function trocarRubrica(container, dataUrl) {
    var alvo = container.querySelector('svg.rubrica') || container.querySelector('.resp-espaco');
    var novo = dataUrl ? criarImgAssinatura(dataUrl) : criarEspacoVazio();
    if (alvo && alvo.parentNode) {
      alvo.parentNode.replaceChild(novo, alvo);
    } else {
      var linha = container.querySelector('.resp-linha');
      if (linha && linha.parentNode) linha.parentNode.insertBefore(novo, linha);
    }
  }

  function setTexto(container, seletor, valor) {
    var el = container.querySelector(seletor);
    if (el) el.textContent = valor;
  }

  // Esvazia a coluna preservando a altura atual, para o grid de assinaturas não colapsar.
  function limparColuna(col) {
    var h = col.offsetHeight;
    if (h > 0) col.style.minHeight = h + 'px';
    while (col.firstChild) col.removeChild(col.firstChild);
  }

  function preencherColuna(col, func, folha, cargoPadrao) {
    if (!func || !assinaFolha(func, folha)) { limparColuna(col); return; }

    trocarRubrica(col, func.assinatura || '');
    setTexto(col, '.resp-nome', func.nome || '');
    setTexto(col, '.resp-cargo', func.funcao || cargoPadrao);
    setTexto(col, '.resp-crea', func.crea ? 'CREA/Registro: ' + func.crea : '');

    // Campos extras (ex.: certificações) — linhas pequenas depois do CREA.
    var crea = col.querySelector('.resp-crea');
    var extras = func.camposExtras;
    if (crea && extras && Object.prototype.toString.call(extras) === '[object Array]') {
      var ref = crea;
      for (var i = 0; i < extras.length; i++) {
        var ex = extras[i] || {};
        if (!ex.rotulo || !ex.valor) continue;
        var div = document.createElement('div');
        div.className = 'resp-extra';
        div.textContent = ex.rotulo + ': ' + ex.valor;
        if (ref.nextSibling) ref.parentNode.insertBefore(div, ref.nextSibling);
        else ref.parentNode.appendChild(div);
        ref = div;
      }
    }
  }

  function aplicar() {
    var pront = lerJSON('nr13_prontuario_atual') || {};
    var tag = pront.tag || new URLSearchParams(location.search).get('tag') || '';

    if (localStorage.getItem('nr13_assinantes_pront_' + tag) === null) return; // sem motor: mantém fictício
    var assinantes = lerJSON('nr13_assinantes_pront_' + tag) || {};
    if (!assinantes.engenheiroId && !assinantes.tecnicoId) return; // ambos null: mantém fictício

    var phs = lerJSON('nr13_lista_phs');
    if (Object.prototype.toString.call(phs) !== '[object Array]') phs = [];

    var eng = buscarPorId(phs, assinantes.engenheiroId);
    var tec = buscarPorId(phs, assinantes.tecnicoId);
    var folha = nomeFolhaAtual();

    injetarCss();

    // Bloco canônico (idêntico nas 6 folhas): grid com 2 colunas.
    var grid = document.querySelector('.resp-tecnica .resp-grid');
    if (grid) {
      var cols = grid.querySelectorAll('.resp-col');
      if (cols[0]) preencherColuna(cols[0], eng, folha, 'Engenheiro');
      if (cols[1]) preencherColuna(cols[1], tec, folha, 'Técnico');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { aplicar(); } catch (_) { /* nunca quebra a folha */ }
  });
})();
