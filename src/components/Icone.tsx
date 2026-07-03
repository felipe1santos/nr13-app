import type { CSSProperties, ReactNode } from 'react';

/**
 * Sprite de ícones SVG próprio (estilo line-icon, traço 1.8, cantos redondos).
 * Paths copiados dos HTMLs de referência em design/ — zero biblioteca externa,
 * zero emoji. Uso: <Icone nome="grid" tam={17} />
 */
export type NomeIcone =
  | 'grid' | 'box' | 'userplus' | 'users' | 'briefcase' | 'barchart' | 'clipboard'
  | 'sliders' | 'key' | 'logout' | 'chevdown' | 'chevleft' | 'chevright' | 'chevup'
  | 'cloudcheck' | 'cloudoff' | 'clock' | 'bell' | 'alerttri' | 'arrowright'
  | 'arrowleft' | 'trendup' | 'map' | 'checkcircle' | 'calendar' | 'plus' | 'x'
  | 'flame' | 'fan' | 'cylinder' | 'tool' | 'filetext' | 'pencil' | 'eye' | 'copy'
  | 'trash' | 'filter' | 'search' | 'book' | 'camera' | 'upload' | 'check'
  | 'building' | 'gauge' | 'refresh' | 'calculator' | 'download' | 'shield';

const PATHS: Record<NomeIcone, ReactNode> = {
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="14" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" /></>),
  box: (<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>),
  userplus: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></>),
  users: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  briefcase: (<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  barchart: (<><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>),
  clipboard: (<><rect x="6" y="4" width="12" height="18" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="15" y2="15" /></>),
  sliders: (<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" /></>),
  key: (<><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.8 12.2L20 3" /><path d="M16 7l3 3" /><path d="M13.2 9.8l3 3" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>),
  chevdown: <polyline points="6 9 12 15 18 9" />,
  chevleft: <polyline points="15 18 9 12 15 6" />,
  chevright: <polyline points="9 18 15 12 9 6" />,
  chevup: <polyline points="6 15 12 9 18 15" />,
  cloudcheck: (<><path d="M17.5 19H7a5 5 0 0 1-1-9.9A6 6 0 0 1 17.6 8h.2A4.4 4.4 0 0 1 22 12.4a4.4 4.4 0 0 1-1 2.8" /><polyline points="9.5 15.5 11.3 17.3 15 13.5" /></>),
  cloudoff: (<><path d="M17.5 19H7a5 5 0 0 1-1-9.9A6 6 0 0 1 17.6 8h.2A4.4 4.4 0 0 1 22 12.4a4.4 4.4 0 0 1-1 2.8" /><line x1="3" y1="3" x2="21" y2="21" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></>),
  bell: (<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  alerttri: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13.5" /><line x1="12" y1="16.5" x2="12" y2="16.6" /></>),
  arrowright: (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  arrowleft: (<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
  trendup: (<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>),
  map: (<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>),
  checkcircle: (<><circle cx="12" cy="12" r="9" /><polyline points="16 9 11 14 8 11" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  x: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  flame: <path d="M12 2s-6 6-6 12a6 6 0 0 0 12 0c0-2-1-3-1-3s-1 2-2 2c1-3-1-5-1-7 0 2-2 3-2 5-1-1-1-3 0-5-1 1-2 3-2 5 0 1 .3 2 1 3-2 0-3-2-3-4 0-4 4-8 4-8z" />,
  fan: (<><circle cx="12" cy="12" r="2" /><path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-2 6" /><path d="M12 22a4 4 0 0 1-4-4c0-2 2-3 2-6" /><path d="M2 12a4 4 0 0 1 4-4c2 0 3 2 6 2" /><path d="M22 12a4 4 0 0 1-4 4c-2 0-3-2-6-2" /></>),
  cylinder: (<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14a8 3 0 0 0 16 0V5" /></>),
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.5-3.5a6 6 0 0 1-8 8L6.4 20.6a2.1 2.1 0 0 1-3-3L10.2 10.8a6 6 0 0 1 8-8l-3.5 3.5z" />,
  filetext: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>),
  pencil: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  eye: (<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  trash: (<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>),
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  search: (<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  camera: (<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  check: <polyline points="20 6 9 17 4 12" />,
  building: (<><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="9" y1="7" x2="10" y2="7" /><line x1="14" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="10" y2="11" /><line x1="14" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="10" y2="15" /><line x1="14" y1="15" x2="15" y2="15" /><path d="M10 22v-3h4v3" /></>),
  gauge: (<><path d="M12 15l3.5-5.5" /><path d="M20.2 17a9 9 0 1 0-16.4 0" /><circle cx="12" cy="15" r="1.5" /></>),
  refresh: (<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" /><path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></>),
  calculator: (<><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11.01" /><line x1="12" y1="11" x2="12" y2="11.01" /><line x1="16" y1="11" x2="16" y2="11.01" /><line x1="8" y1="15" x2="8" y2="15.01" /><line x1="12" y1="15" x2="12" y2="15.01" /><line x1="16" y1="15" x2="16" y2="15.01" /><line x1="8" y1="19" x2="8" y2="19.01" /><line x1="12" y1="19" x2="12" y2="19.01" /><line x1="16" y1="19" x2="16" y2="19.01" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  shield: <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />,
};

export function Icone({
  nome,
  tam = 17,
  style,
  className,
}: {
  nome: NomeIcone;
  tam?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      className={`icone${className ? ` ${className}` : ''}`}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      style={style}
      aria-hidden="true"
    >
      {PATHS[nome]}
    </svg>
  );
}
