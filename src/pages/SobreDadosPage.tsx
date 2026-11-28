import { useEffect, useState } from 'react';
import { ExternalLink, HeartPulse } from 'lucide-react';
import { RodapeFonte } from '../components/RodapeFonte';
import { formatarDataPtBr } from '../utils/niveis';

export function SobreDadosPage() {
  const [versaoModelo, setVersaoModelo] = useState<string>('2026-11-17');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch('/api/sobre')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.versaoModelo) setVersaoModelo(d.versaoModelo);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-600">Transparência metodológica e fontes abertas</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Sobre os dados
        </h1>
      </header>

      <section
        aria-labelledby="titulo-fontes"
        className="radar-cartao space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 id="titulo-fontes" className="text-lg font-bold text-slate-950">
          Fontes oficiais utilizadas
        </h2>

        <div className="space-y-4 text-sm leading-relaxed text-slate-800">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-950">
              1. InfoDengue — API alertcity (Nível A)
            </h3>
            <p className="mt-1">
              Fornece os alertas semanais municipais (níveis 1 a 4: verde, amarelo, laranja e
              vermelho), casos notificados, casos estimados e incidência por 100 mil habitantes
              para dengue, chikungunya e zika.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              URL:{' '}
              <a
                href="https://info.dengue.mat.br/services/api"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-800 underline"
              >
                https://info.dengue.mat.br/services/api
                <span className="sr-only"> (abre em nova aba)</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </p>
            <p className="mt-1 text-xs text-slate-700">
              Versão do modelo observada nos registros:{' '}
              <strong className="font-mono-tabular">
                {carregando ? (
                  <>
                    <span className="sr-only">Carregando versão do modelo...</span>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-24 rounded bg-[#E2DBD0] align-middle"
                    />
                  </>
                ) : (
                  formatarDataPtBr(versaoModelo)
                )}
              </strong>{' '}
              (<span className="font-mono-tabular">{versaoModelo}</span>)
            </p>
          </div>

          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-950">
              2. IBGE — Localidades (Nível A)
            </h3>
            <p className="mt-1">
              Fornece a lista oficial de Estados (UFs) e municípios brasileiros com o código IBGE de
              7 dígitos usado como identificador único no banco e nas consultas ao InfoDengue.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              URL:{' '}
              <a
                href="https://servicodados.ibge.gov.br/api/v1/localidades/estados"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-800 underline"
              >
                https://servicodados.ibge.gov.br/api/v1/localidades/estados
                <span className="sr-only"> (abre em nova aba)</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-950">
              3. IBGE — Malhas Territoriais GeoJSON (Nível A)
            </h3>
            <p className="mt-1">
              Fornece os polígonos municipais por UF usados para desenhar e colorir o Mapa da UF
              no Leaflet, armazenados em cache local para evitar downloads repetidos.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              URL:{' '}
              <span className="font-mono-tabular">
                https://servicodados.ibge.gov.br/api/v3/malhas/estados/&#123;UF&#125;?formato=application/vnd.geo+json&amp;qualidade=minima&amp;intrarregiao=municipio
              </span>
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="titulo-limitacoes"
        className="radar-cartao space-y-3 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 id="titulo-limitacoes" className="text-lg font-bold text-slate-950">
          Decisões e limitações conhecidas
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-800">
          <li>
            <strong>Sem recálculo de nível:</strong> o semáforo exibido vem diretamente do campo{' '}
            <code className="font-mono-tabular">nivel</code> da API do InfoDengue.
          </li>
          <li>
            <strong>Atraso de notificação:</strong> a semana epidemiológica mais recente pode estar
            incompleta e sofrer revisão nas semanas seguintes.
          </li>
          <li>
            <strong>Tendência com tolerância de ±5%:</strong> a classificação (Sobe, Estável ou Cai)
            compara <code className="font-mono-tabular">casos_est</code> das duas últimas semanas
            completas; considerar variação dentro de ±5% como estável é decisão deste projeto e não
            vem da fonte.
          </li>
          <li>
            <strong>Limite de requisições:</strong> o InfoDengue não documenta limite numérico
            rígido de requisições; por cautela, o servidor usa cache de 6 horas, timeout de 9 segundos
            e no máximo 4 chamadas simultâneas no Mapa da UF.
          </li>
          <li>
            <strong>Plano B offline:</strong> quando as APIs falham, o sistema recorre ao histórico já
            salvo no SQLite e às amostras locais em <code className="font-mono-tabular">data/</code>{' '}
            (originalmente apenas Rio de Janeiro capital para dengue e ampliado com a coleta de 6
            municípios da Região Metropolitana do RJ).
          </li>
          <li>
            <strong>Privacidade:</strong> não coletamos dados pessoais, sem login, sem cookies de
            rastreio e sem ferramentas de analytics. Todos os dados são públicos e agregados por
            município.
          </li>
        </ul>
      </section>

      <aside
        aria-label="Aviso de saúde pública"
        className="flex items-start gap-3 rounded-xl border-2 border-slate-900 bg-slate-100 p-5 text-slate-950"
      >
        <HeartPulse className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
        <div className="text-sm leading-relaxed">
          <p className="font-bold">Aviso de saúde pública</p>
          <p className="mt-1">
            Este sistema tem caráter estritamente informativo e educacional. Ele não substitui
            avaliação clínica ou atendimento de saúde. Em caso de sinais de alarme ou emergência,
            procure a UBS/UPA mais próxima ou ligue para o <strong>SAMU 192</strong>.
          </p>
        </div>
      </aside>

      <RodapeFonte modeloData={versaoModelo} />
    </div>
  );
}
