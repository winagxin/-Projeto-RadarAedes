import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import type { Pool, PoolClient, PoolConfig } from 'pg';

const { Pool: PgPool } = pg;

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

export interface AlertaResumoUfRow {
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
  modo_offline: number | null;
}

export interface ResumoBanco {
  total_municipios: number;
  total_consultas: number;
  total_semanas: number;
  total_malhas: number;
}

let sqliteInstance: DatabaseSync | null = null;
let pgPoolInstance: Pool | null = null;
let conexaoRegistrada = false;

function getDatabaseUrl(): string | null {
  const url = (process.env.DATABASE_URL || '').trim();
  if (url.length === 0) {
    return null;
  }
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      'Configuração inválida: DATABASE_URL deve começar com "postgres://" ou "postgresql://".'
    );
  }
  return url;
}

export function isPostgresEnabled(): boolean {
  return getDatabaseUrl() !== null;
}

export function getActiveDbKind(): 'postgresql' | 'sqlite' {
  return isPostgresEnabled() ? 'postgresql' : 'sqlite';
}

function resolveSqlitePath(customPath?: string): string {
  if (customPath) return customPath;
  return process.env.SQLITE_PATH || path.resolve(process.cwd(), 'data', 'radar_aedes.db');
}

/**
 * Abre (ou reutiliza) a conexão SQLite local e ativa chaves estrangeiras.
 */
export function getDb(customPath?: string): DatabaseSync {
  if (sqliteInstance && !customPath) {
    return sqliteInstance;
  }

  const dbPath = resolveSqlitePath(customPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  // Garante integridade referencial e evita travamento/conflito entre servidor e scripts CLI
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = DELETE;');

  if (!customPath) {
    sqliteInstance = db;
  }
  return db;
}

function buildPgPoolConfig(databaseUrl: string): PoolConfig {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  try {
    const parsed = new URL(databaseUrl);
    const isLocalHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    if (!isLocalHost && !parsed.searchParams.has('sslmode')) {
      config.ssl = { rejectUnauthorized: true };
    }
  } catch {
    // Se a URL não for parseável pelo construtor URL, deixa o driver pg validar diretamente
  }

  return config;
}

/**
 * Abre (ou reutiliza) o pool de conexões PostgreSQL quando DATABASE_URL está definida.
 */
export function getPgPool(): Pool {
  if (pgPoolInstance) {
    return pgPoolInstance;
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada para conexão PostgreSQL.');
  }

  pgPoolInstance = new PgPool(buildPgPoolConfig(databaseUrl));
  return pgPoolInstance;
}

/**
 * Encerra conexões abertas (útil ao finalizar scripts CLI no PostgreSQL ou SQLite).
 */
export async function closeDb(): Promise<void> {
  if (pgPoolInstance) {
    const pool = pgPoolInstance;
    pgPoolInstance = null;
    await pool.end();
  }
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // Ignora caso já tenha sido fechada
    }
    sqliteInstance = null;
  }
  conexaoRegistrada = false;
}

async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignora falha secundária de rollback
    }
    throw err;
  } finally {
    client.release();
  }
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function toRequiredNumber(val: unknown): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

function mapMunicipioRow(row: Record<string, unknown>): MunicipioRow {
  return {
    codigo_ibge: String(row.codigo_ibge),
    nome: String(row.nome),
    uf: String(row.uf),
    populacao: toNullableNumber(row.populacao),
    is_teste: toRequiredNumber(row.is_teste),
  };
}

function mapConsultaRow(row: Record<string, unknown>): ConsultaAlertaRow {
  return {
    id: toRequiredNumber(row.id),
    codigo_ibge: String(row.codigo_ibge),
    doenca: String(row.doenca) as Doenca,
    data_coleta: String(row.data_coleta),
    fonte: String(row.fonte),
    modo_offline: toRequiredNumber(row.modo_offline),
    is_teste: toRequiredNumber(row.is_teste),
  };
}

