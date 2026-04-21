import { Injectable, signal, computed } from '@angular/core';
import {
  GasStation,
  TipoCombustible,
  ComparacionEstaciones,
  ParametrosAhorro
} from '../models/gas-station.models';

/**
 * Servicio para comparación de estaciones de servicio
 * Permite comparar precios y calcular ahorros entre múltiples gasolineras
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class ComparacionService {
  private readonly MAX_COMPARACIONES = 3;
  private readonly STORAGE_KEY = 'gas-trend-comparaciones';
  
  // ============================================================================
  // SIGNALS - ESTADO REACTIVO
  // ============================================================================
  
  // Estaciones seleccionadas para comparar
  private estacionesComparacionSignal = signal<GasStation[]>([]);
  
  // Señales computadas
  public estacionesComparacion = this.estacionesComparacionSignal.asReadonly();
  public totalComparaciones = computed(() => this.estacionesComparacionSignal().length);
  public puedeAgregarMas = computed(() => this.totalComparaciones() < this.MAX_COMPARACIONES);
  public tieneComparaciones = computed(() => this.totalComparaciones() > 0);

  // ============================================================================
  // MÉTODOS PRINCIPALES - GESTIÓN DE COMPARACIONES
  // ============================================================================

  /**
   * Agrega una estación a la comparación
   * @param estacion Estación a agregar
   * @returns true si se agregó, false si ya existe o está lleno
   */
  agregarAComparacion(estacion: GasStation): boolean {
    const estaciones = this.estacionesComparacionSignal();
    
    // Verificar límite
    if (estaciones.length >= this.MAX_COMPARACIONES) {
      console.warn(`⚠️ Máximo ${this.MAX_COMPARACIONES} estaciones para comparar`);
      return false;
    }
    
    // Verificar si ya existe
    if (estaciones.some(e => e.id === estacion.id)) {
      console.warn('⚠️ La estación ya está en comparación');
      return false;
    }

    this.estacionesComparacionSignal.update(lista => [...lista, estacion]);
    this.guardarEnStorage();
    
    console.log(`✅ Estación ${estacion.marca} agregada a comparación`);
    return true;
  }

  /**
   * Elimina una estación de la comparación
   * @param estacionId ID de la estación a eliminar
   */
  eliminarDeComparacion(estacionId: string): void {
    this.estacionesComparacionSignal.update(lista =>
      lista.filter(e => e.id !== estacionId)
    );
    this.guardarEnStorage();
    console.log(`🗑️ Estación ${estacionId} eliminada de comparación`);
  }

  /**
   * Verifica si una estación está en comparación
   * @param estacionId ID de la estación
   */
  estaEnComparacion(estacionId: string): boolean {
    return this.estacionesComparacionSignal().some(e => e.id === estacionId);
  }

  /**
   * Limpia todas las comparaciones
   */
  limpiarComparaciones(): void {
    this.estacionesComparacionSignal.set([]);
    this.guardarEnStorage();
    console.log('🗑️ Comparaciones limpiadas');
  }

  // ============================================================================
  // ANÁLISIS Y COMPARACIÓN
  // ============================================================================

  /**
   * Genera un análisis comparativo completo
   * @param combustible Tipo de combustible a comparar
   * @param parametrosAhorro Parámetros para calcular ahorro (opcional)
   * @returns Objeto con análisis completo
   */
  generarComparacion(
    combustible: TipoCombustible,
    parametrosAhorro?: ParametrosAhorro
  ): ComparacionEstaciones | null {
    const estaciones = this.estacionesComparacionSignal();
    
    if (estaciones.length < 2) {
      console.warn('⚠️ Se necesitan al menos 2 estaciones para comparar');
      return null;
    }

    // Obtener precios
    const estacionesConPrecio = estaciones
      .map(e => ({
        estacion: e,
        precio: this.obtenerPrecio(e, combustible)
      }))
      .filter(item => item.precio !== undefined) as Array<{
        estacion: GasStation;
        precio: number;
      }>;

    if (estacionesConPrecio.length < 2) {
      console.warn('⚠️ No hay suficientes estaciones con precio disponible');
      return null;
    }

    // Ordenar por precio
    estacionesConPrecio.sort((a, b) => a.precio - b.precio);

    const mejorPrecio = estacionesConPrecio[0];
    const peorPrecio = estacionesConPrecio[estacionesConPrecio.length - 1];
    const diferenciaMaxima = peorPrecio.precio - mejorPrecio.precio;

    // Calcular ahorro mensual si se proporcionan parámetros
    let ahorroMensual: number | undefined;
    if (parametrosAhorro) {
      ahorroMensual = diferenciaMaxima * parametrosAhorro.litrosPorMes;
    }

    const comparacion: ComparacionEstaciones = {
      estaciones: estacionesConPrecio.map(item => item.estacion),
      combustible,
      timestamp: new Date(),
      mejorPrecio,
      peorPrecio,
      diferenciaMaxima,
      ahorroMensual
    };

    console.log('📊 Comparación generada:', comparacion);
    return comparacion;
  }

  /**
   * Calcula el ahorro potencial entre dos estaciones
   * @param estacion1 Primera estación
   * @param estacion2 Segunda estación
   * @param combustible Tipo de combustible
   * @param litrosPorMes Consumo mensual estimado
   * @returns Ahorro en euros
   */
  calcularAhorro(
    estacion1: GasStation,
    estacion2: GasStation,
    combustible: TipoCombustible,
    litrosPorMes: number
  ): number {
    const precio1 = this.obtenerPrecio(estacion1, combustible);
    const precio2 = this.obtenerPrecio(estacion2, combustible);

    if (!precio1 || !precio2) return 0;

    const diferencia = Math.abs(precio1 - precio2);
    return diferencia * litrosPorMes;
  }

  /**
   * Genera estadísticas de comparación
   * @param combustible Tipo de combustible
   * @returns Objeto con estadísticas
   */
  obtenerEstadisticasComparacion(combustible: TipoCombustible): {
    precioMedio: number;
    precioMinimo: number;
    precioMaximo: number;
    desviacionEstandar: number;
  } | null {
    const estaciones = this.estacionesComparacionSignal();
    
    if (estaciones.length === 0) return null;

    const precios = estaciones
      .map(e => this.obtenerPrecio(e, combustible))
      .filter((p): p is number => p !== undefined);

    if (precios.length === 0) return null;

    const precioMedio = precios.reduce((sum, p) => sum + p, 0) / precios.length;
    const precioMinimo = Math.min(...precios);
    const precioMaximo = Math.max(...precios);

    // Calcular desviación estándar
    const varianza = precios.reduce((sum, p) => 
      sum + Math.pow(p - precioMedio, 2), 0
    ) / precios.length;
    const desviacionEstandar = Math.sqrt(varianza);

    return {
      precioMedio,
      precioMinimo,
      precioMaximo,
      desviacionEstandar
    };
  }

  /**
   * Genera recomendación basada en precio y distancia
   * @param combustible Tipo de combustible
   * @param ubicacionActual Coordenadas actuales del usuario
   * @returns Estación recomendada o null
   */
  obtenerRecomendacion(
    combustible: TipoCombustible,
    ubicacionActual?: { latitud: number; longitud: number }
  ): GasStation | null {
    const estaciones = this.estacionesComparacionSignal();
    
    if (estaciones.length === 0) return null;

    // Si no hay ubicación, recomendar la más barata
    if (!ubicacionActual) {
      const conPrecio = estaciones
        .map(e => ({ estacion: e, precio: this.obtenerPrecio(e, combustible) }))
        .filter(item => item.precio !== undefined)
        .sort((a, b) => a.precio! - b.precio!);
      
      return conPrecio.length > 0 ? conPrecio[0].estacion : null;
    }

    // Con ubicación: calcular mejor relación precio/distancia
    const conPrecioYDistancia = estaciones
      .map(e => {
        const precio = this.obtenerPrecio(e, combustible);
        if (!precio) return null;

        const distancia = e.distancia || 0;
        
        // Score: menor es mejor (penalizar distancia y precio)
        // Fórmula: precio + (distancia * 0.05) para dar peso a ambos factores
        const score = precio + (distancia * 0.05);

        return { estacion: e, precio, distancia, score };
      })
      .filter(item => item !== null)
      .sort((a, b) => a!.score - b!.score);

    return conPrecioYDistancia.length > 0 
      ? conPrecioYDistancia[0]!.estacion 
      : null;
  }

  // ============================================================================
  // PERSISTENCIA - LOCALSTORAGE
  // ============================================================================

  /**
   * Guarda comparaciones en LocalStorage
   */
  private guardarEnStorage(): void {
    try {
      const estaciones = this.estacionesComparacionSignal();
      // Solo guardar IDs para no duplicar datos
      const ids = estaciones.map(e => e.id);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
    } catch (error) {
      console.error('❌ Error guardando comparaciones:', error);
    }
  }

  /**
   * Carga IDs de comparaciones desde LocalStorage
   * Nota: Las estaciones completas deben ser cargadas por el componente
   * @returns Array de IDs de estaciones
   */
  cargarIdsDesdeStorage(): string[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as string[];
      }
    } catch (error) {
      console.error('❌ Error cargando comparaciones:', error);
    }
    return [];
  }

  /**
   * Restaura estaciones completas desde IDs guardados
   * @param todasEstaciones Pool de estaciones disponibles
   */
  restaurarComparaciones(todasEstaciones: GasStation[]): void {
    const ids = this.cargarIdsDesdeStorage();
    const estaciones = ids
      .map(id => todasEstaciones.find(e => e.id === id))
      .filter((e): e is GasStation => e !== undefined);
    
    this.estacionesComparacionSignal.set(estaciones);
    console.log(`📂 ${estaciones.length} comparaciones restauradas`);
  }

  // ============================================================================
  // EXPORTACIÓN
  // ============================================================================

  /**
   * Exporta comparación como JSON descargable
   * @param comparacion Datos de comparación a exportar
   */
  exportarComparacion(comparacion: ComparacionEstaciones): void {
    const data = JSON.stringify(comparacion, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparacion-gasolineras-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('💾 Comparación exportada');
  }

  /**
   * Exporta comparación como CSV
   * @param comparacion Datos de comparación
   */
  exportarComparacionCSV(comparacion: ComparacionEstaciones): void {
    let csv = 'Marca,Dirección,Municipio,Precio,Distancia(km)\n';
    
    comparacion.estaciones.forEach(estacion => {
      const precio = this.obtenerPrecio(estacion, comparacion.combustible);
      csv += `"${estacion.marca}","${estacion.direccion}","${estacion.municipio}",${precio || 'N/D'},${estacion.distancia?.toFixed(2) || 'N/D'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparacion-gasolineras-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('💾 Comparación exportada como CSV');
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Obtiene el precio de un combustible específico
   */
  private obtenerPrecio(
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
}
