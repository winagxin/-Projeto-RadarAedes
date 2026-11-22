export type Doenca = 'dengue' | 'chikungunya' | 'zika';

export type Tendencia = 'sobe' | 'estavel' | 'cai' | 'indisponivel';

export type RotaPagina = 'inicio' | 'painel' | 'mapa' | 'comparar' | 'orientacoes' | 'sobre';

export interface MunicipioSeguido {
  codigo_ibge: string;
  nome: string;
  uf: string;
}

export interface EstadoItem {
  id: number;
  sigla: string;
  nome: string;
}

export interface MunicipioItem {
  codigo_ibge: string;
  nome: string;
  uf: string;
  populacao: number | null;
}

export interface AlertaSemanalItem {
  id: number;
  consulta_id: number;
  codigo_ibge: string;
  doenca: Doenca;
  semana_epi: number;
  data_ini_se: number;
  nivel: number;
  casos_est: number | null;
  casos_est_min: number | null;
  casos_est_max: number | null;
  casos: number | null;
  incidencia_100k: number | null;
  versao_modelo: string | null;
}

export interface RespostaAlertaMunicipio {
  municipio: MunicipioItem;
  doenca: Doenca;
  vazio: boolean;
  nivelAtual: number | null;
  semanaAtual: number | null;
  semanaMaisRecenteIncompleta: boolean;
  versaoModelo: string | null;
  tendencia: Tendencia;
  variacaoPercentual: number | null;
  semanasComparadas: [number, number] | null;
  casosAnterior: number | null;
  casosAtual: number | null;
  poucosCasos: boolean;
  serie: AlertaSemanalItem[];
  fonte: string;
  atualizadoEm: string;
  dataColeta: string | null;
  modoOffline: boolean;
}

export interface OrientacaoNivel {
  nivel: number;
  cor: string;
  titulo: string;
  resumo: string;
  eliminar_agua_parada: string[];
  sinais_alarme: string[];
  quando_procurar_ubs: string;
  fonte_conferencia: string;
}
