import { useEffect, useRef, useState } from 'react';
import { carregarPerfil, perfilParaEntrada, usuarioLogado } from '../services/auth';
import { bloqueioEntrada } from '../features/assinatura/maquinaEstados';
import {
  statusAssinaturaLocal,
  marcarSucessoPendente,
  marcarSucessoExibido,
  montarUrlCheckout,
  obterUrlCheckout,
  urlCheckoutSincrona,
} from '../services/assinatura';
import { emitirAviso } from '../services/eventos';
import { Icone } from './Icone';

const INTERVALO_MS = 10_000;
const LIMITE_MS = 15 * 60_000;
/** Leituras "ruins" (perfil inativo/expirado) seguidas exigidas antes de concluir revogação
 *  de verdade — ver comentário no `.then()` abaixo. */
const LEITURAS_RUINS_PARA_CONCLUIR = 2;

// A Kiwify não tem checkout embutido (só página hospedada), então abrimos em outra aba
// e ficamos perguntando o status ao servidor: quando o webhook chegar, a tela libera
// sozinha, sem F5 nem novo login.
export default function ModalAssinatura({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [aguardando, setAguardando] = useState(false);
  // Depois que já abriu o checkout uma vez, o timeout de 15min não deve reabrir outra aba —
  // quem já pagou e só está esperando o webhook atrasado só precisa reconsultar o servidor.
  const [jaAbriuCheckout, setJaAbriuCheckout] = useState(false);
  const email = usuarioLogado() ?? '';
  const [urlBase, setUrlBase] = useState(urlCheckoutSincrona);

  // onFechar é recriado a cada render do pai (BarraAssinatura define uma arrow function
  // inline). Se ele entrasse nas deps do efeito de polling abaixo, cada re-render do pai
  // reiniciaria o setInterval e o cronômetro de 15min nunca chegaria ao fim. Guardamos a
  // versão mais recente numa ref e chamamos por ela — o efeito só depende do que de fato
  // deve reiniciar o polling (aberto/aguardando).
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  // Contador de leituras consecutivas com perfil "ruim" (inativo/expirado). Zerado a cada
  // leitura normal e a cada nova rodada de polling — ver justificativa no `.then()` abaixo.
  const leiturasRuinsRef = useRef(0);

  // O link vive em config_global (você troca de plano sem novo deploy). Enquanto a consulta
  // não volta — ou se ela falhar — vale o padrão, para o botão nunca ficar morto. A busca é
  // a mesma de services/assinatura.ts (cache compartilhado com o botão da tela de login).
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void obterUrlCheckout().then((u) => {
      if (vivo) setUrlBase(u);
    });
    return () => {
      vivo = false;
    };
  }, [aberto]);

  // Fechar o modal (botão "Fechar" ou clique fora) cancela a espera: se o usuário reabrir
  // depois, começa limpo a partir do botão "Ir para o pagamento" — não deixa um polling
  // "fantasma" correndo com o modal escondido.
  useEffect(() => {
    if (!aberto) {
      setAguardando(false);
      setJaAbriuCheckout(false);
    }
  }, [aberto]);

  useEffect(() => {
    // Só corre enquanto o modal está aberto E o usuário mandou esperar. Qualquer mudança
    // nessas duas (fechou o modal, bateu o limite, ou o pagamento foi confirmado) passa
    // por aqui e o cleanup do efeito anterior derruba o interval — nunca fica vazando.
    if (!aberto || !aguardando) return;
    leiturasRuinsRef.current = 0; // nova rodada de polling começa com o contador zerado
    const inicio = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - inicio >= LIMITE_MS) {
        setAguardando(false); // limite de 15min: para de perguntar, libera o botão de novo
        return;
      }
      // IMPORTANTE: carregarPerfil(), não verificarAcesso(). verificarAcesso() faz logout()
      // se achar o perfil inativo/expirado — rodar isso a cada 10s por até 15min correria o
      // risco de deslogar o usuário NO MEIO da espera do pagamento (ex.: acesso_expira_em já
      // vencido por outro motivo, sessão que caiu um instante). carregarPerfil() só relê o
      // perfil e regrava o espelho local (gravarEstadoLocal) — é só isso que o polling
      // precisa para o statusAssinaturaLocal() enxergar a mudança feita pelo webhook.
      void carregarPerfil()
        .then((perfil) => {
          // MESMA regra do gate de login (bloqueioEntrada): para quem TEM assinatura, uma
          // `acesso_expira_em` vencida é só o webhook de renovação atrasado — não pode ser
          // lida como "conta revogada" justamente enquanto a pessoa espera o pagamento cair.
          const leituraRuim = !!bloqueioEntrada(perfilParaEntrada(perfil), new Date());
          if (leituraRuim) {
            // `!perfil.ativo` também é verdadeiro em falso-positivos passageiros: sessão
            // momentaneamente ilegível (carregarPerfil devolve PERFIL_VAZIO quando
            // getSession() não traz uid) ou a query resolveu sem lançar mas sem dado (data
            // null). É exatamente o tipo de soluço que o .catch abaixo trata para erros que
            // lançam — aqui é o mesmo problema só que "resolvido" em vez de rejeitado. Uma
            // única leitura ruim isolada NÃO pode derrubar quem está de fato pagando: só
            // concluímos revogação de verdade após leituras ruins CONSECUTIVAS (~20s),
            // contador zerado a cada leitura normal e a cada nova rodada de polling.
            leiturasRuinsRef.current += 1;
            if (leiturasRuinsRef.current < LEITURAS_RUINS_PARA_CONCLUIR) return;
            // Concluído: conta de fato desativada/expirada enquanto o usuário esperava o
            // pagamento. Para de perguntar e avisa com clareza, mas NÃO chama logout() daqui
            // — quem decide encerrar a sessão de fato é o gate normal
            // (RotaProtegida/verificarAcesso) no próximo carregamento da rota, não este
            // polling em segundo plano.
            setAguardando(false);
            emitirAviso({
              variante: 'erro',
              titulo: 'Acesso não liberado',
              texto: 'Sua conta está inativa ou expirada. Fale com o administrador antes de tentar novamente.',
            });
            onFecharRef.current();
            return;
          }
          leiturasRuinsRef.current = 0; // leitura normal: zera o contador de leituras ruins
          if (statusAssinaturaLocal() === 'ativa') {
            setAguardando(false);
            marcarSucessoPendente();
            emitirAviso({
              variante: 'sucesso',
              titulo: 'Assinatura confirmada!',
              texto: 'Pagamento aprovado. Salvar, imprimir e gerar documentos já estão liberados.',
              // Só consome a flag quando o usuário efetivamente FECHAR este aviso (clique,
              // Esc ou fora) — o ModalAviso não some sozinho como um toast, então marcar
              // como exibido na emissão apagaria a flag antes de haver qualquer chance de
              // leitura. Quem fechar a aba/app com o aviso ainda aberto preserva a flag: o
              // Layout mostra de novo na próxima sessão (ver o efeito de sucessoPendente lá).
              aoFechar: marcarSucessoExibido,
            });
            onFecharRef.current();
          }
        })
        .catch(() => {
          // Falha de rede (comum numa espera de até 15min) não deve interromper o polling
          // nem sujar o console — só tenta de novo no próximo tick de 10s. Não mexe no
          // contador de leituras ruins: é uma classe de falha diferente (promise rejeitada,
          // não um perfil "resolvido só que vazio/inativo") e não representa nem uma leitura
          // normal nem uma leitura ruim de perfil.
        });
    }, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [aberto, aguardando]);

  if (!aberto) return null;

  const uid = localStorage.getItem('nr13_uid') ?? '';
  const url = montarUrlCheckout(urlBase, email, uid);

  return (
    <div className="modal-aviso-fundo" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="modal-aviso erro" onClick={(e) => e.stopPropagation()}>
        <span className="modal-aviso-ic"><Icone nome="shield" tam={30} /></span>
        <h3>Assinatura NR-13</h3>
        <p>
          Plano mensal, cobrança automática no cartão. Ao concluir o pagamento nesta nova aba,
          esta tela libera sozinha — não precisa recarregar nem entrar de novo.
        </p>
        <div className="modal-aviso-acoes">
          <button
            type="button"
            className="modal-aviso-btn principal"
            onClick={() => {
              // Só reabre a aba do checkout na 1ª vez (ou se o usuário fechou o modal e
              // recomeçou do zero). Depois do timeout de 15min, quem já pagou e só teve o
              // webhook atrasado precisa só reconsultar o servidor — reabrir o checkout de
              // novo seria confuso (pareceria pedir para pagar de novo).
              if (!jaAbriuCheckout) {
                window.open(url, '_blank', 'noopener,noreferrer');
                setJaAbriuCheckout(true);
              }
              setAguardando(true);
            }}
          >
            {aguardando ? 'Aguardando confirmação…' : jaAbriuCheckout ? 'Verificar novamente' : 'Ir para o pagamento'}
          </button>
          <button type="button" className="modal-aviso-btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
