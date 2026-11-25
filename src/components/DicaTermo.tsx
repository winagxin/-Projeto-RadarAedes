import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

export type TermoDica = 'casos_estimados' | 'incidencia_100k' | 'tendencia';

const EXPLICACOES_TERMOS: Record<TermoDica, { titulo: string; texto: string }> = {
  casos_estimados: {
    titulo: 'Casos estimados',
    texto:
      'Estimativa estatística do InfoDengue que corrige o atraso entre o atendimento de saúde e o registro oficial.',
  },
  incidencia_100k: {
    titulo: 'Casos por 100 mil habitantes',
    texto:
      'Proporção de casos em relação à população do município, permitindo comparar cidades de tamanhos diferentes.',
  },
  tendencia: {
    titulo: 'Tendência',
    texto:
      'Compara as duas últimas semanas completas para indicar se os casos estimados estão subindo, caindo ou estáveis.',
  },
};

interface DicaTermoProps {
  termo: TermoDica;
  rotulo?: string;
}

export function DicaTermo({ termo, rotulo }: DicaTermoProps) {
  const [hover, setHover] = useState(false);
  const [foco, setFoco] = useState(false);
  const [fixado, setFixado] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const info = EXPLICACOES_TERMOS[termo];
  const labelExibido = rotulo ?? info.titulo;

  const aberto = !dispensado && (fixado || hover || foco);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(ev: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setFixado(false);
        setHover(false);
        setFoco(false);
      }
    }

    function aoPressionarTecla(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        setFixado(false);
        setHover(false);
        setDispensado(true);
      }
    }

    document.addEventListener('pointerdown', aoClicarFora);
    document.addEventListener('keydown', aoPressionarTecla);
    return () => {
      document.removeEventListener('pointerdown', aoClicarFora);
      document.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aberto]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex max-w-full items-center"
      onMouseEnter={() => {
        setDispensado(false);
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      <button
        type="button"
        aria-expanded={aberto}
        aria-describedby={tooltipId}
        onClick={() => {
          setDispensado(false);
          setFixado((v) => !v);
        }}
        onFocus={() => {
          setDispensado(false);
          setFoco(true);
        }}
        onBlur={(ev) => {
          if (!containerRef.current?.contains(ev.relatedTarget as Node)) {
            setFoco(false);
            setFixado(false);
            setDispensado(false);
          }
        }}
        className="radar-transicao inline-flex items-center gap-1 rounded px-0.5 py-0.5 text-left text-inherit underline decoration-dotted decoration-[#1B4965]/75 underline-offset-4 hover:text-[#0F2744]"
      >
        <span>{labelExibido}</span>
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[#1B4965]" aria-hidden="true" />
      </button>

      <span
        id={tooltipId}
        role="tooltip"
        className={
          aberto
            ? 'radar-entrada absolute top-full left-0 z-40 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-[#1B4965] bg-[#0F2744] px-3 py-2.5 text-xs font-normal leading-relaxed text-white shadow-lg'
            : 'sr-only'
        }
      >
        {info.texto}
      </span>
    </span>
  );
}
