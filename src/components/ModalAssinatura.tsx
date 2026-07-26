import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { carregarPerfil, expirado, usuarioLogado } from '../services/auth';
import {
  statusAssinaturaLocal,
  marcarSucessoPendente,
  marcarSucessoExibido,
  montarUrlCheckout,
} from '../services/assinatura';
import { emitirAviso } from '../services/eventos';
import { Icone } from './Icone';

const INTERVALO_MS = 10_000;
const LIMITE_MS = 15 * 60_000;
/** Fallback do link do checkout (plano Mensal R$ 197) se config_global não responder. */
const URL_CHECKOUT_PADRAO = 'https://pay.kiwify.com.br/O9KdzEI';

// A Kiwify não tem checkout embutido (só página hospedada), então abrimos em outra aba
// e ficamos perguntando o status ao servidor: quando o webhook chegar, a tela libera
// sozinha, sem F5 nem novo login.
export default function ModalAssinatura({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [aguardando, setAguardando] = useState(false);
  // Depois que já abriu o checkout uma vez, o timeout de 15min não deve reabrir outra aba —
  // quem já pagou e só está esperando o webhook atrasado só precisa reconsultar o servidor.
  const [jaAbriuCheckout, setJaAbriuCheckout] = useState(false);
  const email = usuarioLogado() ?? '';
  const [urlBase, setUrlBase] = useState(URL_CHECKOUT_PADRAO);

  // onFechar é recriado a cada render do pai (BarraAssinatura define uma arrow function
  // inline). Se ele entrasse nas deps do efeito de polling abaixo, cada re-render do pai
  // reiniciaria o setInterval e o cronômetro de 15min nunca chegaria ao fim. Guardamos a
  // versão mais recente numa ref e chamamos por ela — o efeito só depende do que de fato
  // deve reiniciar o polling (aberto/aguardando).
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  // O link vive em config_global (você troca de plano sem novo deploy). Enquanto a
  // consulta não volta — ou se ela falhar — usa a constante, para o botão nunca ficar morto.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void supabase
      .from('config_global')
      .select('valor')
      .eq('chave', 'assinatura_checkout_url')
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const u = (data?.valor as { url?: string } | null)?.url;
        if (u) setUrlBase(u);
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
          // Conta desativada/expirada enquanto o usuário esperava o pagamento: para de
          // perguntar e avisa com clareza, mas NÃO chama logout() daqui — quem decide
          // encerrar a sessão de fato é o gate normal (RotaProtegida/verificarAcesso) no
          // próximo carregamento da rota, não este polling em segundo plano.
          if (!perfil.ativo || expirado(perfil.acessoExpiraEm)) {
            setAguardando(false);
            emitirAviso({
              variante: 'erro',
              titulo: 'Acesso não liberado',
              texto: 'Sua conta está inativa ou expirada. Fale com o administrador antes de tentar novamente.',
            });
            onFecharRef.current();
            return;
          }
          if (statusAssinaturaLocal() === 'ativa') {
            setAguardando(false);
            // Mostramos o aviso AO VIVO agora — marcarSucessoExibido() logo em seguida evita
            // que o Layout dispare o mesmo toast de novo num F5 futuro (o mecanismo
            // sucessoPendente/marcarSucessoExibido do Layout continua existindo para quem
            // fechar a aba/app ANTES deste bloco rodar e reabrir depois, ver Layout.tsx).
            marcarSucessoPendente();
            emitirAviso({
              variante: 'sucesso',
              titulo: 'Assinatura confirmada!',
              texto: 'Pagamento aprovado. Salvar, imprimir e gerar documentos já estão liberados.',
            });
            marcarSucessoExibido();
            onFecharRef.current();
          }
        })
        .catch(() => {
          // Falha de rede (comum numa espera de até 15min) não deve interromper o polling
          // nem sujar o console — só tenta de novo no próximo tick de 10s.
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
