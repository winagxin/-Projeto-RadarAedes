import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Doenca = 'dengue' | 'chikungunya' | 'zika';

export interface MunicipioRow {
  codigo_ibge: string;
  nome: string;
  uf: string;
  populacao: number | null;
  is_teste: number;
}

export interface ConsultaAlertaRow {
  id: number;
  codigo_ibge: string;
  doenca: Doenca;
  data_coleta: string;
  fonte: string;
  modo_offline: number;
  is_teste: number;
}

export interface AlertaSemanalRow {
  id: number;
  consulta_id: number;
  codigo_ibge: string;
  doenca: Doenca;
  semana_epi: number;
  data_ini_se: number;
  nivel: number;
  casos_est: number | null;
  casos_est_min: number | null;
  casos_est_max: number | null;
  casos: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
  is_teste: number;
}

export interface InfoDengueItemBruto {
  SE: number;
  data_iniSE: number;
  nivel: number;
  casos_est?: number | null;
  casos_est_min?: number | null;
  casos_est_max?: number | null;
  casos?: number | null;
  p_inc100k?: number | null;
  versao_modelo?: string | null;
  municipio_nome?: string | null;
  pop?: string | number | null;
}

let dbInstance: DatabaseSync | null = null;

function resolveDbPath(customPath?: string): string {
  if (customPath) return customPath;
  return process.env.SQLITE_PATH || path.resolve(process.cwd(), 'data', 'radar_aedes.db');
}

/**
 * Abre (ou reutiliza) a conexão SQLite local e ativa chaves estrangeiras.
 */
