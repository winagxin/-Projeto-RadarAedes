import { Doenca, Tendencia } from '../types';

export interface ConfigNivel {
  nivel: number;
  corNome: string;
  rotulo: string;
  descricaoCurta: string;
  bgCardClass: string;
  borderClass: string;
  textClass: string;
  iconBgClass: string;
  mapFillHex: string;
}

export const NIVEIS_ALERTA: Record<number, ConfigNivel> = {
  1: {
    nivel: 1,
    corNome: 'Verde',
    rotulo: 'Nível 1: Verde — Baixo risco',
    descricaoCurta: 'Condições climáticas pouco favoráveis ou baixa atividade viral na semana.',
    bgCardClass: 'bg-emerald-50',
    borderClass: 'border-emerald-700',
    textClass: 'text-emerald-950',
    iconBgClass: 'bg-emerald-700 text-white',
    mapFillHex: '#15803d',
  },
  2: {
    nivel: 2,
    corNome: 'Amarelo',
    rotulo: 'Nível 2: Amarelo — Atenção',
    descricaoCurta: 'Condições climáticas favoráveis para o mosquito combinadas com circulação viral.',
    bgCardClass: 'bg-amber-50',
    borderClass: 'border-amber-700',
    textClass: 'text-amber-950',
    iconBgClass: 'bg-amber-600 text-slate-950',
    mapFillHex: '#d97706',
  },
  3: {
    nivel: 3,
    corNome: 'Laranja',
    rotulo: 'Nível 3: Laranja — Risco de epidemia',
    descricaoCurta: 'Transmissão sustentada com aumento de casos acima do esperado para o período.',
    bgCardClass: 'bg-orange-50',
    borderClass: 'border-orange-700',
    textClass: 'text-orange-950',
    iconBgClass: 'bg-orange-700 text-white',
    mapFillHex: '#c2410c',
  },
  4: {
    nivel: 4,
    corNome: 'Vermelho',
    rotulo: 'Nível 4: Vermelho — Epidemia',
    descricaoCurta: 'Incidência elevada acima do limiar epidêmico histórico no município.',
    bgCardClass: 'bg-red-50',
    borderClass: 'border-red-700',
    textClass: 'text-red-950',
    iconBgClass: 'bg-red-700 text-white',
    mapFillHex: '#b91c1c',
  },
};

export function obterConfigNivel(nivel: number | null): ConfigNivel | null {
  if (nivel === null || !NIVEIS_ALERTA[nivel]) return null;
  return NIVEIS_ALERTA[nivel];
}

export const NOMES_DOENCA: Record<Doenca, string> = {
  dengue: 'Dengue',
  chikungunya: 'Chikungunya',
  zika: 'Zika',
};

export function formatarSemanaEpi(se: number, dataIniSe?: number | null): string {
  const txt = String(se);
  if (txt.length !== 6) return txt;
  const ano = txt.slice(0, 4);
  const semanaNum = Number(txt.slice(4));
  const base = `Semana ${Number.isFinite(semanaNum) ? semanaNum : txt.slice(4)} de ${ano}`;

  if (!dataIniSe || !Number.isFinite(dataIniSe)) {
    return base;
  }

  const ini = new Date(dataIniSe);
  const fim = new Date(dataIniSe + 6 * 86400000);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) {
    return base;
  }

  const d1 = ini.getUTCDate();
  const m1 = String(ini.getUTCMonth() + 1).padStart(2, '0');
  const d2 = fim.getUTCDate();
  const m2 = String(fim.getUTCMonth() + 1).padStart(2, '0');
  const periodo = m1 === m2 ? `${d1} a ${d2}/${m2}` : `${d1}/${m1} a ${d2}/${m2}`;
  return `${base} (${periodo})`;
}

export function formatarNumeroPtBr(
  valor: number | null | undefined,
  maxCasas = 1,
  minCasas = 0
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'N/D';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: minCasas,
    maximumFractionDigits: maxCasas,
  });
}

export function formatarPercentualPtBr(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  const sinal = valor > 0 ? '+' : '';
  return `${sinal}${valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatarDataPtBr(valor: string | number | null | undefined): string {
  if (!valor) return 'Data indisponível';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [ano, mes, dia] = valor.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  const dt = new Date(valor);
  if (Number.isNaN(dt.getTime())) return String(valor);
  return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function rotuloTendencia(tendencia: Tendencia): {
  titulo: string;
  explicacao: string;
} {
  switch (tendencia) {
    case 'sobe':
      return {
        titulo: 'Tendência: Sobe',
        explicacao: 'Aumento acima de 5% nos casos estimados entre as duas últimas semanas completas.',
      };
    case 'cai':
      return {
        titulo: 'Tendência: Cai',
        explicacao: 'Redução acima de 5% nos casos estimados entre as duas últimas semanas completas.',
      };
    case 'estavel':
      return {
        titulo: 'Tendência: Estável',
        explicacao: 'Variação dentro de ±5% nos casos estimados entre as duas últimas semanas completas.',
      };
    default:
      return {
        titulo: 'Tendência: Indisponível',
        explicacao: 'Não há ao menos duas semanas completas anteriores suficientes para comparação.',
      };
  }
}
