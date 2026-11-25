import { useEffect, useState } from 'react';
import { formatarDataPtBr } from '../utils/niveis';

interface SobreMeta {
  versaoModelo: string;
  atualizadoEm: string;
}

let cacheSobrePromise: Promise<SobreMeta | null> | null = null;

function lerSobreMeta(): Promise<SobreMeta | null> {
  if (!cacheSobrePromise) {
    cacheSobrePromise = fetch('/api/sobre')
      .then((r) => (r.ok ? (r.json() as Promise<SobreMeta>) : null))
      .catch(() => null);
  }
  return cacheSobrePromise;
}

interface RodapeFonteProps {
  modeloData?: string | null;
  consultaData?: string | null;
  sufixo?: string;
}

export function RodapeFonte({ modeloData, consultaData, sufixo }: RodapeFonteProps) {
  const [metaSobre, setMetaSobre] = useState<SobreMeta | null>(null);

  useEffect(() => {
    if (modeloData) return;
    let cancelado = false;
    lerSobreMeta().then((meta) => {
      if (!cancelado && meta) setMetaSobre(meta);
    });
    return () => {
      cancelado = true;
    };
  }, [modeloData]);

  const dataModeloFinal = modeloData || metaSobre?.versaoModelo || '2026-11-17';
  const dataConsultaFinal = consultaData || new Date().toISOString();

  return (
    <p className="border-t border-[#E2DBD0] pt-3 text-xs text-slate-600">
      Dados do InfoDengue (modelo de {formatarDataPtBr(dataModeloFinal)}), consultados em{' '}
      {formatarDataPtBr(dataConsultaFinal)}
      {sufixo ? ` ${sufixo}` : ''}
    </p>
  );
}
