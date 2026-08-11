import { useEffect, useRef, useState } from 'react';
import { armazenamentoV2Ativo } from '../../services/flag';
import { montarPalcoDaTag, limparPalco, type FalhaPalco } from '../../services/palco';
import { renovarTrava, type ContextoMontagem } from '../../services/palcoTrava';
import { recomprimirFotosDoValor, maiorFotoDoValor } from '../../services/recompressorFoto';
import { drenarPonte } from '../../services/ponteTemplates';
import { salvar } from '../../services/storage';
import { idDispositivo } from '../../services/sync';

export type EstadoPalco = 'montando' | 'pronto' | 'recusado';

export interface UsoPalco {
  estado: EstadoPalco;
  falha: FalhaPalco | null;
  /** Parâmetros da montagem para a query string dos iframes. */
  paramsIframe: string;
  ctx: ContextoMontagem | null;
}

/** Um id por aba, estável enquanto a aba viver. */
let idAba: string | null = null;
function abaAtual(): string {
  if (!idAba) idAba = crypto.randomUUID();
  return idAba;
}

const INTERVALO_RENOVACAO_MS = 20_000;

/**
 * Prepara o palco antes de a tela montar os iframes.
 *
 * NENHUM iframe pode ser renderizado antes de `estado === 'pronto'`. Um
 * documento meio montado sai impresso com folha faltando e ninguém percebe —
 * por isso a recusa é um estado explícito, não um aviso no console.
 *
 * No caminho v1 é no-op: lá o `localStorage` já tem tudo, e montar palco seria
 * mexer no que funciona.
 */
export function usePalcoDocumento(
  tag: string,
  relatorioId: string,
  opcoes?: { somenteLeitura?: boolean },
): UsoPalco {
  const [estado, setEstado] = useState<EstadoPalco>(() =>
    armazenamentoV2Ativo() ? 'montando' : 'pronto',
  );
  const [falha, setFalha] = useState<FalhaPalco | null>(null);
  const ctxRef = useRef<ContextoMontagem | null>(null);
  // Lido só na limpeza, e por isso precisa ser ref: `somenteLeitura` vira true
  // no instante em que o relatório é salvo, sem o efeito de montagem remontar.
  const somenteLeitura = opcoes?.somenteLeitura ?? false;
  const somenteLeituraRef = useRef(false);
  useEffect(() => {
    somenteLeituraRef.current = somenteLeitura;
  }, [somenteLeitura]);

  useEffect(() => {
    if (!armazenamentoV2Ativo()) {
      setEstado('pronto');
      return;
    }

    let vivo = true;
    const ctx: ContextoMontagem = {
      orgId: localStorage.getItem('nr13_org_id') ?? idDispositivo(),
      tabId: abaAtual(),
      relatorioId,
      tag,
      nonce: crypto.randomUUID(),
    };
    ctxRef.current = ctx;
    setEstado('montando');
    setFalha(null);

    void montarPalcoDaTag(ctx, { recomprimir: recomprimirFotosDoValor, maiorFoto: maiorFotoDoValor })
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setEstado('pronto');
        else {
          setFalha(r.falha);
          setEstado('recusado');
        }
      })
      .catch((erro: unknown) => {
        if (!vivo) return;
        setFalha({
          tipo: 'escrita_falhou',
          chave: '—',
          erro: {
            categoria: 'desconhecido',
            titulo: 'Não foi possível preparar o documento',
            explicacao: 'Tente novamente. Se persistir, veja os detalhes técnicos.',
            acao: null,
            detalhe: {
              codigo: '—',
              mensagemOriginal: String(erro),
              chave: '—',
              mutationId: '—',
              dispositivo: ctx.tabId,
              quando: new Date().toISOString(),
            },
          },
        });
        setEstado('recusado');
      });

    // A trava expira em 60s; renova enquanto o documento estiver aberto.
    const renovacao = setInterval(() => renovarTrava(ctx), INTERVALO_RENOVACAO_MS);

    return () => {
      vivo = false;
      clearInterval(renovacao);
      // Absorve o que os templates gravaram por sbSalvar antes de soltar o palco.
      // Em documento SOMENTE LEITURA nada é absorvido: o que porventura esteja
      // na ponte não veio desta folha (sbSalvar está bloqueado por ro=1) e será
      // drenado pela próxima sessão editável. Relatório salvo não regrava nada.
      if (!somenteLeituraRef.current) {
        void drenarPonte((chave, valor) => salvar(chave, JSON.parse(valor)));
      }
      limparPalco(ctx);
      ctxRef.current = null;
    };
  }, [tag, relatorioId]);

  const ctx = ctxRef.current;
  const paramsIframe = ctx
    ? `&nonce=${encodeURIComponent(ctx.nonce)}&aba=${encodeURIComponent(ctx.tabId)}&org=${encodeURIComponent(ctx.orgId)}`
    : '';

  return { estado, falha, paramsIframe, ctx };
}

/** Tamanho (UTF-16) da maior foto dentro do valor de `nr13_fotos_<TAG>`. */
