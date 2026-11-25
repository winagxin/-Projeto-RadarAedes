import { useRef, useState } from 'react';
import { AlertaSemanalItem } from '../types';
import {
  formatarDataPtBr,
  formatarNumeroPtBr,
  formatarSemanaEpi,
  obterConfigNivel,
} from '../utils/niveis';

interface GraficoTendenciaProps {
  serie: AlertaSemanalItem[];
  nomeMunicipio: string;
}

type MetricaGrafico = 'casos_est' | 'incidencia_100k';

/**
 * Calcula valores redondos no eixo vertical (ex.: 0, 5, 10, 15 ou 0, 100, 200, 300, 400)
 * para que cada rótulo coincida exatamente com uma linha da grade.
 */
function calcularEscalaRedonda(maxBruto: number, divisoesAlvo = 4): { yMax: number; ticks: number[] } {
  const seguro = maxBruto <= 0 ? 4 : maxBruto;
  const passoBruto = seguro / divisoesAlvo;
  const magnitude = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const normalizado = passoBruto / magnitude;

  let passoBonito = 1;
  if (normalizado <= 1) passoBonito = 1;
  else if (normalizado <= 2) passoBonito = 2;
  else if (normalizado <= 2.5 && magnitude >= 10) passoBonito = 2.5;
  else if (normalizado <= 5) passoBonito = 5;
  else passoBonito = 10;

  const passo = Math.max(1, passoBonito * magnitude);
  const qtdDivisoes = Math.max(2, Math.ceil(seguro / passo));
  const yMax = passo * qtdDivisoes;
  const ticks = Array.from({ length: qtdDivisoes + 1 }, (_, i) => Number((i * passo).toFixed(4)));
  return { yMax, ticks };
}

function formaPorNivel(nivel: number): string {
  switch (nivel) {
    case 1:
      return 'Círculo';
    case 2:
      return 'Quadrado';
    case 3:
      return 'Triângulo';
    default:
      return 'Losango';
  }
}

