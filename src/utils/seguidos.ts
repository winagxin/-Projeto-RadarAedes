import { MunicipioSeguido } from '../types';

const STORAGE_KEY = 'radaraedes_municipios_seguidos_v1';
export const MAX_SEGUIDOS = 3;

export function lerMunicipiosSeguidos(): MunicipioSeguido[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          typeof m.codigo_ibge === 'string' &&
          typeof m.nome === 'string' &&
          typeof m.uf === 'string'
      )
      .slice(0, MAX_SEGUIDOS);
  } catch {
    return [];
  }
}

export function salvarMunicipiosSeguidos(lista: MunicipioSeguido[]): MunicipioSeguido[] {
  const limpa = lista.slice(0, MAX_SEGUIDOS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limpa));
  } catch {
    // Ignora falha caso localStorage esteja indisponível
  }
  return limpa;
}
