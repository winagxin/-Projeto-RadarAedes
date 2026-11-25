import { AlertCircle, AlertTriangle, OctagonAlert, ShieldCheck } from 'lucide-react';
import { formatarSemanaEpi, obterConfigNivel } from '../utils/niveis';

interface SemaforoCardProps {
  nivel: number | null;
  semanaAtual: number | null;
  dataIniSe?: number | null;
  compacto?: boolean;
}

function IconeNivel({ nivel, className }: { nivel: number; className?: string }) {
  switch (nivel) {
    case 1:
      return <ShieldCheck className={className} aria-hidden="true" />;
    case 2:
      return <AlertCircle className={className} aria-hidden="true" />;
    case 3:
      return <AlertTriangle className={className} aria-hidden="true" />;
    default:
      return <OctagonAlert className={className} aria-hidden="true" />;
  }
}

export function SemaforoCard({ nivel, semanaAtual, dataIniSe, compacto = false }: SemaforoCardProps) {
  const cfg = obterConfigNivel(nivel);

  if (!cfg) {
    return (
      <div className="radar-cartao rounded-xl border border-slate-300 bg-slate-100 p-5 text-slate-800">
        <p className="text-base font-semibold">Nível de alerta indisponível</p>
        <p className="mt-1 text-sm text-slate-700">
          Não há leitura numérica de alerta para este município no período consultado.
        </p>
      </div>
    );
  }

  const classePulso =
    cfg.nivel === 3
      ? 'radar-pulso-laranja'
      : cfg.nivel === 4
      ? 'radar-pulso-vermelho'
      : '';

  return (
    <section
      aria-label={`Semáforo de alerta: ${cfg.rotulo}`}
      className={`radar-cartao ${classePulso} rounded-xl border-2 ${cfg.borderClass} ${cfg.bgCardClass} ${cfg.textClass} ${
        compacto ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${cfg.iconBgClass}`}
          >
            <IconeNivel nivel={cfg.nivel} className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Semáforo de alerta do InfoDengue
              {semanaAtual ? ` · ${formatarSemanaEpi(semanaAtual, dataIniSe)}` : ''}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{cfg.rotulo}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-800">
              {cfg.descricaoCurta}
            </p>
          </div>
        </div>

        {/* Escala visual de 4 luzes do semáforo com indicador textual de ativo */}
        <div
          className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 sm:self-center"
          aria-label="Escala do semáforo de 1 a 4"
        >
          {[
            { n: 1, label: 'Verde', cor: 'bg-emerald-700' },
            { n: 2, label: 'Amarelo', cor: 'bg-amber-500' },
            { n: 3, label: 'Laranja', cor: 'bg-orange-600' },
            { n: 4, label: 'Vermelho', cor: 'bg-red-700' },
          ].map((luz) => {
            const ativo = luz.n === cfg.nivel;
            return (
              <div key={luz.n} className="flex flex-col items-center gap-1 px-1">
                <span
                  aria-hidden="true"
                  className={`block h-4 w-4 rounded-full border ${
                    ativo
                      ? `${luz.cor} border-slate-900 ring-2 ring-slate-900 ring-offset-1`
                      : 'border-slate-300 bg-slate-200'
                  }`}
                />
                <span
                  className={`text-[11px] tabular-nums ${
                    ativo ? 'font-bold text-slate-950' : 'text-slate-600'
                  }`}
                >
                  {luz.n}
                  <span className="sr-only"> ({luz.label}{ativo ? ', nível atual' : ''})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
