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

### 6. Ministério da Saúde – Orientações de prevenção e atendimento

- Diretrizes Nacionais para Prevenção e Controle de Epidemias de Dengue: https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/dengue/diretrizes_nacionais_prevencao_controle_dengue.pdf
- Plano de Contingência Nacional para Dengue, Chikungunya e Zika (2025): https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/guias-e-manuais/2025/plano-de-contingencia-nacional-para-dengue-chikungunya-e-zika.pdf
- Uso: base oficial para os textos revisados da tela "O que fazer" (armazenados em `content/orientacoes.json`).

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
- Tendência: compara os casos estimados (`casos_est`) das duas últimas semanas (semana passada vs. semana atual). Variação dentro de ±5% é "Estável". Essa tolerância é decisão do projeto e não vem da fonte.
- A semana mais recente pode estar incompleta por atraso de notificação, e a tela avisa isso.
- Aviso de poucos casos: quando `casos_est` de pelo menos uma das duas semanas comparadas for menor que 20 (`anterior < 20 || atual < 20`), o app exibe `"poucos casos: variação instável"`. Esse limite de 20 casos é decisão do projeto, e não vem da fonte.
- Janelas de consulta: o painel do município exibe até 12 semanas no gráfico e na série histórica (buscando uma janela de 16 semanas na API), enquanto o Mapa da UF consulta uma janela enxuta de 4 semanas por município para agilizar o carregamento estadual.
- População exibida: o total de habitantes mostrado no painel vem do campo `pop` retornado pelo InfoDengue (convertido de texto para inteiro ao salvar no banco), porque a API de Localidades do IBGE não inclui população.
- Cache no SQLite: o servidor grava respostas do InfoDengue em `data/radar_aedes.db` com validade de **6 horas** (`consultas_alerta` e `alerta_semanal`, usando `UNIQUE(codigo_ibge, doenca, semana_epi)` para atualizar semanas sem duplicar) e malhas do IBGE com validade de **24 horas** (`cache_malhas_uf`). O front-end consulta apenas as rotas `/api/*` do servidor.
- Comparação de municípios: a lista de até 3 municípios seguidos é salva somente no navegador (`localStorage`), sem login e sem envio de dado pessoal para o servidor.

## Limitações conhecidas

- O InfoDengue não documenta um limite numérico de requisições. Por cautela, o app usa no máximo 4 chamadas simultâneas, timeout de 9 segundos e cache de 6 horas.
- O plano B offline (`data/amostra_infodengue_rj.json`) cobre 6 municípios do RJ (Rio de Janeiro, Belford Roxo, Mesquita, Niterói, Duque de Caxias e Nova Iguaçu), dengue e chikungunya, coletados em 22/11/2026; zika sem registros em 2026 na fonte.
- O "atualizado em" mostra a data da versão do modelo (`versao_modelo`), e não a data da coleta.

## Requisitos para rodar

- **Node.js 22.18.0 ou superior** (`"engines": { "node": ">=22.18.0" }` no `package.json`): necessário para executar `npm start` (`node server.ts`) diretamente com suporte nativo a arquivos `.ts` sem flags e com o módulo `node:sqlite`. Confirmado e testado em **Node v22.23.5**.
- **Banco persistente para publicação**: implementado (usa PostgreSQL via `DATABASE_URL` quando configurado, mantendo SQLite local no computador).

## Publicação
- Link público: https://projeto-radaraedes.onrender.com
- Hospedagem do site: Render (plano gratuito, serviço web Node).
- Banco de dados publicado: PostgreSQL no Neon (plano gratuito). No computador, o app usa SQLite.
- Configuração: a variável de ambiente DATABASE_URL guarda a conexão com o banco e fica apenas no Render, nunca no repositório.
- Atualização dos dados: o servidor consulta o InfoDengue quando alguém abre uma tela e guarda o resultado por 6 horas.
- Limitações: no plano gratuito, o site dorme após cerca de 15 minutos sem acesso, e a primeira abertura depois disso pode levar cerca de um minuto. Os limites dos planos gratuitos podem mudar.
- Aviso conhecido: a biblioteca de conexão com o PostgreSQL exibe, no registro, um aviso sobre o modo SSL. Não afeta o funcionamento e deve ser tratado em uma atualização futura.
- Testado em: 24/11/2026.

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

