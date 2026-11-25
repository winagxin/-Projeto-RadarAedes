import { useEffect, useRef, useState } from 'react';
import { formatarNumeroPtBr, formatarPercentualPtBr } from '../utils/niveis';

interface NumeroAnimadoProps {
  valor: number | null | undefined;
  maxCasas?: number;
  minCasas?: number;
  modoPercentual?: boolean;
  duracaoMs?: number;
}

function formatar(
  num: number | null | undefined,
  maxCasas: number,
  minCasas: number,
  modoPercentual: boolean
): string {
  if (modoPercentual) {
    return formatarPercentualPtBr(num);
  }
  return formatarNumeroPtBr(num, maxCasas, minCasas);
}

export function NumeroAnimado({
  valor,
  maxCasas = 1,
  minCasas = 0,
  modoPercentual = false,
  duracaoMs = 280,
}: NumeroAnimadoProps) {
  const valido = valor !== null && valor !== undefined && Number.isFinite(valor);
  const [exibido, setExibido] = useState<number>(() => (valido ? 0 : 0));
  const jaAnimouRef = useRef(false);

  useEffect(() => {
    if (!valido) return;

    const prefereReduzido =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefereReduzido || jaAnimouRef.current || valor === 0) {
      setExibido(valor);
      jaAnimouRef.current = true;
      return;
    }

    jaAnimouRef.current = true;
    let rafId = 0;
    const inicio = performance.now();

    function passo(agora: number) {
      const decorrido = agora - inicio;
      const progresso = Math.min(1, decorrido / duracaoMs);
      // Ease-out cúbico leve
      const fator = 1 - Math.pow(1 - progresso, 3);
      setExibido((valor as number) * fator);

      if (progresso < 1) {
        rafId = requestAnimationFrame(passo);
      } else {
        setExibido(valor as number);
      }
    }

    rafId = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafId);
  }, [valor, valido, duracaoMs]);

  if (!valido) {
    return <>{formatar(valor, maxCasas, minCasas, modoPercentual)}</>;
  }

  const textoFinal = formatar(valor, maxCasas, minCasas, modoPercentual);
  const textoAnimado = formatar(exibido, maxCasas, minCasas, modoPercentual);

  return (
    <>
      <span className="sr-only">{textoFinal}</span>
      <span aria-hidden="true">{textoAnimado}</span>
    </>
  );
}
