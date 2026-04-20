import { Injectable, signal, computed, effect } from '@angular/core';
import {
  GasStation,
  Favorito,
  TipoCombustible
} from '../models/gas-station.models';

/**
 * Servicio de gestión de estaciones favoritas
 * Utiliza Angular Signals para reactividad y LocalStorage para persistencia
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class FavoritosService {
  private readonly STORAGE_KEY = 'gas-trend-favoritos';
  
  // ============================================================================
  // SIGNALS - ESTADO REACTIVO
  // ============================================================================
  
  // Signal con el array de favoritos
  private favoritosSignal = signal<Favorito[]>([]);
  
  // Señales computadas derivadas
  public favoritos = this.favoritosSignal.asReadonly();
  public totalFavoritos = computed(() => this.favoritosSignal().length);
  public tieneFavoritos = computed(() => this.favoritosSignal().length > 0);
  
  // Map para búsqueda rápida de IDs
  public favoritosIds = computed(() => {
    const ids = new Set<string>();
    this.favoritosSignal().forEach(f => ids.add(f.estacionId));
    return ids;
  });

  // ============================================================================
  // CONSTRUCTOR - INICIALIZACIÓN
  // ============================================================================
  
  constructor() {
    // Cargar favoritos del LocalStorage al inicializar
    this.cargarDesdeStorage();
    
    // Effect que guarda automáticamente en LocalStorage cuando cambian los favoritos
    effect(() => {
      const favoritos = this.favoritosSignal();
      this.guardarEnStorage(favoritos);
    });
  }

  // ============================================================================
  // MÉTODOS PRINCIPALES - CRUD DE FAVORITOS
  // ============================================================================

  /**
   * Agrega una estación a favoritos
   * @param estacion Estación a agregar
   * @param alias Nombre personalizado opcional
   * @param notas Notas opcionales
   * @returns true si se agregó, false si ya existía
   */
  agregarFavorito(
    estacion: GasStation, 
    alias?: string, 
    notas?: string
  ): boolean {
    const favoritos = this.favoritosSignal();
    
    // Verificar si ya existe
    if (favoritos.some(f => f.estacionId === estacion.id)) {
      console.warn(`⚠️ La estación ${estacion.id} ya está en favoritos`);
      return false;
    }

    const nuevoFavorito: Favorito = {
      estacionId: estacion.id,
      estacion: estacion,
      fechaAgregado: new Date(),
      alias,
      notas
    };

    // Actualizar signal (Angular detecta el cambio automáticamente)
    this.favoritosSignal.update(favs => [...favs, nuevoFavorito]);
    
    console.log(`✅ Estación ${estacion.marca} agregada a favoritos`);
    return true;
  }

  /**
   * Elimina una estación de favoritos
   * @param estacionId ID de la estación a eliminar
   * @returns true si se eliminó, false si no existía
   */
  eliminarFavorito(estacionId: string): boolean {
    const favoritos = this.favoritosSignal();
    const index = favoritos.findIndex(f => f.estacionId === estacionId);
    
    if (index === -1) {
      console.warn(`⚠️ La estación ${estacionId} no está en favoritos`);
      return false;
    }

    this.favoritosSignal.update(favs => 
      favs.filter(f => f.estacionId !== estacionId)
    );
    
    console.log(`🗑️ Estación ${estacionId} eliminada de favoritos`);
    return true;
  }

  /**
   * Actualiza el alias y/o notas de un favorito
   * @param estacionId ID de la estación
   * @param alias Nuevo alias
   * @param notas Nuevas notas
   * @returns true si se actualizó, false si no existe
   */
  actualizarFavorito(
    estacionId: string, 
    alias?: string, 
    notas?: string
  ): boolean {
    this.favoritosSignal.update(favs => 
      favs.map(f => 
        f.estacionId === estacionId 
          ? { ...f, alias, notas }
          : f
      )
    );
    
    return true;
  }

  /**
   * Verifica si una estación está en favoritos
   * @param estacionId ID de la estación
   * @returns true si está en favoritos
   */
  esFavorito(estacionId: string): boolean {
    return this.favoritosIds().has(estacionId);
  }

  /**
   * Obtiene un favorito específico
   * @param estacionId ID de la estación
   * @returns Favorito o undefined
   */
  obtenerFavorito(estacionId: string): Favorito | undefined {
    return this.favoritosSignal().find(f => f.estacionId === estacionId);
  }

  /**
   * Obtiene favoritos filtrados por marca
   * @param marca Marca a filtrar
   * @returns Array de favoritos de esa marca
   */
  obtenerFavoritosPorMarca(marca: string): Favorito[] {
    return this.favoritosSignal().filter(f => 
      f.estacion.marca.toLowerCase().includes(marca.toLowerCase())
    );
  }

  /**
   * Obtiene favoritos ordenados por precio de un combustible
   * @param combustible Tipo de combustible
   * @returns Array ordenado por precio ascendente
   */
  obtenerFavoritosOrdenadosPorPrecio(
    combustible: TipoCombustible
  ): Favorito[] {
    return [...this.favoritosSignal()].sort((a, b) => {
      const precioA = this.obtenerPrecio(a.estacion, combustible) || Infinity;
      const precioB = this.obtenerPrecio(b.estacion, combustible) || Infinity;
      return precioA - precioB;
    });
  }

  /**
   * Limpia todos los favoritos
   * PRECAUCIÓN: Esta acción no es reversible
   */
  limpiarTodosFavoritos(): void {
    if (confirm('¿Estás seguro de que quieres eliminar todos los favoritos?')) {
      this.favoritosSignal.set([]);
      console.log('🗑️ Todos los favoritos han sido eliminados');
    }
  }

  // ============================================================================
  // PERSISTENCIA - LOCALSTORAGE
  // ============================================================================

  /**
   * Carga favoritos desde LocalStorage
   * Maneja errores de parsing y datos corruptos
   */
  private cargarDesdeStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const favoritos = JSON.parse(data) as Favorito[];
        
        // Reconstruir objetos Date que se serializan como strings
        const favoritosReconstruidos = favoritos.map(f => ({
          ...f,
          fechaAgregado: new Date(f.fechaAgregado),
          estacion: {
            ...f.estacion,
            ultimaActualizacion: new Date(f.estacion.ultimaActualizacion)
          }
        }));
        
        this.favoritosSignal.set(favoritosReconstruidos);
        console.log(`📂 ${favoritosReconstruidos.length} favoritos cargados desde LocalStorage`);
      }
    } catch (error) {
      console.error('❌ Error al cargar favoritos desde LocalStorage:', error);
      // En caso de error, inicializar con array vacío
      this.favoritosSignal.set([]);
    }
  }

  /**
   * Guarda favoritos en LocalStorage
   * @param favoritos Array de favoritos a guardar
   */
  private guardarEnStorage(favoritos: Favorito[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favoritos));
    } catch (error) {
      console.error('❌ Error al guardar favoritos en LocalStorage:', error);
      // Puede fallar si el storage está lleno o bloqueado
    }
  }

  /**
   * Exporta favoritos como JSON descargable
   * Útil para backup o transferencia entre dispositivos
   */
  exportarFavoritos(): void {
    const data = JSON.stringify(this.favoritosSignal(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `gas-trend-favoritos-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('💾 Favoritos exportados correctamente');
  }

  /**
   * Importa favoritos desde un archivo JSON
   * @param file Archivo JSON con favoritos
   */
  importarFavoritos(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const favoritos = JSON.parse(e.target?.result as string) as Favorito[];
          
          // Validar estructura básica
          if (!Array.isArray(favoritos)) {
            throw new Error('Formato inválido: se esperaba un array');
          }
          
          // Reconstruir dates
          const favoritosReconstruidos = favoritos.map(f => ({
            ...f,
            fechaAgregado: new Date(f.fechaAgregado),
            estacion: {
              ...f.estacion,
              ultimaActualizacion: new Date(f.estacion.ultimaActualizacion)
            }
          }));
          
          // Merge con favoritos existentes (evitar duplicados)
          const existentes = this.favoritosSignal();
          const nuevos = favoritosReconstruidos.filter(
            f => !existentes.some(e => e.estacionId === f.estacionId)
          );
          
          this.favoritosSignal.update(favs => [...favs, ...nuevos]);
          
          console.log(`📥 ${nuevos.length} favoritos importados correctamente`);
          resolve();
        } catch (error) {
          console.error('❌ Error al importar favoritos:', error);
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file);
    });
  }

  // ============================================================================
  // HELPERS PRIVADOS
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
