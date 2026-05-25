import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface PrediccionPrecio {
  precio_predicho: number;
  unidad: string;
  marca_normalizada: string;
  timestamp: string;
  fuente: 'ml' | 'simulado';
}

export interface PrediccionLote {
  predicciones: { id: string; precio_manana: number | null; dia_prediccion: string }[];
  dia_prediccion: string;
  timestamp: string;
}

export interface MetricasModelo {
  rmse_test: number;
  rmse_percentage: number;
  r2_test: number;
  mae_test: number;
  n_muestras_train: number;
  features: string[];
  importancias: { feature: string; importancia: number }[];
  fecha_entrenamiento: string;
  fuente_datos: string;
}

export interface SolicitudPrediccion {
  latitud: number;
  longitud: number;
  marca: string;
  dia_semana: string;
  hora: number;
  distancia_centro: number;
}

/**
 * Servicio para predicción de precios de combustible mediante el modelo
 * Random Forest entrenado localmente (Flask API en puerto 5000).
 *
 * Si la API no está disponible, el servicio devuelve null y el dashboard
 * cae en su lógica de fallback (variación aleatoria).
 */
@Injectable({ providedIn: 'root' })
export class PrediccionService {
  private readonly http = inject(HttpClient);

  /** Base URL proxeada via proxy.conf.json → http://localhost:5000 */
  private readonly BASE = 'http://localhost:5000/api';

  private modeloDisponible: boolean | null = null;

  /**
   * Comprueba si la API Flask está activa.
   * Resultado cacheado para no repetir el check en cada predicción.
   */
  checkDisponibilidad(): Observable<boolean> {
    if (this.modeloDisponible !== null) {
      return of(this.modeloDisponible);
    }
    return this.http.get<{ status: string }>(`${this.BASE}/health`).pipe(
      map(r => {
        this.modeloDisponible = r.status === 'ok';
        return this.modeloDisponible;
      }),
      catchError(() => {
        this.modeloDisponible = false;
        return of(false);
      })
    );
  }

  /**
   * Predice el precio de Gasolina 95 para mañana en una ubicación/marca dadas.
   * @returns Observable con la predicción o null si el modelo no está disponible.
   */
  predecirPrecio(datos: SolicitudPrediccion): Observable<PrediccionPrecio | null> {
    return this.http
      .post<Omit<PrediccionPrecio, 'fuente'>>(`${this.BASE}/predecir-precio`, datos)
      .pipe(
        map(r => ({ ...r, fuente: 'ml' as const })),
        catchError(() => of(null))
      );
  }

  /**
   * Predicción en lote para un conjunto de estaciones (precio de mañana).
   */
  predecirLote(
    estaciones: { id: string; latitud: number; longitud: number; marca: string; distancia_centro: number }[]
  ): Observable<PrediccionLote | null> {
    return this.http
      .post<PrediccionLote>(`${this.BASE}/predecir-lote`, { estaciones })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Obtiene las métricas del modelo entrenado (RMSE, R², etc.).
   */
  getMetricas(): Observable<MetricasModelo | null> {
    return this.http
      .get<MetricasModelo>(`${this.BASE}/metricas`)
      .pipe(catchError(() => of(null)));
  }

  /**
   * Calcula el día de mañana en español.
   */
  getDiaManana(): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[(new Date().getDay() + 1) % 7];
  }

  /**
   * Calcula la distancia en km entre dos puntos (Haversine).
   */
  distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
