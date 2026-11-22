# RadarAedes

Sistema web de vigilância e comunicação de risco de arboviroses (dengue, chikungunya e zika) com base em dados abertos e níveis de alerta municipais.

## Problema

Moradores, agentes de saúde e escolas precisam de um meio rápido, acessível e sem jargão técnico excessivo para saber qual é o nível de alerta de dengue, chikungunya e zika em seu município, entender se a situação está subindo ou caindo nas últimas semanas e consultar orientações práticas de prevenção e busca por atendimento — inclusive em cenários de conexão instável.

## Fontes de dados

### 1. IBGE – Localidades: Municípios por UF (nível A)

- URL: https://servicodados.ibge.gov.br/api/v1/localidades/estados/RJ/municipios
- Parâmetros: sigla do estado na URL (RJ)
- Testado em: 22/11/2026
- Amostra salva em: data/amostra_ibge_municipios.json
- Exemplo de resposta (primeiro item, o município de Angra dos Reis):

```json
{
  "id": 3300100,
  "nome": "Angra dos Reis",
  "microrregiao": {
    "id": 33013,
    "nome": "Baía da Ilha Grande",
    "mesorregiao": {
      "id": 3305,
      "nome": "Sul Fluminense",
      "UF": {
        "id": 33,
        "sigla": "RJ",
        "nome": "Rio de Janeiro",
        "regiao": { "id": 3, "sigla": "SE", "nome": "Sudeste" }
      }
    }
  },
  "regiao-imediata": {
    "id": 330002,
    "nome": "Angra dos Reis",
    "regiao-intermediaria": {
      "id": 3301,
      "nome": "Rio de Janeiro",
      "UF": {
        "id": 33,
        "sigla": "RJ",
        "nome": "Rio de Janeiro",
        "regiao": { "id": 3, "sigla": "SE", "nome": "Sudeste" }
      }
    }
  }
}
```

#### Campos usados do IBGE (Municípios)

- id: código do município com 7 dígitos (usado como geocode no InfoDengue)
- nome: nome do município (usado na busca com autocompletar)

### 2. IBGE – Localidades: Estados (nível A)

- URL: https://servicodados.ibge.gov.br/api/v1/localidades/estados
- Parâmetros: nenhum (retorna as 27 unidades federativas do Brasil)
- Campos usados: `id`, `sigla`, `nome`
- Exemplo resumido de resposta (item do Rio de Janeiro):

```json
{
  "id": 33,
  "sigla": "RJ",
  "nome": "Rio de Janeiro",
  "regiao": {
    "id": 3,
    "sigla": "SE",
    "nome": "Sudeste"
  }
}
```

### 3. IBGE – Malhas Territoriais GeoJSON (nível A)

- URL: https://servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio
- Parâmetros usados: `{UF}` na rota (ex.: `RJ`), `formato=application/vnd.geo+json`, `qualidade=minima` e `intrarregiao=municipio`
- Campos usados: `features[].properties.codarea` (código IBGE de 7 dígitos para ligar o polígono ao município) e `features[].geometry`
- Exemplo resumido de resposta (RJ com 92 feições; coordenadas abreviadas):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "codarea": "3300100"
      },
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": "[[...]]"
      }
    }
  ]
}
```

### 4. InfoDengue – alertcity (nível A)

- URL: https://info.dengue.mat.br/api/alertcity
- Parâmetros: geocode=3304557, disease=dengue, format=json, ew_start=1, ew_end=52, ey_start=2026, ey_end=2026
- Testado em: 22/11/2026
- Amostra salva em: data/amostra_infodengue.json
- Exemplo de resposta (um item, semana 45 de 2026, Rio de Janeiro):

```json
{
  "data_iniSE": 1794096000000,
  "SE": 202645,
  "casos_est": 397.0,
  "casos_est_min": 285,
  "casos_est_max": 595,
  "casos": 170,
  "p_rt1": 0.9994103,
  "p_inc100k": 5.991685,
  "Localidade_id": 0,
  "nivel": 3,
  "id": 330455720264520774,
  "versao_modelo": "2026-11-17",
  "municipio_nome": "Rio de Janeiro",
  "Rt": 1.2771239,
  "pop": "6625849",
  "tempmin": "18.6812666666667",
  "umidmax": "89.3886",
  "receptivo": 0,
  "transmissao": 1,
  "nivel_inc": 1,
  "umidmed": "81.0942666666667",
  "umidmin": "69.7470333333333",
  "tempmed": "20.4219333333333",
  "tempmax": "22.045",
  "casprov": 147,
  "casprov_est": null,
  "casprov_est_min": null,
  "casprov_est_max": null,
  "casconf": null,
  "notif_accum_year": 16830
}
```

#### Campos usados do InfoDengue

- SE: semana epidemiológica (AAAASS)
- data_iniSE: início da semana (milissegundos)
- nivel: alerta (1 verde, 2 amarelo, 3 laranja, 4 vermelho)
- casos_est: casos estimados
- p_inc100k: incidência por 100 mil habitantes
- versao_modelo: data de atualização dos dados
- pop: população do município usada no cálculo do InfoDengue
- Fonte da legenda dos níveis: https://info.dengue.mat.br/services/api

#### Observações sobre a resposta

- Cada item é uma semana epidemiológica de um município.
- Alguns campos podem vir como `null` (por exemplo `casconf` e `casprov_est`); o código precisa tratar isso.
- Alguns números vêm como texto (por exemplo `pop` e `tempmax`); converter antes de calcular.
- A semana mais recente pode estar incompleta por atraso de notificação; avisar na tela.
- O app não recalcula o nível de alerta: mostra o valor de `nivel` que vem da API.

### 5. OpenStreetMap / Leaflet (fonte complementar não governamental)

- URL dos tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (renderizado via Leaflet)
- Uso: camada visual de mapa de fundo geográfico para contextualizar os limites municipais do IBGE na tela Mapa da UF. Não fornece dados epidemiológicos nem recebe dados pessoais.

## Esquema do banco de dados

O banco local usa SQLite (`data/radar_aedes.db` via módulo nativo `node:sqlite`) com integridade referencial ativada (`PRAGMA foreign_keys = ON`) e coluna `is_teste` booleana (`0` por padrão) em todas as tabelas:

```text
municipios (codigo_ibge PK, nome, uf, populacao, is_teste)
    │
    ├──< consultas_alerta (id PK, codigo_ibge FK, doenca, data_coleta, fonte, modo_offline, is_teste)
    │        │
    │        └──< alerta_semanal (id PK, consulta_id FK, codigo_ibge FK, doenca, semana_epi,
    │                             data_ini_se, nivel, casos_est, casos_est_min, casos_est_max,
    │                             casos, incidencia_100k, versao_modelo, is_teste)
    │            [UNIQUE (codigo_ibge, doenca, semana_epi) -> atualiza sem duplicar]
    │
