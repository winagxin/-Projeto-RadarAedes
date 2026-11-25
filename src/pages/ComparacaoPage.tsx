import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Flag,
  Info,
  Minus,
  OctagonAlert,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { DicaTermo } from '../components/DicaTermo';
import { NumeroAnimado } from '../components/NumeroAnimado';
import { RodapeFonte } from '../components/RodapeFonte';
import {
  Doenca,
  EstadoItem,
  MunicipioItem,
  MunicipioSeguido,
  RespostaAlertaMunicipio,
} from '../types';
import {
  formatarDataPtBr,
  formatarNumeroPtBr,
  formatarPercentualPtBr,
  formatarSemanaEpi,
  NOMES_DOENCA,
  obterConfigNivel,
  rotuloTendencia,
} from '../utils/niveis';
import { MAX_SEGUIDOS } from '../utils/seguidos';

interface ComparacaoPageProps {
  seguidos: MunicipioSeguido[];
  doenca: Doenca;
  onChangeDoenca: (d: Doenca) => void;
  onAdicionarSeguido: (mun: MunicipioSeguido) => void;
  onRemoverSeguido: (codigoIbge: string) => void;
  onAbrirPainel: (mun: MunicipioSeguido) => void;
}

interface EstadoItemComparacao {
  seguido: MunicipioSeguido;
  carregando: boolean;
  erro: string | null;
  dados: RespostaAlertaMunicipio | null;
}

function IconeNivel({ nivel }: { nivel: number | null }) {
  switch (nivel) {
    case 1:
      return <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
    case 2:
      return <AlertCircle className="h-5 w-5" aria-hidden="true" />;
    case 3:
      return <AlertTriangle className="h-5 w-5" aria-hidden="true" />;
    case 4:
      return <OctagonAlert className="h-5 w-5" aria-hidden="true" />;
    default:
      return <Minus className="h-5 w-5" aria-hidden="true" />;
  }
}

