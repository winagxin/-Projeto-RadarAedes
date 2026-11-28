import fs from 'node:fs';
import path from 'node:path';
import {
  buscarCacheMalhaUf,
  buscarMunicipio,
  buscarMunicipiosPorUf,
  buscarSerieHistorica,
  buscarUltimaConsulta,
  buscarUltimosAlertasPorUf,
  type Doenca,
  type InfoDengueItemBruto,
  salvarCacheMalhaUf,
  salvarConsultaEAlertas,
  upsertMunicipios,
} from './db.ts';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const HTTP_TIMEOUT_MS = 9000;
const MAPA_CONCORRENCIA_MAX = 4;

export interface EstadoInfo {
  id: number;
  sigla: string;
  nome: string;
}

// Lista oficial de reserva das 27 UFs caso a API do IBGE fique indisponível
const ESTADOS_FALLBACK: EstadoInfo[] = [
  { id: 12, sigla: 'AC', nome: 'Acre' },
  { id: 27, sigla: 'AL', nome: 'Alagoas' },
  { id: 16, sigla: 'AP', nome: 'Amapá' },
  { id: 13, sigla: 'AM', nome: 'Amazonas' },
  { id: 29, sigla: 'BA', nome: 'Bahia' },
  { id: 23, sigla: 'CE', nome: 'Ceará' },
  { id: 53, sigla: 'DF', nome: 'Distrito Federal' },
  { id: 32, sigla: 'ES', nome: 'Espírito Santo' },
  { id: 52, sigla: 'GO', nome: 'Goiás' },
  { id: 21, sigla: 'MA', nome: 'Maranhão' },
  { id: 51, sigla: 'MT', nome: 'Mato Grosso' },
  { id: 50, sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { id: 31, sigla: 'MG', nome: 'Minas Gerais' },
  { id: 15, sigla: 'PA', nome: 'Pará' },
  { id: 25, sigla: 'PB', nome: 'Paraíba' },
  { id: 41, sigla: 'PR', nome: 'Paraná' },
  { id: 26, sigla: 'PE', nome: 'Pernambuco' },
  { id: 22, sigla: 'PI', nome: 'Piauí' },
  { id: 33, sigla: 'RJ', nome: 'Rio de Janeiro' },
  { id: 24, sigla: 'RN', nome: 'Rio Grande do Norte' },
  { id: 43, sigla: 'RS', nome: 'Rio Grande do Sul' },
  { id: 11, sigla: 'RO', nome: 'Rondônia' },
  { id: 14, sigla: 'RR', nome: 'Roraima' },
  { id: 42, sigla: 'SC', nome: 'Santa Catarina' },
  { id: 35, sigla: 'SP', nome: 'São Paulo' },
  { id: 28, sigla: 'SE', nome: 'Sergipe' },
  { id: 17, sigla: 'TO', nome: 'Tocantins' },
];

let cacheEstadosMem: { dados: EstadoInfo[]; coletadoEm: number } | null = null;
const cacheUfsCompletasMem = new Map<string, number>();

function estaDentroDoTtl(isoDate: string | null | undefined, ttlMs = CACHE_TTL_MS): boolean {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ttlMs;
}

async function fetchJsonComTimeout<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (process.env.RADAR_FORCE_OFFLINE === '1') {
    throw new Error('Modo offline forçado via RADAR_FORCE_OFFLINE');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new Error('Requisição cancelada pelo cliente');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RadarAedes/1.0 (Educacional)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} em ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Calcula semana epidemiológica ISO aproximada e a janela (ex.: últimas 16 semanas)
 * lidando corretamente com a virada de ano (ey_start != ey_end).
 */
export function calcularJanelaEpidemiologica(semanasAtras = 16, referencia = new Date()) {
  function getIsoWeekAndYear(date: Date): { week: number; year: number } {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { week, year: tmp.getUTCFullYear() };
  }

  const fim = getIsoWeekAndYear(referencia);
  const inicioDate = new Date(referencia.getTime() - semanasAtras * 7 * 86400000);
  const inicio = getIsoWeekAndYear(inicioDate);

  return {
    ew_start: inicio.week,
    ey_start: inicio.year,
    ew_end: fim.week,
    ey_end: fim.year,
  };
}

export async function listarEstados() {
  if (cacheEstadosMem && Date.now() - cacheEstadosMem.coletadoEm < CACHE_TTL_MS) {
    return {
      ufPadrao: 'RJ',
      estados: cacheEstadosMem.dados,
      fonte: 'IBGE Localidades',
      atualizadoEm: new Date(cacheEstadosMem.coletadoEm).toISOString(),
      modoOffline: false,
    };
  }

  try {
    const raw = await fetchJsonComTimeout<Array<{ id: number; sigla: string; nome: string }>>(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados'
    );
    const estados = raw
      .map((e) => ({ id: e.id, sigla: e.sigla, nome: e.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const agora = Date.now();
    cacheEstadosMem = { dados: estados, coletadoEm: agora };

    return {
      ufPadrao: 'RJ',
      estados,
      fonte: 'IBGE Localidades',
      atualizadoEm: new Date(agora).toISOString(),
      modoOffline: false,
    };
  } catch {
    return {
      ufPadrao: 'RJ',
      estados: [...ESTADOS_FALLBACK].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      fonte: 'Lista local de UFs',
      atualizadoEm: new Date().toISOString(),
      modoOffline: true,
    };
  }
}

export async function listarMunicipios(ufInput: string) {
  const uf = ufInput.trim().toUpperCase();
  const locais = await buscarMunicipiosPorUf(uf);
  const ultimaCargaCompleta = cacheUfsCompletasMem.get(uf);

  if (
    process.env.RADAR_FORCE_OFFLINE !== '1' &&
    locais.length > 0 &&
    ultimaCargaCompleta &&
    Date.now() - ultimaCargaCompleta < CACHE_TTL_MS
  ) {
    return {
      uf,
      municipios: locais,
      fonte: 'IBGE Localidades (cache local)',
      atualizadoEm: new Date(ultimaCargaCompleta).toISOString(),
      modoOffline: false,
    };
  }

  try {
    const raw = await fetchJsonComTimeout<Array<{ id: number | string; nome: string }>>(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`
    );
    const formatados = raw.map((m) => ({
      codigo_ibge: String(m.id),
      nome: m.nome,
      uf,
    }));
    await upsertMunicipios(formatados);
    const agora = Date.now();
    cacheUfsCompletasMem.set(uf, agora);
    return {
      uf,
      municipios: await buscarMunicipiosPorUf(uf),
      fonte: 'IBGE Localidades',
      atualizadoEm: new Date(agora).toISOString(),
      modoOffline: false,
    };
  } catch {
    if (uf === 'RJ') {
      const samplePath = path.resolve(process.cwd(), 'data', 'amostra_ibge_municipios.json');
      if (fs.existsSync(samplePath)) {
        const rawSample = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as Array<{
          id: number | string;
          nome: string;
        }>;
        const formatados = rawSample.map((m) => ({
          codigo_ibge: String(m.id),
          nome: m.nome,
          uf: 'RJ',
        }));
        await upsertMunicipios(formatados);
        return {
          uf: 'RJ',
          municipios: await buscarMunicipiosPorUf('RJ'),
          fonte: 'Amostra local',
          atualizadoEm: '2026-11-22',
          modoOffline: true,
        };
      }
    }
    if (locais.length > 0) {
      return {
        uf,
        municipios: locais,
        fonte: 'Cache do servidor (modo offline)',
        atualizadoEm: new Date().toISOString(),
        modoOffline: true,
      };
    }
    throw new Error(`Não foi possível carregar os municípios da UF ${uf}`);
  }
}

export type Tendencia = 'sobe' | 'estavel' | 'cai' | 'indisponivel';

function arredondarInteiro(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num) : null;
}

/**
 * Compara as duas últimas semanas COMPLETAS (descartando a semana mais recente,
 * que pode estar incompleta por atraso de notificação).
 */
export function calcularTendencia(
  serieCronologica: Array<{ semana_epi: number; casos_est: number | null }>
): {
  tendencia: Tendencia;
  variacaoPercentual: number | null;
  semanasComparadas: [number, number] | null;
  casosAnterior: number | null;
  casosAtual: number | null;
  poucosCasos: boolean;
} {
  if (serieCronologica.length < 3) {
    return {
      tendencia: 'indisponivel',
      variacaoPercentual: null,
      semanasComparadas: null,
      casosAnterior: null,
      casosAtual: null,
      poucosCasos: false,
    };
  }

  // Penúltima (mais recente completa) vs antepenúltima
  const penultima = serieCronologica[serieCronologica.length - 2];
  const antepenultima = serieCronologica[serieCronologica.length - 3];

  const atual = arredondarInteiro(penultima.casos_est);
  const anterior = arredondarInteiro(antepenultima.casos_est);

  if (atual === null || anterior === null) {
    return {
      tendencia: 'indisponivel',
      variacaoPercentual: null,
      semanasComparadas: null,
      casosAnterior: null,
      casosAtual: null,
      poucosCasos: false,
    };
  }

  const poucosCasos = anterior < 20 || atual < 20;

  if (anterior === 0) {
    if (atual === 0) {
      return {
        tendencia: 'estavel',
        variacaoPercentual: 0,
        semanasComparadas: [antepenultima.semana_epi, penultima.semana_epi],
        casosAnterior: anterior,
        casosAtual: atual,
        poucosCasos,
      };
    }
    return {
      tendencia: 'sobe',
      variacaoPercentual: 100,
      semanasComparadas: [antepenultima.semana_epi, penultima.semana_epi],
      casosAnterior: anterior,
      casosAtual: atual,
      poucosCasos,
    };
  }

  const variacao = ((atual - anterior) / anterior) * 100;
  let tendencia: Tendencia = 'estavel';
  if (variacao > 5) tendencia = 'sobe';
  else if (variacao < -5) tendencia = 'cai';

  return {
    tendencia,
    variacaoPercentual: Number(variacao.toFixed(1)),
    semanasComparadas: [antepenultima.semana_epi, penultima.semana_epi],
    casosAnterior: anterior,
    casosAtual: atual,
    poucosCasos,
  };
}

async function montarRespostaAlerta(codigoIbge: string, doenca: Doenca, forcarOffline = false) {
  const [municipio, consulta, serie] = await Promise.all([
    buscarMunicipio(codigoIbge),
    buscarUltimaConsulta(codigoIbge, doenca),
    buscarSerieHistorica(codigoIbge, doenca, 12),
  ]);
  const maisRecente = serie.length > 0 ? serie[serie.length - 1] : null;
  const tendenciaInfo = calcularTendencia(serie);

  return {
    municipio: municipio ?? {
      codigo_ibge: codigoIbge,
      nome: `Município ${codigoIbge}`,
      uf: '',
      populacao: null,
    },
    doenca,
    vazio: serie.length === 0,
    nivelAtual: maisRecente ? maisRecente.nivel : null,
    semanaAtual: maisRecente ? maisRecente.semana_epi : null,
    semanaMaisRecenteIncompleta: serie.length > 0,
    versaoModelo: maisRecente?.versao_modelo ?? null,
    tendencia: tendenciaInfo.tendencia,
    variacaoPercentual: tendenciaInfo.variacaoPercentual,
    semanasComparadas: tendenciaInfo.semanasComparadas,
    casosAnterior: tendenciaInfo.casosAnterior,
    casosAtual: tendenciaInfo.casosAtual,
    poucosCasos: tendenciaInfo.poucosCasos,
    serie,
    fonte: consulta?.fonte?.startsWith('InfoDengue') ? 'InfoDengue' : (consulta?.fonte ?? 'InfoDengue'),
    atualizadoEm: maisRecente?.versao_modelo ?? consulta?.data_coleta ?? new Date().toISOString(),
    dataColeta: consulta?.data_coleta ?? null,
    modoOffline: forcarOffline || consulta?.modo_offline === 1,
  };
}

function carregarAmostraConsolidadaRj(
  codigoIbge: string,
  doenca: Doenca
): { itens: InfoDengueItemBruto[]; nome: string; coletadoEm: string } | null {
  const consolidadoPath = path.resolve(process.cwd(), 'data', 'amostra_infodengue_rj.json');
  if (fs.existsSync(consolidadoPath)) {
    const raw = JSON.parse(fs.readFileSync(consolidadoPath, 'utf8')) as {
      coletadoEm?: string;
      municipios?: Record<
        string,
        {
          nome?: string;
          doencas?: Partial<Record<Doenca, InfoDengueItemBruto[]>>;
        }
      >;
    };
    const mun = raw.municipios?.[codigoIbge];
    if (mun && mun.doencas && Array.isArray(mun.doencas[doenca])) {
      return {
        itens: mun.doencas[doenca] || [],
        nome: mun.nome || `Município ${codigoIbge}`,
        coletadoEm: raw.coletadoEm || '2026-11-22',
      };
    }
  }

  // Fallback legado para amostra simples do Rio de Janeiro capital
  if (codigoIbge === '3304557' && doenca === 'dengue') {
    const samplePath = path.resolve(process.cwd(), 'data', 'amostra_infodengue.json');
    if (fs.existsSync(samplePath)) {
      const rawSample = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as InfoDengueItemBruto[];
      const versao = rawSample[0]?.versao_modelo || '2026-11-17';
      return {
        itens: rawSample,
        nome: 'Rio de Janeiro',
        coletadoEm: `${versao}T12:00:00.000Z`,
      };
    }
  }

  return null;
}

const FONTE_SERIE_COMPLETA = 'InfoDengue (série 16 sem.)';
const FONTE_MAPA_RESUMO = 'InfoDengue (mapa)';

export async function obterAlertaMunicipio(codigoIbge: string, doenca: Doenca) {
  const codigo = String(codigoIbge).trim();
  const ultimaConsulta = await buscarUltimaConsulta(codigo, doenca);
  const serieCacheAtual =
    ultimaConsulta && ultimaConsulta.modo_offline === 0
      ? await buscarSerieHistorica(codigo, doenca, 12)
      : [];
  const temSerieCompletaEmCache =
    ultimaConsulta?.fonte === FONTE_SERIE_COMPLETA || serieCacheAtual.length >= 12;

  // Cache de 6 horas somente se a última coleta foi online e já trouxe a série completa (não só o resumo de 4 sem. do mapa)
  if (
    process.env.RADAR_FORCE_OFFLINE !== '1' &&
    ultimaConsulta &&
    ultimaConsulta.modo_offline === 0 &&
    estaDentroDoTtl(ultimaConsulta.data_coleta) &&
    temSerieCompletaEmCache
  ) {
    return montarRespostaAlerta(codigo, doenca, false);
  }

  const janela = calcularJanelaEpidemiologica(16);
  const url =
    `https://info.dengue.mat.br/api/alertcity` +
    `?geocode=${encodeURIComponent(codigo)}` +
    `&disease=${encodeURIComponent(doenca)}` +
    `&format=json` +
    `&ew_start=${janela.ew_start}&ew_end=${janela.ew_end}` +
    `&ey_start=${janela.ey_start}&ey_end=${janela.ey_end}`;

  try {
    const itens = await fetchJsonComTimeout<InfoDengueItemBruto[]>(url);
    const lista = Array.isArray(itens) ? itens : [];

    const municipioExistente = await buscarMunicipio(codigo);
    await salvarConsultaEAlertas({
      codigo_ibge: codigo,
      nome_municipio: municipioExistente?.nome,
      uf: municipioExistente?.uf,
      doenca,
      fonte: FONTE_SERIE_COMPLETA,
      modo_offline: false,
      itens: lista,
    });

    return montarRespostaAlerta(codigo, doenca, false);
  } catch {
    // Plano B 1: Se já existe histórico salvo no banco para esse município/doença
    const serieBanco = await buscarSerieHistorica(codigo, doenca, 12);
    if (serieBanco.length > 0) {
      return montarRespostaAlerta(codigo, doenca, true);
    }

    // Plano B 2: Amostra consolidada data/amostra_infodengue_rj.json (ou legado data/amostra_infodengue.json)
    const amostra = carregarAmostraConsolidadaRj(codigo, doenca);
    if (amostra) {
      await salvarConsultaEAlertas({
        codigo_ibge: codigo,
        nome_municipio: amostra.nome,
        uf: 'RJ',
        doenca,
        fonte: 'Amostra local',
        modo_offline: true,
        data_coleta: amostra.coletadoEm,
        itens: amostra.itens,
      });
      return montarRespostaAlerta(codigo, doenca, true);
    }

    throw new Error('Não foi possível consultar o InfoDengue e não há cache offline para este município.');
  }
}

export async function obterMalhaUf(ufInput: string) {
  const uf = ufInput.trim().toUpperCase();
  const cached = await buscarCacheMalhaUf(uf);
  if (cached && estaDentroDoTtl(cached.data_coleta, 24 * 60 * 60 * 1000)) {
    return {
      uf,
      geojson: JSON.parse(cached.geojson) as Record<string, unknown>,
      dataColeta: cached.data_coleta,
      modoOffline: false,
    };
  }

  try {
    const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${encodeURIComponent(
      uf
    )}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;
    const geojson = await fetchJsonComTimeout<Record<string, unknown>>(url);
    await salvarCacheMalhaUf(uf, JSON.stringify(geojson));
    return {
      uf,
      geojson,
      dataColeta: new Date().toISOString(),
      modoOffline: false,
    };
  } catch (err) {
    if (cached) {
      return {
        uf,
        geojson: JSON.parse(cached.geojson) as Record<string, unknown>,
        dataColeta: cached.data_coleta,
        modoOffline: true,
      };
    }
    throw err;
  }
}

export interface ItemMapaMunicipio {
  codigo_ibge: string;
  nome: string;
  uf: string;
  semana_epi: number | null;
  data_ini_se: number | null;
  nivel: number | null;
  casos_est: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
  data_coleta: string | null;
  fonte: string | null;
  modo_offline: boolean;
  origem: 'cache' | 'api' | 'amostra' | 'indisponivel';
}

export type EventoStreamMapa =
  | {
      tipo: 'inicio';
      uf: string;
      doenca: Doenca;
      totalMunicipios: number;
      geojson: Record<string, unknown>;
      itens: ItemMapaMunicipio[];
      emCache: number;
    }
  | {
      tipo: 'lote';
      itens: ItemMapaMunicipio[];
      concluidos: number;
      totalMunicipios: number;
    }
  | {
      tipo: 'fim';
      resumo: {
        uf: string;
        doenca: Doenca;
        total: number;
        emCache: number;
        atualizadosApi: number;
        semDados: number;
        falhas: number;
        modoOffline: boolean;
        atualizadoEm: string;
      };
    };

/**
 * Carrega o Mapa da UF sob demanda:
 * 1) Entrega imediatamente a malha GeoJSON + todos os municípios já no cache de 6h do SQLite.
 * 2) Para os faltantes, consulta o InfoDengue com fila de no máximo 4 requisições simultâneas
 *    e envia lotes progressivos para o front-end colorir o mapa conforme chegam.
 */
export async function streamMapaUf(
  ufInput: string,
  doenca: Doenca,
  emit: (ev: EventoStreamMapa) => void,
  signal?: AbortSignal
): Promise<void> {
  const uf = ufInput.trim().toUpperCase();
  const [listaMun, malha] = await Promise.all([listarMunicipios(uf), obterMalhaUf(uf)]);
  const snapshot = await buscarUltimosAlertasPorUf(uf, doenca);

  const janela = calcularJanelaEpidemiologica(4); // Janela enxuta de 4 semanas para mapa estadual
  const iniciais: ItemMapaMunicipio[] = [];
  const pendentes: Array<{ codigo_ibge: string; nome: string; uf: string; temFallbackBanco: boolean }> = [];

  for (const row of snapshot) {
    const cacheFresco =
      process.env.RADAR_FORCE_OFFLINE !== '1' &&
      row.modo_offline === 0 &&
      estaDentroDoTtl(row.data_coleta);

    if (cacheFresco) {
      iniciais.push({
        codigo_ibge: row.codigo_ibge,
        nome: row.nome,
        uf: row.uf,
        semana_epi: row.semana_epi,
        data_ini_se: row.data_ini_se,
        nivel: row.nivel,
        casos_est: arredondarInteiro(row.casos_est),
        incidencia_100k: row.incidencia_100k,
        versao_modelo: row.versao_modelo,
        data_coleta: row.data_coleta,
        fonte: row.fonte || 'InfoDengue',
        modo_offline: false,
        origem: 'cache',
      });
    } else if (process.env.RADAR_FORCE_OFFLINE === '1') {
      const amostra = row.nivel === null ? carregarAmostraConsolidadaRj(row.codigo_ibge, doenca) : null;
      const topoAmostra = amostra ? [...amostra.itens].sort((a, b) => b.SE - a.SE)[0] : null;
      if (row.nivel !== null) {
        iniciais.push({
          codigo_ibge: row.codigo_ibge,
          nome: row.nome,
          uf: row.uf,
          semana_epi: row.semana_epi,
          data_ini_se: row.data_ini_se,
          nivel: row.nivel,
          casos_est: arredondarInteiro(row.casos_est),
          incidencia_100k: row.incidencia_100k,
          versao_modelo: row.versao_modelo,
          data_coleta: row.data_coleta,
          fonte: row.fonte || 'Amostra local',
          modo_offline: true,
          origem: 'amostra',
        });
      } else if (topoAmostra) {
        iniciais.push({
          codigo_ibge: row.codigo_ibge,
          nome: row.nome,
          uf: row.uf,
          semana_epi: topoAmostra.SE,
          data_ini_se: topoAmostra.data_iniSE ?? null,
          nivel: topoAmostra.nivel,
          casos_est: arredondarInteiro(topoAmostra.casos_est),
          incidencia_100k: topoAmostra.p_inc100k ?? null,
          versao_modelo: topoAmostra.versao_modelo ?? null,
          data_coleta: amostra?.coletadoEm ?? null,
          fonte: 'Amostra local',
          modo_offline: true,
          origem: 'amostra',
        });
      } else {
        iniciais.push({
          codigo_ibge: row.codigo_ibge,
          nome: row.nome,
          uf: row.uf,
          semana_epi: null,
          data_ini_se: null,
          nivel: null,
          casos_est: null,
          incidencia_100k: null,
          versao_modelo: null,
          data_coleta: null,
          fonte: 'Indisponível',
          modo_offline: true,
          origem: 'indisponivel',
        });
      }
    } else {
      pendentes.push({
        codigo_ibge: row.codigo_ibge,
        nome: row.nome,
        uf: row.uf,
        temFallbackBanco: row.nivel !== null,
      });
    }
  }

  emit({
    tipo: 'inicio',
    uf,
    doenca,
    totalMunicipios: snapshot.length,
    geojson: malha.geojson,
    itens: iniciais,
    emCache: iniciais.length,
  });

  let concluidos = iniciais.length;
  let atualizadosApi = 0;
  let semDados = 0;
  let falhas = 0;
  let cursor = 0;
  let bufferLote: ItemMapaMunicipio[] = [];
  const mapaFallback = new Map(snapshot.map((r) => [r.codigo_ibge, r]));

  const flushLote = () => {
    if (bufferLote.length === 0) return;
    const loteParaEnviar = bufferLote;
    bufferLote = [];
    emit({
      tipo: 'lote',
      itens: loteParaEnviar,
      concluidos,
      totalMunicipios: snapshot.length,
    });
  };

  async function worker() {
    while (cursor < pendentes.length) {
      if (signal?.aborted) return;
      const idx = cursor++;
      const alvo = pendentes[idx];

      const url =
        `https://info.dengue.mat.br/api/alertcity` +
        `?geocode=${encodeURIComponent(alvo.codigo_ibge)}` +
        `&disease=${encodeURIComponent(doenca)}` +
        `&format=json` +
        `&ew_start=${janela.ew_start}&ew_end=${janela.ew_end}` +
        `&ey_start=${janela.ey_start}&ey_end=${janela.ey_end}`;

      try {
        const itens = await fetchJsonComTimeout<InfoDengueItemBruto[]>(url, signal);
        const lista = Array.isArray(itens) ? itens : [];

        await salvarConsultaEAlertas({
          codigo_ibge: alvo.codigo_ibge,
          nome_municipio: alvo.nome,
          uf: alvo.uf,
          doenca,
          fonte: FONTE_MAPA_RESUMO,
          modo_offline: false,
          itens: lista,
        });

        const ordenados = [...lista].sort((a, b) => b.SE - a.SE);
        const topo = ordenados[0];

        if (!topo) {
          semDados++;
        } else {
          atualizadosApi++;
        }

        bufferLote.push({
          codigo_ibge: alvo.codigo_ibge,
          nome: alvo.nome,
          uf: alvo.uf,
          semana_epi: topo?.SE ?? null,
          data_ini_se: topo?.data_iniSE ?? null,
          nivel: topo?.nivel ?? null,
          casos_est: arredondarInteiro(topo?.casos_est),
          incidencia_100k: topo?.p_inc100k ?? null,
          versao_modelo: topo?.versao_modelo ?? null,
          data_coleta: new Date().toISOString(),
          fonte: 'InfoDengue',
          modo_offline: false,
          origem: 'api',
        });
      } catch {
        if (signal?.aborted) return;
        falhas++;
        const fb = mapaFallback.get(alvo.codigo_ibge);
        const amostra = fb?.nivel == null ? carregarAmostraConsolidadaRj(alvo.codigo_ibge, doenca) : null;
        const topoAmostra = amostra ? [...amostra.itens].sort((a, b) => b.SE - a.SE)[0] : null;
        bufferLote.push({
          codigo_ibge: alvo.codigo_ibge,
          nome: alvo.nome,
          uf: alvo.uf,
          semana_epi: fb?.semana_epi ?? topoAmostra?.SE ?? null,
          data_ini_se: fb?.data_ini_se ?? topoAmostra?.data_iniSE ?? null,
          nivel: fb?.nivel ?? topoAmostra?.nivel ?? null,
          casos_est: arredondarInteiro(fb?.casos_est ?? topoAmostra?.casos_est),
          incidencia_100k: fb?.incidencia_100k ?? topoAmostra?.p_inc100k ?? null,
          versao_modelo: fb?.versao_modelo ?? topoAmostra?.versao_modelo ?? null,
          data_coleta: fb?.data_coleta ?? amostra?.coletadoEm ?? null,
          fonte: fb?.fonte ?? (topoAmostra ? 'Amostra local' : 'Indisponível'),
          modo_offline: true,
          origem: fb?.nivel != null || topoAmostra ? 'amostra' : 'indisponivel',
        });
      }

      concluidos++;
      if (bufferLote.length >= MAPA_CONCORRENCIA_MAX) {
        flushLote();
      }
      // Pequeno espaçamento para respeitar o servidor acadêmico do InfoDengue
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  const workersCount = Math.min(MAPA_CONCORRENCIA_MAX, Math.max(1, pendentes.length));
  if (pendentes.length > 0 && !signal?.aborted) {
    await Promise.all(Array.from({ length: workersCount }, () => worker()));
    flushLote();
  }

  if (!signal?.aborted) {
    emit({
      tipo: 'fim',
      resumo: {
        uf,
        doenca,
        total: snapshot.length,
        emCache: iniciais.length,
        atualizadosApi,
        semDados,
        falhas,
        modoOffline: listaMun.modoOffline || malha.modoOffline || (falhas > 0 && atualizadosApi === 0),
        atualizadoEm: new Date().toISOString(),
      },
    });
  }
}
