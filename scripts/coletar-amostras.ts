import fs from 'node:fs';
import path from 'node:path';
import {
  Doenca,
  getDb,
  InfoDengueItemBruto,
  runMigrations,
  salvarConsultaEAlertas,
  upsertMunicipios,
} from '../server/db.ts';

const ALVOS = [
  { codigo_ibge: '3304557', nomeEsperado: 'Rio de Janeiro' },
  { codigo_ibge: '3300456', nomeEsperado: 'Belford Roxo' },
  { codigo_ibge: '3302858', nomeEsperado: 'Mesquita' },
  { codigo_ibge: '3303302', nomeEsperado: 'Niterói' },
  { codigo_ibge: '3301702', nomeEsperado: 'Duque de Caxias' },
  { codigo_ibge: '3303500', nomeEsperado: 'Nova Iguaçu' },
];

const DOENCAS: Doenca[] = ['dengue', 'chikungunya', 'zika'];
const MAX_CONCORRENCIA = 4;
const TIMEOUT_MS = 12000;

interface IbgeMunicipioAmostra {
  id: number | string;
  nome: string;
}

export interface ArquivoConsolidadoRj {
  coletadoEm: string;
  fonte: string;
  ano: number;
  municipios: Record<
    string,
    {
      nome: string;
      uf: string;
      doencas: Record<Doenca, InfoDengueItemBruto[]>;
    }
  >;
}

async function consultarInfoDengue(geocode: string, doenca: Doenca): Promise<InfoDengueItemBruto[]> {
  const url =
    `https://info.dengue.mat.br/api/alertcity` +
    `?geocode=${encodeURIComponent(geocode)}` +
    `&disease=${encodeURIComponent(doenca)}` +
    `&format=json&ew_start=1&ew_end=52&ey_start=2026&ey_end=2026`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RadarAedes/1.0 (ColetaEducacional)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} para ${geocode} (${doenca})`);
    }
    const json = await res.json();
    return Array.isArray(json) ? (json as InfoDengueItemBruto[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const ibgePath = path.resolve(process.cwd(), 'data', 'amostra_ibge_municipios.json');
  const rawIbge = JSON.parse(fs.readFileSync(ibgePath, 'utf8')) as IbgeMunicipioAmostra[];
  const mapaIbge = new Map(rawIbge.map((m) => [String(m.id), m.nome]));

  // (6) Conferência dos 6 códigos contra data/amostra_ibge_municipios.json
  console.log('=== Conferência dos 6 códigos contra data/amostra_ibge_municipios.json ===');
  let divergencias = 0;
  for (const alvo of ALVOS) {
    const nomeIbge = mapaIbge.get(alvo.codigo_ibge);
    if (!nomeIbge) {
      console.error(`DIVERGÊNCIA: código ${alvo.codigo_ibge} (${alvo.nomeEsperado}) NÃO encontrado!`);
      divergencias++;
    } else if (nomeIbge !== alvo.nomeEsperado) {
      console.warn(
        `AVISO DE NOME: código ${alvo.codigo_ibge} é "${nomeIbge}" no IBGE (esperado "${alvo.nomeEsperado}").`
      );
      divergencias++;
    } else {
      console.log(`OK: ${alvo.codigo_ibge} -> ${nomeIbge}`);
    }
  }
  if (divergencias > 0) {
    console.warn(`Total de divergências encontradas: ${divergencias}`);
  }

  const db = getDb();
  runMigrations(db);
  upsertMunicipios(
    ALVOS.map((a) => ({
      codigo_ibge: a.codigo_ibge,
      nome: mapaIbge.get(a.codigo_ibge) || a.nomeEsperado,
      uf: 'RJ',
    })),
    db,
    false
  );

  // Lista das 18 tarefas (6 municípios x 3 doenças)
  const tarefas: Array<{ codigo_ibge: string; nome: string; doenca: Doenca }> = [];
  for (const alvo of ALVOS) {
    const nome = mapaIbge.get(alvo.codigo_ibge) || alvo.nomeEsperado;
    for (const doenca of DOENCAS) {
      tarefas.push({ codigo_ibge: alvo.codigo_ibge, nome, doenca });
    }
  }

  const coletadoEm = new Date().toISOString();
  const consolidado: ArquivoConsolidadoRj = {
    coletadoEm,
    fonte: 'InfoDengue',
    ano: 2026,
    municipios: {},
  };

  for (const alvo of ALVOS) {
    const nome = mapaIbge.get(alvo.codigo_ibge) || alvo.nomeEsperado;
    consolidado.municipios[alvo.codigo_ibge] = {
      nome,
      uf: 'RJ',
      doencas: { dengue: [], chikungunya: [], zika: [] },
    };
  }

  const relatorio: Array<{
    codigo_ibge: string;
    municipio: string;
    doenca: Doenca;
    semanas: number;
    status: string;
  }> = [];

  let cursor = 0;

  async function worker() {
    while (cursor < tarefas.length) {
      const idx = cursor++;
      const t = tarefas[idx];
      try {
        const itens = await consultarInfoDengue(t.codigo_ibge, t.doenca);
        const dataColetaItem = new Date().toISOString();

        salvarConsultaEAlertas(
          {
            codigo_ibge: t.codigo_ibge,
            nome_municipio: t.nome,
            uf: 'RJ',
            doenca: t.doenca,
            fonte: 'InfoDengue',
            modo_offline: false,
            data_coleta: dataColetaItem,
            itens,
            is_teste: false,
          },
          db
        );

        consolidado.municipios[t.codigo_ibge].doencas[t.doenca] = itens;
        relatorio.push({
          codigo_ibge: t.codigo_ibge,
          municipio: t.nome,
          doenca: t.doenca,
          semanas: itens.length,
          status: itens.length === 0 ? 'VAZIA (0 semanas)' : 'OK',
        });
      } catch (err) {
        relatorio.push({
          codigo_ibge: t.codigo_ibge,
          municipio: t.nome,
          doenca: t.doenca,
          semanas: 0,
          status: `ERRO: ${(err as Error).message}`,
        });
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  await Promise.all(Array.from({ length: MAX_CONCORRENCIA }, () => worker()));

  const saidaPath = path.resolve(process.cwd(), 'data', 'amostra_infodengue_rj.json');
  fs.writeFileSync(saidaPath, JSON.stringify(consolidado, null, 2), 'utf8');

  // Ordena relatório na ordem original dos alvos e doenças
  relatorio.sort((a, b) => {
    const ia = ALVOS.findIndex((x) => x.codigo_ibge === a.codigo_ibge);
    const ib = ALVOS.findIndex((x) => x.codigo_ibge === b.codigo_ibge);
    if (ia !== ib) return ia - ib;
    return DOENCAS.indexOf(a.doenca) - DOENCAS.indexOf(b.doenca);
  });

  console.log('\n=== Resumo da coleta por município e doença (2026) ===');
  console.table(relatorio);

  const vazias = relatorio.filter((r) => r.semanas === 0);
  console.log(`Arquivo consolidado salvo em: data/amostra_infodengue_rj.json`);
  console.log(
    `Séries vazias (${vazias.length}):`,
    vazias.map((v) => `${v.municipio} (${v.codigo_ibge}) - ${v.doenca}`).join(' | ') || 'Nenhuma'
  );

  const totalBanco = db.prepare('SELECT COUNT(*) AS total FROM alerta_semanal').get() as {
    total: number;
  };
  console.log('Total de linhas em alerta_semanal após coleta:', totalBanco.total);
}

main().catch((err) => {
  console.error('Erro na coleta:', err);
  process.exit(1);
});