function mapAlertaRow(row: Record<string, unknown>): AlertaSemanalRow {
  return {
    id: toRequiredNumber(row.id),
    consulta_id: toRequiredNumber(row.consulta_id),
    codigo_ibge: String(row.codigo_ibge),
    doenca: String(row.doenca) as Doenca,
    semana_epi: toRequiredNumber(row.semana_epi),
    data_ini_se: toRequiredNumber(row.data_ini_se),
    nivel: toRequiredNumber(row.nivel),
    casos_est: toNullableNumber(row.casos_est),
    casos_est_min: toNullableNumber(row.casos_est_min),
    casos_est_max: toNullableNumber(row.casos_est_max),
    casos: toNullableNumber(row.casos),
    incidencia_100k: toNullableNumber(row.incidencia_100k),
    versao_modelo: row.versao_modelo != null ? String(row.versao_modelo) : null,
    is_teste: toRequiredNumber(row.is_teste),
  };
}

function mapAlertaResumoUfRow(row: Record<string, unknown>): AlertaResumoUfRow {
  return {
    codigo_ibge: String(row.codigo_ibge),
    nome: String(row.nome),
    uf: String(row.uf),
    semana_epi: toNullableNumber(row.semana_epi),
    data_ini_se: toNullableNumber(row.data_ini_se),
    nivel: toNullableNumber(row.nivel),
    casos_est: toNullableNumber(row.casos_est),
    incidencia_100k: toNullableNumber(row.incidencia_100k),
    versao_modelo: row.versao_modelo != null ? String(row.versao_modelo) : null,
    data_coleta: row.data_coleta != null ? String(row.data_coleta) : null,
    fonte: row.fonte != null ? String(row.fonte) : null,
    modo_offline: toNullableNumber(row.modo_offline),
  };
}

/**
 * Cria as tabelas relacionais do Radar Aedes (4 tabelas) no banco ativo (PostgreSQL ou SQLite).
 * Todas as tabelas possuem a coluna booleana is_teste (0 = falso por padrão).
 */
