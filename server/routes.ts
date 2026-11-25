import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { buscarUltimosAlertasPorUf, type Doenca, getActiveDbKind } from './db.ts';
import {
  listarEstados,
  listarMunicipios,
  obterAlertaMunicipio,
  obterMalhaUf,
  streamMapaUf,
} from './infodengue.ts';

const DOENCAS_VALIDAS = new Set<Doenca>(['dengue', 'chikungunya', 'zika']);

function validarDoenca(raw: unknown): Doenca {
  const val = String(raw || 'dengue').toLowerCase() as Doenca;
  return DOENCAS_VALIDAS.has(val) ? val : 'dengue';
}

function normalizarTexto(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function criarApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, servico: 'RadarAedes API', banco: getActiveDbKind() });
  });

  router.get('/estados', async (_req, res) => {
    try {
      const dados = await listarEstados();
      res.json(dados);
    } catch (err) {
      res.status(502).json({ erro: (err as Error).message });
    }
  });

  router.get('/municipios', async (req, res) => {
    const uf = String(req.query.uf || 'RJ').toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      res.status(400).json({ erro: 'Parâmetro uf inválido. Informe sigla de 2 letras (ex.: RJ).' });
      return;
    }

    try {
      const resultado = await listarMunicipios(uf);
      const q = normalizarTexto(String(req.query.q || ''));
      const filtrados = q
        ? resultado.municipios.filter((m) => normalizarTexto(m.nome).includes(q))
        : resultado.municipios;

      res.json({
        ...resultado,
        total: filtrados.length,
        municipios: filtrados,
      });
    } catch (err) {
      res.status(502).json({ erro: (err as Error).message });
    }
  });

  router.get('/alerta', async (req, res) => {
    const geocode = String(req.query.geocode || '3304557').trim();
    if (!/^\d{7}$/.test(geocode)) {
      res.status(400).json({ erro: 'Parâmetro geocode inválido. Informe código IBGE de 7 dígitos.' });
      return;
    }

    const doenca = validarDoenca(req.query.doenca);
    try {
      const alerta = await obterAlertaMunicipio(geocode, doenca);
      res.json(alerta);
    } catch (err) {
      res.status(502).json({ erro: (err as Error).message });
    }
  });

  /**
   * Snapshot JSON imediato do Mapa da UF (lê malha + estado atual do SQLite).
   */
  router.get('/mapa-uf', async (req, res) => {
    const uf = String(req.query.uf || 'RJ').toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      res.status(400).json({ erro: 'Parâmetro uf inválido.' });
      return;
    }

    const doenca = validarDoenca(req.query.doenca);
    try {
      const [listaMun, malha] = await Promise.all([listarMunicipios(uf), obterMalhaUf(uf)]);
      const itens = await buscarUltimosAlertasPorUf(uf, doenca);
      const nomeBanco = getActiveDbKind() === 'postgresql' ? 'PostgreSQL' : 'SQLite';
      res.json({
        uf,
        doenca,
        totalMunicipios: itens.length,
        geojson: malha.geojson,
        itens,
        fonte: `IBGE Malhas + InfoDengue (cache ${nomeBanco})`,
        atualizadoEm: malha.dataColeta,
        modoOffline: listaMun.modoOffline || malha.modoOffline,
      });
    } catch (err) {
      res.status(502).json({ erro: (err as Error).message });
    }
  });

  /**
   * Stream progressivo (SSE) do Mapa da UF: envia malha + cache na hora e depois
   * lotes conforme o servidor consulta o InfoDengue com concorrência controlada.
   */
  router.get('/mapa-uf/stream', async (req, res) => {
    const uf = String(req.query.uf || 'RJ').toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      res.status(400).json({ erro: 'Parâmetro uf inválido.' });
      return;
    }

    const doenca = validarDoenca(req.query.doenca);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => {
      controller.abort();
    });

    try {
      await streamMapaUf(
        uf,
        doenca,
        (evento) => {
          if (!res.writableEnded) {
            res.write(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`);
          }
        },
        controller.signal
      );
    } catch (err) {
      if (!res.writableEnded) {
        res.write(`event: erro\ndata: ${JSON.stringify({ erro: (err as Error).message })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  router.get('/orientacoes', (req, res) => {
    const filePath = path.resolve(process.cwd(), 'content', 'orientacoes.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ erro: 'Arquivo de orientações não encontrado.' });
      return;
    }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      atualizado_em?: string;
      fontes?: Array<{ titulo: string; url: string }>;
      niveis: Array<{ nivel: number }>;
    };

    const nivelQuery = req.query.nivel ? Number(req.query.nivel) : null;
    if (nivelQuery && [1, 2, 3, 4].includes(nivelQuery)) {
      const encontrado = raw.niveis.find((n) => n.nivel === nivelQuery);
      res.json({
        atualizado_em: raw.atualizado_em,
        fontes: raw.fontes ?? [],
        nivel: encontrado ?? null,
      });
      return;
    }

    res.json(raw);
  });

  router.get('/sobre', async (_req, res) => {
    try {
      const alertasRj = await buscarUltimosAlertasPorUf('RJ', 'dengue');
      const alertaRj = alertasRj.find((item) => item.versao_modelo !== null);
      res.json({
        versaoModelo: alertaRj?.versao_modelo ?? '2026-11-17',
        atualizadoEm: alertaRj?.versao_modelo ?? new Date().toISOString(),
        fonte: 'InfoDengue e IBGE',
      });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  return router;
}
