/**
 * O avatar de um funcionário na lista de cadastro.
 *
 * ## Por que INICIAIS, e não foto
 *
 * O cadastro de funcionário não tem campo de foto. Ele tem `assinatura` — a
 * imagem da rubrica que vai ao documento assinado —, e usar a rubrica como
 * retrato seria mostrar um rabisco no lugar de uma pessoa, além de expor num
 * lugar casual algo que só deveria aparecer no documento.
 *
 * Criar um campo de foto para resolver um item de layout seria mudança de dado
 * por causa de aparência, e este projeto tem a regra oposta. Então: iniciais.
 *
 * ## A cor
 *
 * Derivada do nome, sempre a mesma para a mesma pessoa — é o que faz o avatar
 * ajudar a achar alguém numa lista, em vez de ser só um círculo. A paleta são
 * tons do próprio sistema, escurecidos o bastante para o texto branco passar em
 * contraste.
 */
import { Icone } from '../../components/Icone';
import './avatarPessoa.css';

/** Tons de fundo. Escolhidos por contraste com branco, não por variedade. */
const TONS = ['#8a5a2b', '#2f6f52', '#3a5a8c', '#7a3f6d', '#8a6d1f', '#4a5568'];

/** Soma estável dos códigos do nome → índice do tom. */
export function tomDoNome(nome: string): string {
  let n = 0;
  for (let i = 0; i < nome.length; i++) n = (n + nome.charCodeAt(i)) % 9973;
  return TONS[n % TONS.length];
}

/**
 * Até duas iniciais: a primeira letra do primeiro e do último nome.
 *
 * Ignora partículas ("da", "de", "dos") — "João da Silva" vira JS, não JD.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || !/^(da|de|do|das|dos|e)$/i.test(p));
  if (partes.length === 0) return '';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

export default function AvatarPessoa({ nome, tam = 34 }: { nome: string; tam?: number }) {
  const iniciais = iniciaisDe(nome);
  return (
    <span
      className="avatar-pessoa"
      style={{
        width: tam,
        height: tam,
        fontSize: Math.round(tam * 0.36),
        background: iniciais ? tomDoNome(nome) : undefined,
      }}
      aria-hidden
    >
      {/* Sem nome não há inicial: cai no ícone de pessoa, que não inventa
          uma letra a partir de nada. */}
      {iniciais || <Icone nome="users" tam={Math.round(tam * 0.5)} />}
    </span>
  );
}
