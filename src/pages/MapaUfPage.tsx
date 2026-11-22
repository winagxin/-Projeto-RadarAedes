import { useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  MapPin,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { Doenca, EstadoItem } from '../types';
import {
  formatarDataPtBr,
  formatarSemanaEpi,
  NIVEIS_ALERTA,
  NOMES_DOENCA,
  obterConfigNivel,
} from '../utils/niveis';

interface ItemMapa {
  codigo_ibge: string;
  nome: string;
  uf: string;
  semana_epi: number | null;
  nivel: number | null;
  casos_est: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
  data_coleta: string | null;
  fonte: string | null;
  modo_offline: boolean;
  origem: 'cache' | 'api' | 'amostra' | 'indisponivel';
}

interface ResumoMapa {
  uf: string;
  doenca: Doenca;
  total: number;
  emCache: number;
  atualizadosApi: number;
  semDados: number;
  falhas: number;
  modoOffline: boolean;
  atualizadoEm: string;
}

interface MapaUfPageProps {
  ufInicial: string;
  doencaInicial: Doenca;
  onChangeUf: (uf: string) => void;
  onChangeDoenca: (doenca: Doenca) => void;
  onAbrirPainelMunicipio: (codigoIbge: string, nome: string, uf: string, doenca: Doenca) => void;
}

type LayerMunicipio = L.Path & {
  feature?: GeoJSON.Feature;
  getBounds?: () => L.LatLngBounds;
};

const ZOOM_MINIMO_ROTULOS = 9;
const LIMITE_POUCOS_CASOS = 20;

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function garantirPadraoHachura(svg: SVGSVGElement | null | undefined) {
  if (!svg) return;
  if (svg.querySelector('#radar-hachura-sem-info')) return;
  const svgNs = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(svgNs, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const pattern = document.createElementNS(svgNs, 'pattern');
  pattern.setAttribute('id', 'radar-hachura-sem-info');
  pattern.setAttribute('width', '8');
  pattern.setAttribute('height', '8');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('patternTransform', 'rotate(45)');

  const rect = document.createElementNS(svgNs, 'rect');
  rect.setAttribute('width', '8');
  rect.setAttribute('height', '8');
  rect.setAttribute('fill', '#cbd5e1');

  const line = document.createElementNS(svgNs, 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('x2', '0');
  line.setAttribute('y2', '8');
  line.setAttribute('stroke', '#64748b');
  line.setAttribute('stroke-width', '2.5');

  pattern.appendChild(rect);
  pattern.appendChild(line);
  defs.appendChild(pattern);
}

function montarHtmlDadosMunicipio(info: ItemMapa | undefined, codigoIbge: string): string {
  if (!info || info.nivel === null) {
    const titulo = info ? `${escapeHtml(info.nome)} (${escapeHtml(info.uf)})` : `Município ${escapeHtml(codigoIbge)}`;
    return `
      <div class="space-y-1 text-xs sm:text-sm text-slate-900">
        <p class="font-bold text-slate-950">${titulo}</p>
        <p class="font-semibold text-slate-700">Sem informação</p>
        <p class="text-xs text-slate-600">Sem leitura ativa ou aguardando resposta da fonte.</p>
      </div>
    `;
  }

  const cfg = obterConfigNivel(info.nivel);
  const nivelTexto = cfg ? cfg.rotulo : `Nível ${info.nivel}`;
  const semanaTexto = info.semana_epi ? formatarSemanaEpi(info.semana_epi) : 'Sem leitura';
  const casosTexto =
    info.casos_est !== null
      ? info.casos_est.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      : 'N/D';
  const incidenciaTexto =
    info.incidencia_100k !== null ? `${info.incidencia_100k.toFixed(1)} / 100 mil` : 'N/D';
  const poucosCasos = info.casos_est !== null && info.casos_est < LIMITE_POUCOS_CASOS;

  return `
    <div class="space-y-1 text-xs sm:text-sm text-slate-900">
      <p class="font-bold text-slate-950">${escapeHtml(info.nome)} (${escapeHtml(info.uf)})</p>
      <p class="font-semibold text-slate-800">${escapeHtml(nivelTexto)}</p>
      <p class="text-xs text-slate-700">Semana: <strong>${escapeHtml(semanaTexto)}</strong></p>
      <p class="text-xs text-slate-700">Casos estimados: <strong>${escapeHtml(casosTexto)}</strong></p>
      <p class="text-xs text-slate-700">Incidência: <strong>${escapeHtml(incidenciaTexto)}</strong></p>
      ${
        poucosCasos
          ? '<p class="text-xs font-semibold text-amber-900">Aviso: poucos casos: variação instável</p>'
          : ''
      }
    </div>
  `;
}

export function MapaUfPage({
  ufInicial,
  doencaInicial,
  onChangeUf,
  onChangeDoenca,
  onAbrirPainelMunicipio,
}: MapaUfPageProps) {
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [itensMapa, setItensMapa] = useState<Record<string, ItemMapa>>({});
  const [totalMunicipios, setTotalMunicipios] = useState(0);
  const [concluidos, setConcluidos] = useState(0);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [carregandoStream, setCarregandoStream] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoMapa | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<string>('todos');
  const [municipioSelecionadoMapa, setMunicipioSelecionadoMapa] = useState<string | null>(null);
  const [zoomAtual, setZoomAtual] = useState<number>(7);
  const [tentativa, setTentativa] = useState(0);

  const ufSelectId = useId();
  const filtroId = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const rotulosLayerRef = useRef<L.LayerGroup | null>(null);
  const layersByCodeRef = useRef<Record<string, LayerMunicipio>>({});
  const itensRef = useRef<Record<string, ItemMapa>>({});
  const selecionadoRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const onAbrirPainelRef = useRef(onAbrirPainelMunicipio);
  const doencaRef = useRef(doencaInicial);

  useEffect(() => {
    onAbrirPainelRef.current = onAbrirPainelMunicipio;
  }, [onAbrirPainelMunicipio]);

  useEffect(() => {
    doencaRef.current = doencaInicial;
  }, [doencaInicial]);

  useEffect(() => {
    fetch('/api/estados')
      .then((r) => r.json())
      .then((d) => setEstados(d.estados || []))
      .catch(() => {});
  }, []);

  function estiloFeature(codigoIbge: string): L.PathOptions {
    const info = itensRef.current[codigoIbge];
    const cfg = info ? obterConfigNivel(info.nivel) : null;
    const isHover = hoveredRef.current === codigoIbge;
    const isSelecionado = selecionadoRef.current === codigoIbge;
    const borderWeight = isSelecionado ? 4 : isHover ? 3.5 : 1;
    const borderColor = isSelecionado ? '#1d4ed8' : '#0f172a';

    if (!info || !cfg) {
      return {
        fillColor: '#cbd5e1',
        fillOpacity: isHover ? 0.92 : 0.82,
        color: isSelecionado ? '#1d4ed8' : isHover ? '#0f172a' : '#475569',
        weight: borderWeight,
        dashArray: isSelecionado || isHover ? undefined : '3 3',
      };
    }

    return {
      fillColor: cfg.mapFillHex,
      fillOpacity: isHover || isSelecionado ? 0.86 : 0.72,
      color: borderColor,
      weight: borderWeight,
      dashArray: undefined,
    };
  }

  function atualizarRotulosCriticos() {
    const map = leafletMapRef.current;
    const rotulosLayer = rotulosLayerRef.current;
    if (!map || !rotulosLayer) return;

    rotulosLayer.clearLayers();
    if (map.getZoom() < ZOOM_MINIMO_ROTULOS) return;

    for (const [codarea, layer] of Object.entries(layersByCodeRef.current)) {
      const info = itensRef.current[codarea];
      if (!info || (info.nivel !== 3 && info.nivel !== 4)) continue;
      if (typeof layer.getBounds !== 'function') continue;

      const bounds = layer.getBounds();
      if (!bounds.isValid()) continue;

      L.tooltip({
        permanent: true,
        direction: 'center',
        interactive: false,
        className: 'radar-rotulo-critico',
      })
        .setLatLng(bounds.getCenter())
        .setContent(escapeHtml(info.nome))
        .addTo(rotulosLayer);
    }
  }

  function aplicarHachuraSeSemInfo(layer: LayerMunicipio, info: ItemMapa | undefined) {
    const el = layer.getElement?.() as SVGPathElement | undefined;
    if (!el) return;
    const semInfo = !info || info.nivel === null || !obterConfigNivel(info.nivel);
    if (semInfo) {
      garantirPadraoHachura(el.ownerSVGElement);
      el.classList.add('radar-poligono-sem-info');
    } else {
      el.classList.remove('radar-poligono-sem-info');
    }
  }

  function criarConteudoPopup(info: ItemMapa | undefined, codarea: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'min-w-[200px] space-y-2';
    container.innerHTML = montarHtmlDadosMunicipio(info, codarea);

    if (info) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Abrir painel completo';
      btn.className =
        'mt-2 inline-flex min-h-[38px] w-full items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800';
      btn.onclick = () => {
        onAbrirPainelRef.current(info.codigo_ibge, info.nome, info.uf, doencaRef.current);
      };
      container.appendChild(btn);
    }

    return container;
  }

  function atualizarEstilosCamada() {
    if (!geoLayerRef.current) return;

    geoLayerRef.current.eachLayer((rawLayer) => {
      const featureLayer = rawLayer as LayerMunicipio;
      const codarea = String(featureLayer.feature?.properties?.codarea || '');
      const info = itensRef.current[codarea];

      if (typeof featureLayer.setStyle === 'function') {
        featureLayer.setStyle(estiloFeature(codarea));
      }
      aplicarHachuraSeSemInfo(featureLayer, info);

      const htmlTooltip = montarHtmlDadosMunicipio(info, codarea);
      if (featureLayer.getTooltip()) {
        featureLayer.setTooltipContent(htmlTooltip);
      } else {
        featureLayer.bindTooltip(htmlTooltip, {
          sticky: true,
          direction: 'auto',
          opacity: 0.97,
        });
      }

      const popupEl = criarConteudoPopup(info, codarea);
      if (featureLayer.getPopup()) {
        featureLayer.setPopupContent(popupEl);
      } else {
        featureLayer.bindPopup(popupEl, { maxWidth: 280 });
      }
    });

    if (selecionadoRef.current && layersByCodeRef.current[selecionadoRef.current]) {
      layersByCodeRef.current[selecionadoRef.current].bringToFront();
    }
    atualizarRotulosCriticos();
  }

  function selecionarMunicipioNoMapa(codigoIbge: string) {
    selecionadoRef.current = codigoIbge;
    setMunicipioSelecionadoMapa(codigoIbge);
    atualizarEstilosCamada();

    const layer = layersByCodeRef.current[codigoIbge];
    const map = leafletMapRef.current;
    if (layer && map) {
      layer.bringToFront();
      if (typeof layer.getBounds === 'function') {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { maxZoom: 10, padding: [48, 48] });
        }
      }
      layer.openPopup();
      mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Inicializa o mapa Leaflet uma única vez (sempre com renderer SVG para suportar hachura)
  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-22.4, -42.8],
      zoom: 7,
      scrollWheelZoom: true,
      preferCanvas: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 14,
    }).addTo(map);

    const rotulos = L.layerGroup().addTo(map);
    rotulosLayerRef.current = rotulos;

    map.on('zoomend', () => {
      setZoomAtual(map.getZoom());
      atualizarRotulosCriticos();
    });

    leafletMapRef.current = map;

    return () => {
      map.remove();
      leafletMapRef.current = null;
      geoLayerRef.current = null;
      rotulosLayerRef.current = null;
      layersByCodeRef.current = {};
    };
  }, []);

  // Conecta ao stream progressivo SSE sob demanda ao abrir a tela ou mudar UF/doença
  useEffect(() => {
    setCarregandoInicial(true);
    setCarregandoStream(true);
    setErro(null);
    setResumo(null);
    setItensMapa({});
    setMunicipioSelecionadoMapa(null);
    selecionadoRef.current = null;
    hoveredRef.current = null;
    itensRef.current = {};
    layersByCodeRef.current = {};
    setTotalMunicipios(0);
    setConcluidos(0);

    const es = new EventSource(
      `/api/mapa-uf/stream?uf=${encodeURIComponent(ufInicial)}&doenca=${encodeURIComponent(
        doencaInicial
      )}`
    );

    es.addEventListener('inicio', (ev) => {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        totalMunicipios: number;
        geojson: GeoJSON.GeoJsonObject;
        itens: ItemMapa[];
      };

      const mapaInicial: Record<string, ItemMapa> = {};
      for (const item of payload.itens) {
        mapaInicial[item.codigo_ibge] = item;
      }
      itensRef.current = mapaInicial;
      setItensMapa(mapaInicial);
      setTotalMunicipios(payload.totalMunicipios);
      setConcluidos(payload.itens.length);
      setCarregandoInicial(false);

      const map = leafletMapRef.current;
      if (map && payload.geojson) {
        if (geoLayerRef.current) {
          geoLayerRef.current.removeFrom(map);
        }
        layersByCodeRef.current = {};

        const camada = L.geoJSON(payload.geojson, {
          style: (feature) => estiloFeature(String(feature?.properties?.codarea || '')),
          onEachFeature: (feature, rawLayer) => {
            const featureLayer = rawLayer as LayerMunicipio;
            const codarea = String(feature?.properties?.codarea || '');
            if (codarea) {
              layersByCodeRef.current[codarea] = featureLayer;
            }

            featureLayer.on({
              mouseover: () => {
                hoveredRef.current = codarea;
                featureLayer.setStyle(estiloFeature(codarea));
                aplicarHachuraSeSemInfo(featureLayer, itensRef.current[codarea]);
                featureLayer.bringToFront();
              },
              mouseout: () => {
                if (hoveredRef.current === codarea) {
                  hoveredRef.current = null;
                }
                featureLayer.setStyle(estiloFeature(codarea));
                aplicarHachuraSeSemInfo(featureLayer, itensRef.current[codarea]);
                if (selecionadoRef.current && layersByCodeRef.current[selecionadoRef.current]) {
                  layersByCodeRef.current[selecionadoRef.current].bringToFront();
                }
              },
              click: () => {
                featureLayer.closeTooltip();
                selecionadoRef.current = codarea;
                setMunicipioSelecionadoMapa(codarea);
                atualizarEstilosCamada();
              },
            });
          },
        }).addTo(map);

        geoLayerRef.current = camada;
        const bounds = camada.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [16, 16] });
          setZoomAtual(map.getZoom());
        }
        atualizarEstilosCamada();
      }
    });

    es.addEventListener('lote', (ev) => {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        itens: ItemMapa[];
        concluidos: number;
        totalMunicipios: number;
      };
      const proximo = { ...itensRef.current };
      for (const item of payload.itens) {
        proximo[item.codigo_ibge] = item;
      }
      itensRef.current = proximo;
      setItensMapa(proximo);
      setConcluidos(payload.concluidos);
      setTotalMunicipios(payload.totalMunicipios);
      atualizarEstilosCamada();
    });

    es.addEventListener('fim', (ev) => {
      const payload = JSON.parse((ev as MessageEvent).data) as { resumo: ResumoMapa };
      setResumo(payload.resumo);
      setCarregandoStream(false);
      setCarregandoInicial(false);
      es.close();
    });

    es.addEventListener('erro', (ev) => {
      const dataStr = (ev as MessageEvent).data;
      const msg = dataStr ? JSON.parse(dataStr).erro : 'Erro ao carregar mapa da UF.';
      setErro(msg);
      setCarregandoStream(false);
      setCarregandoInicial(false);
      es.close();
    });

    es.onerror = () => {
      if (Object.keys(itensRef.current).length === 0) {
        setErro('Falha de conexão ao carregar o mapa estadual.');
      }
      setCarregandoStream(false);
      setCarregandoInicial(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [ufInicial, doencaInicial, tentativa]);

  // Contagem por nível (e sem informação) sempre com base nos dados recebidos
  const contagemNiveis = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let semInfo = 0;

    const lista = Object.values(itensMapa);
    for (const item of lista) {
      if (item.nivel !== null && counts[item.nivel] !== undefined) {
        counts[item.nivel]++;
      } else {
        semInfo++;
      }
    }

    // Municípios ainda pendentes no stream também entram como sem informação até chegarem
    const faltantes = Math.max(0, totalMunicipios - lista.length);
    return {
      1: counts[1],
      2: counts[2],
      3: counts[3],
      4: counts[4],
      semInfo: semInfo + faltantes,
    };
  }, [itensMapa, totalMunicipios]);

  const listaTabela = useMemo(() => {
    const q = filtroTexto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return Object.values(itensMapa)
      .filter((item) => {
        const matchTexto =
          !q ||
          item.nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .includes(q) ||
          item.codigo_ibge.includes(q);
        if (!matchTexto) return false;
        if (filtroNivel === 'todos') return true;
        if (filtroNivel === 'indisponivel') return item.nivel === null;
        return String(item.nivel) === filtroNivel;
      })
      .sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [itensMapa, filtroTexto, filtroNivel]);

  const percentualProgresso =
    totalMunicipios > 0 ? Math.round((concluidos / totalMunicipios) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Visualização estadual sob demanda · Cache de 6 horas no servidor
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Mapa da UF — {ufInicial} ({NOMES_DOENCA[doencaInicial]})
          </h1>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={ufSelectId} className="block text-xs font-semibold text-slate-700">
              Estado (UF)
            </label>
            <select
              id={ufSelectId}
              value={ufInicial}
              onChange={(e) => onChangeUf(e.target.value)}
              className="mt-1 min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
            >
              {estados.length === 0 ? (
                <option value={ufInicial}>{ufInicial}</option>
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
            role="group"
            aria-label="Selecionar doença no mapa"
            className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1"
          >
            {(['dengue', 'chikungunya', 'zika'] as Doenca[]).map((d) => {
              const ativo = doencaInicial === d;
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
      </header>

      {/* Progresso progressivo do stream */}
      {carregandoStream && (
        <div
          aria-live="polite"
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
        >
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">
              {carregandoInicial
                ? `Carregando malha territorial de ${ufInicial}...`
                : `Colorindo municípios progressivamente: ${concluidos} de ${totalMunicipios} (${percentualProgresso}%)`}
            </span>
            <span className="font-mono-tabular text-xs text-slate-600">
              Máx. 4 consultas simultâneas
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-700 transition-all duration-200"
              style={{ width: `${percentualProgresso}%` }}
            />
          </div>
        </div>
      )}

      {resumo?.modoOffline && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-amber-600 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Dados de {formatarDataPtBr(resumo.atualizadoEm)} (modo offline)</span>
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-xl border border-red-700 bg-red-50 p-4 text-red-950">
          <p className="text-sm font-semibold">{erro}</p>
          <button
            type="button"
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* Resumo acima do mapa: contagem de municípios por nível (texto + ícone + número) */}
      <section
        aria-label="Resumo dos municípios por nível de alerta"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            Resumo de {ufInicial} ({totalMunicipios} municípios)
          </h2>
          <p className="text-xs text-slate-600">
            Passe o ponteiro ou toque em um município para ver os detalhes. Nomes no mapa apenas para
            níveis 3 e 4 ao aproximar (zoom {zoomAtual}/{ZOOM_MINIMO_ROTULOS}+).
          </p>
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <li className="flex items-center gap-2.5 rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-2 text-emerald-950">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-700 text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">
                Nível 1 · {NIVEIS_ALERTA[1].corNome} (Baixo risco)
              </p>
              <p className="text-base font-bold tabular-nums">{contagemNiveis[1]}</p>
            </div>
          </li>

          <li className="flex items-center gap-2.5 rounded-lg border border-amber-700 bg-amber-50 px-3 py-2 text-amber-950">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-amber-600 text-slate-950">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">
                Nível 2 · {NIVEIS_ALERTA[2].corNome} (Atenção)
              </p>
              <p className="text-base font-bold tabular-nums">{contagemNiveis[2]}</p>
            </div>
          </li>

          <li className="flex items-center gap-2.5 rounded-lg border border-orange-700 bg-orange-50 px-3 py-2 text-orange-950">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-orange-700 text-white">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">
                Nível 3 · {NIVEIS_ALERTA[3].corNome} (Risco)
              </p>
              <p className="text-base font-bold tabular-nums">{contagemNiveis[3]}</p>
            </div>
          </li>

          <li className="flex items-center gap-2.5 rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-red-950">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-700 text-white">
              <OctagonAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">
                Nível 4 · {NIVEIS_ALERTA[4].corNome} (Epidemia)
              </p>
              <p className="text-base font-bold tabular-nums">{contagemNiveis[4]}</p>
            </div>
          </li>

          <li className="col-span-2 flex items-center gap-2.5 rounded-lg border border-slate-400 bg-slate-100 px-3 py-2 text-slate-900 sm:col-span-1">
            <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-500 bg-slate-300 text-slate-900">
              <svg width="28" height="28" viewBox="0 0 28 28" className="absolute inset-0" aria-hidden="true">
                <defs>
                  <pattern id="legenda-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="#cbd5e1" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" strokeWidth="2" />
                  </pattern>
                </defs>
                <rect width="28" height="28" fill="url(#legenda-hachura)" />
              </svg>
              <HelpCircle className="relative z-10 h-4 w-4 text-slate-950" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">Sem informação (hachurado)</p>
              <p className="text-base font-bold tabular-nums">{contagemNiveis.semInfo}</p>
            </div>
          </li>
        </ul>
      </section>

      {/* Mapa Leaflet */}
      <div className="relative z-0 isolate overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div
          ref={mapContainerRef}
          aria-label={`Mapa interativo dos municípios de ${ufInicial}. Use a tabela alternativa logo abaixo para navegação completa por teclado.`}
          className="h-[420px] w-full sm:h-[480px]"
        />
      </div>

      {resumo && (
        <p className="text-xs text-slate-700 tabular-nums">
          Resumo da carga: {resumo.total} municípios · {resumo.emCache} do cache ·{' '}
          {resumo.atualizadosApi} atualizados da API · {resumo.semDados} sem séries no período ·{' '}
          {resumo.falhas} indisponíveis.
        </p>
      )}

      {/* Alternativa completa em tabela acessível */}
      <section
        aria-labelledby="titulo-tabela-mapa"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="titulo-tabela-mapa" className="text-lg font-bold text-slate-950">
              Tabela alternativa de municípios ({listaTabela.length})
            </h2>
            <p className="text-sm text-slate-600">
              Alternativa em texto ao mapa. Selecione um município para destacá-lo no mapa e abrir o
              popup, ou abra diretamente o painel completo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div>
              <label htmlFor={filtroId} className="sr-only">
                Filtrar município na tabela
              </label>
              <input
                id={filtroId}
                type="search"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Filtrar por nome ou IBGE..."
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              />
            </div>

            <select
              aria-label="Filtrar por nível de alerta"
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            >
              <option value="todos">Todos os níveis</option>
              <option value="4">Nível 4 · Vermelho</option>
              <option value="3">Nível 3 · Laranja</option>
              <option value="2">Nível 2 · Amarelo</option>
              <option value="1">Nível 1 · Verde</option>
              <option value="indisponivel">Sem informação</option>
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-96 overflow-auto border-t border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-700">
              <tr className="border-b border-slate-200">
                <th scope="col" className="py-2.5 pr-4">Município</th>
                <th scope="col" className="py-2.5 pr-4">Código IBGE</th>
                <th scope="col" className="py-2.5 pr-4">Nível</th>
                <th scope="col" className="py-2.5 pr-4 text-right">Casos est.</th>
                <th scope="col" className="py-2.5 pr-4 text-right">Incidência / 100 mil</th>
                <th scope="col" className="py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {listaTabela.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-sm text-slate-600">
                    {carregandoInicial
                      ? 'Aguardando carregamento dos municípios...'
                      : 'Nenhum município encontrado com os filtros atuais.'}
                  </td>
                </tr>
              ) : (
                listaTabela.map((item) => {
                  const cfg = obterConfigNivel(item.nivel);
                  const selecionado = municipioSelecionadoMapa === item.codigo_ibge;
                  return (
                    <tr
                      key={item.codigo_ibge}
                      className={selecionado ? 'bg-blue-50' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => selecionarMunicipioNoMapa(item.codigo_ibge)}
                          className="text-left font-semibold text-blue-900 underline decoration-blue-400 underline-offset-2 hover:text-blue-700"
                        >
                          {item.nome}
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-tabular text-xs text-slate-600">
                        {item.codigo_ibge}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-800">
                        {cfg ? cfg.rotulo : 'Sem informação'}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-800">
                        {item.casos_est !== null
                          ? item.casos_est.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                          : 'N/D'}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">
                        {item.incidencia_100k !== null ? item.incidencia_100k.toFixed(1) : 'N/D'}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={selecionado}
                            onClick={() => selecionarMunicipioNoMapa(item.codigo_ibge)}
                            className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                              selecionado
                                ? 'border-blue-800 bg-blue-700 text-white'
                                : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            Ver no mapa
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onAbrirPainelMunicipio(
                                item.codigo_ibge,
                                item.nome,
                                item.uf,
                                doencaInicial
                              )
                            }
                            className="min-h-[36px] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                          >
                            Ver painel
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

      <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">
        Fonte: IBGE Malhas + InfoDengue, atualizado em{' '}
        {formatarDataPtBr(resumo?.atualizadoEm || new Date().toISOString())}
      </p>
    </div>
  );
}
