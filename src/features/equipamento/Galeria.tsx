import { useRef, useState } from 'react';
import { ler, salvar } from '../../services/storage';
import { comprimirImagem } from '../../services/imagem';
import type { FotoEquipamento } from './tipos';
import './equipamento.css';

export default function Galeria({ tag }: { tag: string }) {
  const [fotos, setFotos] = useState<FotoEquipamento[]>(() => ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || []);
  const inputRef = useRef<HTMLInputElement>(null);

  async function persistir(novas: FotoEquipamento[]) {
    setFotos(novas);
    await salvar(`nr13_fotos_${tag}`, novas);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files || []);
    const novas: FotoEquipamento[] = [];
    for (const arquivo of arquivos) {
      const src = await comprimirImagem(arquivo);
      novas.push({ id: Date.now() + Math.floor(Math.random() * 1000), src, isCapa: fotos.length === 0 && novas.length === 0 });
    }
    await persistir([...fotos, ...novas]);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function definirCapa(id: number) {
    await persistir(fotos.map((f) => ({ ...f, isCapa: f.id === id })));
  }

  async function remover(id: number) {
    await persistir(fotos.filter((f) => f.id !== id));
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
          <img src={f.src} alt="Foto do equipamento" />
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
        <span className="gallery-add-icone">📷</span>
        <span>Anexar Foto</span>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
      </label>
    </div>
  );
}
