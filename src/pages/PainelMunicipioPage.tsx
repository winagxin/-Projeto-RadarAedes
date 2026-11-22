import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BookmarkCheck,
  BookmarkPlus,
  Info,
  Map,
  Minus,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { GraficoTendencia } from '../components/GraficoTendencia';
import { SemaforoCard } from '../components/SemaforoCard';
import { Doenca, MunicipioItem, RespostaAlertaMunicipio } from '../types';
import {
  formatarDataPtBr,
  formatarSemanaEpi,
  NOMES_DOENCA,
  rotuloTendencia,
} from '../utils/niveis';
import { MAX_SEGUIDOS } from '../utils/seguidos';

interface PainelMunicipioPageProps {
  geocode: string;
  doenca: Doenca;
  seguindo: boolean;
  totalSeguidos: number;
  onAlternarSeguir: (mun: MunicipioItem) => void;
  onAbrirComparacao: () => void;
  onChangeDoenca: (doenca: Doenca) => void;
  onVoltarInicio: () => void;
  onAbrirOrientacoes: (nivel: number | null) => void;
  onAbrirMapa: () => void;
}

function IconeTendencia({ tendencia }: { tendencia: RespostaAlertaMunicipio['tendencia'] }) {
  switch (tendencia) {
    case 'sobe':
      return <ArrowUpRight className="h-5 w-5 text-red-700" aria-hidden="true" />;
    case 'cai':
      return <ArrowDownRight className="h-5 w-5 text-emerald-700" aria-hidden="true" />;
    default:
      return <Minus className="h-5 w-5 text-slate-700" aria-hidden="true" />;
  }
}