cache_malhas_uf (uf PK, geojson, data_coleta, is_teste)
```

> **Nota:** o arquivo `data/radar_aedes.db` não é versionado (está listado no `.gitignore`), é recriado automaticamente na inicialização do servidor e se preenche conforme as consultas. Para recompor as amostras completas no banco local, rode `npx tsx scripts/coletar-amostras.ts`.

## Como rodar

1. Instalar as dependências:

```bash
npm install
```

2. Criar as tabelas do SQLite e carregar as amostras iniciais em `data/`:

```bash
npx tsx scripts/migrate-seed.ts
```

3. (Opcional) Coletar séries reais de 2026 para os 6 municípios do RJ e gerar `data/amostra_infodengue_rj.json`:

```bash
npx tsx scripts/coletar-amostras.ts
```

4. Iniciar o servidor de desenvolvimento (Express + Vite na porta 3000):

```bash
npm run dev
```

5. Simular o modo offline (Plano B) localmente:

PowerShell (Windows):

```powershell
$env:RADAR_FORCE_OFFLINE=1; npm run dev
```

Linux/macOS/Git Bash:

```bash
RADAR_FORCE_OFFLINE=1 npm run dev
```

6. Gerar build de produção e checar tipos:

```bash
npm run lint
npm run build
npm start
```

## Decisões do projeto

- O nível de alerta vem direto do campo `nivel` da API. O app não recalcula nem reinterpreta.
- Tendência: compara os casos estimados (`casos_est`) das duas últimas semanas completas, descartando a semana mais recente. Variação dentro de ±5% é "Estável". Essa tolerância é decisão do projeto e não vem da fonte.
- A semana mais recente pode estar incompleta por atraso de notificação, e a tela avisa isso.
- Aviso de poucos casos: quando `casos_est` de pelo menos uma das duas semanas completas comparadas for menor que 20 (`anterior < 20 || atual < 20`), o app exibe `"poucos casos: variação instável"`. Esse limite de 20 casos é decisão do projeto, e não vem da fonte.
- Janelas de consulta: o painel do município exibe até 12 semanas no gráfico e na série histórica (buscando uma janela de 16 semanas na API), enquanto o Mapa da UF consulta uma janela enxuta de 4 semanas por município para agilizar o carregamento estadual.
- População exibida: o total de habitantes mostrado no painel vem do campo `pop` retornado pelo InfoDengue (convertido de texto para inteiro ao salvar no banco), porque a API de Localidades do IBGE não inclui população.
- Cache no SQLite: o servidor grava respostas do InfoDengue em `data/radar_aedes.db` com validade de **6 horas** (`consultas_alerta` e `alerta_semanal`, usando `UNIQUE(codigo_ibge, doenca, semana_epi)` para atualizar semanas sem duplicar) e malhas do IBGE com validade de **24 horas** (`cache_malhas_uf`). O front-end consulta apenas as rotas `/api/*` do servidor.
- Comparação de municípios: a lista de até 3 municípios seguidos é salva somente no navegador (`localStorage`), sem login e sem envio de dado pessoal para o servidor.

## Limitações conhecidas

- O InfoDengue não documenta um limite numérico de requisições. Por cautela, o app usa no máximo 4 chamadas simultâneas, timeout de 9 segundos e cache de 6 horas.
- O plano B offline (`data/amostra_infodengue_rj.json`) cobre 6 municípios do RJ (Rio de Janeiro, Belford Roxo, Mesquita, Niterói, Duque de Caxias e Nova Iguaçu), dengue e chikungunya, coletados em 22/11/2026; zika sem registros em 2026 na fonte.
- O "atualizado em" mostra a data da versão do modelo (`versao_modelo`), e não a data da coleta.
- Os textos de orientação por nível são provisórios (marcados "REVISAR") até a conferência em fonte oficial.

## Requisitos para rodar

- Node.js 22.13 ou superior: o projeto usa o módulo nativo `node:sqlite`, exigindo Node.js 22.13 ou superior (confirmar na documentação do Node a versão em que o `node:sqlite` deixou de exigir flag).
- Banco local e publicação: o desenvolvimento usa SQLite (`data/radar_aedes.db`) pela simplicidade de rodar localmente sem servidor de banco separado. Ao publicar em ambiente com contêineres (como o Cloud Run), o disco local é temporário e apagado a cada reinício ou nova versão; por isso, em produção será necessário migrar para um banco persistente externo, como o PostgreSQL. **Esse banco persistente para publicação ainda não foi implementado (pendente).**

## Privacidade e LGPD

- Nenhum dado pessoal é coletado, gravado ou enviado (sem nome, CPF, e-mail, GPS ou identificador de usuário).
- Sem login, sem cookies de rastreamento e sem ferramentas de analytics.
- Todos os dados gravados no SQLite são públicos e agregados por município e semana epidemiológica.
- A seleção de até 3 municípios na tela Comparar permanece apenas no `localStorage` do próprio navegador.

## Acessibilidade

Recursos implementados e verificados no código da aplicação:

- **Cor nunca isolada**: os níveis 1 a 4 combinam cor, texto descritivo e ícone nos cartões de alerta e na legenda do mapa; no gráfico das 12 semanas (`src/components/GraficoTendencia.tsx`), cada nível possui também uma forma geométrica própria (círculo para nível 1, quadrado para nível 2, triângulo para nível 3 e losango para nível 4).
- **Rótulos e nomes acessíveis**: campos associados via `<label>`, grupos com `aria-label` e botões de ação descritivos, incluindo os botões de remover na comparação (`aria-label="Remover <município> da comparação"` em `src/pages/ComparacaoPage.tsx`).
- **Foco e navegação por teclado**: link `"Pular para o conteúdo principal"`, estilo global `:focus-visible` de alto contraste, foco movido para o `<main>` na troca de tela, combobox de busca municipal com suporte a `ArrowDown`/`ArrowUp`/`Enter`/`Escape` e pontos do gráfico navegáveis por `Tab` e setas esquerda/direita.
- **Alternativas em texto**: tabelas HTML semânticas (`<caption>` e `<th scope="col">`) no gráfico das 12 semanas, no Mapa da UF (com busca e filtro por nível) e na tela Comparar.
- **Sobreposição e movimento reduzido**: rodapé fixo e cabeçalho com `z-[1100]` (`src/App.tsx`) sobre o contêiner isolado do mapa Leaflet (`relative z-0 isolate` em `src/pages/MapaUfPage.tsx`), além de suporte a `prefers-reduced-motion` no CSS.
- **Pendências de auditoria externa**: execução de auditoria formal com leitor de tela (Narrador/NVDA) e Lighthouse em ambiente publicado (a preencher abaixo após os testes da dupla).

### Testes realizados

- **Leitor de tela (Narrador / NVDA)**: _Pendente — preencher com observações e resultado após teste da dupla_ (Data: _dd/mm/aaaa_)
- **Lighthouse (Acessibilidade)**: _Pendente — preencher com a pontuação obtida e eventuais apontamentos_ (Data: _dd/mm/aaaa_)
- **Navegação completa por teclado (Tab / Shift+Tab / Setas / Enter / Esc)**: _Pendente — preencher após percurso completo nas 6 telas_ (Data: _dd/mm/aaaa_)

## Prompts usados

*(Espaço reservado para a dupla registrar os prompts e ajustes realizados durante o desenvolvimento e revisão do projeto.)*

- **Prompt 1 (Planejamento e teste de APIs)**: _Preencher com o prompt usado_
- **Prompt 2 (Banco de dados e backend)**: _Preencher com o prompt usado_
- **Prompt 3 (Interface, acessibilidade, mapa e revisão)**: _Preencher com o prompt usado_

## Entregas

- **Link público da aplicação**: _Preencher com a URL publicada_
- **Link do vídeo de demonstração**: _Preencher com o link do vídeo_