export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = resolveDbPath(customPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  // Garante integridade referencial e evita travamento/conflito entre servidor e scripts CLI
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = DELETE;');

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

/**
 * Cria as tabelas relacionais do Radar Aedes caso ainda não existam.
 * Todas as tabelas possuem a coluna booleana is_teste (0 = falso por padrão).
 */
export function runMigrations(db: DatabaseSync = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS municipios (
      codigo_ibge TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      uf TEXT NOT NULL,
      populacao INTEGER,
      is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS consultas_alerta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_ibge TEXT NOT NULL,
      doenca TEXT NOT NULL CHECK (doenca IN ('dengue', 'chikungunya', 'zika')),
      data_coleta TEXT NOT NULL,
      fonte TEXT NOT NULL,
      modo_offline INTEGER NOT NULL DEFAULT 0 CHECK (modo_offline IN (0, 1)),
      is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1)),
      FOREIGN KEY (codigo_ibge) REFERENCES municipios(codigo_ibge)
    );

    CREATE TABLE IF NOT EXISTS alerta_semanal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consulta_id INTEGER NOT NULL,
      codigo_ibge TEXT NOT NULL,
      doenca TEXT NOT NULL CHECK (doenca IN ('dengue', 'chikungunya', 'zika')),
      semana_epi INTEGER NOT NULL,
      data_ini_se INTEGER NOT NULL,
      nivel INTEGER NOT NULL,
      casos_est REAL,
      casos_est_min REAL,
      casos_est_max REAL,
      casos INTEGER,
      incidencia_100k REAL,
      versao_modelo TEXT,
      is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1)),
      FOREIGN KEY (consulta_id) REFERENCES consultas_alerta(id) ON DELETE CASCADE,
      FOREIGN KEY (codigo_ibge) REFERENCES municipios(codigo_ibge),
      UNIQUE (codigo_ibge, doenca, semana_epi)
    );

    CREATE TABLE IF NOT EXISTS cache_malhas_uf (
      uf TEXT PRIMARY KEY,
      geojson TEXT NOT NULL,
      data_coleta TEXT NOT NULL,
      is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS idx_municipios_uf ON municipios(uf);
    CREATE INDEX IF NOT EXISTS idx_consultas_lookup
      ON consultas_alerta(codigo_ibge, doenca, data_coleta DESC);
    CREATE INDEX IF NOT EXISTS idx_alerta_serie
      ON alerta_semanal(codigo_ibge, doenca, semana_epi DESC);
  `);
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Insere ou atualiza municípios no catálogo local.
 */
export function upsertMunicipios(
  municipios: Array<{ codigo_ibge: string; nome: string; uf: string; populacao?: number | null }>,
  db: DatabaseSync = getDb(),
  isTeste = false
): void {
  const stmt = db.prepare(`
    INSERT INTO municipios (codigo_ibge, nome, uf, populacao, is_teste)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(codigo_ibge) DO UPDATE SET
      nome = excluded.nome,
      uf = excluded.uf,
      populacao = COALESCE(excluded.populacao, municipios.populacao)
  `);

  db.exec('BEGIN');
  try {
    for (const m of municipios) {
      stmt.run(String(m.codigo_ibge), m.nome, m.uf.toUpperCase(), m.populacao ?? null, isTeste ? 1 : 0);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Registra uma coleta em consultas_alerta e faz UPSERT em alerta_semanal
 * para atualizar semanas existentes sem duplicar e preservar o histórico.
 */
export function salvarConsultaEAlertas(
  params: {
    codigo_ibge: string;
    nome_municipio?: string;
    uf?: string;
    doenca: Doenca;
    fonte: string;
    modo_offline: boolean;
    data_coleta?: string;
    itens: InfoDengueItemBruto[];
    is_teste?: boolean;
  },
  db: DatabaseSync = getDb()
): number {
  const codigo = String(params.codigo_ibge);
  const dataColeta = params.data_coleta ?? new Date().toISOString();
  const isTesteInt = params.is_teste ? 1 : 0;

  // Extrai população (que vem como texto no InfoDengue) do primeiro item válido
  const firstWithPop = params.itens.find((i) => toNullableNumber(i.pop) !== null);
  const populacao = firstWithPop ? Math.round(Number(firstWithPop.pop)) : null;
  const nomeFallback =
    params.nome_municipio ||
    params.itens.find((i) => i.municipio_nome)?.municipio_nome ||
    `Município ${codigo}`;
  const ufFallback = (params.uf || '').toUpperCase() || inferirUfPorCodigo(codigo);

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO municipios (codigo_ibge, nome, uf, populacao, is_teste)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(codigo_ibge) DO UPDATE SET
        nome = CASE WHEN municipios.nome LIKE 'Município %' THEN excluded.nome ELSE municipios.nome END,
        populacao = COALESCE(excluded.populacao, municipios.populacao)
    `).run(codigo, nomeFallback, ufFallback, populacao, isTesteInt);

    const consultaResult = db
      .prepare(
        `
        INSERT INTO consultas_alerta (codigo_ibge, doenca, data_coleta, fonte, modo_offline, is_teste)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(codigo, params.doenca, dataColeta, params.fonte, params.modo_offline ? 1 : 0, isTesteInt);

    const consultaId = Number(consultaResult.lastInsertRowid);

    const upsertAlerta = db.prepare(`
      INSERT INTO alerta_semanal (
        consulta_id, codigo_ibge, doenca, semana_epi, data_ini_se,
        nivel, casos_est, casos_est_min, casos_est_max, casos,
        incidencia_100k, versao_modelo, is_teste
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigo_ibge, doenca, semana_epi) DO UPDATE SET
        consulta_id = excluded.consulta_id,
        data_ini_se = excluded.data_ini_se,
        nivel = excluded.nivel,
        casos_est = excluded.casos_est,
        casos_est_min = excluded.casos_est_min,
        casos_est_max = excluded.casos_est_max,
        casos = excluded.casos,
        incidencia_100k = excluded.incidencia_100k,
        versao_modelo = excluded.versao_modelo
    `);

    for (const item of params.itens) {
      if (!item || typeof item.SE !== 'number' || typeof item.nivel !== 'number') continue;
      const casosInt = toNullableNumber(item.casos);
      upsertAlerta.run(
        consultaId,
        codigo,
        params.doenca,
        item.SE,
        Number(item.data_iniSE),
        item.nivel,
        toNullableNumber(item.casos_est),
        toNullableNumber(item.casos_est_min),
        toNullableNumber(item.casos_est_max),
        casosInt !== null ? Math.round(casosInt) : null,
        toNullableNumber(item.p_inc100k),
        item.versao_modelo ?? null,
        isTesteInt
      );
    }

    db.exec('COMMIT');
    return consultaId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Carrega as amostras reais de data/ para o banco SQLite (carga inicial idempotente).
 */
export function seedFromLocalSamples(db: DatabaseSync = getDb()): {
  municipiosCarregados: number;
  semanasCarregadas: number;
} {
  const dataDir = path.resolve(process.cwd(), 'data');
  const ibgePath = path.join(dataDir, 'amostra_ibge_municipios.json');
  const infoPath = path.join(dataDir, 'amostra_infodengue.json');

  let municipiosCarregados = 0;
  let semanasCarregadas = 0;

  if (fs.existsSync(ibgePath)) {
    const rawIbge = JSON.parse(fs.readFileSync(ibgePath, 'utf8')) as Array<{
      id: number | string;
      nome: string;
      microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
    }>;

    const lista = rawIbge.map((m) => ({
      codigo_ibge: String(m.id),
      nome: m.nome,
      uf: m.microrregiao?.mesorregiao?.UF?.sigla || 'RJ',
      populacao: null,
    }));

    upsertMunicipios(lista, db, false);
    municipiosCarregados = lista.length;
  }

  if (fs.existsSync(infoPath)) {
    const existingCountRow = db
      .prepare(
        `SELECT COUNT(*) AS total FROM alerta_semanal WHERE codigo_ibge = '3304557' AND doenca = 'dengue'`
      )
      .get() as { total: number };

    // Evita regravar uma nova consulta de amostra se já houver dados carregados para o RJ
    if (existingCountRow.total === 0) {
      const rawInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as InfoDengueItemBruto[];
      if (Array.isArray(rawInfo) && rawInfo.length > 0) {
        const versao = rawInfo[0].versao_modelo || '2026-11-17';
        salvarConsultaEAlertas(
          {
            codigo_ibge: '3304557',
            nome_municipio: rawInfo[0].municipio_nome || 'Rio de Janeiro',
            uf: 'RJ',
            doenca: 'dengue',
            fonte: 'Amostra local',
            modo_offline: true,
            data_coleta: `${versao}T12:00:00.000Z`,
            itens: rawInfo,
            is_teste: false,
          },
          db
        );
        semanasCarregadas = rawInfo.length;
      }
    }
  }

  return { municipiosCarregados, semanasCarregadas };
}

export function buscarMunicipiosPorUf(uf: string, db: DatabaseSync = getDb()): MunicipioRow[] {
  return db
    .prepare(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE uf = ? AND is_teste = 0
       ORDER BY nome ASC`
    )
    .all(uf.toUpperCase()) as unknown as MunicipioRow[];
}

