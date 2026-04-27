/**
 * Modelos de datos para la API del Ministerio de Transición Ecológica
 * Basados en los endpoints reales de sedeaplicaciones.minetur.gob.es
 */

// ============================================================================
// ENTIDADES BASE DE LA API
// ============================================================================

/**
 * Estación de servicio terrestre según API del Ministerio
 */
export interface EstacionTerrestre {
  'IDEESS': string;                          // ID único de la estación
  'Rótulo': string;                          // Marca comercial
  'Dirección': string;                       // Dirección completa
  'Municipio': string;                       // Nombre del municipio
  'Provincia': string;                       // Nombre de la provincia
  'C.P.': string;                            // Código Postal
  'Horario': string;                         // Horario en texto libre
  'Latitud': string;                         // Coordenada (formato: "40,123456")
  'Longitud (WGS84)': string;                // Coordenada (formato: "-3,123456")
  'Precio Gasoleo A': string;                // Precio en € (formato: "1,234")
  'Precio Gasolina 95 E5': string;
  'Precio Gasolina 98 E5': string;
  'Precio Biodiesel': string;
  'Precio Nuevo Gasoleo A': string;
  'Precio Gases licuados del petróleo': string;
  'Remisión': string;                        // Tipo de instalación
  'Margen': string;                          // Margen comercial
  'Fecha': string;                           // Última actualización
}

/**
 * Respuesta del endpoint de estaciones terrestres
 */
export interface EstacionesTerrestresResponse {
  Fecha: string;
  ListaEESSPrecio: EstacionTerrestre[];
  Nota: string;
  ResultadoConsulta: string;
}

/**
 * Provincia según API del Ministerio
 */
export interface Provincia {
  IDPovincia: string;
  IDCCAA: string;
  Provincia: string;
  CCAA: string;
}

/**
 * Municipio según API del Ministerio
 */
export interface Municipio {
  IDMunicipio: string;
  IDProvincia: string;
  IDCCAA: string;
  Municipio: string;
  Provincia: string;
  CCAA: string;
}

// ============================================================================
// MODELOS NORMALIZADOS DE LA APLICACIÓN
// ============================================================================

/**
 * Tipo de combustible disponible
 */
export enum TipoCombustible {
  GASOLEO_A = 'Precio Gasoleo A',
  GASOLINA_95 = 'Precio Gasolina 95 E5',
  GASOLINA_98 = 'Precio Gasolina 98 E5',
  BIODIESEL = 'Precio Biodiesel',
  GLP = 'Precio Gases licuados del petróleo'
}

/**
 * Información de combustible con label para UI
 */
export interface CombustibleInfo {
  key: TipoCombustible;
  label: string;
  icon: string;
}

/**
 * Estación normalizada para uso en la aplicación
 */
export interface GasStation {
  id: string;
  marca: string;
  direccion: string;
  municipio: string;
  provincia: string;
  codigoPostal: string;
  horario: string;
  latitud: number;
  longitud: number;
  precios: {
    gasoleoA?: number;
    gasolina95?: number;
    gasolina98?: number;
    biodiesel?: number;
    glp?: number;
  };
  distancia?: number;                        // Calculada con Haversine
  estaAbierta?: boolean;                     // Calculada según horario
  ultimaActualizacion: Date;
  raw?: EstacionTerrestre;                   // Datos originales para debugging
}

/**
 * Review/opinion de cliente sobre una estación
 */
export interface ReviewCliente {
  id: string;
  estacionId: string;
  autor: string;
  puntuacion: number;                        // 1-5
  comentario: string;
  fecha: Date;
}


/**
 * Coordenadas geográficas
 */
export interface Coordenadas {
  latitud: number;
  longitud: number;
}

// ============================================================================
// FILTROS Y BÚSQUEDA
// ============================================================================

/**
 * Criterios de búsqueda y filtrado
 */
export interface FiltrosBusqueda {
  codigoPostal?: string;
  municipioId?: string;
  provinciaId?: string;
  combustible: TipoCombustible;
  marcas: string[];                          // Array de marcas seleccionadas
  soloAbiertas: boolean;
  radioKm: number;                           // Radio de búsqueda en km
  ordenarPor: 'precio' | 'distancia' | 'marca';
  coordenadas?: Coordenadas;                 // Para búsqueda por GPS
}

/**
 * Resultado de búsqueda con metadatos
 */
export interface ResultadoBusqueda {
  estaciones: GasStation[];
  totalEncontradas: number;
  precioMedio: number;
  precioMinimo: number;
  precioMaximo: number;
  timestamp: Date;
}

// ============================================================================
// FAVORITOS Y ALERTAS
// ============================================================================

/**
 * Estación guardada como favorita
 */
export interface Favorito {
  estacionId: string;
  estacion: GasStation;
  fechaAgregado: Date;
  alias?: string;                            // Nombre personalizado
  notas?: string;
}

/**
 * Alerta de precio configurada por el usuario
 */
export interface Alerta {
  id: string;
  estacionId: string;
  combustible: TipoCombustible;
  precioObjetivo: number;
  activa: boolean;
  fechaCreacion: Date;
  ultimaNotificacion?: Date;
  descripcion?: string;
}

/**
 * Estado de una alerta disparada
 */
