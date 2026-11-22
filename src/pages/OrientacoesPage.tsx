import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Droplets,
  FileWarning,
  Hospital,
  OctagonAlert,
  ShieldCheck,
} from 'lucide-react';
import { OrientacaoNivel } from '../types';
import { obterConfigNivel } from '../utils/niveis';

interface OrientacoesPageProps {
  nivelInicial: number | null;
}

interface RespostaOrientacoes {
  aviso_revisao: string;
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

  const temRevisar =
    dados !== null && JSON.stringify(dados).toUpperCase().includes('REVISAR');

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

      {temRevisar && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border-2 border-amber-700 bg-amber-50 px-4 py-3.5 text-amber-950"
        >
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-bold">Texto provisório, em revisão</p>
            <p className="mt-0.5 text-amber-900">
              {dados?.aviso_revisao ||
                'Este conteúdo é provisório (marcado com REVISAR) e será conferido pela equipe em fontes oficiais do Ministério da Saúde.'}
            </p>
          </div>
        </div>
      )}

      {carregando && (
        <div
          aria-busy="true"
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-6"
        >
          <p className="text-sm text-slate-700">Carregando orientações...</p>
          <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
        </div>
      )}

      {!carregando && erro && (
        <div role="alert" className="rounded-xl border border-red-700 bg-red-50 p-5 text-red-950">
          {erro}
        </div>
      )}

      {!carregando && !erro && dados && (
        <>
          {/* Seletor acessível de nível 1..4 */}
          <div
            role="tablist"
            aria-label="Selecionar nível de alerta para ver orientações"
            className="grid gap-2 sm:grid-cols-4"
          >
            {dados.niveis.map((n) => {
              const ativo = n.nivel === nivelAtual?.nivel;
              const styleCfg = obterConfigNivel(n.nivel);
              return (
                <button
                  key={n.nivel}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setNivelSelecionado(n.nivel)}
                  className={`flex min-h-[48px] items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    ativo && styleCfg
                      ? `${styleCfg.borderClass} ${styleCfg.bgCardClass} ${styleCfg.textClass}`
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <IconeNivel nivel={n.nivel} />
                  <span>{n.titulo}</span>
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
              aria-label={nivelAtual.titulo}
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
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
                <p className="mt-2 text-sm leading-relaxed">{nivelAtual.resumo}</p>
              </div>

              <section aria-labelledby="sec-agua-parada" className="space-y-2">
                <h3
                  id="sec-agua-parada"
                  className="flex items-center gap-2 text-base font-bold text-slate-950"
                >
                  <Droplets className="h-5 w-5 text-blue-700" aria-hidden="true" />
                  Eliminar água parada e prevenção
                </h3>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800">
                  {nivelAtual.eliminar_agua_parada.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="sec-sinais-alarme" className="space-y-2">
                <h3
                  id="sec-sinais-alarme"
                  className="flex items-center gap-2 text-base font-bold text-slate-950"
                >
                  <AlertTriangle className="h-5 w-5 text-orange-700" aria-hidden="true" />
                  Sinais de alarme
                </h3>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800">
                  {nivelAtual.sinais_alarme.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="sec-ubs" className="space-y-2">
                <h3
                  id="sec-ubs"
                  className="flex items-center gap-2 text-base font-bold text-slate-950"
                >
                  <Hospital className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  Quando procurar a UBS ou emergência
                </h3>
                <p className="text-sm leading-relaxed text-slate-800">
                  {nivelAtual.quando_procurar_ubs}
                </p>
              </section>

              <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">
                {nivelAtual.fonte_conferencia}
              </p>
            </article>
          )}
        </>
      )}

      <p className="border-t border-slate-200 pt-3 text-xs text-slate-600">
        Fonte: content/orientacoes.json (revisão humana pendente), atualizado em 22/11/2026
      </p>
    </div>
  );
}
