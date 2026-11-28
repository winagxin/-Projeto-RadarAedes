import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Map,
  MapPin,
  OctagonAlert,
  Search,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { RodapeFonte } from '../components/RodapeFonte';
import { Doenca, EstadoItem, MunicipioItem } from '../types';
import { formatarDataPtBr, NIVEIS_ALERTA, NOMES_DOENCA } from '../utils/niveis';

interface InicioPageProps {
  ufSelecionada: string;
  doencaSelecionada: Doenca;
  municipioAtual: MunicipioItem | null;
  onChangeUf: (uf: string) => void;
  onChangeDoenca: (doenca: Doenca) => void;
  onSelecionarMunicipio: (mun: MunicipioItem, doenca: Doenca) => void;
  onAbrirMapa: () => void;
}

interface ItemCacheEstado {
  codigo_ibge: string;
  nome: string;
  uf: string;
  semana_epi: number | null;
  nivel: number | null;
  casos_est: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
  data_coleta: string | null;
}

interface ResumoCacheEstado {
  uf: string;
  doenca: Doenca;
  totalMunicipios: number;
  itensComNivel: ItemCacheEstado[];
  atualizadoEm: string;
}

function normalizar(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function IconeNivel({ nivel }: { nivel: number }) {
  switch (nivel) {
    case 1:
      return <ShieldCheck className="h-4 w-4" aria-hidden="true" />;
    case 2:
      return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
    case 3:
      return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
    default:
      return <OctagonAlert className="h-4 w-4" aria-hidden="true" />;
  }
}

export function InicioPage({
  ufSelecionada,
  doencaSelecionada,
  municipioAtual,
  onChangeUf,
  onChangeDoenca,
  onSelecionarMunicipio,
  onAbrirMapa,
}: InicioPageProps) {
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioItem[]>([]);
  const [carregandoEstados, setCarregandoEstados] = useState(true);
  const [carregandoMunicipios, setCarregandoMunicipios] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fonteInfo, setFonteInfo] = useState<{
    fonte: string;
    atualizadoEm: string;
    modoOffline: boolean;
  } | null>(null);
  const [estadoCache, setEstadoCache] = useState<ResumoCacheEstado | null>(null);

  const [buscaTexto, setBuscaTexto] = useState(municipioAtual?.nome ?? 'Rio de Janeiro');
  const [municipioEscolhido, setMunicipioEscolhido] = useState<MunicipioItem | null>(
    municipioAtual
  );
  const [listaAberta, setListaAberta] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  const listboxId = useId();
  const ufSelectId = useId();
  const buscaInputId = useId();
  const containerComboRef = useRef<HTMLDivElement>(null);

  // Carrega a lista de UFs (com RJ como padrão)
  useEffect(() => {
    let cancelado = false;
    setCarregandoEstados(true);
    fetch('/api/estados')
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar estados');
        return r.json();
      })
      .then((data) => {
        if (cancelado) return;
        setEstados(data.estados || []);
        setFonteInfo({
          fonte: data.fonte || 'IBGE Localidades',
          atualizadoEm: data.atualizadoEm || new Date().toISOString(),
          modoOffline: Boolean(data.modoOffline),
        });
      })
      .catch(() => {
        if (!cancelado) setErro('Não foi possível carregar a lista de estados.');
      })
      .finally(() => {
        if (!cancelado) setCarregandoEstados(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  // Carrega os municípios sempre que a UF mudar
  useEffect(() => {
    let cancelado = false;
    setCarregandoMunicipios(true);
    setErro(null);

    fetch(`/api/municipios?uf=${encodeURIComponent(ufSelecionada)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar municípios');
        return r.json();
      })
      .then((data) => {
        if (cancelado) return;
        const lista: MunicipioItem[] = data.municipios || [];
        setMunicipios(lista);
        setFonteInfo({
          fonte: data.fonte || 'IBGE Localidades',
          atualizadoEm: data.atualizadoEm || new Date().toISOString(),
          modoOffline: Boolean(data.modoOffline),
        });

        if (municipioAtual && municipioAtual.uf === ufSelecionada) {
          const achado = lista.find((m) => m.codigo_ibge === municipioAtual.codigo_ibge);
          if (achado) {
            setMunicipioEscolhido(achado);
            setBuscaTexto(achado.nome);
            return;
          }
        }

        const padraoRj =
          ufSelecionada === 'RJ' ? lista.find((m) => m.codigo_ibge === '3304557') : null;
        const inicial = padraoRj || lista[0] || null;
        setMunicipioEscolhido(inicial);
        setBuscaTexto(inicial ? inicial.nome : '');
      })
      .catch(() => {
        if (!cancelado) {
          setErro(`Não foi possível listar os municípios de ${ufSelecionada}.`);
          setMunicipios([]);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregandoMunicipios(false);
      });

    return () => {
      cancelado = true;
    };
  }, [ufSelecionada]);

  // Lê apenas o que já está em cache no servidor para "Situação agora no estado"
  useEffect(() => {
    let cancelado = false;
    fetch(
      `/api/mapa-uf?uf=${encodeURIComponent(ufSelecionada)}&doenca=${encodeURIComponent(
        doencaSelecionada
      )}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelado || !data || !Array.isArray(data.itens)) {
          if (!cancelado) setEstadoCache(null);
          return;
        }
        const itensComNivel = (data.itens as ItemCacheEstado[]).filter(
          (item) => item.nivel !== null && [1, 2, 3, 4].includes(item.nivel)
        );
        if (itensComNivel.length === 0) {
          setEstadoCache(null);
          return;
        }
        setEstadoCache({
          uf: data.uf || ufSelecionada,
          doenca: data.doenca || doencaSelecionada,
          totalMunicipios: Number(data.totalMunicipios || data.itens.length),
          itensComNivel,
          atualizadoEm: data.atualizadoEm || new Date().toISOString(),
        });
      })
      .catch(() => {
        if (!cancelado) setEstadoCache(null);
      });

    return () => {
      cancelado = true;
    };
  }, [ufSelecionada, doencaSelecionada]);

  // Fecha o listbox ao clicar fora
  useEffect(() => {
    function aoClicarFora(ev: MouseEvent) {
      if (
        containerComboRef.current &&
        !containerComboRef.current.contains(ev.target as Node)
      ) {
        setListaAberta(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const sugestoes = useMemo(() => {
    const q = normalizar(buscaTexto);
    if (!q) return municipios.slice(0, 20);
    return municipios
      .filter((m) => normalizar(m.nome).includes(q) || m.codigo_ibge.includes(q))
      .slice(0, 20);
  }, [municipios, buscaTexto]);

  const resumoEstado = useMemo(() => {
    if (!estadoCache || estadoCache.itensComNivel.length === 0) return null;
    const contagens: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const item of estadoCache.itensComNivel) {
      if (item.nivel && contagens[item.nivel] !== undefined) {
        contagens[item.nivel]++;
      }
    }
    const ordenados = [...estadoCache.itensComNivel].sort(
      (a, b) =>
        (b.nivel ?? 0) - (a.nivel ?? 0) ||
        (b.casos_est ?? 0) - (a.casos_est ?? 0) ||
        a.nome.localeCompare(b.nome, 'pt-BR')
    );
    const criticos = ordenados.filter((i) => (i.nivel ?? 0) >= 3).slice(0, 4);
    const modeloData =
      estadoCache.itensComNivel.find((i) => i.versao_modelo)?.versao_modelo ?? null;
    const coletaData =
      estadoCache.itensComNivel.find((i) => i.data_coleta)?.data_coleta ?? estadoCache.atualizadoEm;

    return {
      contagens,
      criticos,
      totalComCache: estadoCache.itensComNivel.length,
      totalMunicipios: estadoCache.totalMunicipios,
      modeloData,
      coletaData,
    };
  }, [estadoCache]);

  function escolherSugestao(mun: MunicipioItem) {
    setMunicipioEscolhido(mun);
    setBuscaTexto(mun.nome);
    setListaAberta(false);
  }

  function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    const alvo =
      municipioEscolhido && normalizar(municipioEscolhido.nome) === normalizar(buscaTexto)
        ? municipioEscolhido
        : sugestoes[0] || municipioEscolhido;

    if (!alvo) {
      setErro('Escolha um município válido na lista para continuar.');
      return;
    }
    onSelecionarMunicipio(alvo, doencaSelecionada);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Cabeçalho editorial com maior contraste de escala tipográfica */}
      <section className="space-y-3 pt-1">
        <p className="text-sm font-semibold text-[#1B4965]">
          Dados abertos do InfoDengue e do IBGE
        </p>
        <h1 className="max-w-4xl text-[clamp(2.1rem,4.4vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.025em] text-[#0F2744]">
          Consulte o semáforo de dengue, chikungunya e zika do seu município
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-700 sm:text-[17px]">
          Veja o nível de alerta, a tendência das últimas semanas e o que fazer em cada nível.
        </p>
      </section>

      {fonteInfo?.modoOffline && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-[#1B4965] bg-[#F3EFE7] px-4 py-3 text-sm font-medium text-[#0F2744]"
        >
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Dados de {formatarDataPtBr(fonteInfo.atualizadoEm)} (modo offline)</span>
        </div>
      )}

      {erro && (
        <div
          role="alert"
          className="rounded-xl border border-[#0F2744] bg-[#F3EFE7] px-4 py-3 text-sm font-semibold text-[#0F2744]"
        >
          {erro}
        </div>
      )}

      {/* Busca principal em destaque */}
      <form
        onSubmit={aoEnviar}
        className="radar-cartao rounded-2xl border border-[#E2DBD0] bg-white p-5 shadow-[0_12px_32px_-20px_rgba(15,39,68,0.22)] sm:p-7"
        aria-label="Formulário de seleção de município e doença"
      >
        <div className="grid gap-5 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label htmlFor={ufSelectId} className="block text-sm font-semibold text-[#0F2744]">
              UF - Estado
            </label>
            <select
              id={ufSelectId}
              value={ufSelecionada}
              disabled={carregandoEstados}
              onChange={(e) => {
                setMunicipioEscolhido(null);
                setBuscaTexto('');
                onChangeUf(e.target.value);
              }}
              className="radar-transicao mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CFC7BA] bg-[#FAF7F2] px-3.5 py-2 text-base font-medium text-[#17212B] focus:border-[#0F2744] focus:bg-white"
            >
              {estados.length === 0 ? (
                <option value="RJ">RJ — Rio de Janeiro</option>
              ) : (
                estados.map((uf) => (
                  <option key={uf.sigla} value={uf.sigla}>
                    {uf.sigla} — {uf.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          <div
            className="relative sm:col-span-8"
            ref={containerComboRef}
            onBlur={(ev) => {
              if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
                setListaAberta(false);
              }
            }}
          >
            <label htmlFor={buscaInputId} className="block text-sm font-semibold text-[#0F2744]">
              Município
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#1B4965]"
                aria-hidden="true"
              />
              <input
                id={buscaInputId}
                type="text"
                role="combobox"
                aria-expanded={listaAberta}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  listaAberta && sugestoes[indiceAtivo]
                    ? `mun-opt-${sugestoes[indiceAtivo].codigo_ibge}`
                    : undefined
                }
                disabled={carregandoMunicipios}
                value={carregandoMunicipios ? '' : buscaTexto}
                placeholder={
                  carregandoMunicipios
                    ? ''
                    : 'Digite o nome do município (ex.: Rio de Janeiro)'
                }
                onFocus={() => {
                  setListaAberta(true);
                  setIndiceAtivo(0);
                }}
                onChange={(e) => {
                  setBuscaTexto(e.target.value);
                  setListaAberta(true);
                  setIndiceAtivo(0);
                  setErro(null);
                }}
                onKeyDown={(e) => {
                  if (!listaAberta && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    setListaAberta(true);
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const proximo = Math.min(indiceAtivo + 1, Math.max(0, sugestoes.length - 1));
                    setIndiceAtivo(proximo);
                    const alvo = sugestoes[proximo];
                    if (alvo) {
                      document
                        .getElementById(`mun-opt-${alvo.codigo_ibge}`)
                        ?.scrollIntoView({ block: 'nearest' });
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const anterior = Math.max(indiceAtivo - 1, 0);
                    setIndiceAtivo(anterior);
                    const alvo = sugestoes[anterior];
                    if (alvo) {
                      document
                        .getElementById(`mun-opt-${alvo.codigo_ibge}`)
                        ?.scrollIntoView({ block: 'nearest' });
                    }
                  } else if (e.key === 'Enter' && listaAberta && sugestoes[indiceAtivo]) {
                    e.preventDefault();
                    escolherSugestao(sugestoes[indiceAtivo]);
                  } else if (e.key === 'Escape') {
                    setListaAberta(false);
                  }
                }}
                className="radar-transicao min-h-[48px] w-full rounded-xl border border-[#CFC7BA] bg-[#FAF7F2] py-2 pr-4 pl-11 text-base font-medium text-[#17212B] placeholder:text-slate-500 focus:border-[#0F2744] focus:bg-white"
              />
              {carregandoMunicipios && (
                <span
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute inset-y-0 right-4 left-11 flex items-center"
                >
                  <span className="sr-only">Carregando municípios...</span>
                  <span aria-hidden="true" className="h-4 w-44 max-w-full rounded bg-[#E2DBD0]" />
                </span>
              )}
            </div>

            {listaAberta && !carregandoMunicipios && sugestoes.length === 0 && (
              <div
                role="status"
                aria-live="polite"
                className="absolute z-20 mt-1.5 w-full rounded-xl border border-[#CFC7BA] bg-white px-3.5 py-2.5 text-sm text-slate-600 shadow-lg"
              >
                Nenhum município encontrado para &ldquo;{buscaTexto}&rdquo;.
              </div>
            )}

            {listaAberta && !carregandoMunicipios && sugestoes.length > 0 && (
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Municípios encontrados"
                className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#CFC7BA] bg-white py-1 shadow-lg"
              >
                {sugestoes.map((mun, idx) => {
                  const ativo = idx === indiceAtivo;
                  const selecionado = municipioEscolhido?.codigo_ibge === mun.codigo_ibge;
                  return (
                    <li
                      key={mun.codigo_ibge}
                      id={`mun-opt-${mun.codigo_ibge}`}
                      role="option"
                      aria-selected={selecionado}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        escolherSugestao(mun);
                      }}
                      onMouseEnter={() => setIndiceAtivo(idx)}
                      className={`flex min-h-[44px] cursor-pointer items-center justify-between px-3.5 py-2 text-sm ${
                        ativo ? 'bg-[#EAEFF5] text-[#0F2744]' : 'text-[#17212B] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <MapPin className="h-4 w-4 text-[#1B4965]" aria-hidden="true" />
                        {mun.nome}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-[#0F2744]">Qual doença?</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:max-w-md sm:grid-cols-3">
            {(['dengue', 'chikungunya', 'zika'] as Doenca[]).map((d) => {
              const ativo = doencaSelecionada === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onChangeDoenca(d)}
                  className={`radar-interativo min-h-[44px] rounded-xl border px-3.5 py-2 text-center text-sm font-semibold leading-tight ${
                    ativo
                      ? 'border-[#0F2744] bg-[#0F2744] text-white'
                      : 'border-[#CFC7BA] bg-[#FAF7F2] text-[#17212B] hover:border-[#0F2744] hover:bg-white'
                  }`}
                >
                  {NOMES_DOENCA[d]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col gap-3 border-t border-[#EAE4DA] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-slate-700">
            {municipioEscolhido ? (
              <>
                Selecionado:{' '}
                <strong className="font-semibold text-[#0F2744]">{municipioEscolhido.nome}</strong>{' '}
                · {NOMES_DOENCA[doencaSelecionada]}
              </>
            ) : (
              'Selecione um município na lista para consultar o alerta.'
            )}
          </p>

          <button
            type="submit"
            disabled={carregandoMunicipios}
            className="radar-interativo inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0F2744] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#16365C] disabled:opacity-50"
          >
            Ver painel do município
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Grade inferior: Situação agora no estado (se houver cache) + Como ler o semáforo compacto */}
      <div className={resumoEstado ? 'grid gap-6 lg:grid-cols-12 lg:items-start' : 'space-y-6'}>
        {resumoEstado && (
          <section
            aria-labelledby="titulo-situacao-estado"
            className="radar-entrada radar-cartao rounded-2xl border border-[#E2DBD0] bg-white p-5 sm:p-6 lg:col-span-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="titulo-situacao-estado" className="text-lg font-bold text-[#0F2744]">
                  Situação agora no estado
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                  {ufSelecionada} · {NOMES_DOENCA[doencaSelecionada]} ·{' '}
                  {resumoEstado.totalComCache} de {resumoEstado.totalMunicipios} municípios em cache
                  no servidor
                </p>
              </div>
              <button
                type="button"
                onClick={onAbrirMapa}
                className="radar-interativo inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#CFC7BA] bg-[#FAF7F2] px-3 py-1.5 text-xs font-semibold text-[#0F2744] hover:border-[#0F2744] hover:bg-white"
              >
                <Map className="h-3.5 w-3.5" aria-hidden="true" />
                Abrir mapa de {ufSelecionada}
              </button>
            </div>

            {/* Barra proporcional visual dos níveis em cache */}
            <div
              aria-hidden="true"
              className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[#EFEAE1]"
            >
              {[1, 2, 3, 4].map((nivelNum) => {
                const qtd = resumoEstado.contagens[nivelNum] || 0;
                if (qtd === 0) return null;
                const pct = (qtd / resumoEstado.totalComCache) * 100;
                return (
                  <div
                    key={nivelNum}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: NIVEIS_ALERTA[nivelNum].mapFillHex,
                    }}
                  />
                );
              })}
            </div>

            {/* Faixas por nível (sem cartões repetidos com borda colorida) */}
            <ul className="mt-4 divide-y divide-[#EAE4DA]">
              {[1, 2, 3, 4].map((nivelNum) => {
                const cfg = NIVEIS_ALERTA[nivelNum];
                const qtd = resumoEstado.contagens[nivelNum] || 0;
                return (
                  <li
                    key={nivelNum}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2.5 font-medium text-[#17212B]">
                      <span
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cfg.iconBgClass}`}
                      >
                        <IconeNivel nivel={nivelNum} />
                      </span>
                      <span>{cfg.rotulo}</span>
                    </span>
                    <span className="font-mono-tabular text-sm font-bold text-[#0F2744] tabular-nums">
                      {qtd}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Municípios em destaque (níveis 3 ou 4 em cache) com acesso por clique, toque e teclado */}
            <div className="mt-4 border-t border-[#EAE4DA] pt-3.5">
              {resumoEstado.criticos.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-[#0F2744]">
                    Municípios em nível 3 ou 4 no cache
                  </p>
                  <ul className="mt-2 divide-y divide-[#EFEAE1]">
                    {resumoEstado.criticos.map((item) => {
                      const cfg = item.nivel ? NIVEIS_ALERTA[item.nivel] : null;
                      return (
                        <li key={item.codigo_ibge}>
                          <button
                            type="button"
                            aria-label={
                              cfg
                                ? `Abrir painel de ${item.nome} — ${cfg.rotulo}`
                                : `Abrir painel de ${item.nome}`
                            }
                            onClick={() =>
                              onSelecionarMunicipio(
                                {
                                  codigo_ibge: item.codigo_ibge,
                                  nome: item.nome,
                                  uf: item.uf,
                                  populacao: null,
                                },
                                doencaSelecionada
                              )
                            }
                            className="radar-interativo flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[#FAF7F2]"
                          >
                            <span className="flex items-center gap-2.5 font-medium text-[#17212B]">
                              {cfg && item.nivel && (
                                <span
                                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${cfg.iconBgClass}`}
                                >
                                  <IconeNivel nivel={item.nivel} />
                                </span>
                              )}
                              <span>{item.nome}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B4965]">
                              {cfg ? cfg.corNome : ''}
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-slate-600">
                  Nenhum município em nível 3 ou 4 entre os registros em cache para{' '}
                  {ufSelecionada}.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Bloco "Como ler o semáforo" mais compacto, em faixas sem bordas coloridas */}
        <section
          aria-labelledby="titulo-como-ler-semaforo"
          className={`radar-cartao rounded-2xl border border-[#E2DBD0] bg-white p-5 sm:p-6 ${
            resumoEstado ? 'lg:col-span-5' : ''
          }`}
        >
          <h2 id="titulo-como-ler-semaforo" className="text-lg font-bold text-[#0F2744]">
            Como ler o semáforo
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Nível oficial do InfoDengue identificado por cor, ícone e texto:
          </p>

          <ul
            className={`mt-3 divide-y divide-[#EAE4DA] ${
              resumoEstado ? '' : 'sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0'
            }`}
          >
            {[1, 2, 3, 4].map((nivelNum) => {
              const cfg = NIVEIS_ALERTA[nivelNum];
              return (
                <li
                  key={nivelNum}
                  className={`flex items-start gap-3 py-2.5 ${
                    resumoEstado ? '' : 'sm:border-b sm:border-[#EAE4DA]'
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cfg.iconBgClass}`}
                  >
                    <IconeNivel nivel={nivelNum} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-snug text-[#17212B]">{cfg.rotulo}</h3>
                    <p className="mt-0.5 text-xs leading-snug text-slate-600">
                      {cfg.descricaoCurta}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <RodapeFonte
        modeloData={resumoEstado?.modeloData}
        consultaData={resumoEstado?.coletaData || fonteInfo?.atualizadoEm}
      />
    </div>
  );
}
