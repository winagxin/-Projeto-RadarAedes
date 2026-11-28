import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { RadarLogo } from './components/RadarLogo';
import { ComparacaoPage } from './pages/ComparacaoPage';
import { InicioPage } from './pages/InicioPage';
import { MapaUfPage } from './pages/MapaUfPage';
import { OrientacoesPage } from './pages/OrientacoesPage';
import { PainelMunicipioPage } from './pages/PainelMunicipioPage';
import { SobreDadosPage } from './pages/SobreDadosPage';
import { Doenca, MunicipioItem, MunicipioSeguido, RotaPagina } from './types';
import {
  lerMunicipiosSeguidos,
  MAX_SEGUIDOS,
  salvarMunicipiosSeguidos,
} from './utils/seguidos';

export default function App() {
  const [rota, setRota] = useState<RotaPagina>('inicio');
  const [uf, setUf] = useState<string>('RJ');
  const [doenca, setDoenca] = useState<Doenca>('dengue');
  const [municipio, setMunicipio] = useState<MunicipioItem | null>({
    codigo_ibge: '3304557',
    nome: 'Rio de Janeiro',
    uf: 'RJ',
    populacao: 6625849,
  });
  const [nivelOrientacao, setNivelOrientacao] = useState<number | null>(null);
  const [seguidos, setSeguidos] = useState<MunicipioSeguido[]>(() => lerMunicipiosSeguidos());
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  const [anuncioRota, setAnuncioRota] = useState('');

  const mainRef = useRef<HTMLElement>(null);
  const botaoMenuMobileRef = useRef<HTMLButtonElement>(null);
  const primeiraMontagemRef = useRef(true);

  const linksNav: Array<{ id: RotaPagina; label: string }> = [
    { id: 'inicio', label: 'Início' },
    { id: 'painel', label: 'Painel' },
    { id: 'mapa', label: 'Mapa da UF' },
    { id: 'comparar', label: `Comparar (${seguidos.length}/${MAX_SEGUIDOS})` },
    { id: 'orientacoes', label: 'O que fazer' },
    { id: 'sobre', label: 'Sobre os dados' },
  ];

  function obterTituloRota(r: RotaPagina): string {
    switch (r) {
      case 'inicio':
        return 'Início — Consulta por município';
      case 'painel':
        return municipio
          ? `Painel de ${municipio.nome} (${municipio.uf})`
          : 'Painel do município';
      case 'mapa':
        return `Mapa da UF — ${uf}`;
      case 'comparar':
        return 'Comparar municípios seguidos';
      case 'orientacoes':
        return 'O que fazer por nível de alerta';
      case 'sobre':
        return 'Sobre os dados';
    }
  }

  function navegarPara(novaRota: RotaPagina) {
    setRota(novaRota);
    setMenuMobileAberto(false);
    requestAnimationFrame(() => {
      mainRef.current?.focus();
    });
  }

  function adicionarSeguido(mun: MunicipioSeguido) {
    setSeguidos((atual) => {
      if (atual.some((s) => s.codigo_ibge === mun.codigo_ibge)) return atual;
      if (atual.length >= MAX_SEGUIDOS) return atual;
      return salvarMunicipiosSeguidos([...atual, mun]);
    });
  }

  function removerSeguido(codigoIbge: string) {
    setSeguidos((atual) =>
      salvarMunicipiosSeguidos(atual.filter((s) => s.codigo_ibge !== codigoIbge))
    );
  }

  function alternarSeguir(mun: MunicipioItem) {
    const jaExiste = seguidos.some((s) => s.codigo_ibge === mun.codigo_ibge);
    if (jaExiste) {
      removerSeguido(mun.codigo_ibge);
    } else {
      adicionarSeguido({
        codigo_ibge: mun.codigo_ibge,
        nome: mun.nome,
        uf: mun.uf || uf,
      });
    }
  }

  const tituloTelaAtual = obterTituloRota(rota);

  useEffect(() => {
    document.title = `${tituloTelaAtual} — RadarAedes`;
    if (primeiraMontagemRef.current) {
      primeiraMontagemRef.current = false;
      return;
    }
    setAnuncioRota(`Tela aberta: ${tituloTelaAtual}`);
  }, [rota, tituloTelaAtual]);

  useEffect(() => {
    if (!menuMobileAberto) return;
    function aoPressionarTecla(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        setMenuMobileAberto(false);
        requestAnimationFrame(() => {
          botaoMenuMobileRef.current?.focus();
        });
      }
    }
    document.addEventListener('keydown', aoPressionarTecla);
    return () => document.removeEventListener('keydown', aoPressionarTecla);
  }, [menuMobileAberto]);

  const geocodeAtual = municipio?.codigo_ibge ?? '3304557';
  const seguindoAtual = seguidos.some((s) => s.codigo_ibge === geocodeAtual);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF7F2] text-[#17212B]">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1200] focus:rounded-lg focus:bg-[#0F2744] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo principal
      </a>

      <header className="sticky top-0 z-[1100] border-b border-[#E2DBD0] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <a
            href="#inicio"
            onClick={(e) => {
              e.preventDefault();
              navegarPara('inicio');
            }}
            aria-label="RadarAedes — Ir para a página inicial"
            className="radar-transicao rounded-md py-1 whitespace-nowrap shrink-0 hover:opacity-85"
          >
            <RadarLogo />
          </a>

          <nav aria-label="Navegação principal" className="hidden lg:flex items-center gap-6">
            {linksNav.map((item) => {
              const ativo = rota === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navegarPara(item.id)}
                  aria-current={ativo ? 'page' : undefined}
                  className={`radar-interativo min-h-[42px] border-b-2 px-1 text-sm whitespace-nowrap shrink-0 ${
                    ativo
                      ? 'border-[#0F2744] font-semibold text-[#0F2744]'
                      : 'border-transparent font-medium text-slate-700 hover:border-[#B6C2CF] hover:text-[#0F2744]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navegarPara('painel')}
              className="radar-interativo hidden sm:inline-flex min-h-[42px] items-center rounded-lg bg-[#0F2744] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#16365C]"
            >
              Consultar painel
            </button>

            <button
              ref={botaoMenuMobileRef}
              type="button"
              aria-expanded={menuMobileAberto}
              aria-controls="menu-movel-radar"
              aria-label={menuMobileAberto ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuMobileAberto((v) => !v)}
              className="radar-interativo inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#D4CCC0] bg-white text-[#0F2744] hover:bg-[#F3EFE7] lg:hidden"
            >
              {menuMobileAberto ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {menuMobileAberto && (
          <nav
            id="menu-movel-radar"
            aria-label="Menu móvel"
            className="border-t border-[#E2DBD0] bg-white px-4 py-2 lg:hidden"
          >
            <ul className="flex flex-col gap-1">
              {linksNav.map((item) => {
                const ativo = rota === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navegarPara(item.id)}
                      aria-current={ativo ? 'page' : undefined}
                      className={`radar-interativo flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium ${
                        ativo
                          ? 'bg-[#EAEFF5] font-semibold text-[#0F2744]'
                          : 'text-slate-800 hover:bg-[#FAF7F2]'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncioRota}
      </div>

      <main
        id="conteudo-principal"
        ref={mainRef}
        tabIndex={-1}
        aria-label={tituloTelaAtual}
        className="flex-1 px-4 pt-6 pb-20 outline-none sm:px-6 sm:pt-10"
      >
        <div key={rota} className="radar-fade-tela">
          {rota === 'inicio' && (
            <InicioPage
              ufSelecionada={uf}
              doencaSelecionada={doenca}
              municipioAtual={municipio}
              onChangeUf={(novaUf) => setUf(novaUf)}
              onChangeDoenca={(novaDoenca) => setDoenca(novaDoenca)}
              onSelecionarMunicipio={(mun, d) => {
                setMunicipio(mun);
                setUf(mun.uf || uf);
                setDoenca(d);
                navegarPara('painel');
              }}
              onAbrirMapa={() => navegarPara('mapa')}
            />
          )}

          {rota === 'painel' && (
            <PainelMunicipioPage
              geocode={geocodeAtual}
              doenca={doenca}
              seguindo={seguindoAtual}
              totalSeguidos={seguidos.length}
              onAlternarSeguir={alternarSeguir}
              onAbrirComparacao={() => navegarPara('comparar')}
              onChangeDoenca={(d) => setDoenca(d)}
              onVoltarInicio={() => navegarPara('inicio')}
              onAbrirOrientacoes={(nivel) => {
                setNivelOrientacao(nivel);
                navegarPara('orientacoes');
              }}
              onAbrirMapa={() => navegarPara('mapa')}
            />
          )}

          {rota === 'mapa' && (
            <MapaUfPage
              ufInicial={uf}
              doencaInicial={doenca}
              onChangeUf={(novaUf) => setUf(novaUf)}
              onChangeDoenca={(novaDoenca) => setDoenca(novaDoenca)}
              onAbrirPainelMunicipio={(codigo, nome, ufMun, d) => {
                setMunicipio({ codigo_ibge: codigo, nome, uf: ufMun, populacao: null });
                setUf(ufMun);
                setDoenca(d);
                navegarPara('painel');
              }}
            />
          )}

          {rota === 'comparar' && (
            <ComparacaoPage
              seguidos={seguidos}
              doenca={doenca}
              onChangeDoenca={(d) => setDoenca(d)}
              onAdicionarSeguido={adicionarSeguido}
              onRemoverSeguido={removerSeguido}
              onAbrirPainel={(mun) => {
                setMunicipio({
                  codigo_ibge: mun.codigo_ibge,
                  nome: mun.nome,
                  uf: mun.uf,
                  populacao: null,
                });
                setUf(mun.uf);
                navegarPara('painel');
              }}
            />
          )}

          {rota === 'orientacoes' && <OrientacoesPage nivelInicial={nivelOrientacao} />}

          {rota === 'sobre' && <SobreDadosPage />}
        </div>
      </main>

      <footer
        role="contentinfo"
        data-surface="dark"
        className="fixed right-0 bottom-0 left-0 z-[1100] border-t border-[#16365C] bg-[#0F2744] px-4 py-2.5 text-center text-xs font-medium text-stone-100 sm:text-sm"
      >
        Informativo. Não substitui atendimento de saúde. Emergência: SAMU 192.
      </footer>
    </div>
  );
}
