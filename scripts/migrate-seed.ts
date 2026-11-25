import 'dotenv/config';
import {
  closeDb,
  contarResumoBanco,
  getActiveDbKind,
  runMigrations,
  seedFromLocalSamples,
} from '../server/db.ts';

async function main() {
  try {
    await runMigrations();
    const { municipiosCarregados, semanasCarregadas } = await seedFromLocalSamples();
    const resumo = await contarResumoBanco();

    console.log('Migração e carga inicial concluídas:', {
      banco: getActiveDbKind(),
      municipiosCarregadosNaCarga: municipiosCarregados,
      semanasCarregadasNaCarga: semanasCarregadas,
      ...resumo,
    });
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('Erro na migração e carga inicial:', err);
  process.exit(1);
});