export function PainelMunicipioPage({
  geocode,
  doenca,
  seguindo,
  totalSeguidos,
  onAlternarSeguir,
  onAbrirComparacao,
  onChangeDoenca,
  onVoltarInicio,
  onAbrirOrientacoes,
  onAbrirMapa,
}: PainelMunicipioPageProps) {
  const [dados, setDados] = useState<RespostaAlertaMunicipio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [avisoSeguir, setAvisoSeguir] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    fetch(`/api/alerta?geocode=${encodeURIComponent(geocode)}&doenca=${encodeURIComponent(doenca)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          throw new Error(json.erro || 'Erro ao buscar dados do município.');
        }
        return json as RespostaAlertaMunicipio;
      })
      .then((json) => {
        if (!cancelado) setDados(json);
      })
      .catch((err) => {
        if (!cancelado) setErro((err as Error).message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [geocode, doenca, tentativa]);

  const ultimaSemana = dados && dados.serie.length > 0 ? dados.serie[dados.serie.length - 1] : null;
  const infoTendencia = dados ? rotuloTendencia(dados.tendencia) : null;

  function aoClicarSeguir() {
    if (!dados) return;
    if (!seguindo && totalSeguidos >= MAX_SEGUIDOS) {
      setAvisoSeguir(
        `Você já segue ${MAX_SEGUIDOS} municípios. Remova um na tela Comparar para adicionar outro.`
      );
      return;
    }
    setAvisoSeguir(null);
    onAlternarSeguir(dados.municipio);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onVoltarInicio}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Trocar município
          </button>

          {dados && (
            <button
              type="button"
              onClick={aoClicarSeguir}
              aria-pressed={seguindo}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                seguindo
                  ? 'border-blue-800 bg-blue-50 text-blue-950 hover:bg-blue-100'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
              }`}
            >
              {seguindo ? (
                <>
                  <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                  Seguindo ({totalSeguidos}/{MAX_SEGUIDOS})
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
                  Seguir para comparar ({totalSeguidos}/{MAX_SEGUIDOS})
                </>
              )}
            </button>
          )}
        </div>

        {/* Seletor rápido de doença no painel */}
        <div
          role="group"
          aria-label="Selecionar doença no painel"
          className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1 self-start sm:self-auto"
        >
          {(['dengue', 'chikungunya', 'zika'] as Doenca[]).map((d) => {
            const ativo = doenca === d;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={ativo}
                onClick={() => onChangeDoenca(d)}
                className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  ativo ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                {NOMES_DOENCA[d]}
              </button>
            );
          })}
        </div>
      </div>

      {avisoSeguir && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <span>{avisoSeguir}</span>
          <button
            type="button"
            onClick={onAbrirComparacao}
            className="min-h-[36px] rounded-lg bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-950"
          >
            Gerenciar comparação
          </button>
        </div>
      )}

      {/* Estado de carregamento */}
      {carregando && (
        <div
          aria-busy="true"
          aria-live="polite"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <p className="text-sm font-medium text-slate-700">
            Carregando painel epidemiológico...
          </p>
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="h-28 w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" />
        </div>
      )}

      {/* Estado de erro */}
      {!carregando && erro && (
        <div role="alert" className="rounded-xl border border-red-700 bg-red-50 p-6 text-red-950">
          <h2 className="text-lg font-bold">Não foi possível carregar os dados</h2>
          <p className="mt-1 text-sm">{erro}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTentativa((t) => t + 1)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={onVoltarInicio}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo carregado */}
      {!carregando && !erro && dados && (
        <>
          <header className="space-y-1">
            <p className="text-sm text-slate-600">
              Código IBGE <span className="font-mono-tabular">{dados.municipio.codigo_ibge}</span>
              {dados.municipio.uf ? ` · ${dados.municipio.uf}` : ''}
              {dados.municipio.populacao
                ? ` · População: ${dados.municipio.populacao.toLocaleString('pt-BR')} hab.`
                : ''}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {dados.municipio.nome} — {NOMES_DOENCA[dados.doenca]}
            </h1>
          </header>

          {dados.modoOffline && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
            >
              <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>Dados de {formatarDataPtBr(dados.atualizadoEm)} (modo offline)</span>
            </div>
          )}

          {/* Estado vazio (ex.: Zika sem registros no período) */}
          {dados.vazio ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold text-slate-900">
                Sem registros recentes para {NOMES_DOENCA[dados.doenca]}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">
                A fonte oficial (InfoDengue) respondeu sem séries semanais ativas para{' '}
                <strong>{NOMES_DOENCA[dados.doenca]}</strong> em{' '}
                <strong>{dados.municipio.nome}</strong> nas últimas semanas consultadas.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onChangeDoenca('dengue')}
                  className="min-h-[44px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Ver dados de Dengue
                </button>
                <button
                  type="button"
                  onClick={onVoltarInicio}
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Escolher outro município
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* Semáforo principal */}
              <SemaforoCard
                nivel={dados.nivelAtual}
                semanaAtual={dados.semanaAtual}
                dataIniSe={ultimaSemana?.data_ini_se}
              />

              {/* Aviso obrigatório sobre atraso de notificação na semana mais recente */}
              {dados.semanaMaisRecenteIncompleta && dados.semanaAtual && (
                <div
                  role="note"
                  className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800"
                >
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden="true" />
                  <p>
                    <strong>
                      Atenção sobre a semana mais recente ({formatarSemanaEpi(dados.semanaAtual)}):
                    </strong>{' '}
                    os números desta semana podem estar incompletos por atraso de notificação e
                    costumam ser atualizados nas próximas coletas.
                  </p>
                </div>
              )}

              {/* Resumo numérico + Tendência */}
              <section
                aria-label="Indicadores da semana e tendência"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-600">Casos estimados (última SE)</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950 tabular-nums">
                    {ultimaSemana?.casos_est !== null && ultimaSemana?.casos_est !== undefined
                      ? ultimaSemana.casos_est.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })
                      : 'N/D'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">
                    Intervalo:{' '}
                    {ultimaSemana?.casos_est_min !== null &&
                    ultimaSemana?.casos_est_max !== null &&
                    ultimaSemana !== null
                      ? `${Math.round(ultimaSemana.casos_est_min)} a ${Math.round(
                          ultimaSemana.casos_est_max
                        )}`
                      : 'N/D'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-600">Casos notificados</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950 tabular-nums">
                    {ultimaSemana?.casos !== null && ultimaSemana?.casos !== undefined
                      ? ultimaSemana.casos.toLocaleString('pt-BR')
                      : 'N/D'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Sujeito a revisão por atraso de digitação
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-600">Incidência / 100 mil hab.</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950 tabular-nums">
                    {ultimaSemana?.incidencia_100k !== null &&
                    ultimaSemana?.incidencia_100k !== undefined
                      ? ultimaSemana.incidencia_100k.toFixed(1)
                      : 'N/D'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Taxa semanal estimada</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-600">
                    Tendência (2 últimas semanas completas)
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <IconeTendencia tendencia={dados.tendencia} />
                    <span className="text-xl font-bold text-slate-950">
                      {infoTendencia?.titulo.replace('Tendência: ', '')}
                    </span>
                    {dados.variacaoPercentual !== null && (
                      <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                        ({dados.variacaoPercentual > 0 ? '+' : ''}
                        {dados.variacaoPercentual}%)
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-700 tabular-nums">
                    {dados.casosAnterior !== null && dados.casosAtual !== null ? (
                      <>
                        de{' '}
                        <strong>
                          {dados.casosAnterior.toLocaleString('pt-BR', {
                            maximumFractionDigits: 1,
                          })}
                        </strong>{' '}
                        para{' '}
                        <strong>
                          {dados.casosAtual.toLocaleString('pt-BR', {
                            maximumFractionDigits: 1,
                          })}
                        </strong>{' '}
                        casos estimados
                        {dados.semanasComparadas
                          ? ` (${formatarSemanaEpi(dados.semanasComparadas[0])} → ${formatarSemanaEpi(
                              dados.semanasComparadas[1]
                            )})`
                          : ''}
                      </>
                    ) : (
                      infoTendencia?.explicacao
                    )}
                  </p>
                  {dados.poucosCasos && (
                    <p className="mt-1 text-xs font-semibold text-amber-900">
                      Aviso: poucos casos: variação instável
                    </p>
                  )}
                </div>
              </section>

              {/* Gráfico das últimas 12 semanas + alternativa em tabela */}
              <GraficoTendencia serie={dados.serie} nomeMunicipio={dados.municipio.nome} />

              {/* Atalhos para próximas ações */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onAbrirOrientacoes(dados.nivelAtual)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  O que fazer no Nível {dados.nivelAtual ?? 1}
                </button>
                <button
                  type="button"
                  onClick={onAbrirMapa}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <Map className="h-4 w-4" aria-hidden="true" />
                  Ver mapa de {dados.municipio.uf || 'UF'}
                </button>
                {totalSeguidos > 0 && (
                  <button
                    type="button"
                    onClick={onAbrirComparacao}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    Comparar municípios seguidos ({totalSeguidos}/{MAX_SEGUIDOS})
                  </button>
                )}
              </div>
            </>
          )}

          <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">
            Fonte: {dados.fonte}, atualizado em {formatarDataPtBr(dados.atualizadoEm)}
          </p>
        </>
      )}
    </div>
  );
}
