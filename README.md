# RadarAedes

Sistema web de vigilância e comunicação de risco de arboviroses (dengue, chikungunya e zika) com base em dados abertos e níveis de alerta municipais.

## Fontes de dados

### 1. IBGE – Localidades (nível A)

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

#### Campos usados do IBGE

- id: código do município com 7 dígitos (usado como geocode no InfoDengue)
- nome: nome do município (usado na busca com autocompletar)

### 2. InfoDengue – alertcity (nível A)

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
- Fonte da legenda dos níveis: (colar aqui o link da documentação oficial do InfoDengue após conferir)

#### Observações sobre a resposta

- Cada item é uma semana epidemiológica de um município.
- Alguns campos podem vir como `null` (por exemplo `casconf` e `casprov_est`); o código precisa tratar isso.
- Alguns números vêm como texto (por exemplo `pop` e `tempmax`); converter antes de calcular.
- A semana mais recente pode estar incompleta por atraso de notificação; avisar na tela.
- O app não recalcula o nível de alerta: mostra o valor de `nivel` que vem da API.