export function buscarMunicipio(codigoIbge: string, db: DatabaseSync = getDb()): MunicipioRow | undefined {
  return db
    .prepare(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE codigo_ibge = ?`
    )
    .get(String(codigoIbge)) as unknown as MunicipioRow | undefined;
}

export function buscarUltimaConsulta(
  codigoIbge: string,
  doenca: Doenca,
  db: DatabaseSync = getDb()
): ConsultaAlertaRow | undefined {
  return db
    .prepare(
      `SELECT id, codigo_ibge, doenca, data_coleta, fonte, modo_offline, is_teste
       FROM consultas_alerta
       WHERE codigo_ibge = ? AND doenca = ? AND is_teste = 0
       ORDER BY data_coleta DESC, id DESC
       LIMIT 1`
    )
    .get(String(codigoIbge), doenca) as unknown as ConsultaAlertaRow | undefined;
}

export function buscarSerieHistorica(
  codigoIbge: string,
  doenca: Doenca,
  limite = 12,
  db: DatabaseSync = getDb()
): AlertaSemanalRow[] {
  const rows = db
    .prepare(
      `SELECT id, consulta_id, codigo_ibge, doenca, semana_epi, data_ini_se,
              nivel, casos_est, casos_est_min, casos_est_max, casos,
              incidencia_100k, versao_modelo, is_teste
       FROM alerta_semanal
       WHERE codigo_ibge = ? AND doenca = ? AND is_teste = 0
       ORDER BY semana_epi DESC
       LIMIT ?`
    )
    .all(String(codigoIbge), doenca, limite) as unknown as AlertaSemanalRow[];

  // Retorna em ordem cronológica (mais antiga -> mais recente) para gráficos
  return rows.reverse();
}

export interface AlertaResumoUfRow {
  codigo_ibge: string;
  nome: string;
  uf: string;
  semana_epi: number | null;
  nivel: number | null;
  casos_est: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
  data_coleta: string | null;
  fonte: string | null;
  modo_offline: number | null;
}

export function buscarUltimosAlertasPorUf(
  uf: string,
  doenca: Doenca,
  db: DatabaseSync = getDb()
): AlertaResumoUfRow[] {
  return db
    .prepare(
      `SELECT
         m.codigo_ibge,
         m.nome,
         m.uf,
         a.semana_epi,
         a.nivel,
         a.casos_est,
         a.incidencia_100k,
         a.versao_modelo,
         c.data_coleta,
         c.fonte,
         c.modo_offline
       FROM municipios m
       LEFT JOIN (
         SELECT c1.*
         FROM consultas_alerta c1
         INNER JOIN (
           SELECT codigo_ibge, MAX(id) AS max_id
           FROM consultas_alerta
           WHERE doenca = ? AND is_teste = 0
           GROUP BY codigo_ibge
         ) c2 ON c1.id = c2.max_id
       ) c ON c.codigo_ibge = m.codigo_ibge
       LEFT JOIN (
         SELECT a1.*
         FROM alerta_semanal a1
         INNER JOIN (
           SELECT codigo_ibge, MAX(semana_epi) AS max_se
           FROM alerta_semanal
           WHERE doenca = ? AND is_teste = 0
           GROUP BY codigo_ibge
         ) a2 ON a1.codigo_ibge = a2.codigo_ibge AND a1.semana_epi = a2.max_se AND a1.doenca = ?
       ) a ON a.codigo_ibge = m.codigo_ibge
       WHERE m.uf = ? AND m.is_teste = 0
       ORDER BY m.nome ASC`
    )
    .all(doenca, doenca, doenca, uf.toUpperCase()) as unknown as AlertaResumoUfRow[];
}

export function buscarCacheMalhaUf(
  uf: string,
  db: DatabaseSync = getDb()
): { uf: string; geojson: string; data_coleta: string } | undefined {
  return db
    .prepare(`SELECT uf, geojson, data_coleta FROM cache_malhas_uf WHERE uf = ? AND is_teste = 0`)
    .get(uf.toUpperCase()) as unknown as { uf: string; geojson: string; data_coleta: string } | undefined;
}

export function salvarCacheMalhaUf(uf: string, geojson: string, db: DatabaseSync = getDb()): void {
  db.prepare(`
    INSERT INTO cache_malhas_uf (uf, geojson, data_coleta, is_teste)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(uf) DO UPDATE SET
      geojson = excluded.geojson,
      data_coleta = excluded.data_coleta
  `).run(uf.toUpperCase(), geojson, new Date().toISOString());
}

const UF_POR_PREFIXO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

function inferirUfPorCodigo(codigo: string): string {
  return UF_POR_PREFIXO[codigo.slice(0, 2)] || 'BR';
}
