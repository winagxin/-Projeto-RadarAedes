import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
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

  const mainRef = useRef<HTMLElement>(null);

  const linksNav: Array<{ id: RotaPagina; label: string }> = [
    { id: 'inicio', label: 'Início' },
    { id: 'painel', label: 'Painel' },
    { id: 'mapa', label: 'Mapa da UF' },
    { id: 'comparar', label: `Comparar (${seguidos.length}/${MAX_SEGUIDOS})` },
    { id: 'orientacoes', label: 'O que fazer' },
    { id: 'sobre', label: 'Sobre os dados' },
  ];

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

  useEffect(() => {
    document.title = 'RadarAedes — Semáforo de Alerta de Arboviroses';
  }, []);

  const geocodeAtual = municipio?.codigo_ibge ?? '3304557';
  const seguindoAtual = seguidos.some((s) => s.codigo_ibge === geocodeAtual);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1200] focus:rounded-lg focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo principal
      </a>

      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <a
            href="#inicio"
            onClick={(e) => {
              e.preventDefault();
              navegarPara('inicio');
            }}
            className="text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
          >
            RadarAedes
          </a>

          <nav aria-label="Navegação principal" className="hidden lg:flex items-center gap-5">
            {linksNav.map((item) => {
              const ativo = rota === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navegarPara(item.id)}
                  aria-current={ativo ? 'page' : undefined}
                  className={`min-h-[40px] border-b-2 px-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    ativo
                      ? 'border-blue-700 font-semibold text-blue-800'
                      : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-950'
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
              className="hidden sm:inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-slate-800"
            >
              Consultar painel
            </button>

            <button
              type="button"
              aria-expanded={menuMobileAberto}
              aria-label={menuMobileAberto ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuMobileAberto((v) => !v)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 text-slate-800 lg:hidden"
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
            aria-label="Menu móvel"
            className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden"
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
                      className={`flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium ${
                        ativo
                          ? 'bg-blue-50 font-semibold text-blue-900'
                          : 'text-slate-800 hover:bg-slate-100'
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

      <main
        id="conteudo-principal"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 px-4 pt-6 pb-20 outline-none sm:px-6 sm:pt-8"
      >
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
      </main>

      <footer
        role="contentinfo"
        className="fixed right-0 bottom-0 left-0 z-[1100] border-t border-slate-800 bg-slate-950 px-4 py-2.5 text-center text-xs font-medium text-slate-100 sm:text-sm"
      >
        Informativo. Não substitui atendimento de saúde. Emergência: SAMU 192.
      </footer>
    </div>
  );
}
