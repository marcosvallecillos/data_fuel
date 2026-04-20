import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, BehaviorSubject, combineLatest } from 'rxjs';
import { map, catchError, retry, shareReplay, tap, debounceTime } from 'rxjs/operators';
import {
  EstacionesTerrestresResponse,
  EstacionTerrestre,
  GasStation,
  Provincia,
  Municipio,
  TipoCombustible,
  Coordenadas,
  FiltrosBusqueda,
  ResultadoBusqueda
} from '../models/gas-station.models';

/**
 * Servicio principal para la gestión de datos de gasolineras
 * Consume la API REST del Ministerio para la Transición Ecológica
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class GasStationService {
  private readonly http = inject(HttpClient);
  
  // ============================================================================
  // CONFIGURACIÓN DE LA API
  // ============================================================================
  
  private readonly API_BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';
  
  private readonly ENDPOINTS = {
    estacionesGeneral: `${this.API_BASE}/EstacionesTerrestres/`,
    estacionesMunicipio: (id: string) => `${this.API_BASE}/EstacionesTerrestres/FiltroMunicipio/${id}`,
    municipios: `${this.API_BASE}/Listados/MunicipiosPorProvincia/`,
    provincias: `${this.API_BASE}/Listados/Provincias/`
  };

  // ============================================================================
  // CACHÉ Y ESTADO
  // ============================================================================
  
  // Caché de provincias (no cambian frecuentemente)
  private provinciasCache$?: Observable<Provincia[]>;
  
  // Caché de municipios por provincia
  private municipiosCache = new Map<string, Observable<Municipio[]>>();
  
  // Estado de estaciones cargadas
  private estacionesSubject = new BehaviorSubject<GasStation[]>([]);
  public estaciones$ = this.estacionesSubject.asObservable();
  
  // Estado de carga
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  // Último timestamp de actualización
  private ultimaActualizacion?: Date;

  // ============================================================================
  // MÉTODOS PRINCIPALES - ENDPOINTS DE LA API
  // ============================================================================

  /**
   * Obtiene todas las estaciones terrestres de España
   * Nota: Este endpoint puede devolver +10,000 registros
   * @returns Observable con array de estaciones normalizadas
   */
  getEstacionesGeneral(): Observable<GasStation[]> {
    this.loadingSubject.next(true);
    
    return this.http.get<EstacionesTerrestresResponse>(this.ENDPOINTS.estacionesGeneral).pipe(
      retry(2), // Reintentar 2 veces en caso de fallo
      map(response => this.normalizarEstaciones(response.ListaEESSPrecio)),
      tap(estaciones => {
        this.estacionesSubject.next(estaciones);
        this.ultimaActualizacion = new Date();
        this.loadingSubject.next(false);
      }),
      catchError(this.handleError),
      shareReplay(1) // Compartir resultado entre múltiples suscriptores
    );
  }

  /**
   * Obtiene estaciones filtradas por municipio
   * @param municipioId ID del municipio (ej: "4606" para Madrid)
   * @returns Observable con array de estaciones del municipio
   */
  getEstacionesPorMunicipio(municipioId: string): Observable<GasStation[]> {
    this.loadingSubject.next(true);
    
    return this.http.get<EstacionesTerrestresResponse>(
      this.ENDPOINTS.estacionesMunicipio(municipioId)
    ).pipe(
      retry(2),
      map(response => this.normalizarEstaciones(response.ListaEESSPrecio)),
      tap(estaciones => {
        this.estacionesSubject.next(estaciones);
        this.ultimaActualizacion = new Date();
        this.loadingSubject.next(false);
      }),
      catchError(this.handleError),
      shareReplay(1)
    );
  }

  /**
   * Obtiene el listado de todas las provincias de España
   * Resultado cacheado para evitar llamadas repetidas
   * @returns Observable con array de provincias
   */
  getProvincias(): Observable<Provincia[]> {
    if (!this.provinciasCache$) {
      this.provinciasCache$ = this.http.get<Provincia[]>(this.ENDPOINTS.provincias).pipe(
        retry(2),
        catchError(this.handleError),
        shareReplay(1) // Mantener en caché
      );
    }
    return this.provinciasCache$;
  }

  /**
   * Obtiene municipios de una provincia específica
   * Resultado cacheado por provincia
   * @param provinciaId ID de la provincia
   * @returns Observable con array de municipios
   */
  getMunicipiosPorProvincia(provinciaId: string): Observable<Municipio[]> {
    if (!this.municipiosCache.has(provinciaId)) {
      const municipios$ = this.http.get<Municipio[]>(
        `${this.ENDPOINTS.municipios}${provinciaId}`
      ).pipe(
        retry(2),
        catchError(this.handleError),
        shareReplay(1)
      );
      this.municipiosCache.set(provinciaId, municipios$);
    }
    return this.municipiosCache.get(provinciaId)!;
  }

  // ============================================================================
  // NORMALIZACIÓN Y TRANSFORMACIÓN DE DATOS
  // ============================================================================

  /**
   * Convierte los datos raw de la API a nuestro modelo normalizado
   * @param estaciones Array de estaciones raw de la API
   * @returns Array de estaciones normalizadas
   */
  private normalizarEstaciones(estaciones: EstacionTerrestre[]): GasStation[] {
    return estaciones.map(e => this.normalizarEstacion(e));
  }

  /**
   * Normaliza una estación individual
   * Parsea coordenadas, precios y calcula estado de apertura
   * @param estacion Estación raw de la API
   * @returns Estación normalizada
   */
  private normalizarEstacion(estacion: EstacionTerrestre): GasStation {
    return {
      id: estacion['IDEESS'],
      marca: estacion['Rótulo']?.trim() || 'Sin marca',
      direccion: estacion['Dirección'],
      municipio: estacion['Municipio'],
      provincia: estacion['Provincia'],
      codigoPostal: estacion['C.P.'],
      horario: estacion['Horario'],
      latitud: this.parseCoordinate(estacion['Latitud']),
      longitud: this.parseCoordinate(estacion['Longitud (WGS84)']),
      precios: {
        gasoleoA: this.parsePrecio(estacion['Precio Gasoleo A']),
        gasolina95: this.parsePrecio(estacion['Precio Gasolina 95 E5']),
        gasolina98: this.parsePrecio(estacion['Precio Gasolina 98 E5']),
        biodiesel: this.parsePrecio(estacion['Precio Biodiesel']),
        glp: this.parsePrecio(estacion['Precio Gases licuados del petróleo'])
      },
      estaAbierta: this.calcularEstadoApertura(estacion['Horario']),
      ultimaActualizacion: estacion['Fecha'] ? new Date(estacion['Fecha']) : new Date(),
      raw: estacion // Mantener datos originales para debugging
    };
  }

  /**
   * Parsea coordenadas del formato "40,123456" a número
   * @param coord Coordenada en formato string con coma
   * @returns Número decimal o 0 si inválido
   */
  private parseCoordinate(coord: string): number {
    if (!coord) return 0;
    return parseFloat(coord.replace(',', '.'));
  }

  /**
   * Parsea precio del formato "1,234" a número
   * @param precio Precio en formato string con coma
   * @returns Número decimal o undefined si no disponible
   */
  private parsePrecio(precio: string): number | undefined {
    if (!precio || precio === '') return undefined;
    return parseFloat(precio.replace(',', '.'));
  }

  /**
   * Calcula si una estación está abierta según su horario
   * Analiza patrones comunes: "L-D: 24H", "L-D: 06:00-22:00", etc.
   * @param horario String de horario en formato libre
   * @returns true si está abierta, false si cerrada, undefined si no se puede determinar
   */
  private calcularEstadoApertura(horario: string): boolean | undefined {
    if (!horario) return undefined;
    
    const horarioLower = horario.toLowerCase();
    
    // Casos 24 horas
    if (horarioLower.includes('24') && horarioLower.includes('h')) {
      return true;
    }
    
    // Si dice "cerrado"
    if (horarioLower.includes('cerrado')) {
      return false;
    }
    
    // Intentar extraer horas de apertura/cierre
    const horaActual = new Date().getHours();
    const matchHorario = horario.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    
    if (matchHorario) {
      const [ horaApertura, horaCierre] = matchHorario;
      const apertura = parseInt(horaApertura);
      const cierre = parseInt(horaCierre);
      
      if (cierre < apertura) {
        // Horario que cruza medianoche
        return horaActual >= apertura || horaActual < cierre;
      } else {
        return horaActual >= apertura && horaActual < cierre;
      }
    }
    
    // No se puede determinar
    return undefined;
  }

  // ============================================================================
  // FILTRADO Y BÚSQUEDA AVANZADA
  // ============================================================================

  /**
   * Aplica filtros complejos sobre un conjunto de estaciones
   * Optimizado para grandes volúmenes de datos en memoria
   * @param estaciones Array de estaciones a filtrar
   * @param filtros Criterios de filtrado
   * @returns Resultado de búsqueda con estaciones filtradas y estadísticas
   */
  filtrarEstaciones(
    estaciones: GasStation[], 
    filtros: FiltrosBusqueda
  ): ResultadoBusqueda {
    let resultado = [...estaciones];

    // 1. Filtrar por marca
    if (filtros.marcas.length > 0) {
      resultado = resultado.filter(e => 
        filtros.marcas.some(marca => 
          e.marca.toLowerCase().includes(marca.toLowerCase())
        )
      );
    }

    // 2. Filtrar por estado de apertura
    if (filtros.soloAbiertas) {
      resultado = resultado.filter(e => e.estaAbierta === true);
    }

    // 3. Filtrar por disponibilidad de precio del combustible seleccionado
    resultado = resultado.filter(e => {
      const precio = this.obtenerPrecioCombustible(e, filtros.combustible);
      return precio !== undefined && precio > 0;
    });

    // 4. Calcular distancia si hay coordenadas
    if (filtros.coordenadas) {
      resultado = resultado.map(e => ({
        ...e,
        distancia: this.calcularDistanciaHaversine(
          filtros.coordenadas!,
          { latitud: e.latitud, longitud: e.longitud }
        )
      }));

      // Filtrar por radio
      resultado = resultado.filter(e => 
        e.distancia !== undefined && e.distancia <= filtros.radioKm
      );
    }

    // 5. Ordenar según criterio
    resultado = this.ordenarEstaciones(resultado, filtros);

    // 6. Calcular estadísticas
    const precios = resultado
      .map(e => this.obtenerPrecioCombustible(e, filtros.combustible))
      .filter((p): p is number => p !== undefined);

    return {
      estaciones: resultado,
      totalEncontradas: resultado.length,
      precioMedio: precios.length > 0 
        ? precios.reduce((a, b) => a + b, 0) / precios.length 
        : 0,
      precioMinimo: precios.length > 0 ? Math.min(...precios) : 0,
      precioMaximo: precios.length > 0 ? Math.max(...precios) : 0,
      timestamp: new Date()
    };
  }

  /**
   * Ordena estaciones según criterio especificado
   * @param estaciones Array de estaciones
   * @param filtros Filtros que incluyen el criterio de ordenación
   * @returns Array ordenado
   */
  private ordenarEstaciones(
    estaciones: GasStation[], 
    filtros: FiltrosBusqueda
  ): GasStation[] {
    switch (filtros.ordenarPor) {
      case 'precio':
        return estaciones.sort((a, b) => {
          const precioA = this.obtenerPrecioCombustible(a, filtros.combustible) || Infinity;
          const precioB = this.obtenerPrecioCombustible(b, filtros.combustible) || Infinity;
          return precioA - precioB;
        });
      
      case 'distancia':
        return estaciones.sort((a, b) => 
          (a.distancia || Infinity) - (b.distancia || Infinity)
        );
      
      case 'marca':
        return estaciones.sort((a, b) => 
          a.marca.localeCompare(b.marca)
        );
      
      default:
        return estaciones;
    }
  }

  /**
   * Obtiene el precio de un combustible específico de una estación
   * @param estacion Estación de servicio
   * @param combustible Tipo de combustible
   * @returns Precio o undefined si no disponible
   */
  private obtenerPrecioCombustible(
    estacion: GasStation, 
    combustible: TipoCombustible
  ): number | undefined {
    switch (combustible) {
      case TipoCombustible.GASOLEO_A:
        return estacion.precios.gasoleoA;
      case TipoCombustible.GASOLINA_95:
        return estacion.precios.gasolina95;
      case TipoCombustible.GASOLINA_98:
        return estacion.precios.gasolina98;
      case TipoCombustible.BIODIESEL:
        return estacion.precios.biodiesel;
      case TipoCombustible.GLP:
        return estacion.precios.glp;
      default:
        return undefined;
    }
  }

  // ============================================================================
  // GEOLOCALIZACIÓN Y CÁLCULOS
  // ============================================================================

  /**
   * Calcula la distancia entre dos puntos usando la fórmula de Haversine
   * Precisión suficiente para distancias cortas (~40km)
   * @param punto1 Primera coordenada
   * @param punto2 Segunda coordenada
   * @returns Distancia en kilómetros
   */
  private calcularDistanciaHaversine(punto1: Coordenadas, punto2: Coordenadas): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(punto2.latitud - punto1.latitud);
    const dLon = this.toRad(punto2.longitud - punto1.longitud);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(punto1.latitud)) * 
      Math.cos(this.toRad(punto2.latitud)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convierte grados a radianes
   */
  private toRad(grados: number): number {
    return grados * (Math.PI / 180);
  }

  /**
   * Obtiene la ubicación actual del usuario usando Geolocation API
   * @returns Promise con coordenadas o error
   */
  obtenerUbicacionActual(): Promise<Coordenadas> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada por el navegador'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitud: position.coords.latitude,
            longitud: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error(`Error de geolocalización: ${error.message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // Caché de 5 minutos
        }
      );
    });
  }

  // ============================================================================
  // UTILIDADES Y HELPERS
  // ============================================================================

  /**
   * Obtiene todas las marcas únicas del dataset actual
   * Útil para poblar el filtro de marcas dinámicamente
   * @returns Array de marcas únicas ordenadas alfabéticamente
   */
  obtenerMarcasDisponibles(): Observable<string[]> {
    return this.estaciones$.pipe(
      map(estaciones => {
        const marcas = new Set(estaciones.map(e => e.marca));
        return Array.from(marcas).sort();
      })
    );
  }

  /**
   * Busca una estación por su ID
   * @param id ID de la estación
   * @returns Observable con la estación o undefined
   */
  obtenerEstacionPorId(id: string): Observable<GasStation | undefined> {
    return this.estaciones$.pipe(
      map(estaciones => estaciones.find(e => e.id === id))
    );
  }

  /**
   * Obtiene la fecha de última actualización de datos
   */
  obtenerUltimaActualizacion(): Date | undefined {
    return this.ultimaActualizacion;
  }

  /**
   * Limpia la caché de municipios (útil para refrescar datos)
   */
  limpiarCacheMunicipios(): void {
    this.municipiosCache.clear();
  }

  // ============================================================================
  // MANEJO DE ERRORES
  // ============================================================================

  /**
   * Maneja errores HTTP de forma centralizada
   * @param error Error HTTP
   * @returns Observable que emite el error procesado
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let mensajeError = 'Ha ocurrido un error desconocido';

    if (error.error instanceof ErrorEvent) {
      // Error del lado del cliente
      mensajeError = `Error del cliente: ${error.error.message}`;
    } else {
      // Error del lado del servidor
      mensajeError = `Error del servidor: ${error.status} - ${error.message}`;
      
      // Mensajes específicos según código
      switch (error.status) {
        case 0:
          mensajeError = 'No se puede conectar con el servidor. Verifica tu conexión.';
          break;
        case 404:
          mensajeError = 'Recurso no encontrado en la API.';
          break;
        case 500:
          mensajeError = 'Error interno del servidor del Ministerio.';
          break;
        case 503:
          mensajeError = 'Servicio temporalmente no disponible.';
          break;
      }
    }

    console.error('❌ Error en GasStationService:', mensajeError, error);
    this.loadingSubject.next(false);
    return throwError(() => new Error(mensajeError));
  }
}
