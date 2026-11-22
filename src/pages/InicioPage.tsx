import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, MapPin, Search, WifiOff } from 'lucide-react';
import { Doenca, EstadoItem, MunicipioItem } from '../types';
import { formatarDataPtBr, NOMES_DOENCA } from '../utils/niveis';

interface InicioPageProps {
  ufSelecionada: string;
  doencaSelecionada: Doenca;
  municipioAtual: MunicipioItem | null;
  onChangeUf: (uf: string) => void;
  onChangeDoenca: (doenca: Doenca) => void;
  onSelecionarMunicipio: (mun: MunicipioItem, doenca: Doenca) => void;
}

function normalizar(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function InicioPage({
  ufSelecionada,
  doencaSelecionada,
  municipioAtual,
  onChangeUf,
  onChangeDoenca,
  onSelecionarMunicipio,
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

        // Se já havia município selecionado na mesma UF, mantém; caso contrário, sugere capital/Rio ou 1º
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
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-medium text-slate-600">
          Vigilância pública municipal · Dados abertos InfoDengue e IBGE
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Consulte o semáforo de arboviroses do seu município
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-700">
          Veja o nível de alerta oficial (verde, amarelo, laranja ou vermelho), a tendência das
          últimas semanas e orientações práticas para moradores, escolas e agentes de saúde.
        </p>
      </section>

      {fonteInfo?.modoOffline && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Dados de {formatarDataPtBr(fonteInfo.atualizadoEm)} (modo offline)</span>
        </div>
      )}

      {erro && (
        <div
          role="alert"
          className="rounded-xl border border-red-700 bg-red-50 px-4 py-3 text-sm font-medium text-red-950"
        >
          {erro}
        </div>
      )}

      <form
        onSubmit={aoEnviar}
        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        aria-label="Formulário de seleção de município e doença"
      >
        <div className="grid gap-5 sm:grid-cols-12">
          {/* Seleção de UF */}
          <div className="sm:col-span-4">
            <label htmlFor={ufSelectId} className="block text-sm font-semibold text-slate-900">
              Estado (UF)
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
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-700"
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

          {/* Busca com autocompletar acessível */}
          <div className="relative sm:col-span-8" ref={containerComboRef}>
            <label htmlFor={buscaInputId} className="block text-sm font-semibold text-slate-900">
              Município
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-500"
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
                value={buscaTexto}
                placeholder={
                  carregandoMunicipios
                    ? 'Carregando municípios...'
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
                    setIndiceAtivo((i) => Math.min(i + 1, Math.max(0, sugestoes.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setIndiceAtivo((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && listaAberta && sugestoes[indiceAtivo]) {
                    e.preventDefault();
                    escolherSugestao(sugestoes[indiceAtivo]);
                  } else if (e.key === 'Escape') {
                    setListaAberta(false);
                  }
                }}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-10 text-base text-slate-900 placeholder:text-slate-500"
              />
            </div>

            {listaAberta && !carregandoMunicipios && (
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Municípios encontrados"
                className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg"
              >
                {sugestoes.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-slate-600">
                    Nenhum município encontrado para &ldquo;{buscaTexto}&rdquo;.
                  </li>
                ) : (
                  sugestoes.map((mun, idx) => {
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
                        className={`flex min-h-[44px] cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                          ativo ? 'bg-blue-50 text-blue-950' : 'text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <MapPin className="h-4 w-4 text-slate-500" aria-hidden="true" />
                          {mun.nome}
                        </span>
                        <span className="font-mono-tabular text-xs text-slate-600">
                          {mun.codigo_ibge}
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Seleção de doença */}
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-slate-900">Arbovirose consultada</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
            {(['dengue', 'chikungunya', 'zika'] as Doenca[]).map((d) => {
              const ativo = doencaSelecionada === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onChangeDoenca(d)}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                    ativo
                      ? 'border-slate-950 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {NOMES_DOENCA[d]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {municipioEscolhido ? (
              <>
                Selecionado: <strong className="text-slate-900">{municipioEscolhido.nome}</strong> (
                <span className="font-mono-tabular">{municipioEscolhido.codigo_ibge}</span>) ·{' '}
                {NOMES_DOENCA[doencaSelecionada]}
              </>
            ) : (
              'Selecione um município na lista para consultar o alerta.'
            )}
          </p>

          <button
            type="submit"
            disabled={carregandoMunicipios}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:bg-blue-800 disabled:opacity-50"
          >
            Ver painel do município
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {fonteInfo && (
        <p className="text-xs text-slate-600">
          Fonte: {fonteInfo.fonte}, atualizado em {formatarDataPtBr(fonteInfo.atualizadoEm)}
        </p>
      )}
    </div>
  );
}
