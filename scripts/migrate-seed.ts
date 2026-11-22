import { getDb, runMigrations, seedFromLocalSamples } from '../server/db.ts';

const db = getDb();
runMigrations(db);
const { municipiosCarregados, semanasCarregadas } = seedFromLocalSamples(db);

const resumo = db
  .prepare(`
    SELECT
      (SELECT COUNT(*) FROM municipios) AS total_municipios,
      (SELECT COUNT(*) FROM consultas_alerta) AS total_consultas,
      (SELECT COUNT(*) FROM alerta_semanal) AS total_semanas,
      (SELECT COUNT(*) FROM cache_malhas_uf) AS total_malhas
  `)
  .get() as {
  total_municipios: number;
  total_consultas: number;
  total_semanas: number;
  total_malhas: number;
};

console.log('Migração e carga inicial concluídas:', {
  municipiosCarregadosNaCarga: municipiosCarregados,
  semanasCarregadasNaCarga: semanasCarregadas,
  ...resumo,
});