export async function runMigrations(customSqliteDb?: DatabaseSync): Promise<void> {
  if (isPostgresEnabled() && !customSqliteDb) {
    const pool = getPgPool();
    try {
      await pool.query('SELECT 1');
      if (!conexaoRegistrada) {
        console.log('Conexão com o banco de dados PostgreSQL estabelecida com sucesso.');
        conexaoRegistrada = true;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS municipios (
          codigo_ibge TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          uf TEXT NOT NULL,
          populacao INTEGER,
          is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS consultas_alerta (
          id SERIAL PRIMARY KEY,
          codigo_ibge TEXT NOT NULL REFERENCES municipios(codigo_ibge),
          doenca TEXT NOT NULL CHECK (doenca IN ('dengue', 'chikungunya', 'zika')),
          data_coleta TEXT NOT NULL,
          fonte TEXT NOT NULL,
          modo_offline INTEGER NOT NULL DEFAULT 0 CHECK (modo_offline IN (0, 1)),
          is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS alerta_semanal (
          id SERIAL PRIMARY KEY,
          consulta_id INTEGER NOT NULL REFERENCES consultas_alerta(id) ON DELETE CASCADE,
          codigo_ibge TEXT NOT NULL REFERENCES municipios(codigo_ibge),
          doenca TEXT NOT NULL CHECK (doenca IN ('dengue', 'chikungunya', 'zika')),
          semana_epi INTEGER NOT NULL,
          data_ini_se BIGINT NOT NULL,
          nivel INTEGER NOT NULL,
          casos_est DOUBLE PRECISION,
          casos_est_min DOUBLE PRECISION,
          casos_est_max DOUBLE PRECISION,
          casos INTEGER,
          incidencia_100k DOUBLE PRECISION,
          versao_modelo TEXT,
          is_teste INTEGER NOT NULL DEFAULT 0 CHECK (is_teste IN (0, 1)),
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
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Configuração inválida: DATABASE_URL')) {
        throw err;
      }
      throw new Error(
        'Não foi possível conectar ou preparar as tabelas no PostgreSQL. Verifique DATABASE_URL e a disponibilidade do banco.'
      );
    }
  }

  const db = customSqliteDb ?? getDb();
  db.exec('SELECT 1;');
  if (!customSqliteDb && !conexaoRegistrada) {
    console.log('Conexão com o banco de dados SQLite estabelecida com sucesso.');
    conexaoRegistrada = true;
  }

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

/**
 * Insere ou atualiza municípios no catálogo local ou PostgreSQL.
 */
export async function upsertMunicipios(
  municipios: Array<{ codigo_ibge: string; nome: string; uf: string; populacao?: number | null }>,
  isTeste = false,
  customSqliteDb?: DatabaseSync
): Promise<void> {
  if (municipios.length === 0) return;

  // Deduplica por código IBGE mantendo a última ocorrência
  const mapaDedup = new Map<
    string,
    { codigo_ibge: string; nome: string; uf: string; populacao: number | null }
  >();
  for (const m of municipios) {
    const codigo = String(m.codigo_ibge);
    mapaDedup.set(codigo, {
      codigo_ibge: codigo,
      nome: m.nome,
      uf: m.uf.toUpperCase(),
      populacao: m.populacao ?? null,
    });
  }
  const lista = Array.from(mapaDedup.values());
  const isTesteInt = isTeste ? 1 : 0;

  if (isPostgresEnabled() && !customSqliteDb) {
    const codigos: string[] = [];
    const nomes: string[] = [];
    const ufs: string[] = [];
    const populacoes: Array<number | null> = [];
    const testes: number[] = [];

    for (const m of lista) {
      codigos.push(m.codigo_ibge);
      nomes.push(m.nome);
      ufs.push(m.uf);
      populacoes.push(m.populacao);
      testes.push(isTesteInt);
    }

    await withPgTransaction(async (client) => {
      await client.query(
        `
        INSERT INTO municipios (codigo_ibge, nome, uf, populacao, is_teste)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::integer[], $5::integer[])
        ON CONFLICT(codigo_ibge) DO UPDATE SET
          nome = EXCLUDED.nome,
          uf = EXCLUDED.uf,
          populacao = COALESCE(EXCLUDED.populacao, municipios.populacao)
        `,
        [codigos, nomes, ufs, populacoes, testes]
      );
    });
    return;
  }

  const db = customSqliteDb ?? getDb();
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
    for (const m of lista) {
      stmt.run(m.codigo_ibge, m.nome, m.uf, m.populacao, isTesteInt);
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
export async function salvarConsultaEAlertas(
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
  customSqliteDb?: DatabaseSync
): Promise<number> {
  const codigo = String(params.codigo_ibge);
  const dataColeta = params.data_coleta ?? new Date().toISOString();
  const isTesteInt = params.is_teste ? 1 : 0;
  const modoOfflineInt = params.modo_offline ? 1 : 0;

  // Extrai população (que vem como texto no InfoDengue) do primeiro item válido
  const firstWithPop = params.itens.find((i) => toNullableNumber(i.pop) !== null);
  const populacao = firstWithPop ? Math.round(Number(firstWithPop.pop)) : null;
  const nomeFallback =
    params.nome_municipio ||
    params.itens.find((i) => i.municipio_nome)?.municipio_nome ||
    `Município ${codigo}`;
  const ufFallback = (params.uf || '').toUpperCase() || inferirUfPorCodigo(codigo);

  // Deduplica por semana_epi preservando o último registro para garantir upsert consistente
  const itensPorSemana = new Map<number, InfoDengueItemBruto>();
  for (const item of params.itens) {
    if (!item || typeof item.SE !== 'number' || typeof item.nivel !== 'number') continue;
    itensPorSemana.set(item.SE, item);
  }
  const itensValidos = Array.from(itensPorSemana.values());

  if (isPostgresEnabled() && !customSqliteDb) {
    return withPgTransaction(async (client) => {
      await client.query(
        `
        INSERT INTO municipios (codigo_ibge, nome, uf, populacao, is_teste)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(codigo_ibge) DO UPDATE SET
          nome = CASE WHEN municipios.nome LIKE 'Município %' THEN EXCLUDED.nome ELSE municipios.nome END,
          populacao = COALESCE(EXCLUDED.populacao, municipios.populacao)
        `,
        [codigo, nomeFallback, ufFallback, populacao, isTesteInt]
      );

      const consultaRes = await client.query<{ id: number }>(
        `
        INSERT INTO consultas_alerta (codigo_ibge, doenca, data_coleta, fonte, modo_offline, is_teste)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [codigo, params.doenca, dataColeta, params.fonte, modoOfflineInt, isTesteInt]
      );
      const consultaId = toRequiredNumber(consultaRes.rows[0].id);

      if (itensValidos.length > 0) {
        const consultaIds: number[] = [];
        const codigos: string[] = [];
        const doencas: string[] = [];
        const semanasEpi: number[] = [];
        const datasIniSe: number[] = [];
        const niveis: number[] = [];
        const casosEst: Array<number | null> = [];
        const casosEstMin: Array<number | null> = [];
        const casosEstMax: Array<number | null> = [];
        const casos: Array<number | null> = [];
        const incidencias: Array<number | null> = [];
        const versoesModelo: Array<string | null> = [];
        const testes: number[] = [];

        for (const item of itensValidos) {
          const casosInt = toNullableNumber(item.casos);
          consultaIds.push(consultaId);
          codigos.push(codigo);
          doencas.push(params.doenca);
          semanasEpi.push(item.SE);
          datasIniSe.push(Number(item.data_iniSE));
          niveis.push(item.nivel);
          casosEst.push(toNullableNumber(item.casos_est));
          casosEstMin.push(toNullableNumber(item.casos_est_min));
          casosEstMax.push(toNullableNumber(item.casos_est_max));
          casos.push(casosInt !== null ? Math.round(casosInt) : null);
          incidencias.push(toNullableNumber(item.p_inc100k));
          versoesModelo.push(item.versao_modelo ?? null);
          testes.push(isTesteInt);
        }

        await client.query(
          `
          INSERT INTO alerta_semanal (
            consulta_id, codigo_ibge, doenca, semana_epi, data_ini_se,
            nivel, casos_est, casos_est_min, casos_est_max, casos,
            incidencia_100k, versao_modelo, is_teste
          )
          SELECT * FROM UNNEST(
            $1::integer[], $2::text[], $3::text[], $4::integer[], $5::bigint[],
            $6::integer[], $7::double precision[], $8::double precision[], $9::double precision[], $10::integer[],
            $11::double precision[], $12::text[], $13::integer[]
          )
          ON CONFLICT(codigo_ibge, doenca, semana_epi) DO UPDATE SET
            consulta_id = EXCLUDED.consulta_id,
            data_ini_se = EXCLUDED.data_ini_se,
            nivel = EXCLUDED.nivel,
            casos_est = EXCLUDED.casos_est,
            casos_est_min = EXCLUDED.casos_est_min,
            casos_est_max = EXCLUDED.casos_est_max,
            casos = EXCLUDED.casos,
            incidencia_100k = EXCLUDED.incidencia_100k,
            versao_modelo = EXCLUDED.versao_modelo
          `,
          [
            consultaIds,
            codigos,
            doencas,
            semanasEpi,
            datasIniSe,
            niveis,
            casosEst,
            casosEstMin,
            casosEstMax,
            casos,
            incidencias,
            versoesModelo,
            testes,
          ]
        );
      }

      return consultaId;
    });
  }

  const db = customSqliteDb ?? getDb();
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
      .run(codigo, params.doenca, dataColeta, params.fonte, modoOfflineInt, isTesteInt);

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

    for (const item of itensValidos) {
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
 * Carrega as amostras reais de data/ para o banco ativo (carga inicial idempotente).
 */
export async function seedFromLocalSamples(customSqliteDb?: DatabaseSync): Promise<{
  municipiosCarregados: number;
  semanasCarregadas: number;
}> {
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

    await upsertMunicipios(lista, false, customSqliteDb);
    municipiosCarregados = lista.length;
  }

  if (fs.existsSync(infoPath)) {
    let totalExistente = 0;
    if (isPostgresEnabled() && !customSqliteDb) {
      const res = await getPgPool().query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM alerta_semanal WHERE codigo_ibge = '3304557' AND doenca = 'dengue'`
      );
      totalExistente = toRequiredNumber(res.rows[0]?.total);
    } else {
      const db = customSqliteDb ?? getDb();
      const row = db
        .prepare(
          `SELECT COUNT(*) AS total FROM alerta_semanal WHERE codigo_ibge = '3304557' AND doenca = 'dengue'`
        )
        .get() as { total: number };
      totalExistente = toRequiredNumber(row?.total);
    }

    // Evita regravar uma nova consulta de amostra se já houver dados carregados para o RJ
    if (totalExistente === 0) {
      const rawInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as InfoDengueItemBruto[];
      if (Array.isArray(rawInfo) && rawInfo.length > 0) {
        const versao = rawInfo[0].versao_modelo || '2026-11-17';
        await salvarConsultaEAlertas(
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
          customSqliteDb
        );
        semanasCarregadas = rawInfo.length;
      }
    }
  }

  return { municipiosCarregados, semanasCarregadas };
}

export async function buscarMunicipiosPorUf(
  uf: string,
  customSqliteDb?: DatabaseSync
): Promise<MunicipioRow[]> {
  const ufNorm = uf.toUpperCase();
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE uf = $1 AND is_teste = 0
       ORDER BY nome ASC`,
      [ufNorm]
    );
    return res.rows.map((r) => mapMunicipioRow(r as Record<string, unknown>));
  }

  const db = customSqliteDb ?? getDb();
  const rows = db
    .prepare(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE uf = ? AND is_teste = 0
       ORDER BY nome ASC`
    )
    .all(ufNorm) as Array<Record<string, unknown>>;
  return rows.map(mapMunicipioRow);
}

export async function buscarMunicipio(
  codigoIbge: string,
  customSqliteDb?: DatabaseSync
): Promise<MunicipioRow | undefined> {
  const codigo = String(codigoIbge);
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE codigo_ibge = $1`,
      [codigo]
    );
    return res.rows[0] ? mapMunicipioRow(res.rows[0] as Record<string, unknown>) : undefined;
  }

  const db = customSqliteDb ?? getDb();
  const row = db
    .prepare(
      `SELECT codigo_ibge, nome, uf, populacao, is_teste
       FROM municipios
       WHERE codigo_ibge = ?`
    )
    .get(codigo) as Record<string, unknown> | undefined;
  return row ? mapMunicipioRow(row) : undefined;
}

export async function buscarUltimaConsulta(
  codigoIbge: string,
  doenca: Doenca,
  customSqliteDb?: DatabaseSync
): Promise<ConsultaAlertaRow | undefined> {
  const codigo = String(codigoIbge);
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query(
      `SELECT id, codigo_ibge, doenca, data_coleta, fonte, modo_offline, is_teste
       FROM consultas_alerta
       WHERE codigo_ibge = $1 AND doenca = $2 AND is_teste = 0
       ORDER BY data_coleta DESC, id DESC
       LIMIT 1`,
      [codigo, doenca]
    );
    return res.rows[0] ? mapConsultaRow(res.rows[0] as Record<string, unknown>) : undefined;
  }

  const db = customSqliteDb ?? getDb();
  const row = db
    .prepare(
      `SELECT id, codigo_ibge, doenca, data_coleta, fonte, modo_offline, is_teste
       FROM consultas_alerta
       WHERE codigo_ibge = ? AND doenca = ? AND is_teste = 0
       ORDER BY data_coleta DESC, id DESC
       LIMIT 1`
    )
    .get(codigo, doenca) as Record<string, unknown> | undefined;
  return row ? mapConsultaRow(row) : undefined;
}

export async function buscarSerieHistorica(
  codigoIbge: string,
  doenca: Doenca,
  limite = 12,
  customSqliteDb?: DatabaseSync
): Promise<AlertaSemanalRow[]> {
  const codigo = String(codigoIbge);
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query(
      `SELECT id, consulta_id, codigo_ibge, doenca, semana_epi, data_ini_se,
              nivel, casos_est, casos_est_min, casos_est_max, casos,
              incidencia_100k, versao_modelo, is_teste
       FROM alerta_semanal
       WHERE codigo_ibge = $1 AND doenca = $2 AND is_teste = 0
       ORDER BY semana_epi DESC
       LIMIT $3`,
      [codigo, doenca, limite]
    );
    return res.rows.map((r) => mapAlertaRow(r as Record<string, unknown>)).reverse();
  }

  const db = customSqliteDb ?? getDb();
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
    .all(codigo, doenca, limite) as Array<Record<string, unknown>>;

  // Retorna em ordem cronológica (mais antiga -> mais recente) para gráficos
  return rows.map(mapAlertaRow).reverse();
}

export async function buscarUltimosAlertasPorUf(
  uf: string,
  doenca: Doenca,
  customSqliteDb?: DatabaseSync
): Promise<AlertaResumoUfRow[]> {
  const ufNorm = uf.toUpperCase();
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query(
      `SELECT
         m.codigo_ibge,
         m.nome,
         m.uf,
         a.semana_epi,
         a.data_ini_se,
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
           WHERE doenca = $1 AND is_teste = 0
           GROUP BY codigo_ibge
         ) c2 ON c1.id = c2.max_id
       ) c ON c.codigo_ibge = m.codigo_ibge
       LEFT JOIN (
         SELECT a1.*
         FROM alerta_semanal a1
         INNER JOIN (
           SELECT codigo_ibge, MAX(semana_epi) AS max_se
           FROM alerta_semanal
           WHERE doenca = $2 AND is_teste = 0
           GROUP BY codigo_ibge
         ) a2 ON a1.codigo_ibge = a2.codigo_ibge AND a1.semana_epi = a2.max_se AND a1.doenca = $3
       ) a ON a.codigo_ibge = m.codigo_ibge
       WHERE m.uf = $4 AND m.is_teste = 0
       ORDER BY m.nome ASC`,
      [doenca, doenca, doenca, ufNorm]
    );
    return res.rows.map((r) => mapAlertaResumoUfRow(r as Record<string, unknown>));
  }

  const db = customSqliteDb ?? getDb();
  const rows = db
    .prepare(
      `SELECT
         m.codigo_ibge,
         m.nome,
         m.uf,
         a.semana_epi,
         a.data_ini_se,
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
    .all(doenca, doenca, doenca, ufNorm) as Array<Record<string, unknown>>;
  return rows.map(mapAlertaResumoUfRow);
}

export async function buscarCacheMalhaUf(
  uf: string,
  customSqliteDb?: DatabaseSync
): Promise<{ uf: string; geojson: string; data_coleta: string } | undefined> {
  const ufNorm = uf.toUpperCase();
  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query<{ uf: string; geojson: string; data_coleta: string }>(
      `SELECT uf, geojson, data_coleta FROM cache_malhas_uf WHERE uf = $1 AND is_teste = 0`,
      [ufNorm]
    );
    return res.rows[0]
      ? {
          uf: String(res.rows[0].uf),
          geojson: String(res.rows[0].geojson),
          data_coleta: String(res.rows[0].data_coleta),
        }
      : undefined;
  }

  const db = customSqliteDb ?? getDb();
  return db
    .prepare(`SELECT uf, geojson, data_coleta FROM cache_malhas_uf WHERE uf = ? AND is_teste = 0`)
    .get(ufNorm) as unknown as { uf: string; geojson: string; data_coleta: string } | undefined;
}

export async function salvarCacheMalhaUf(
  uf: string,
  geojson: string,
  customSqliteDb?: DatabaseSync
): Promise<void> {
  const ufNorm = uf.toUpperCase();
  const dataColeta = new Date().toISOString();

  if (isPostgresEnabled() && !customSqliteDb) {
    await getPgPool().query(
      `
      INSERT INTO cache_malhas_uf (uf, geojson, data_coleta, is_teste)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT(uf) DO UPDATE SET
        geojson = EXCLUDED.geojson,
        data_coleta = EXCLUDED.data_coleta
      `,
      [ufNorm, geojson, dataColeta]
    );
    return;
  }

  const db = customSqliteDb ?? getDb();
  db.prepare(`
    INSERT INTO cache_malhas_uf (uf, geojson, data_coleta, is_teste)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(uf) DO UPDATE SET
      geojson = excluded.geojson,
      data_coleta = excluded.data_coleta
  `).run(ufNorm, geojson, dataColeta);
}

export async function contarResumoBanco(customSqliteDb?: DatabaseSync): Promise<ResumoBanco> {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM municipios) AS total_municipios,
      (SELECT COUNT(*) FROM consultas_alerta) AS total_consultas,
      (SELECT COUNT(*) FROM alerta_semanal) AS total_semanas,
      (SELECT COUNT(*) FROM cache_malhas_uf) AS total_malhas
  `;

  if (isPostgresEnabled() && !customSqliteDb) {
    const res = await getPgPool().query<Record<string, unknown>>(sql);
    const row = res.rows[0] ?? {};
    return {
      total_municipios: toRequiredNumber(row.total_municipios),
      total_consultas: toRequiredNumber(row.total_consultas),
      total_semanas: toRequiredNumber(row.total_semanas),
      total_malhas: toRequiredNumber(row.total_malhas),
    };
  }

  const db = customSqliteDb ?? getDb();
  const row = db.prepare(sql).get() as Record<string, unknown>;
  return {
    total_municipios: toRequiredNumber(row.total_municipios),
    total_consultas: toRequiredNumber(row.total_consultas),
    total_semanas: toRequiredNumber(row.total_semanas),
    total_malhas: toRequiredNumber(row.total_malhas),
  };
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