export interface AlertaDisparada extends Alerta {
  estacion: GasStation;
  precioActual: number;
  diferencia: number;                        // Ahorro en €
  porcentajeDiferencia: number;              // % de ahorro
}

// ============================================================================
// HISTORIAL Y ESTADÍSTICAS
// ============================================================================

/**
 * Entrada del historial de búsquedas
 */
export interface HistorialBusqueda {
  id: string;
  filtros: FiltrosBusqueda;
  timestamp: Date;
  resultados: number;
}

/**
 * Datos para gráficas de evolución de precios
 */
export interface EvolucionPrecio {
  fecha: Date;
  precioNacional: number;
  precioEstacion?: number;
  combustible: TipoCombustible;
}

/**
 * Estadísticas agregadas
 */
export interface EstadisticasPrecio {
  combustible: TipoCombustible;
  precioActual: number;
  variacionDiaria: number;                   // % de cambio
  variacionSemanal: number;
  variacionMensual: number;
  tendencia: 'subida' | 'bajada' | 'estable';
}

// ============================================================================
// CONFIGURACIÓN Y PREFERENCIAS
// ============================================================================

/**
 * Preferencias del usuario
 */
export interface PreferenciasUsuario {
  combustiblePreferido: TipoCombustible;
  marcasFavoritas: string[];
  coordenadasHabituales?: Coordenadas;
  radioPreferido: number;
  notificacionesActivas: boolean;
  temaOscuro: boolean;
}

// ============================================================================
// HELPERS Y CONSTANTES
// ============================================================================

/**
 * Información de combustibles para la UI
 */
export const COMBUSTIBLES_INFO: CombustibleInfo[] = [
  { 
    key: TipoCombustible.GASOLEO_A, 
    label: 'Gasóleo A', 
    icon: '🛢️' 
  },
  { 
    key: TipoCombustible.GASOLINA_95, 
    label: 'Gasolina 95 E5', 
    icon: '⛽' 
  },
  { 
    key: TipoCombustible.GASOLINA_98, 
    label: 'Gasolina 98 E5', 
    icon: '⛽' 
  },
  { 
    key: TipoCombustible.BIODIESEL, 
    label: 'Biodiesel', 
    icon: '🌱' 
  },
  { 
    key: TipoCombustible.GLP, 
    label: 'GLP', 
    icon: '💨' 
  }
];

/**
 * Marcas principales en España (se actualizará dinámicamente desde la API)
 */
export const MARCAS_PRINCIPALES = [
  'REPSOL',
  'CEPSA',
  'BP',
  'SHELL',
  'GALP',
  'PETRONOR',
  'AVIA',
  'BALLENOIL',
  'PLENOIL',
  'CARREFOUR',
  'ALCAMPO',
  'COOP',
  'COOPERATIVA',
  'E.S. COOPERATIVA',
  'VALCARCE',
  'PETROPRIX'
] as const;

// ============================================================================
// COMPARACIÓN DE ESTACIONES
// ============================================================================

/**
 * Comparación entre múltiples estaciones
 */
export interface ComparacionEstaciones {
  estaciones: GasStation[];
  combustible: TipoCombustible;
  timestamp: Date;
  mejorPrecio: {
    estacion: GasStation;
    precio: number;
  };
  peorPrecio: {
    estacion: GasStation;
    precio: number;
  };
  diferenciaMaxima: number;
  ahorroMensual?: number; // Basado en consumo estimado
}

/**
 * Parámetros para cálculo de ahorro
 */
export interface ParametrosAhorro {
  litrosPorMes: number;
  combustible: TipoCombustible;
}

// ============================================================================
// RUTAS Y NAVEGACIÓN
// ============================================================================

/**
 * Punto de origen para cálculo de rutas
 */
export interface OrigenRuta {
  tipo: 'gps' | 'manual' | 'favorito';
  coordenadas: Coordenadas;
  direccion?: string;
  nombre?: string; // Para favoritos (ej: "Casa", "Trabajo")
}

/**
 * Paso de una ruta (instrucción de navegación)
 */
export interface PasoRuta {
  distancia: number; // En metros
  duracion: number; // En segundos
  instruccion: string;
  tipo: 'straight' | 'turn-left' | 'turn-right' | 'roundabout' | 'destination';
  coordenadas: Coordenadas;
}

/**
 * Información completa de una ruta
 */
export interface InformacionRuta {
  origen: OrigenRuta;
  destino: GasStation;
  distanciaTotal: number; // En km
  duracionEstimada: number; // En minutos
  pasos: PasoRuta[];
  polyline: Coordenadas[]; // Coordenadas para dibujar la línea en el mapa
  modoTransporte: 'driving' | 'walking' | 'cycling';
  timestamp: Date;
}

/**
 * Resultado de búsqueda de direcciones (geocoding)
 */
export interface ResultadoDireccion {
  direccion: string;
  coordenadas: Coordenadas;
  confianza: number; // 0-1
  detalles?: {
    calle?: string;
    numero?: string;
    codigoPostal?: string;
    municipio?: string;
    provincia?: string;
  };
}

/**
 * Opciones para cálculo de ruta
 */
export interface OpcionesRuta {
  modoTransporte: 'driving' | 'walking' | 'cycling';
  evitarAutopistas?: boolean;
  evitarPeajes?: boolean;
  optimizarPara: 'distancia' | 'tiempo';
}
