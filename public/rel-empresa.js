// Fonte dos dados da empresa executante (logo + rodapé) nas folhas do RELATÓRIO.
// Congela a empresa exibida em relatórios salvos: quando a folha roda dentro do visualizador de
// relatórios (?ctx=rel na URL) e a meta atual (nr13_relatorio_meta_atual) traz o snapshot
// `empresa` (gravado na geração do relatório), usa o snapshot; caso contrário cai no dado vivo
// (nr13_minha_empresa) — comportamento antigo, usado pelo livro/certificados fora do relatório e
// por relatórios salvos antes do snapshot existir.
// Os templates leem via: (window.NR13_EMPRESA_JSON || localStorage.getItem('nr13_minha_empresa')).
window.NR13_EMPRESA_JSON = (function () {
  'use strict';
  try {
    if (new URLSearchParams(location.search).get('ctx') === 'rel') {
      var meta = JSON.parse(localStorage.getItem('nr13_relatorio_meta_atual') || 'null');
      if (meta && meta.empresa) return JSON.stringify(meta.empresa);
    }
  } catch (_) { /* qualquer erro: cai no dado vivo abaixo */ }
  return localStorage.getItem('nr13_minha_empresa');
})();
