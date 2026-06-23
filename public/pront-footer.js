// Footer padrão das folhas do prontuário: logo + dados da empresa + "Página X de Y".
// Injetado por todas as folhas PRONT-* (o footer não existia no body — só havia CSS solto).
// Lê page/total da URL (?page=N&total=M) e a empresa de nr13_prontuario_atual / nr13_minha_empresa.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('.pront-footer')) return; // idempotente
    var wrap = document.querySelector('.content-wrapper') || document.querySelector('.a4-page');
    if (!wrap) return;

    var params = new URLSearchParams(location.search);
    var page = (params.get('page') || '').trim();
    var total = (params.get('total') || '').trim();

    var d = {}, me = {};
    try { d = JSON.parse(localStorage.getItem('nr13_prontuario_atual') || '{}') || {}; } catch (_) {}
    try { me = JSON.parse(localStorage.getItem('nr13_minha_empresa') || '{}') || {}; } catch (_) {}

    var nome = d.minhaEmpresaNome || me.razao || me.fantasia || '';
    var cnpj = d.minhaEmpresaCnpj || me.cnpj || '';
    var cidade = d.minhaEmpresaCidade || me.cidade || '';
    var uf = d.minhaEmpresaEstado || me.estado || '';
    var logo = d.logo || me.logo || '';

    var partes = [
      nome,
      cnpj ? 'CNPJ: ' + cnpj : '',
      cidade ? cidade + (uf ? '/' + uf : '') : '',
    ].filter(Boolean);

    var pag = page ? ('Página ' + page + (total ? ' de ' + total : '')) : '';

    if (!document.getElementById('pront-footer-style')) {
      var st = document.createElement('style');
      st.id = 'pront-footer-style';
      st.textContent =
        '.pront-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'margin-top:auto;padding-top:8px;border-top:1px solid #ccc;font-size:8.5px;color:#333;flex-shrink:0;position:relative;z-index:1}' +
        '.pront-footer-logo{max-height:32px;width:auto;object-fit:contain;flex-shrink:0}' +
        '.pront-footer-text{flex:1;text-align:center;line-height:1.35}' +
        '.pront-footer-page{font-weight:700;color:#003366;white-space:nowrap}';
      document.head.appendChild(st);
    }

    var foot = document.createElement('div');
    foot.className = 'pront-footer';
    foot.innerHTML =
      (logo ? '<img class="pront-footer-logo" src="' + logo + '" alt="">' : '') +
      '<div class="pront-footer-text">' + partes.join(' • ') + '</div>' +
      '<div class="pront-footer-page">' + pag + '</div>';
    wrap.appendChild(foot);
  });
})();
