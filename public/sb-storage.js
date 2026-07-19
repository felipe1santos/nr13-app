// Sincroniza gravações feitas DENTRO dos templates HTML (iframe) com o Supabase.
// O iframe é mesmo-origin, então compartilha o localStorage onde o supabase-js guarda a sessão.
// Lê o access_token de lá e faz upsert na tabela app_storage via REST.
// Uso: sbSalvar('nr13_med_esp_TAG', JSON.stringify(obj));  (também grava no localStorage)
(function () {
  var SB_URL = 'https://qqsesrntfvmdxqxrfvmw.supabase.co';
  var SB_KEY = 'sb_publishable_q0WdFDVUFTuZMlDpD6uO1g_bYZ7WDEo';

  function sessao() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > -1) {
          return JSON.parse(localStorage.getItem(k));
        }
      }
    } catch (e) {}
    return null;
  }

  function userIdDoToken(token) {
    try {
      return JSON.parse(atob(token.split('.')[1])).sub || null;
    } catch (e) {
      return null;
    }
  }

  // Falhou a gravação remota: enfileira em nr13_fila_sync (mesmo formato/dedup do
  // storage.ts) para o app drenar no próximo flushFila. Sem isso a chave ficava só no
  // cache local e o reconcile do lerTudo() a APAGAVA (dado do template sumia após F5).
  function enfileirar(chave, valor) {
    try {
      var fila = [];
      try { fila = JSON.parse(localStorage.getItem('nr13_fila_sync') || '[]'); } catch (e) {}
      if (!Array.isArray(fila)) fila = [];
      fila = fila.filter(function (o) { return o && o.chave !== chave; });
      fila.push({ op: 'set', chave: chave, valor: valor });
      localStorage.setItem('nr13_fila_sync', JSON.stringify(fila));
    } catch (e) {}
  }

  window.sbSalvar = function (chave, valor) {
    // valor já deve ser string (JSON.stringify). Grava no cache local sempre.
    try { localStorage.setItem(chave, valor); } catch (e) {}

    var s = sessao();
    var token = s && s.access_token;
    var uid = token ? userIdDoToken(token) : null;
    if (!token || !uid) {
      enfileirar(chave, valor); // offline / sem sessão / token ilegível: o app sincroniza depois
      return;
    }

    fetch(SB_URL + '/rest/v1/app_storage', {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_id: uid, chave: chave, valor: valor }),
    }).then(function (res) {
      if (!res || !res.ok) enfileirar(chave, valor); // token expirado / RLS: não perde a escrita
    }).catch(function () {
      enfileirar(chave, valor);
    });
  };
})();
