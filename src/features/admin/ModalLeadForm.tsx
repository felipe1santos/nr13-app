import { useState } from 'react';
import {
  atualizarLeadImportado,
  criarLeadImportado,
  type DadosLead,
  type LeadImportado,
} from '../../services/leadsImportados';

interface Props {
  lead: LeadImportado | null; // null = cadastro novo
  onClose: () => void;
  onSalvo: (msg: string) => void;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Cadastro/edição manual de um lead importado (painel Admin). */
export default function ModalLeadForm({ lead, onClose, onSalvo }: Props) {
  const [form, setForm] = useState<DadosLead>({
    nome: lead?.nome ?? '',
    email: lead?.email ?? '',
    telefone: lead?.telefone ?? '',
    empresa: lead?.empresa ?? '',
    origem: lead?.origem ?? 'Cadastro manual',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function campo<K extends keyof DadosLead>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!RE_EMAIL.test(email)) {
      setErro('Informe um e-mail válido.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (lead) {
        await atualizarLeadImportado(lead.id, form);
        onSalvo(`Lead ${email} atualizado.`);
      } else {
        await criarLeadImportado(form);
        onSalvo(`Lead ${email} cadastrado.`);
      }
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao salvar o lead.');
      setSalvando(false);
    }
  }

  return (
    <div className="admin-email-overlay" role="dialog" aria-modal="true">
      <form className="admin-email-modal" style={{ maxWidth: 460 }} onSubmit={salvar}>
        <h3>{lead ? 'Editar lead' : 'Cadastrar lead'}</h3>
        <p className="admin-email-sub">
          Lead de contato para campanhas — não cria conta de acesso ao sistema.
        </p>

        <label className="admin-email-label">Nome</label>
        <input type="text" className="admin-email-assunto" value={form.nome} onChange={campo('nome')} placeholder="Nome do contato" />

        <label className="admin-email-label">E-mail *</label>
        <input type="email" className="admin-email-assunto" value={form.email} onChange={campo('email')} placeholder="contato@empresa.com.br" required />

        <label className="admin-email-label">Telefone</label>
        <input type="text" className="admin-email-assunto" value={form.telefone} onChange={campo('telefone')} placeholder="(51) 99999-0000" />

        <label className="admin-email-label">Empresa</label>
        <input type="text" className="admin-email-assunto" value={form.empresa} onChange={campo('empresa')} placeholder="Empresa do contato" />

        <label className="admin-email-label">Origem do lead</label>
        <input type="text" className="admin-email-assunto" value={form.origem} onChange={campo('origem')} placeholder='Ex.: "Planilha antiga", "Feira 2025"' />

        {erro && <p className="admin-erro" style={{ marginTop: 10 }}>{erro}</p>}

        <div className="admin-email-acoes">
          <button type="button" className="cancelar" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="enviar" disabled={salvando}>
            {salvando ? 'Salvando…' : lead ? 'Salvar alterações' : 'Cadastrar lead'}
          </button>
        </div>
      </form>
    </div>
  );
}