- **Lighthouse (Chrome DevTools), site publicado, 25/11/2026**: página inicial, 3 execuções. Acessibilidade: 100, 100 e 100. Desempenho: 96, 97 e 90. Boas práticas: 100, 100 e 100. Painel do Rio de Janeiro (dengue), em modo Snapshot: 27 de 27 testes de acessibilidade e 4 de 4 de boas práticas aprovados; esse modo não mede desempenho. Essas medições foram feitas antes dos ajustes de teclado e leitor de tela descritos acima; uma nova medição ainda não foi feita.
- **Leitor de tela (Narrador do Windows)**: teste manual ainda não realizado até 25/11/2026.
- **Navegação por teclado**: percurso manual completo nas 6 telas ainda não realizado até 25/11/2026; os ajustes foram feitos por revisão de código.
- **Observação**: o Lighthouse automático cobre apenas parte dos critérios de acessibilidade e não substitui o teste com leitor de tela real.

## Prompts usados

### Prompts de inspeção e preparação para publicação (Render + Neon)

#### Inspeção da escolha entre SQLite e PostgreSQL

```text
mostre no chat o trecho em que o código escolhe entre SQLite e PostgreSQL
```

#### Preparação do ambiente publicado (Render + Neon)

```text
Preparar o app publicado (Render + Neon) sem mudar telas nem regras de negócio:
1) Se DATABASE_URL existir mas não começar com postgres:// ou postgresql://, pare a inicialização com uma mensagem clara em português. Nunca imprima a string de conexão, o usuário ou a senha em logs, respostas de API ou no chat. Ao conectar, registre apenas o tipo de banco e que a conexão funcionou.
2) Ao iniciar, crie as tabelas com CREATE TABLE IF NOT EXISTS (PostgreSQL e SQLite), sem apagar dados existentes.
3) A rota /api/health continua mostrando apenas ok, servico e banco.
4) Crie .env.example com DATABASE_URL, SQLITE_PATH e RADAR_FORCE_OFFLINE, sem valores. Confirme que .env e data/radar_aedes.db estão no .gitignore e que nenhum segredo está no repositório.
5) No README, troque a nota "banco persistente pendente" por "implementado" e acrescente a seção abaixo, exatamente como está, mantendo as demais seções:

## Publicação
- Link público: https://projeto-radaraedes.onrender.com
- Hospedagem do site: Render (plano gratuito, serviço web Node).
- Banco de dados publicado: PostgreSQL no Neon (plano gratuito). No computador, o app usa SQLite.
- Configuração: a variável de ambiente DATABASE_URL guarda a conexão com o banco e fica apenas no Render, nunca no repositório.
- Atualização dos dados: o servidor consulta o InfoDengue quando alguém abre uma tela e guarda o resultado por 6 horas.
- Limitações: no plano gratuito, o site dorme após cerca de 15 minutos sem acesso, e a primeira abertura depois disso pode levar cerca de um minuto. Os limites dos planos gratuitos podem mudar.
- Aviso conhecido: a biblioteca de conexão com o PostgreSQL exibe, no registro, um aviso sobre o modo SSL. Não afeta o funcionamento e deve ser tratado em uma atualização futura.
- Testado em: 24/11/2026.

Explique cada arquivo alterado em 2 linhas.
```

### Prompts de redesenho visual e interações (3 etapas)

#### Etapa 1 — Identidade visual, Início e rodapés

```text
Redesenho visual do RadarAedes. Muda só a aparência: não mude dados, rotas, banco, cálculo de nível nem textos de saúde.
REGRAS DE TODAS AS ETAPAS: contraste AA, foco visível, teclado completo, alternativa em texto para gráfico e mapa, rodapé com SAMU 192 sempre visível, sem dado pessoal, sem bibliotecas novas sem me avisar, animações só com CSS (150 a 300 ms) e desligadas com prefers-reduced-motion, nada que dependa só de hover (tudo também funciona por toque e foco). Lighthouse de acessibilidade ≥ 90. As cores de nível (verde, amarelo, laranja, vermelho) são usadas só para níveis.
ETAPA 1, faça só isto e pare:
1) Identidade: cor de marca azul-marinho, fundo off-white quente, escala tipográfica com mais contraste de tamanho entre título e texto, logotipo simples em SVG (ícone de radar + "RadarAedes"), originais e leves.
2) Início: título maior, busca em destaque e o bloco "Como ler o semáforo" mais compacto. Preencha o espaço vazio com "Situação agora no estado", usando só dados já em cache no servidor; se não houver cache, não mostre o bloco. Sem cartões repetidos com borda colorida: use faixas, ícones e tipografia.
3) Padronize todos os rodapés: "Dados do InfoDengue (modelo de <data>), consultados em <data>". Troque "via cache SQLite" por "via cache do servidor".
Mostre o tamanho do build (npm run build) antes e depois. Explique cada arquivo alterado em 2 linhas.
```

