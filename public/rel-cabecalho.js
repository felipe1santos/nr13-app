// ── Cabeçalho padronizado das folhas do RELATÓRIO (caixa de info à direita) ──────────────
// Padrão (revisão do engenheiro, 07/2026):
//   Linha 1: "Rastreabilidade:"   → código do relatório (nr13_relatorio_meta_atual.codigo)
//   Linha 2: "Data da Inspeção:"  → meta.execucaoInspecao → dataInspecao do container de
//            inspeção (nr13_injecao_atual / nr13_inspecao_atual) → meta.emissao (DD/MM/AAAA)
//   Linha 3: "Folha: k/N" só nas folhas com subfolhas (MEMORIAL ?part, *-FOTOS ?fpag).
// Carregado no <head> (execução síncrona, ANTES dos scripts inline de cada template): expõe
// window.NR13_CABECALHO = { codigo, dataInspecao } para os DOMContentLoaded consumirem.
(function () {
    function fmtBR(v) {
        if (!v) return '';
        var s = String(v).trim();
        var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // aaaa-mm-dd (input date dos formulários)
        if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
        var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // já em dd/mm/aaaa
        if (br) return ('0' + br[1]).slice(-2) + '/' + ('0' + br[2]).slice(-2) + '/' + br[3];
        return s;
    }

    function lerJson(chave) {
        try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
    }

    // Data de campo do container injetado: o checklist é a fonte primária; os demais
    // formulários entram como fallback (gravam dataInspecao em aaaa-mm-dd; o ultrassom
    // grava a data do ensaio em `dataUltrassom` — sem ele, um container só de ultrassom
    // caía errado em meta.emissao).
    function dataDoContainer() {
        var chaves = ['nr13_injecao_atual', 'nr13_inspecao_atual'];
        var forms = ['checklist', 'visual_externo', 'visual_interno', 'th'];
        for (var i = 0; i < chaves.length; i++) {
            var dados = lerJson(chaves[i]);
            if (!dados) continue;
            for (var j = 0; j < forms.length; j++) {
                if (dados[forms[j]] && dados[forms[j]].dataInspecao) return dados[forms[j]].dataInspecao;
            }
            var us = dados.ultrassom;
            if (us && (us.dataInspecao || us.dataUltrassom)) return us.dataInspecao || us.dataUltrassom;
            if (dados.dataInspecao) return dados.dataInspecao;
        }
        return '';
    }

    var meta = lerJson('nr13_relatorio_meta_atual') || {};
    window.NR13_CABECALHO = {
        codigo: meta.codigo || '',
        dataInspecao: fmtBR(meta.execucaoInspecao) || fmtBR(dataDoContainer()) || fmtBR(meta.emissao) || ''
    };

    // Atalho pros templates: valor da linha 2 com fallback local do template.
    window.NR13_DATA_INSP = function (fallback) {
        return (window.NR13_CABECALHO && window.NR13_CABECALHO.dataInspecao) || fallback || '';
    };
})();
