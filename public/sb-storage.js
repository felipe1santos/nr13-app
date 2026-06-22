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

  window.sbSalvar = function (chave, valor) {
    // valor já deve ser string (JSON.stringify). Grava no cache local sempre.
    try { localStorage.setItem(chave, valor); } catch (e) {}

    var s = sessao();
    var token = s && s.access_token;
    if (!token) return; // offline / sem sessão: fica só no cache local
    var uid = userIdDoToken(token);
    if (!uid) return;

    fetch(SB_URL + '/rest/v1/app_storage', {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ user_id: uid, chave: chave, valor: valor }),
    }).catch(function () {});
  };
})();
