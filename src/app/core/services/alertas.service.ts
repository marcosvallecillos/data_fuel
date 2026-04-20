import { Injectable, signal, computed, effect, inject } from '@angular/core';
import {
  Alerta,
  AlertaDisparada,
  GasStation,
  TipoCombustible
} from '../models/gas-station.models';
import { GasStationService } from './gas-station.service';

/**
 * Servicio de gestión de alertas de precio
 * Permite configurar notificaciones cuando el precio alcanza un objetivo
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class AlertasService {
  private readonly gasStationService = inject(GasStationService);
  private readonly STORAGE_KEY = 'gas-trend-alertas';
  
  // ============================================================================
  // SIGNALS - ESTADO REACTIVO
  // ============================================================================
  
  // Signal con el array de alertas configuradas
  private alertasSignal = signal<Alerta[]>([]);
  
  // Signal con alertas disparadas actualmente
  private alertasDisparadasSignal = signal<AlertaDisparada[]>([]);
  
  // Señales computadas públicas
  public alertas = this.alertasSignal.asReadonly();
  public alertasDisparadas = this.alertasDisparadasSignal.asReadonly();
  public totalAlertas = computed(() => this.alertasSignal().length);
  public alertasActivas = computed(() => 
    this.alertasSignal().filter(a => a.activa).length
  );
  public tieneAlertasDisparadas = computed(() => 
    this.alertasDisparadasSignal().length > 0
  );

  // ============================================================================
  // CONSTRUCTOR - INICIALIZACIÓN
  // ============================================================================
  
  constructor() {
    // Cargar alertas del LocalStorage
    this.cargarDesdeStorage();
    
    // Effect para guardar automáticamente en LocalStorage
    effect(() => {
      const alertas = this.alertasSignal();
      this.guardarEnStorage(alertas);
    });
    
    // Suscribirse a cambios en estaciones para verificar alertas
    effect(() => {
      const estaciones = this.gasStationService.estaciones$;
      // Este effect se re-ejecutará cada vez que cambien las estaciones
    });
  }

  // ============================================================================
  // MÉTODOS PRINCIPALES - CRUD DE ALERTAS
  // ============================================================================

  /**
   * Crea una nueva alerta de precio
   * @param estacionId ID de la estación a monitorizar
   * @param combustible Tipo de combustible
   * @param precioObjetivo Precio objetivo en €
   * @param descripcion Descripción opcional
   * @returns ID de la alerta creada
   */
  crearAlerta(
    estacionId: string,
    combustible: TipoCombustible,
    precioObjetivo: number,
    descripcion?: string
  ): string {
    const nuevaAlerta: Alerta = {
      id: this.generarId(),
      estacionId,
      combustible,
      precioObjetivo,
      activa: true,
      fechaCreacion: new Date(),
      descripcion
    };

    this.alertasSignal.update(alertas => [...alertas, nuevaAlerta]);
    
    console.log(`🔔 Alerta creada: ${precioObjetivo}€ para estación ${estacionId}`);
    return nuevaAlerta.id;
  }

  /**
   * Elimina una alerta
   * @param alertaId ID de la alerta a eliminar
   * @returns true si se eliminó correctamente
   */
  eliminarAlerta(alertaId: string): boolean {
    const alertas = this.alertasSignal();
    const index = alertas.findIndex(a => a.id === alertaId);
    
    if (index === -1) {
      console.warn(`⚠️ Alerta ${alertaId} no encontrada`);
      return false;
    }

    this.alertasSignal.update(alertas => 
      alertas.filter(a => a.id !== alertaId)
    );
    
    // También eliminar de alertas disparadas si existe
    this.alertasDisparadasSignal.update(disparadas =>
      disparadas.filter(d => d.id !== alertaId)
    );
    
    console.log(`🗑️ Alerta ${alertaId} eliminada`);
    return true;
  }

  /**
   * Activa o desactiva una alerta
   * @param alertaId ID de la alerta
   * @param activa true para activar, false para desactivar
   */
  toggleAlerta(alertaId: string, activa: boolean): void {
    this.alertasSignal.update(alertas =>
      alertas.map(a => 
        a.id === alertaId ? { ...a, activa } : a
      )
    );
    
    console.log(`${activa ? '✅' : '⏸️'} Alerta ${alertaId} ${activa ? 'activada' : 'desactivada'}`);
  }

  /**
   * Actualiza el precio objetivo de una alerta
   * @param alertaId ID de la alerta
   * @param nuevoPrecio Nuevo precio objetivo
   */
  actualizarPrecioObjetivo(alertaId: string, nuevoPrecio: number): void {
    this.alertasSignal.update(alertas =>
      alertas.map(a => 
        a.id === alertaId ? { ...a, precioObjetivo: nuevoPrecio } : a
      )
    );
    
    console.log(`💰 Precio objetivo actualizado a ${nuevoPrecio}€`);
  }

  /**
   * Obtiene todas las alertas de una estación específica
   * @param estacionId ID de la estación
   * @returns Array de alertas de esa estación
   */
  obtenerAlertasPorEstacion(estacionId: string): Alerta[] {
    return this.alertasSignal().filter(a => a.estacionId === estacionId);
  }

  /**
   * Obtiene una alerta específica
   * @param alertaId ID de la alerta
   * @returns Alerta o undefined
   */
  obtenerAlerta(alertaId: string): Alerta | undefined {
    return this.alertasSignal().find(a => a.id === alertaId);
  }

  // ============================================================================
  // VERIFICACIÓN DE ALERTAS
  // ============================================================================

  /**
   * Verifica todas las alertas activas contra las estaciones actuales
   * Identifica qué alertas se han disparado
   * @param estaciones Array de estaciones a verificar
   */
  verificarAlertas(estaciones: GasStation[]): void {
    const alertasActivas = this.alertasSignal().filter(a => a.activa);
    const alertasDisparadas: AlertaDisparada[] = [];

    for (const alerta of alertasActivas) {
      const estacion = estaciones.find(e => e.id === alerta.estacionId);
      
      if (!estacion) continue;

      const precioActual = this.obtenerPrecioCombustible(estacion, alerta.combustible);
      
      if (precioActual === undefined) continue;

      // Verificar si el precio actual cumple o está por debajo del objetivo
      if (precioActual <= alerta.precioObjetivo) {
        const diferencia = alerta.precioObjetivo - precioActual;
        const porcentajeDiferencia = (diferencia / alerta.precioObjetivo) * 100;

        alertasDisparadas.push({
          ...alerta,
          estacion,
          precioActual,
          diferencia,
          porcentajeDiferencia
        });

        // Actualizar timestamp de última notificación
        this.actualizarUltimaNotificacion(alerta.id);
      }
    }

    // Actualizar signal de alertas disparadas
    this.alertasDisparadasSignal.set(alertasDisparadas);

    if (alertasDisparadas.length > 0) {
      console.log(`🚨 ${alertasDisparadas.length} alertas disparadas`);
      this.notificarAlertas(alertasDisparadas);
    }
  }

  /**
   * Actualiza el timestamp de última notificación de una alerta
   * @param alertaId ID de la alerta
   */
  private actualizarUltimaNotificacion(alertaId: string): void {
    this.alertasSignal.update(alertas =>
      alertas.map(a => 
        a.id === alertaId 
          ? { ...a, ultimaNotificacion: new Date() }
          : a
      )
    );
  }

  /**
   * Descarta (cierra) alertas disparadas temporalmente
   * No elimina la configuración de la alerta
   */
  descartarAlertasDisparadas(): void {
    this.alertasDisparadasSignal.set([]);
    console.log('🔕 Alertas disparadas descartadas');
  }

  // ============================================================================
  // NOTIFICACIONES
  // ============================================================================

  /**
   * Envía notificaciones visuales para alertas disparadas
   * Usa la API de Notificaciones del navegador si está disponible
   * @param alertas Array de alertas disparadas
   */
  private notificarAlertas(alertas: AlertaDisparada[]): void {
    // Notificación visual en la UI (siempre)
    this.mostrarNotificacionVisual(alertas);

    // Notificación del navegador (si está permitido)
    if ('Notification' in window && Notification.permission === 'granted') {
      this.enviarNotificacionNavegador(alertas);
    }
  }

  /**
   * Muestra notificación visual en la UI
   * (Este método será llamado desde el componente de UI)
   */
  private mostrarNotificacionVisual(alertas: AlertaDisparada[]): void {
    // La UI se actualizará automáticamente vía el signal alertasDisparadas
    console.log('📢 Notificación visual mostrada en UI');
  }

  /**
   * Envía notificación del sistema operativo
   * @param alertas Alertas a notificar
   */
  private enviarNotificacionNavegador(alertas: AlertaDisparada[]): void {
    if (alertas.length === 1) {
      const alerta = alertas[0];
      new Notification('🎯 ¡Precio alcanzado!', {
        body: `${alerta.estacion.marca} - ${alerta.combustible}: ${alerta.precioActual.toFixed(3)}€ (objetivo: ${alerta.precioObjetivo.toFixed(3)}€)`,
        icon: '/assets/icons/gas-station.png',
        badge: '/assets/icons/badge.png',
        tag: alerta.id
      });
    } else {
      new Notification('🎯 ¡Múltiples alertas disparadas!', {
        body: `${alertas.length} estaciones han alcanzado tu precio objetivo`,
        icon: '/assets/icons/gas-station.png',
        badge: '/assets/icons/badge.png'
      });
    }
  }

  /**
   * Solicita permiso para notificaciones del navegador
   * @returns Promise con el resultado del permiso
   */
  async solicitarPermisoNotificaciones(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('⚠️ Notificaciones no soportadas por el navegador');
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      console.log(`🔔 Permiso de notificaciones: ${permission}`);
      return permission;
    }

    return Notification.permission;
  }

  // ============================================================================
  // ANÁLISIS Y ESTADÍSTICAS
  // ============================================================================

  /**
   * Calcula estadísticas de ahorro potencial
   * @returns Objeto con estadísticas de alertas
   */
  obtenerEstadisticasAlertas(): {
    totalAhorroDisponible: number;
    alertasMasRentables: AlertaDisparada[];
    promedioAhorro: number;
  } {
    const disparadas = this.alertasDisparadasSignal();
    
    const totalAhorroDisponible = disparadas.reduce(
      (sum, a) => sum + a.diferencia, 
      0
    );

    const alertasMasRentables = [...disparadas]
      .sort((a, b) => b.diferencia - a.diferencia)
      .slice(0, 5);

    const promedioAhorro = disparadas.length > 0 
      ? totalAhorroDisponible / disparadas.length 
      : 0;

    return {
      totalAhorroDisponible,
      alertasMasRentables,
      promedioAhorro
    };
  }

  /**
   * Obtiene el historial de alertas disparadas (últimos 30 días)
   * Útil para análisis de tendencias
   */
  obtenerHistorialAlertas(): Alerta[] {
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    return this.alertasSignal().filter(a => 
      a.ultimaNotificacion && a.ultimaNotificacion >= hace30Dias
    );
  }

  // ============================================================================
  // PERSISTENCIA - LOCALSTORAGE
  // ============================================================================

  /**
   * Carga alertas desde LocalStorage
   */
  private cargarDesdeStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const alertas = JSON.parse(data) as Alerta[];
        
        // Reconstruir objetos Date
        const alertasReconstruidas = alertas.map(a => ({
          ...a,
          fechaCreacion: new Date(a.fechaCreacion),
          ultimaNotificacion: a.ultimaNotificacion 
            ? new Date(a.ultimaNotificacion) 
            : undefined
        }));
        
        this.alertasSignal.set(alertasReconstruidas);
        console.log(`📂 ${alertasReconstruidas.length} alertas cargadas desde LocalStorage`);
      }
    } catch (error) {
      console.error('❌ Error al cargar alertas desde LocalStorage:', error);
      this.alertasSignal.set([]);
    }
  }

  /**
   * Guarda alertas en LocalStorage
   * @param alertas Array de alertas a guardar
   */
  private guardarEnStorage(alertas: Alerta[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alertas));
    } catch (error) {
      console.error('❌ Error al guardar alertas en LocalStorage:', error);
    }
  }

  /**
   * Limpia todas las alertas
   */
  limpiarTodasAlertas(): void {
    if (confirm('¿Estás seguro de que quieres eliminar todas las alertas?')) {
      this.alertasSignal.set([]);
      this.alertasDisparadasSignal.set([]);
      console.log('🗑️ Todas las alertas han sido eliminadas');
    }
  }

  // ============================================================================
  // HELPERS PRIVADOS
  // ============================================================================

  /**
   * Genera un ID único para alertas
   * @returns ID en formato timestamp-random
   */
  private generarId(): string {
    return `alerta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene el precio de un combustible específico
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
}