function PontoFormaSvg({
  nivel,
  x,
  y,
  fill,
  focado,
}: {
  nivel: number;
  x: number;
  y: number;
  fill: string;
  focado: boolean;
}) {
  const r = focado ? 7.5 : 5.5;
  const stroke = '#ffffff';
  const strokeWidth = focado ? 2.2 : 1.8;

  if (nivel === 1) {
    return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (nivel === 2) {
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={1}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (nivel === 3) {
    const h = r * 1.25;
    const w = r * 1.2;
    const pts = `${x},${y - h} ${x + w},${y + h * 0.85} ${x - w},${y + h * 0.85}`;
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  // Nível 4: Losango
  const d = r * 1.3;
  const pts = `${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`;
  return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function GraficoTendencia({ serie, nomeMunicipio }: GraficoTendenciaProps) {
  const [metrica, setMetrica] = useState<MetricaGrafico>('casos_est');
  const [indiceFoco, setIndiceFoco] = useState<number | null>(
    serie.length > 0 ? serie.length - 1 : null
  );
  const [dicaVisivel, setDicaVisivel] = useState(false);
  const [mostrarTabela, setMostrarTabela] = useState(false);
  const pontosRefs = useRef<Array<SVGGElement | null>>([]);

  if (serie.length === 0) {
    return null;
  }

  const width = 760;
  const height = 290;
  const padLeft = 58;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 46;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const valores = serie.map((item) =>
    metrica === 'casos_est' ? item.casos_est ?? 0 : item.incidencia_100k ?? 0
  );
  const maxVal = Math.max(...valores, 1);
  const { yMax, ticks } = calcularEscalaRedonda(maxVal, 4);

  const pontos = serie.map((item, idx) => {
    const val = metrica === 'casos_est' ? item.casos_est ?? 0 : item.incidencia_100k ?? 0;
    const x =
      serie.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (serie.length - 1)) * plotW;
    const y = padTop + plotH - (val / yMax) * plotH;
    return { x, y, val, item, idx };
  });

  const pathLine = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    pontos.length > 1
      ? `${pathLine} L ${pontos[pontos.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${pontos[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const ticksY = ticks.map((valor) => ({
    valor,
    y: padTop + plotH - (valor / yMax) * plotH,
  }));

  const pontoSelecionado =
    indiceFoco !== null && pontos[indiceFoco] ? pontos[indiceFoco] : pontos[pontos.length - 1];

  const tituloMetrica =
    metrica === 'casos_est' ? 'Casos estimados por semana' : 'Casos por 100 mil habitantes';

  const larguraFaixa = serie.length > 1 ? plotW / (serie.length - 1) : plotW;
  const nivelPonto = pontoSelecionado ? obterConfigNivel(pontoSelecionado.item.nivel) : null;
  const proporcaoX = pontoSelecionado ? pontoSelecionado.x / width : 0.5;
  const alinhamentoDica =
    proporcaoX < 0.28
      ? 'left-2'
      : proporcaoX > 0.72
      ? 'right-2'
      : 'left-1/2 -translate-x-1/2';

  function selecionarIndice(novoIdx: number, moverFoco = false) {
    setIndiceFoco(novoIdx);
    setDicaVisivel(true);
    if (moverFoco) {
      requestAnimationFrame(() => {
        pontosRefs.current[novoIdx]?.focus();
      });
    }
  }

  return (
    <section
      aria-labelledby="titulo-grafico-tendencia"
      className="radar-cartao rounded-xl border border-[#E2DBD0] bg-white p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="titulo-grafico-tendencia" className="text-lg font-bold text-[#0F2744]">
            Evolução das últimas {serie.length} semanas
          </h3>
          <p className="text-sm text-slate-600">
            {tituloMetrica} em {nomeMunicipio}. Passe o mouse, toque ou use as setas para ler cada
            semana.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Selecionar métrica do gráfico"
            className="flex flex-wrap gap-1 rounded-lg border border-[#D4CCC0] bg-[#F3EFE7] p-1"
          >
            <button
              type="button"
              onClick={() => setMetrica('casos_est')}
              aria-pressed={metrica === 'casos_est'}
              className={`radar-interativo min-h-[38px] rounded-md px-3 py-1.5 text-center text-xs font-semibold leading-tight ${
                metrica === 'casos_est'
                  ? 'bg-[#0F2744] text-white'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              Casos estimados
            </button>
            <button
              type="button"
              onClick={() => setMetrica('incidencia_100k')}
              aria-pressed={metrica === 'incidencia_100k'}
              className={`radar-interativo min-h-[38px] rounded-md px-3 py-1.5 text-center text-xs font-semibold leading-tight ${
                metrica === 'incidencia_100k'
                  ? 'bg-[#0F2744] text-white'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              Casos por 100 mil habitantes
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarTabela((v) => !v)}
            aria-expanded={mostrarTabela}
            className="radar-interativo min-h-[40px] rounded-lg border border-[#CFC7BA] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2744] hover:bg-[#FAF7F2]"
          >
            {mostrarTabela ? 'Ocultar tabela em texto' : 'Ver alternativa em tabela'}
          </button>
        </div>
      </div>

      {/* Legenda de forma + cor + nível em texto */}
      <ul
        aria-label="Legenda das formas e cores por nível de alerta"
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-800"
      >
        <li className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="#15803d" />
          </svg>
          <span>Nível 1: Verde (Círculo)</span>
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="#d97706" />
          </svg>
          <span>Nível 2: Amarelo (Quadrado)</span>
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <polygon points="8,2 14,13.5 2,13.5" fill="#c2410c" />
          </svg>
          <span>Nível 3: Laranja (Triângulo)</span>
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="#b91c1c" />
          </svg>
          <span>Nível 4: Vermelho (Losango)</span>
        </li>
      </ul>

      {/* Leitura acessível da semana selecionada / em foco */}
      {pontoSelecionado && (
        <div
          aria-live="polite"
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#E2DBD0] bg-[#FAF7F2] px-4 py-2.5 text-sm text-[#17212B]"
        >
          <span className="font-semibold tabular-nums">
            {formatarSemanaEpi(pontoSelecionado.item.semana_epi, pontoSelecionado.item.data_ini_se)}
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="tabular-nums">
            Casos est.:{' '}
            <strong>{formatarNumeroPtBr(pontoSelecionado.item.casos_est, 1, 0)}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="tabular-nums">
            Casos por 100 mil habitantes:{' '}
            <strong>{formatarNumeroPtBr(pontoSelecionado.item.incidencia_100k, 1, 1)}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            {nivelPonto?.rotulo ?? `Nível ${pontoSelecionado.item.nivel}`} (
            {formaPorNivel(pontoSelecionado.item.nivel)})
          </span>
        </div>
      )}

      {/* Gráfico SVG responsivo com linha-guia vertical e dica flutuante */}
      <div
        className="relative mt-4 w-full"
        onMouseLeave={() => setDicaVisivel(false)}
      >
        {dicaVisivel && pontoSelecionado && (
          <div
            role="status"
            aria-hidden="true"
            className={`radar-entrada pointer-events-none absolute top-1 z-20 w-64 max-w-[calc(100%-1rem)] rounded-lg border border-[#1B4965] bg-[#0F2744] px-3 py-2 text-xs text-white shadow-lg ${alinhamentoDica}`}
          >
            <p className="font-semibold tabular-nums">
              {formatarSemanaEpi(
                pontoSelecionado.item.semana_epi,
                pontoSelecionado.item.data_ini_se
              )}
            </p>
            <p className="mt-1 tabular-nums text-stone-100">
              {metrica === 'casos_est'
                ? `${formatarNumeroPtBr(pontoSelecionado.item.casos_est, 1, 0)} casos estimados`
                : `${formatarNumeroPtBr(
                    pontoSelecionado.item.incidencia_100k,
                    1,
                    1
                  )} casos por 100 mil hab.`}
            </p>
            <p className="mt-0.5 text-stone-200">
              {nivelPonto?.rotulo ?? `Nível ${pontoSelecionado.item.nivel}`} (
              {formaPorNivel(pontoSelecionado.item.nivel)})
            </p>
          </div>
        )}

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby="titulo-grafico-tendencia desc-grafico-tendencia"
            className="h-auto min-w-[560px] w-full select-none"
          >
            <desc id="desc-grafico-tendencia">
              Gráfico de linha mostrando {tituloMetrica.toLowerCase()} ao longo de {serie.length}{' '}
              semanas epidemiológicas em {nomeMunicipio}. Os pontos diferenciam os níveis por forma
              e cor (círculo verde, quadrado amarelo, triângulo laranja, losango vermelho). A tabela
              alternativa contém todos os valores e níveis em texto.
            </desc>

            {/* Linhas de grade horizontais com rótulos exatamente alinhados */}
            {ticksY.map((t, i) => (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={t.y}
                  x2={width - padRight}
                  y2={t.y}
                  stroke={i === 0 ? '#94a3b8' : '#e2dbd0'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 10}
                  y={t.y + 4}
                  textAnchor="end"
                  className="fill-slate-700 text-[11px] tabular-nums"
                >
                  {t.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </text>
              </g>
            ))}

            {/* Linha-guia vertical acompanhando a semana em foco */}
            {pontoSelecionado && (
              <line
                x1={pontoSelecionado.x}
                y1={padTop}
                x2={pontoSelecionado.x}
                y2={padTop + plotH}
                stroke="#1B4965"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity={dicaVisivel ? 0.85 : 0.4}
              />
            )}

            {/* Área sob a curva */}
            {areaPath && <path d={areaPath} fill="#1B4965" fillOpacity="0.08" />}

            {/* Linha principal com animação curta de desenho no carregamento */}
            {pontos.length > 1 && (
              <path
                key={`${metrica}-${serie[0]?.semana_epi ?? 0}-${serie.length}`}
                pathLength={1}
                d={pathLine}
                fill="none"
                stroke="#0F2744"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="radar-linha-grafico"
              />
            )}

            {/* Áreas de toque amplas por semana + rótulos do eixo X + pontos interativos */}
            {pontos.map((p) => {
              const cfg = obterConfigNivel(p.item.nivel);
              const isFocado = pontoSelecionado?.idx === p.idx;
              const labelCurto = String(p.item.semana_epi).slice(4);
              const hitX = Math.max(padLeft, p.x - larguraFaixa / 2);
              const hitW = Math.min(width - padRight - hitX, larguraFaixa);

              return (
                <g key={p.item.semana_epi}>
                  <rect
                    x={hitX}
                    y={padTop}
                    width={Math.max(16, hitW)}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => selecionarIndice(p.idx)}
                    onClick={() => selecionarIndice(p.idx)}
                  />
                  <text
                    x={p.x}
                    y={height - 16}
                    textAnchor="middle"
                    className={`text-[11px] tabular-nums ${
                      isFocado ? 'fill-[#0F2744] font-bold' : 'fill-slate-700'
                    }`}
                  >
                    S{labelCurto}
                  </text>
                  <g
                    ref={(el) => {
                      pontosRefs.current[p.idx] = el;
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatarSemanaEpi(p.item.semana_epi, p.item.data_ini_se)}: ${
                      metrica === 'casos_est'
                        ? `${formatarNumeroPtBr(p.val, 1, 0)} casos estimados`
                        : `${formatarNumeroPtBr(p.val, 1, 1)} casos por 100 mil habitantes`
                    }, ${cfg?.rotulo || `nível ${p.item.nivel}`} (${formaPorNivel(p.item.nivel)})`}
                    onFocus={() => selecionarIndice(p.idx)}
                    onBlur={() => setDicaVisivel(false)}
                    onMouseEnter={() => selecionarIndice(p.idx)}
                    onClick={() => selecionarIndice(p.idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' && p.idx < pontos.length - 1) {
                        e.preventDefault();
                        selecionarIndice(p.idx + 1, true);
                      } else if (e.key === 'ArrowLeft' && p.idx > 0) {
                        e.preventDefault();
                        selecionarIndice(p.idx - 1, true);
                      } else if (e.key === 'Escape') {
                        setDicaVisivel(false);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <PontoFormaSvg
                      nivel={p.item.nivel}
                      x={p.x}
                      y={p.y}
                      fill={cfg?.mapFillHex || '#0F2744'}
                      focado={isFocado}
                    />
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Alternativa completa em texto/tabela */}
      <div className={mostrarTabela ? 'mt-5 overflow-x-auto border-t border-[#E2DBD0] pt-4' : 'sr-only'}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="pb-2 text-left text-xs font-medium text-slate-600">
            Série histórica semanal de {nomeMunicipio} (últimas {serie.length} semanas) — nível em
            texto
          </caption>
          <thead>
            <tr className="border-b border-[#E2DBD0] text-xs font-semibold text-slate-700">
              <th scope="col" className="py-2 pr-4">Semana</th>
              <th scope="col" className="py-2 pr-4">Início</th>
              <th scope="col" className="py-2 pr-4">Nível (texto)</th>
              <th scope="col" className="py-2 pr-4 text-right">Casos estimados</th>
              <th scope="col" className="py-2 pr-4 text-right">Casos notificados</th>
              <th scope="col" className="py-2 text-right">Casos por 100 mil habitantes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE1] tabular-nums">
            {serie.map((s) => {
              const cfg = obterConfigNivel(s.nivel);
              return (
                <tr key={s.semana_epi} className="hover:bg-[#FAF7F2]">
                  <td className="py-2 pr-4 font-medium text-[#17212B]">
                    {formatarSemanaEpi(s.semana_epi, s.data_ini_se)}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">{formatarDataPtBr(s.data_ini_se)}</td>
                  <td className="py-2 pr-4 text-[#17212B]">
                    {cfg?.rotulo ?? `Nível ${s.nivel}`}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium text-[#17212B]">
                    {formatarNumeroPtBr(s.casos_est, 1, 0)}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700">
                    {s.casos !== null ? s.casos.toLocaleString('pt-BR') : 'N/D'}
                  </td>
                  <td className="py-2 text-right text-slate-700">
                    {formatarNumeroPtBr(s.incidencia_100k, 2, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
