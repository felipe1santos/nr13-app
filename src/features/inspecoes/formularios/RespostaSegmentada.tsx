// Botões segmentados touch-friendly para respostas de checklist em campo (substitui <select>
// nas perguntas de opções curtas). Tocar na opção já selecionada desmarca (volta a "sem resposta").
export interface OpcaoSegmentada {
  value: string;
  label: string;
}

export default function RespostaSegmentada({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: (OpcaoSegmentada | string)[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  const lista: OpcaoSegmentada[] = opcoes.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <div className="resposta-segmentada" role="radiogroup">
      {lista.map((o) => {
        const ativa = valor === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativa}
            className={`resposta-seg-btn${ativa ? ' ativa' : ''}`}
            onClick={() => onChange(ativa ? '' : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