#### Etapa 2 — Interações, contagem animada, pulso, dicas e esqueletos

```text
Mantenha todas as regras anteriores. ETAPA 2, só interações, faça e pare:
1) Cartões e botões: transição suave ao passar o mouse e ao focar (leve elevação e mudança de sombra), sem mudar o layout.
2) Números dos indicadores (casos estimados, casos por 100 mil, tendência): contagem animada de 0 ao valor, uma única vez, ao carregar.
3) Semáforo: nível 3 e 4 com pulso suave de uns 2 segundos, uma vez; nível 1 e 2 sem pulso. Sem animação infinita.
4) Dicas ao passar o mouse, tocar ou focar nos termos "casos estimados", "casos por 100 mil habitantes" e "tendência", com explicação curta em português simples (acessível por teclado e leitor de tela).
5) Transição curta (fade) ao trocar de tela e esqueletos de carregamento no lugar de "Carregando...".
Explique cada arquivo em 2 linhas.
```

#### Etapa 3 — Gráfico das 12 semanas, Mapa da UF e Comparar

```text
Mantenha todas as regras anteriores. ETAPA 3, faça e pare:
1) Gráfico das 12 semanas: linha desenhada com animação curta no carregamento, linha-guia vertical e dica flutuante ao passar o mouse, tocar ou usar as setas (semana, casos, nível em texto). Mantenha a tabela alternativa.
2) Mapa: destaque do município ao passar o mouse, animação suave ao selecionar na tabela, e mini gráfico das últimas semanas no popup. Ao passar o mouse numa linha da tabela, destaque o município no mapa, e vice-versa. Enquadre o mapa no estado (fitBounds). Troque "Resumo da carga..." por "92 municípios carregados. Dados consultados em <data>.", com os detalhes técnicos num bloco recolhível.
3) Comparar: animação ao adicionar e remover municípios; marque o município de maior nível com um selo de texto e ícone, não só cor; quando a tendência for "indisponível", explique o motivo em uma linha.
Mostre o tamanho do build antes e depois. Explique cada arquivo em 2 linhas.
```

### Prompts de diagnóstico de dados e documentação final

#### Diagnóstico e correção da janela de semanas em cache (Mapa da UF × Painel do município)

```text
Por que só o RIo de Janeiro tem dados de de antes de duas semanas atrás?
```

*(Seguido da confirmação `"Quero"` para ajustar o cache do servidor e separar consultas resumidas do Mapa da UF da série completa de 16 semanas do painel municipal.)*

#### Registro dos prompts, testes do Lighthouse e link público no README

```text
escreva aqueles 3 prompts dividos em 3 etapas em que eu pedi você para fazer alterações nas interações, no mapa, gráfico, o visual, a identidade, etc, no readme do projeto, mais especificamente na aba "Prompts usados"
```

```text
registrar no readme tem testes realizados com lighthouse
:
- **Lighthouse (Chrome DevTools)**: 
  - Página inicial, modo navegação, 3 execuções em 25/11/2026: acessibilidade 100, 100 e 100; desempenho 96, 97 e 90; boas práticas 100, 100 e 100.
  - Painel do Rio de Janeiro (dengue), modo Snapshot, em 25/11/2026: 27 de 27 testes de acessibilidade aprovados e 4 de 4 de boas práticas. O modo Snapshot não mede desempenho.
  - Apontamentos: nenhum.
```

```text
preencha o readme com outros prompts que eu te enviei e adicione o link publico da aplicação: https://projeto-radaraedes.onrender.com/
```

## Entregas

- **Link público da aplicação**: https://projeto-radaraedes.onrender.com/
- **Link do vídeo de demonstração**: _Preencher com o link do vídeo_
