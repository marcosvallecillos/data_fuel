/**
 * Servicio de Predicción de Precios
 * Se conecta con la API Flask en http://localhost:5000
 * 
 * @author Gas-Trend Pro Team
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PrediccionRequest {
  latitud: number;
  longitud: number;
  marca: string;
  dia_semana: string;
  hora: number;
  distancia_centro: number;
}

export interface PrediccionResponse {
  precio_predicho: number;
  unidad: string;
  marca_original: string;
  marca_normalizada: string;
  dia: string;
  hora: number;
  latitud: number;
  longitud: number;
  timestamp: string;
  exito: boolean;
}

export interface MetricasModelo {
  rmse_test: number;
  rmse_percentage: number;
  r2_test: number;
  mae_test: number;
  cv_rmse: number;
  n_muestras_train: number;
  n_muestras_test: number;
  fecha_entrenamiento: string;
}

export interface Clases {
  marcas: string[];
  dias: string[];
  horas: number[];
}

@Injectable({
  providedIn: 'root'
})
export class PrediccionService {
  private readonly http = inject(HttpClient);

  constructor() {
    console.log('✅ PrediccionService inicializado y conectado a', this.API_URL);
  }
  
  // ============================================================================
  // CONFIGURACIÓN
  // ============================================================================
  
  private readonly API_URL = 'http://localhost:5000/api';
  
  // Estado
  private cargandoSubject = new BehaviorSubject<boolean>(false);
  public cargando$ = this.cargandoSubject.asObservable();
  
  private ultimaPrediccionSubject = new BehaviorSubject<PrediccionResponse | null>(null);
  public ultimaPrediccion$ = this.ultimaPrediccionSubject.asObservable();

  // ============================================================================
  // MÉTODOS PRINCIPALES
  // ============================================================================

  /**
   * Verifica que la API está disponible
   */
  verificarSalud(): Observable<any> {
    return this.http.get(`${this.API_URL}/health`).pipe(
      catchError(error => {
        console.error('❌ API no disponible:', error);
        return throwError(() => new Error(
          'La API Flask no está disponible. Asegúrate de ejecutar: python api_prediccion.py'
        ));
      })
    );
  }

  /**
   * Obtiene las métricas del modelo entrenado
   */
  obtenerMetricas(): Observable<MetricasModelo> {
    return this.http.get<MetricasModelo>(`${this.API_URL}/metricas`).pipe(
      catchError(this.manejarError)
    );
  }

  /**
   * Obtiene las clases válidas (marcas, días, horas)
   */
  obtenerClases(): Observable<Clases> {
    return this.http.get<Clases>(`${this.API_URL}/clases`).pipe(
      catchError(this.manejarError)
    );
  }

  /**
   * Predice el precio de gasolina para una estación
   * 
   * @param request Datos de ubicación y características
   * @returns Observable con la predicción
   */
  predecirPrecio(request: PrediccionRequest): Observable<PrediccionResponse> {
    this.cargandoSubject.next(true);
    
    return this.http.post<PrediccionResponse>(
      `${this.API_URL}/predecir-precio`,
      request
    ).pipe(
      map(response => {
        this.cargandoSubject.next(false);
        this.ultimaPrediccionSubject.next(response);
        return response;
      }),
      catchError(error => {
        this.cargandoSubject.next(false);
        return throwError(() => this.manejarError(error));
      })
    );
  }

  /**
   * Predice precios para múltiples estaciones (lote)
   * 
   * @param estaciones Array de estaciones con sus coordenadas
   * @returns Observable con las predicciones
   */
  predecirLote(estaciones: any[]): Observable<any> {
    this.cargandoSubject.next(true);
    
    const requests = estaciones.map(est => ({
      latitud: est.latitud,
      longitud: est.longitud,
      marca: est.marca,
      dia_semana: est.dia_semana || 'Lunes',
      hora: est.hora || 12,
      distancia_centro: est.distancia_centro || 0
    }));
    
    return this.http.post(
      `${this.API_URL}/predecir-lote`,
      { estaciones: requests }
    ).pipe(
      map(response => {
        this.cargandoSubject.next(false);
        return response;
      }),
      catchError(error => {
        this.cargandoSubject.next(false);
        return throwError(() => this.manejarError(error));
      })
    );
  }

  /**
   * Predice el precio basándose en coordenadas GPS
   * 
   * @param latitud Latitud del usuario
   * @param longitud Longitud del usuario
   * @param estacion Datos de la estación
   * @returns Observable con la predicción
   */
  predecirDesdeGPS(
    latitud: number,
    longitud: number,
    estacion: any
  ): Observable<PrediccionResponse> {
    const request: PrediccionRequest = {
      latitud: estacion.latitud,
      longitud: estacion.longitud,
      marca: estacion.marca,
      dia_semana: this.obtenerDiaActual(),
      hora: new Date().getHours(),
      distancia_centro: this.calcularDistancia(
        latitud,
        longitud,
        estacion.latitud,
        estacion.longitud
      )
    };
    
    return this.predecirPrecio(request);
  }

  /**
   * Predice el precio para mañana a una hora específica
   * 
   * @param estacion Datos de la estación
   * @param hora Hora del día (0-23)
   * @returns Observable con la predicción
   */
  predecirParaManana(estacion: any, hora: number = 12): Observable<PrediccionResponse> {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    
    const diaManana = this.diaNumeroATexto((manana.getDay() + 1) % 7);
    
    const request: PrediccionRequest = {
      latitud: estacion.latitud,
      longitud: estacion.longitud,
      marca: estacion.marca,
      dia_semana: diaManana,
      hora: hora,
      distancia_centro: estacion.distancia_centro || 0
    };
    
    return this.predecirPrecio(request);
  }

  // ============================================================================
  // HELPERS - CÁLCULOS Y UTILIDADES
  // ============================================================================

  /**
   * Calcula la distancia entre dos puntos usando fórmula Haversine
   */
  private calcularDistancia(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // Redondear a 1 decimal
  }

  /**
   * Convierte grados a radianes
   */
  private toRad(grados: number): number {
    return grados * (Math.PI / 180);
  }

  /**
   * Obtiene el día actual en texto
   */
  private obtenerDiaActual(): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[new Date().getDay()];
  }

  /**
   * Convierte número de día a texto
   */
  private diaNumeroATexto(num: number): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[num % 7];
  }

  /**
   * Obtiene la hora actual formateada
   */
  obtenerHoraActual(): number {
    return new Date().getHours();
  }

  /**
   * Calcula la distancia en km entre dos puntos (lat/lon)
   * Wrapper público de calcularDistancia
   */
  distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return this.calcularDistancia(lat1, lon1, lat2, lon2);
  }

  /**
   * Devuelve el nombre del día de mañana en español
   */
  getDiaManana(): string {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    return this.diaNumeroATexto(manana.getDay());
  }

  /**
   * Obtiene el día actual formateado
   */
  obtenerDiaFormateado(): string {
    return this.obtenerDiaActual();
  }

  /**
   * Formatea el precio para mostrar
   */
  formatearPrecio(precio: number): string {
    return `${precio.toFixed(3)}€/L`;
  }

  /**
   * Calcula el ahorro con respecto a otro precio
   */
  calcularAhorro(precio1: number, precio2: number, litros: number = 60): {
    diferencia: number;
    ahorro: number;
    porcentaje: number;
  } {
    const diferencia = Math.abs(precio1 - precio2);
    const ahorro = diferencia * litros;
    const porcentaje = (diferencia / Math.max(precio1, precio2)) * 100;
    
    return {
      diferencia: Math.round(diferencia * 1000) / 1000,
      ahorro: Math.round(ahorro * 100) / 100,
      porcentaje: Math.round(porcentaje * 100) / 100
    };
  }

  // ============================================================================
  // MANEJO DE ERRORES
  // ============================================================================

  /**
   * Maneja errores HTTP de forma centralizada
   */
  private manejarError(error: HttpErrorResponse): Observable<never> {
    let mensajeError = 'Error desconocido';
    
    if (error.error instanceof ErrorEvent) {
      // Error del cliente
      mensajeError = `Error del cliente: ${error.error.message}`;
    } else {
      // Error del servidor
      if (error.status === 0) {
        mensajeError = '❌ No se puede conectar con la API Flask. Asegúrate de ejecutar: python api_prediccion.py';
      } else if (error.status === 400) {
        mensajeError = `Error en la solicitud: ${error.error?.error || 'Datos inválidos'}`;
      } else if (error.status === 404) {
        mensajeError = 'Endpoint no encontrado';
      } else if (error.status === 500) {
        mensajeError = 'Error interno del servidor de predicción';
      } else {
        mensajeError = `Error del servidor: ${error.status}`;
      }
    }
    
    console.error('❌ Error en PrediccionService:', mensajeError, error);
    return throwError(() => new Error(mensajeError));
  }

  // ============================================================================
  // UTILIDADES PARA DEBUGGING
  // ============================================================================

  /**
   * Obtiene la URL base de la API
   */
  obtenerUrlApi(): string {
    return this.API_URL;
  }

  /**
   * Verifica si la API está disponible
   */
  async verificarApiDisponible(): Promise<boolean> {
    try {
      await this.verificarSalud().toPromise();
      console.log('✅ API Flask disponible en:', this.API_URL);
      return true;
    } catch (error) {
      console.error('❌ API no disponible. Asegúrate de ejecutar: python api_prediccion.py');
      return false;
    }
  }
}