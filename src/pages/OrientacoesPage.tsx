import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  OctagonAlert,
  ShieldCheck,
} from 'lucide-react';
import { RodapeFonte } from '../components/RodapeFonte';
import { FonteOrientacao, OrientacaoNivel } from '../types';
import { obterConfigNivel } from '../utils/niveis';

interface OrientacoesPageProps {
  nivelInicial: number | null;
}

interface RespostaOrientacoes {
  atualizado_em?: string;
  fontes: FonteOrientacao[];
  niveis: OrientacaoNivel[];
}

function IconeNivel({ nivel }: { nivel: number }) {
  switch (nivel) {
    case 1:
      return <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
    case 2:
      return <AlertCircle className="h-5 w-5" aria-hidden="true" />;
    case 3:
      return <AlertTriangle className="h-5 w-5" aria-hidden="true" />;
    default:
      return <OctagonAlert className="h-5 w-5" aria-hidden="true" />;
  }
}

export function OrientacoesPage({ nivelInicial }: OrientacoesPageProps) {
  const [dados, setDados] = useState<RespostaOrientacoes | null>(null);
  const [nivelSelecionado, setNivelSelecionado] = useState<number>(nivelInicial ?? 1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const baseTabId = useId();
  const panelId = `${baseTabId}-panel`;
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (nivelInicial && [1, 2, 3, 4].includes(nivelInicial)) {
      setNivelSelecionado(nivelInicial);
    }
  }, [nivelInicial]);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    fetch('/api/orientacoes')
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar orientações.');
        return r.json() as Promise<RespostaOrientacoes>;
      })
      .then((json) => setDados(json))
      .catch((err) => setErro((err as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  const nivelAtual =
    dados?.niveis.find((n) => n.nivel === nivelSelecionado) || dados?.niveis[0] || null;
  const cfg = nivelAtual ? obterConfigNivel(nivelAtual.nivel) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-600">
          Guia prático para moradores, escolas e agentes de saúde
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          O que fazer por nível de alerta
        </h1>
      </header>

      {carregando && (
        <div role="status" aria-busy="true" aria-live="polite" className="space-y-5">
          <span className="sr-only">Carregando orientações...</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((tab) => (
              <div
                key={tab}
                className="h-12 rounded-xl border border-[#E2DBD0] bg-white p-3"
              >
                <div className="mx-auto h-4 w-20 rounded bg-[#E2DBD0]" />
              </div>
            ))}
          </div>
          <div className="space-y-4 rounded-xl border border-[#E2DBD0] bg-white p-5 sm:p-6">
            <div className="h-20 rounded-xl bg-[#EAE4DA]" />
            <div className="h-4 w-48 rounded bg-[#E2DBD0]" />
            <div className="space-y-2.5">
              <div className="h-4 w-full rounded bg-[#F3EFE7]" />
              <div className="h-4 w-5/6 rounded bg-[#F3EFE7]" />
              <div className="h-4 w-4/6 rounded bg-[#F3EFE7]" />
            </div>
          </div>
        </div>
      )}

      {!carregando && erro && (
        <div role="alert" className="rounded-xl border border-red-700 bg-red-50 p-5 text-red-950">
          {erro}
        </div>
      )}

      {!carregando && !erro && dados && (
        <>
          {/* Seletor acessível apenas com o nome das cores e ícone */}
          <div
            role="tablist"
            aria-label="Selecionar nível de alerta por cor"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {dados.niveis.map((n, idx) => {
              const ativo = n.nivel === nivelAtual?.nivel;
              const styleCfg = obterConfigNivel(n.nivel);
              return (
                <button
                  key={n.nivel}
                  ref={(el) => {
                    tabRefs.current[n.nivel] = el;
                  }}
                  id={`${baseTabId}-tab-${n.nivel}`}
                  type="button"
                  role="tab"
                  tabIndex={ativo ? 0 : -1}
                  aria-selected={ativo}
                  aria-controls={panelId}
                  aria-label={`${n.cor_nome} (${n.titulo})`}
                  onClick={() => setNivelSelecionado(n.nivel)}
                  onKeyDown={(e) => {
                    const lista = dados.niveis;
                    let proximoNivel: number | null = null;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      proximoNivel = lista[(idx + 1) % lista.length].nivel;
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      proximoNivel = lista[(idx - 1 + lista.length) % lista.length].nivel;
                    } else if (e.key === 'Home') {
                      proximoNivel = lista[0].nivel;
                    } else if (e.key === 'End') {
                      proximoNivel = lista[lista.length - 1].nivel;
                    }
                    if (proximoNivel !== null) {
                      e.preventDefault();
                      setNivelSelecionado(proximoNivel);
                      requestAnimationFrame(() => {
                        tabRefs.current[proximoNivel as number]?.focus();
                      });
                    }
                  }}
                  className={`radar-interativo flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold ${
                    ativo && styleCfg
                      ? `${styleCfg.borderClass} ${styleCfg.bgCardClass} ${styleCfg.textClass}`
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <IconeNivel nivel={n.nivel} />
                  <span>{n.cor_nome}</span>
                </button>
              );
            })}
          </div>

          {!nivelAtual ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              Nenhuma orientação cadastrada para este nível.
            </p>
          ) : (
            <article
              id={panelId}
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`${baseTabId}-tab-${nivelAtual.nivel}`}
              className="radar-cartao space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
            >
              <div
                className={`rounded-xl border-2 p-4 ${
                  cfg ? `${cfg.borderClass} ${cfg.bgCardClass} ${cfg.textClass}` : 'border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <IconeNivel nivel={nivelAtual.nivel} />
                  <h2 className="text-xl font-bold">{nivelAtual.titulo}</h2>
                </div>
                {nivelAtual.resumo && (
                  <p className="mt-2 text-sm leading-relaxed">{nivelAtual.resumo}</p>
                )}
              </div>

              <section aria-labelledby="sec-orientacoes-nivel" className="space-y-3">
                <h3 id="sec-orientacoes-nivel" className="text-base font-bold text-slate-950">
                  Orientações para este nível
                </h3>
                <ul className="list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-slate-800">
                  {nivelAtual.orientacoes.map((item, idx) => (
                    <li key={idx}>
                      <strong className="text-slate-950">{item.titulo}:</strong> {item.descricao}
                    </li>
                  ))}
                </ul>
              </section>
            </article>
          )}

          {dados.fontes && dados.fontes.length > 0 && (
            <section
              aria-labelledby="titulo-fontes-orientacoes"
              className="radar-cartao rounded-xl border border-slate-200 bg-white p-5"
            >
              <h2 id="titulo-fontes-orientacoes" className="text-base font-bold text-slate-950">
                Fontes oficiais consultadas
              </h2>
              <ul className="mt-2.5 space-y-2 text-sm text-slate-800">
                {dados.fontes.map((fonte) => (
                  <li key={fonte.url}>
                    <a
                      href={fonte.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-start gap-1.5 font-medium text-blue-800 underline hover:text-blue-950"
                    >
                      <span>{fonte.titulo}</span>
                      <span className="sr-only"> (abre em nova aba)</span>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <RodapeFonte />
    </div>
  );
}