export function ComparacaoPage({
  seguidos,
  doenca,
  onChangeDoenca,
  onAdicionarSeguido,
  onRemoverSeguido,
  onAbrirPainel,
}: ComparacaoPageProps) {
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [ufAdd, setUfAdd] = useState('RJ');
  const [municipiosUf, setMunicipiosUf] = useState<MunicipioItem[]>([]);
  const [buscaMun, setBuscaMun] = useState('');
  const [munSelecionadoCodigo, setMunSelecionadoCodigo] = useState('');
  const [carregandoListaMun, setCarregandoListaMun] = useState(false);

  const [resultados, setResultados] = useState<Record<string, EstadoItemComparacao>>({});
  const [removendoCodigos, setRemovendoCodigos] = useState<string[]>([]);
  const [tentativa, setTentativa] = useState(0);
  const timeoutsRef = useRef<number[]>([]);

  const ufSelectId = useId();
  const munSelectId = useId();
  const filtroMunId = useId();

  useEffect(() => {
    fetch('/api/estados')
      .then((r) => r.json())
      .then((d) => setEstados(d.estados || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCarregandoListaMun(true);
    fetch(`/api/municipios?uf=${encodeURIComponent(ufAdd)}`)
      .then((r) => r.json())
      .then((d) => {
        const lista: MunicipioItem[] = d.municipios || [];
        setMunicipiosUf(lista);
        setMunSelecionadoCodigo(lista[0]?.codigo_ibge ?? '');
      })
      .catch(() => setMunicipiosUf([]))
      .finally(() => setCarregandoListaMun(false));
  }, [ufAdd]);

  const municipiosFiltrados = useMemo(() => {
    const q = buscaMun
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!q) return municipiosUf;
    return municipiosUf.filter((m) =>
      m.nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(q)
    );
  }, [municipiosUf, buscaMun]);

  useEffect(() => {
    if (municipiosFiltrados.length > 0) {
      if (!municipiosFiltrados.some((m) => m.codigo_ibge === munSelecionadoCodigo)) {
        setMunSelecionadoCodigo(municipiosFiltrados[0].codigo_ibge);
      }
    } else {
      setMunSelecionadoCodigo('');
    }
  }, [municipiosFiltrados, munSelecionadoCodigo]);

  // Busca os alertas dos municípios seguidos
  useEffect(() => {
    let cancelado = false;

    if (seguidos.length === 0) {
      setResultados({});
      return;
    }

    const inicial: Record<string, EstadoItemComparacao> = {};
    for (const s of seguidos) {
      inicial[s.codigo_ibge] = { seguido: s, carregando: true, erro: null, dados: null };
    }
    setResultados(inicial);

    seguidos.forEach((s) => {
      fetch(
        `/api/alerta?geocode=${encodeURIComponent(s.codigo_ibge)}&doenca=${encodeURIComponent(
          doenca
        )}`
      )
        .then(async (r) => {
          const json = await r.json();
          if (!r.ok) throw new Error(json.erro || 'Falha ao consultar município');
          return json as RespostaAlertaMunicipio;
        })
        .then((dados) => {
          if (cancelado) return;
          setResultados((prev) => ({
            ...prev,
            [s.codigo_ibge]: { seguido: s, carregando: false, erro: null, dados },
          }));
        })
        .catch((err) => {
          if (cancelado) return;
          setResultados((prev) => ({
            ...prev,
            [s.codigo_ibge]: {
              seguido: s,
              carregando: false,
              erro: (err as Error).message,
              dados: null,
            },
          }));
        });
    });

    return () => {
      cancelado = true;
    };
  }, [seguidos, doenca, tentativa]);

  function aoAdicionar(e: React.FormEvent) {
    e.preventDefault();
    const alvo = municipiosUf.find((m) => m.codigo_ibge === munSelecionadoCodigo);
    if (!alvo) return;
    onAdicionarSeguido({
      codigo_ibge: alvo.codigo_ibge,
      nome: alvo.nome,
      uf: alvo.uf || ufAdd,
    });
  }

  function adicionarSugestoesRj() {
    const iniciais: MunicipioSeguido[] = [
      { codigo_ibge: '3304557', nome: 'Rio de Janeiro', uf: 'RJ' },
      { codigo_ibge: '3303302', nome: 'Niterói', uf: 'RJ' },
      { codigo_ibge: '3301702', nome: 'Duque de Caxias', uf: 'RJ' },
    ];
    for (const item of iniciais) {
      onAdicionarSeguido(item);
    }
  }

  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current) {
        window.clearTimeout(t);
      }
    };
  }, []);

  function solicitarRemocao(codigoIbge: string) {
    if (removendoCodigos.includes(codigoIbge)) return;

    const prefereReduzido =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefereReduzido) {
      onRemoverSeguido(codigoIbge);
      return;
    }

    setRemovendoCodigos((prev) => [...prev, codigoIbge]);
    const id = window.setTimeout(() => {
      setRemovendoCodigos((prev) => prev.filter((c) => c !== codigoIbge));
      onRemoverSeguido(codigoIbge);
    }, 190);
    timeoutsRef.current.push(id);
  }

  const algumOffline = Object.values(resultados).some((r) => r.dados?.modoOffline);
  const primeiroComDados = Object.values(resultados).find((r) => r.dados)?.dados;
  const dataMaisRecente =
    primeiroComDados?.dataColeta || primeiroComDados?.atualizadoEm || new Date().toISOString();
  const modeloMaisRecente = primeiroComDados?.versaoModelo || null;

  const niveisComparaveis = seguidos
    .map((s) => resultados[s.codigo_ibge]?.dados)
    .filter((d): d is RespostaAlertaMunicipio => Boolean(d && !d.vazio && d.nivelAtual !== null))
    .map((d) => d.nivelAtual as number);
  const maiorNivel = niveisComparaveis.length >= 2 ? Math.max(...niveisComparaveis) : null;
  const menorNivel = niveisComparaveis.length >= 2 ? Math.min(...niveisComparaveis) : null;
  const haDiferencaNivel =
    maiorNivel !== null && menorNivel !== null && maiorNivel > menorNivel;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Sem login · Escolha salva apenas no navegador ({seguidos.length} de {MAX_SEGUIDOS})
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Comparar municípios seguidos ({NOMES_DOENCA[doenca]})
          </h1>
        </div>

        <div
          role="group"
          aria-label="Selecionar doença para comparação"
          className="flex flex-wrap gap-1 self-start rounded-lg border border-slate-300 bg-slate-100 p-1 sm:self-auto"
        >
          {(['dengue', 'chikungunya', 'zika'] as Doenca[]).map((d) => {
            const ativo = doenca === d;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={ativo}
                onClick={() => onChangeDoenca(d)}
                className={`radar-interativo min-h-[38px] rounded-md px-3 py-1.5 text-center text-xs font-semibold leading-tight ${
                  ativo ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                {NOMES_DOENCA[d]}
              </button>
            );
          })}
        </div>
      </header>

      {/* Formulário para adicionar até 3 municípios */}
      <form
        onSubmit={aoAdicionar}
        aria-label="Adicionar município para seguir e comparar"
        className="radar-cartao rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-2">
            <label htmlFor={ufSelectId} className="block text-xs font-semibold text-slate-700">
              UF
            </label>
            <select
              id={ufSelectId}
              value={ufAdd}
              onChange={(e) => {
                setUfAdd(e.target.value);
                setBuscaMun('');
              }}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            >
              {estados.length === 0 ? (
                <option value="RJ">RJ</option>
              ) : (
                estados.map((uf) => (
                  <option key={uf.sigla} value={uf.sigla}>
                    {uf.sigla} — {uf.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor={filtroMunId} className="block text-xs font-semibold text-slate-700">
              Filtrar município
            </label>
            <input
              id={filtroMunId}
              type="search"
              value={buscaMun}
              onChange={(e) => setBuscaMun(e.target.value)}
              placeholder="Digite para filtrar..."
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            />
          </div>

          <div className="sm:col-span-4">
            <label htmlFor={munSelectId} className="block text-xs font-semibold text-slate-700">
              Selecionar município
            </label>
            <select
              id={munSelectId}
              disabled={carregandoListaMun || municipiosFiltrados.length === 0}
              value={munSelecionadoCodigo}
              onChange={(e) => setMunSelecionadoCodigo(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            >
              {municipiosFiltrados.length === 0 ? (
                <option value="">Nenhum município encontrado</option>
              ) : (
                municipiosFiltrados.map((m) => (
                  <option key={m.codigo_ibge} value={m.codigo_ibge}>
                    {m.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={
                seguidos.length >= MAX_SEGUIDOS ||
                !munSelecionadoCodigo ||
                seguidos.some((s) => s.codigo_ibge === munSelecionadoCodigo)
              }
              className="radar-interativo inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {seguidos.length >= MAX_SEGUIDOS
                ? `Limite de ${MAX_SEGUIDOS} atingido`
                : 'Seguir município'}
            </button>
          </div>
        </div>
      </form>

      {algumOffline && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Dados de {formatarDataPtBr(dataMaisRecente)} (modo offline)</span>
        </div>
      )}

      {/* Estado vazio dos cartões */}
      {seguidos.length === 0 ? (
        <section className="radar-cartao rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">Nenhum município seguido ainda</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-700">
            Adicione até {MAX_SEGUIDOS} municípios usando o formulário acima (ou clicando em
            &ldquo;Seguir para comparar&rdquo; no painel de qualquer município). A lista fica salva
            apenas no navegador deste dispositivo.
          </p>
          <button
            type="button"
            onClick={adicionarSugestoesRj}
            className="radar-interativo mt-4 min-h-[44px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Carregar exemplo (Rio de Janeiro, Niterói e Duque de Caxias)
          </button>
        </section>
      ) : (
        <>
          <div
            role="note"
            className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-xs sm:text-sm text-slate-800"
          >
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden="true" />
            <p>
              A semana mais recente pode estar incompleta por atraso de notificação. A tendência
              compara as duas últimas semanas completas.
            </p>
          </div>

          {/* Cartões comparativos lado a lado */}
          <section
            aria-label="Cartões comparativos dos municípios seguidos"
            className="grid gap-4 md:grid-cols-3"
          >
            {seguidos.map((mun) => {
              const item = resultados[mun.codigo_ibge];
              const d = item?.dados;
              const cfg = d && !d.vazio ? obterConfigNivel(d.nivelAtual) : null;
              const ultimaSe = d && d.serie.length > 0 ? d.serie[d.serie.length - 1] : null;
              const tend = d ? rotuloTendencia(d.tendencia) : null;
              const estaRemovendo = removendoCodigos.includes(mun.codigo_ibge);
              const ehMaiorNivel = Boolean(
                haDiferencaNivel && d && !d.vazio && d.nivelAtual === maiorNivel
              );

              return (
                <article
                  key={mun.codigo_ibge}
                  className={`${
                    estaRemovendo ? 'radar-saida' : 'radar-entrada'
                  } radar-cartao flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-slate-600">{mun.uf}</p>
                        <h2 className="text-lg font-bold text-slate-950">{mun.nome}</h2>
                        {ehMaiorNivel && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-[#0F2744] px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Flag className="h-3 w-3" aria-hidden="true" />
                            Maior nível
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={estaRemovendo}
                        onClick={() => solicitarRemocao(mun.codigo_ibge)}
                        aria-label={`Remover ${mun.nome} da comparação`}
                        title={`Remover ${mun.nome} da comparação`}
                        className="radar-interativo inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {item?.carregando && (
                      <div role="status" aria-busy="true" className="space-y-3 py-2">
                        <span className="sr-only">Carregando dados de {mun.nome}...</span>
                        <div className="h-14 rounded-lg bg-[#EAE4DA]" />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="h-10 rounded-lg bg-[#F3EFE7]" />
                          <div className="h-10 rounded-lg bg-[#F3EFE7]" />
                        </div>
                        <div className="h-10 rounded-lg bg-[#F3EFE7]" />
                      </div>
                    )}

                    {!item?.carregando && item?.erro && (
                      <div role="alert" className="rounded-lg border border-red-700 bg-red-50 p-3 text-xs text-red-950">
                        <p className="font-semibold">{item.erro}</p>
                        <button
                          type="button"
                          onClick={() => setTentativa((t) => t + 1)}
                          className="mt-2 inline-flex items-center gap-1 font-semibold underline"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          Tentar novamente
                        </button>
                      </div>
                    )}

                    {!item?.carregando && !item?.erro && d && (
                      <>
                        {d.vazio ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            Não há casos de {NOMES_DOENCA[doenca].toLowerCase()} registrados no
                            InfoDengue para este município em {new Date().getFullYear()}. Isso não
                            significa ausência de risco: pode haver atraso ou falta de notificação.
                          </div>
                        ) : (
                          <>
                            <div
                              className={`flex items-center gap-3 rounded-lg border-2 p-3 ${
                                cfg
                                  ? `${cfg.borderClass} ${cfg.bgCardClass} ${cfg.textClass}`
                                  : 'border-slate-300 bg-slate-100'
                              }`}
                            >
                              <IconeNivel nivel={d.nivelAtual} />
                              <div>
                                <p className="text-xs font-semibold">
                                  {d.semanaAtual
                                    ? formatarSemanaEpi(d.semanaAtual, ultimaSe?.data_ini_se)
                                    : 'Sem leitura'}
                                </p>
                                <p className="text-sm font-bold">
                                  {cfg ? cfg.rotulo : `Nível ${d.nivelAtual}`}
                                </p>
                              </div>
                            </div>

                            <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
                              <div>
                                <dt className="text-xs text-slate-600">
                                  <DicaTermo termo="casos_estimados" rotulo="Casos estimados" />
                                </dt>
                                <dd className="font-bold text-slate-950">
                                  <NumeroAnimado
                                    key={`cmp-est-${mun.codigo_ibge}-${doenca}`}
                                    valor={ultimaSe?.casos_est}
                                    maxCasas={1}
                                    minCasas={0}
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-600">
                                  <DicaTermo
                                    termo="incidencia_100k"
                                    rotulo="Casos por 100 mil habitantes"
                                  />
                                </dt>
                                <dd className="font-bold text-slate-950">
                                  <NumeroAnimado
                                    key={`cmp-inc-${mun.codigo_ibge}-${doenca}`}
                                    valor={ultimaSe?.incidencia_100k}
                                    maxCasas={1}
                                    minCasas={1}
                                  />
                                </dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-xs text-slate-600">
                                  <DicaTermo termo="tendencia" rotulo="Tendência" />
                                </dt>
                                <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900">
                                  {d.tendencia === 'sobe' ? (
                                    <ArrowUpRight className="h-4 w-4 text-red-700" aria-hidden="true" />
                                  ) : d.tendencia === 'cai' ? (
                                    <ArrowDownRight className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                                  ) : (
                                    <Minus className="h-4 w-4 text-slate-700" aria-hidden="true" />
                                  )}
                                  <span>{tend?.titulo.replace('Tendência: ', '')}</span>
                                  {d.variacaoPercentual !== null && (
                                    <span className="font-mono-tabular text-xs text-slate-700">
                                      (
                                      <NumeroAnimado
                                        key={`cmp-pct-${mun.codigo_ibge}-${doenca}`}
                                        valor={d.variacaoPercentual}
                                        modoPercentual
                                      />
                                      )
                                    </span>
                                  )}
                                </dd>
                                {d.casosAnterior !== null && d.casosAtual !== null ? (
                                  <p className="text-xs text-slate-600">
                                    de {formatarNumeroPtBr(d.casosAnterior, 1, 0)} para{' '}
                                    {formatarNumeroPtBr(d.casosAtual, 1, 0)} casos est.
                                    {d.poucosCasos ? ' · poucos casos: variação instável' : ''}
                                  </p>
                                ) : d.tendencia === 'indisponivel' && tend?.explicacao ? (
                                  <p className="text-xs text-slate-600">{tend.explicacao}</p>
                                ) : null}
                              </div>
                            </dl>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAbrirPainel(mun)}
                    className="radar-interativo mt-4 min-h-[42px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    Ver painel do município
                  </button>
                </article>
              );
            })}
          </section>
        </>
      )}

      {/* Tabela comparativa alternativa acessível (sempre visível) */}
      <section
        aria-labelledby="titulo-tabela-comparacao"
        className="radar-cartao rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 id="titulo-tabela-comparacao" className="text-lg font-bold text-slate-950">
          Tabela comparativa ({seguidos.length}/{MAX_SEGUIDOS})
        </h2>
        <p className="text-sm text-slate-600">
          Comparação direta em texto dos municípios seguidos para {NOMES_DOENCA[doenca]}.
        </p>

        <div className="mt-3 overflow-x-auto border-t border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Comparação de nível de alerta, casos estimados, incidência e tendência entre municípios
              seguidos
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-700">
                <th scope="col" className="py-2.5 pr-4">Município</th>
                <th scope="col" className="py-2.5 pr-4">Semana</th>
                <th scope="col" className="py-2.5 pr-4">Nível (texto)</th>
                <th scope="col" className="py-2.5 pr-4 text-right">Casos estimados</th>
                <th scope="col" className="py-2.5 pr-4 text-right">Casos por 100 mil habitantes</th>
                <th scope="col" className="py-2.5 pr-4">Tendência</th>
                <th scope="col" className="py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {seguidos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-sm text-slate-600">
                    Nenhum município na comparação. Selecione até {MAX_SEGUIDOS} municípios no
                    formulário acima para comparar lado a lado.
                  </td>
                </tr>
              ) : (
                seguidos.map((mun) => {
                  const item = resultados[mun.codigo_ibge];
                  const d = item?.dados;
                  const cfg = d && !d.vazio ? obterConfigNivel(d.nivelAtual) : null;
                  const ultimaSe = d && d.serie.length > 0 ? d.serie[d.serie.length - 1] : null;
                  const tend = d ? rotuloTendencia(d.tendencia) : null;
                  const estaRemovendo = removendoCodigos.includes(mun.codigo_ibge);
                  const ehMaiorNivel = Boolean(
                    haDiferencaNivel && d && !d.vazio && d.nivelAtual === maiorNivel
                  );

                  return (
                    <tr
                      key={mun.codigo_ibge}
                      className={`${
                        estaRemovendo ? 'radar-saida' : 'radar-entrada'
                      } hover:bg-slate-50`}
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-semibold text-slate-950">
                          {mun.nome} ({mun.uf})
                        </span>
                        {ehMaiorNivel && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-[#0F2744] px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Flag className="h-3 w-3" aria-hidden="true" />
                            Maior nível
                          </span>
                        )}
                        <span className="block font-mono-tabular text-xs text-slate-600">
                          IBGE {mun.codigo_ibge}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">
                        {d?.semanaAtual
                          ? formatarSemanaEpi(d.semanaAtual, ultimaSe?.data_ini_se)
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        {item?.carregando ? (
                          <>
                            <span className="sr-only">Carregando dados de {mun.nome}...</span>
                            <span
                              aria-hidden="true"
                              className="inline-block h-4 w-28 rounded bg-[#E2DBD0]"
                            />
                          </>
                        ) : item?.erro ? (
                          'Erro ao consultar'
                        ) : d?.vazio ? (
                          `Não há casos de ${NOMES_DOENCA[doenca].toLowerCase()} registrados no InfoDengue para este município em ${new Date().getFullYear()}. Isso não significa ausência de risco: pode haver atraso ou falta de notificação.`
                        ) : (
                          cfg?.rotulo ?? `Nível ${d?.nivelAtual}`
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-900">
                        {formatarNumeroPtBr(ultimaSe?.casos_est, 1, 0)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">
                        {formatarNumeroPtBr(ultimaSe?.incidencia_100k, 1, 1)}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-800">
                        {d && !d.vazio ? (
                          <div>
                            <span>
                              {tend?.titulo.replace('Tendência: ', '')}
                              {d.variacaoPercentual !== null
                                ? ` (${formatarPercentualPtBr(d.variacaoPercentual)})`
                                : ''}
                            </span>
                            {d.casosAnterior !== null && d.casosAtual !== null ? (
                              <span className="block text-xs text-slate-600">
                                de {formatarNumeroPtBr(d.casosAnterior, 1, 0)} para{' '}
                                {formatarNumeroPtBr(d.casosAtual, 1, 0)} casos est.
                                {d.poucosCasos ? ' · poucos casos: variação instável' : ''}
                              </span>
                            ) : d.tendencia === 'indisponivel' && tend?.explicacao ? (
                              <span className="block text-xs text-slate-600">{tend.explicacao}</span>
                            ) : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onAbrirPainel(mun)}
                            className="radar-interativo min-h-[36px] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                          >
                            Ver painel do município
                          </button>
                          <button
                            type="button"
                            disabled={estaRemovendo}
                            onClick={() => solicitarRemocao(mun.codigo_ibge)}
                            aria-label={`Remover ${mun.nome} da comparação`}
                            title={`Remover ${mun.nome} da comparação`}
                            className="radar-interativo inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RodapeFonte
        modeloData={modeloMaisRecente}
        consultaData={dataMaisRecente}
        sufixo="(via cache do servidor)"
      />
    </div>
  );
}
