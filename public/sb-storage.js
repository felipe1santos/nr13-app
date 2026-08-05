// Escrita feita DENTRO dos templates HTML (iframe).
//
// O template NAO fala mais com o Supabase. Ele deposita no fallback local,
// posta para o app e espera a CONFIRMACAO; quem grava e o app, que sabe org_id,
// versao, dispositivo e fila. Antes, o upsert daqui ia SEM org_id e a RLS por
// organizacao recusava toda escrita direta — so sobrevivia porque caia na fila.
//
// Ordem de proposito: grava o fallback ANTES de postar. Se o app morrer no meio,
// o dado existe e e drenado no proximo boot. Cada item so sai do fallback
// DEPOIS que o app confirma o commit.
(function () {
  var PONTE = 'nr13_fila_ponte';
  var pendentes = {};

  // Credenciais desta montagem, entregues pelo app na query string do iframe.
  var params = new URLSearchParams(location.search);
  var NONCE = params.get('nonce') || '';
  var ABA = params.get('aba') || '';
  var ORG = params.get('org') || '';
  // ro=1: folha de RELATORIO JA SALVO. Relatorio salvo e registro tecnico
  // assinado — nao muda mais. Sem este gate, digitar dentro da folha ainda
  // gravava nr13_med_esp_/nr13_med_grid_/nr13_laudo_ da TAG, contaminando o
  // prontuario e os proximos relatorios do mesmo equipamento.
  var SOMENTE_LEITURA = params.get('ro') === '1';

  function avisarApp(payload) {
    try {
      window.parent.postMessage(payload, location.origin); // destino explicito, nunca '*'
      return true;
    } catch (e) {
      return false;
    }
  }

  function reportarErro(chave, erro) {
    // Nao existe catch vazio nesta ponte: falha que o app nao souber vira
    // pendencia invisivel, que e a classe de bug que este projeto conserta.
    avisarApp({
      tipo: 'nr13_erro_ponte',
      nonce: NONCE,
      aba: ABA,
      org: ORG,
      chave: chave,
      erro: String((erro && erro.message) || erro),
    });
  }

  function lerFila() {
    try {
      var fila = JSON.parse(localStorage.getItem(PONTE) || '[]');
      return Array.isArray(fila) ? fila : [];
    } catch (e) {
      return [];
    }
  }

  function guardarFallback(id, chave, valor) {
    try {
      var fila = lerFila().filter(function (o) {
        return o && o.chave !== chave;
      });
      fila.push({ id: id, chave: chave, valor: valor });
      localStorage.setItem(PONTE, JSON.stringify(fila));
      return true;
    } catch (e) {
      reportarErro(chave, e); // cota estourada: o app precisa saber
      return false;
    }
  }

  function removerDoFallback(id) {
    try {
      var restante = lerFila().filter(function (o) {
        return o && o.id !== id;
      });
      if (restante.length === 0) localStorage.removeItem(PONTE);
      else localStorage.setItem(PONTE, JSON.stringify(restante));
    } catch (e) {
      // Nao encolher o fallback e inofensivo: o item sera reprocessado e a
      // gravacao e idempotente por chave.
    }
  }

  window.addEventListener('message', function (ev) {
    // Espelho da validacao do lado do app: origem, emissor e nonce.
    if (ev.origin !== location.origin) return;
    if (ev.source !== window.parent) return;
    var m = ev.data;
    if (!m || m.tipo !== 'nr13_salvo' || m.nonce !== NONCE) return;
    if (!pendentes[m.id]) return;

    clearTimeout(pendentes[m.id].timer);
    delete pendentes[m.id];
    removerDoFallback(m.id); // so agora: o app confirmou o commit
  });

  window.sbSalvar = function (chave, valor) {
    // Portal do Cliente e somente leitura.
    if ((localStorage.getItem('nr13_papel') || '') === 'cliente') return;
    // Relatorio ja salvo: nada sai da folha. A trava de DOM do app ja impede a
    // digitacao; este e o gate de DADOS, que vale mesmo se o DOM for burlado.
    if (SOMENTE_LEITURA) return;

    var id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
    guardarFallback(id, chave, valor);

    pendentes[id] = {
      timer: setTimeout(function () {
        delete pendentes[id];
        reportarErro(chave, 'sem confirmacao do app em 5s');
      }, 5000),
    };

    if (!avisarApp({
      tipo: 'nr13_salvar',
      id: id,
      nonce: NONCE,
      aba: ABA,
      org: ORG,
      chave: chave,
      valor: valor,
    })) {
      // Sem parent acessivel: o fallback ja cobriu e o app drena no proximo boot.
      clearTimeout(pendentes[id].timer);
      delete pendentes[id];
    }
  };
})();
