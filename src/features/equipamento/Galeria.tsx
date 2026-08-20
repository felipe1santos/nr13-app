import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import FotoImg from '../../components/FotoImg';
import { ler, salvar } from '../../services/storage';
import { removerFoto, salvarFoto } from '../../services/fotos';
import type { FotoEquipamento } from './tipos';
import './equipamento.css';

export default function Galeria({ tag }: { tag: string }) {
  const [fotos, setFotos] = useState<FotoEquipamento[]>(() => ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function persistir(novas: FotoEquipamento[]) {
    setFotos(novas);
    await salvar(`nr13_fotos_${tag}`, novas);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files || []);
    if (arquivos.length === 0) return;
    setEnviando(true);
    setErro(null);
    try {
      const novas: FotoEquipamento[] = [];
      for (const arquivo of arquivos) {
        // A imagem vai para o bucket; aqui fica só a referência. `src` nasce
        // vazio de propósito — é o campo do formato antigo, mantido para as
        // fotos que já estavam gravadas em base64.
        const ref = await salvarFoto(arquivo, tag);
        novas.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          src: '',
          ref,
          isCapa: fotos.length === 0 && novas.length === 0,
        });
      }
      await persistir([...fotos, ...novas]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível anexar a foto');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function definirCapa(id: number) {
    await persistir(fotos.map((f) => ({ ...f, isCapa: f.id === id })));
  }

  async function remover(id: number) {
    const alvo = fotos.find((f) => f.id === id);
    // Tira da lista primeiro: a ação do usuário não pode ficar refém da rede.
    await persistir(fotos.filter((f) => f.id !== id));
    if (alvo?.ref) await removerFoto(alvo.ref);
  }

  return (
    <div className="galeria-fotos-row">
      {fotos.map((f) => (
        <div
          key={f.id}
          className={`galeria-foto-item ${f.isCapa ? 'capa' : ''}`}
          onClick={() => !f.isCapa && definirCapa(f.id)}
          title={f.isCapa ? 'Foto de capa' : 'Clique para definir como capa'}
        >
          <FotoImg foto={{ ref: f.ref, base64: f.src }} alt="Foto do equipamento" variante="thumb" />
          <button
            type="button"
            className="btn-remover-foto"
            onClick={(e) => {
              e.stopPropagation();
              remover(f.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <label className="gallery-add-dropzone">
        <span className="gallery-add-icone"><Icone nome="camera" tam={20} /></span>
        <span>{enviando ? 'Enviando…' : 'Anexar Foto'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={enviando}
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </label>
      {erro && <p style={{ color: 'var(--erro, #c00)', fontSize: 12, width: '100%' }}>{erro}</p>}
    </div>
  );
}
