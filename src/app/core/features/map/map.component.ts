import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  AfterViewInit,
  Output,
  EventEmitter,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { GasStation, Coordenadas, TipoCombustible } from '../../models/gas-station.models';
import { FavoritosService } from '../../services/favoritos.service';

/**
 * Componente de mapa interactivo con Leaflet
 * Muestra gasolineras con marcadores personalizados y popups informativos
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-container">
      <div id="map" class="map-view"></div>
      
      <!-- Controles superpuestos -->
      <div class="map-controls">
        <button 
          class="control-btn"
          (click)="centrarEnUbicacion()"
          title="Centrar en mi ubicación">
          📍 Mi ubicación
        </button>
        
        <button 
          class="control-btn"
          (click)="ajustarVistaTodosMarkers()"
          title="Ver todas las estaciones">
          🗺️ Ver todas
        </button>
        
        <div class="legend">
          <div class="legend-title">Leyenda</div>
          <div class="legend-item">
            <span class="legend-icon legend-barato">●</span>
            <span>Más barato</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon legend-medio">●</span>
            <span>Precio medio</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon legend-caro">●</span>
            <span>Más caro</span>
          </div>
          @if (estacionesCargadas() > 0) {
            <div class="legend-stats">
              {{ estacionesCargadas() }} estaciones
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .map-container {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 500px;
    }

    .map-view {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      z-index: 1;
    }

    .map-controls {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .control-btn {
      background: white;
      border: 2px solid #ccc;
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.2s;
    }

    .control-btn:hover {
      background: #f0f0f0;
      border-color: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0,0,0,0.15);
    }

    .legend {
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      min-width: 150px;
    }

    .legend-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      color: #333;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
      font-size: 13px;
      color: #666;
    }

    .legend-icon {
      font-size: 20px;
      line-height: 1;
    }

    .legend-barato { color: #10b981; }
    .legend-medio { color: #f59e0b; }
    .legend-caro { color: #ef4444; }

    .legend-stats {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      font-weight: 500;
    }

    /* Estilos para popups de Leaflet */
    :host ::ng-deep .leaflet-popup-content-wrapper {
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    :host ::ng-deep .leaflet-popup-content {
      margin: 12px;
      font-family: system-ui, -apple-system, sans-serif;
    }

    :host ::ng-deep .popup-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
    }

    :host ::ng-deep .popup-address {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 12px;
    }

    :host ::ng-deep .popup-price {
      font-size: 24px;
      font-weight: 700;
      color: #2563eb;
      margin: 8px 0;
    }

    :host ::ng-deep .popup-distance {
      font-size: 13px;
      color: #059669;
      font-weight: 500;
      margin: 4px 0;
    }

    :host ::ng-deep .popup-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    :host ::ng-deep .popup-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    :host ::ng-deep .popup-btn-primary {
      background: #2563eb;
      color: white;
    }

    :host ::ng-deep .popup-btn-primary:hover {
      background: #1d4ed8;
    }

    :host ::ng-deep .popup-btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    :host ::ng-deep .popup-btn-secondary:hover {
      background: #e5e7eb;
    }
  `]
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  private readonly favoritosService = inject(FavoritosService);
  
  // ============================================================================
  // INPUTS Y OUTPUTS
  // ============================================================================
  
  @Input() estaciones: GasStation[] = [];
  @Input() combustibleSeleccionado: TipoCombustible = TipoCombustible.GASOLINA_95;
  @Input() centroInicial?: Coordenadas;
  @Input() zoomInicial = 13;
  @Input() modoSeleccionPunto = false;
  
  @Output() estacionSeleccionada = new EventEmitter<GasStation>();
  @Output() favoritoAgregado = new EventEmitter<GasStation>();
  @Output() puntoSeleccionado = new EventEmitter<Coordenadas>();
  
  // ============================================================================
  // PROPIEDADES DEL COMPONENTE
  // ============================================================================
  
  private map?: L.Map;
  private markers: L.Marker[] = [];
  private userLocationMarker?: L.Marker;
  private userLocationCircle?: L.Circle;
  private puntoRecomendacionMarker?: L.Marker;
  
  // Signal para trackear estaciones cargadas
  estacionesCargadas = signal(0);
  
  // Configuración por defecto (España)
  private readonly CENTRO_DEFAULT: Coordenadas = {
    latitud: 40.4168,
    longitud: -3.7038
  };

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
  
  ngOnInit(): void {
    // Configurar iconos por defecto de Leaflet
    this.configurarIconosLeaflet();
  }

  ngAfterViewInit(): void {
    // Inicializar mapa después de que la vista esté lista
    setTimeout(() => {
      this.inicializarMapa();
      this.cargarEstaciones();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['estaciones'] || changes['combustibleSeleccionado'])) {
      this.cargarEstaciones();
    }

    if (this.map && changes['modoSeleccionPunto']) {
      const mapElement = this.map.getContainer();
      if (this.modoSeleccionPunto) {
        mapElement.style.cursor = 'crosshair';
      } else {
        mapElement.style.cursor = '';
      }
    }
  }

  ngOnDestroy(): void {
    // Limpiar recursos
    if (this.map) {
      this.map.remove();
    }
  }

  // ============================================================================
  // INICIALIZACIÓN DEL MAPA
  // ============================================================================

  /**
   * Inicializa el mapa de Leaflet con OpenStreetMap
   */
  private inicializarMapa(): void {
    const centro = this.centroInicial || this.CENTRO_DEFAULT;
    
    this.map = L.map('map', {
      center: [centro.latitud, centro.longitud],
      zoom: this.zoomInicial,
      zoomControl: true,
      attributionControl: true
    });

    // Capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      minZoom: 6
    }).addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (!this.modoSeleccionPunto) return;

      const coords: Coordenadas = {
        latitud: event.latlng.lat,
        longitud: event.latlng.lng
      };

      this.marcarPuntoRecomendacion(coords);
      this.puntoSeleccionado.emit(coords);
    });

    console.log('✅ Mapa inicializado correctamente');
  }

  /**
   * Configura los iconos por defecto de Leaflet
   * (Fix para iconos rotos en producción)
   */
  private configurarIconosLeaflet(): void {
    const iconRetinaUrl = 'assets/marker-icon-2x.png';
    const iconUrl = 'assets/marker-icon.png';
    const shadowUrl = 'assets/marker-shadow.png';
    
    const iconDefault = L.icon({
      iconRetinaUrl,
      iconUrl,
      shadowUrl,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });
    
    L.Marker.prototype.options.icon = iconDefault;
  }

  // ============================================================================
  // GESTIÓN DE ESTACIONES Y MARCADORES
  // ============================================================================

  /**
   * Carga y muestra todas las estaciones en el mapa
   */
  private cargarEstaciones(): void {
    if (!this.map) return;

    // Limpiar marcadores existentes
    this.limpiarMarkers();

    // Calcular rango de precios para colorear marcadores
    const precios = this.estaciones
      .map(e => this.obtenerPrecio(e))
      .filter((p): p is number => p !== undefined);

    const precioMin = Math.min(...precios);
    const precioMax = Math.max(...precios);

    // Crear marcador para cada estación
    this.estaciones.forEach(estacion => {
      const precio = this.obtenerPrecio(estacion);
      if (precio === undefined) return;

      const marker = this.crearMarker(estacion, precio, precioMin, precioMax);
      marker.addTo(this.map!);
      this.markers.push(marker);
    });

    this.estacionesCargadas.set(this.markers.length);
    console.log(`📍 ${this.markers.length} marcadores cargados en el mapa`);

    // Ajustar vista si hay marcadores
    if (this.markers.length > 0) {
      this.ajustarVistaTodosMarkers();
    }
  }

  /**
   * Crea un marcador personalizado para una estación
   * @param estacion Estación de servicio
   * @param precio Precio del combustible seleccionado
   * @param precioMin Precio mínimo del conjunto
   * @param precioMax Precio máximo del conjunto
   * @returns Marcador de Leaflet configurado
   */
  private crearMarker(
    estacion: GasStation, 
    precio: number,
    precioMin: number,
    precioMax: number
  ): L.Marker {
    // Determinar color según precio
    const color = this.obtenerColorPorPrecio(precio, precioMin, precioMax);
    
    // Crear icono personalizado
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          background: ${color};
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
          font-size: 14px;
        ">
          ⛽
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    });

    // Crear marcador
    const marker = L.marker(
      [estacion.latitud, estacion.longitud],
      { icon }
    );

    // Configurar popup
    const popupContent = this.generarPopupContent(estacion, precio);
    marker.bindPopup(popupContent, {
      maxWidth: 280,
      className: 'custom-popup'
    });

    // Eventos
    marker.on('click', () => {
      this.estacionSeleccionada.emit(estacion);
    });

    return marker;
  }

  /**
   * Genera el contenido HTML del popup de una estación
   * @param estacion Estación de servicio
   * @param precio Precio del combustible
   * @returns HTML string del popup
   */
  private generarPopupContent(estacion: GasStation, precio: number): string {
    const esFavorito = this.favoritosService.esFavorito(estacion.id);
    const distanciaText = estacion.distancia 
      ? `<div class="popup-distance">📏 ${estacion.distancia.toFixed(1)} km</div>`
      : '';

    return `
      <div>
        <div class="popup-title">${estacion.marca}</div>
        <div class="popup-address">${estacion.direccion}</div>
        <div class="popup-price">${precio.toFixed(3)}€/L</div>
        ${distanciaText}
        <div class="popup-actions">
          <button 
            class="popup-btn popup-btn-primary"
            onclick="window.dispatchEvent(new CustomEvent('favorito-toggle', { detail: '${estacion.id}' }))">
            ${esFavorito ? '⭐ Eliminar' : '☆ Favorito'}
          </button>
          <button 
            class="popup-btn popup-btn-secondary"
            onclick="window.dispatchEvent(new CustomEvent('ver-detalles', { detail: '${estacion.id}' }))">
            Ver más
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Determina el color del marcador según el precio relativo
   * @param precio Precio actual
   * @param min Precio mínimo
   * @param max Precio máximo
   * @returns Color hexadecimal
   */
  private obtenerColorPorPrecio(precio: number, min: number, max: number): string {
    const rango = max - min;
    if (rango === 0) return '#f59e0b'; // Naranja si todos tienen el mismo precio

    const normalizado = (precio - min) / rango;

    if (normalizado < 0.33) {
      return '#10b981'; // Verde - barato
    } else if (normalizado < 0.66) {
      return '#f59e0b'; // Naranja - medio
    } else {
      return '#ef4444'; // Rojo - caro
    }
  }

  /**
   * Limpia todos los marcadores del mapa
   */
  private limpiarMarkers(): void {
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
  }

  // ============================================================================
  // MÉTODOS PÚBLICOS - CONTROLES
  // ============================================================================

  /**
   * Centra el mapa en la ubicación del usuario
   * Solicita permiso de geolocalización si es necesario
   */
  centrarEnUbicacion(): void {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordenadas = {
          latitud: position.coords.latitude,
          longitud: position.coords.longitude
        };

        if (this.map) {
          this.map.setView([coords.latitud, coords.longitud], 14);
          this.mostrarUbicacionUsuario(coords);
        }
      },
      (error) => {
        console.error('Error obteniendo ubicación:', error);
        alert('No se pudo obtener tu ubicación');
      }
    );
  }

  /**
   * Muestra un marcador especial para la ubicación del usuario
   * @param coords Coordenadas del usuario
   */
  private mostrarUbicacionUsuario(coords: Coordenadas): void {
    if (!this.map) return;

    // Eliminar marcadores previos
    if (this.userLocationMarker) {
      this.userLocationMarker.remove();
    }
    if (this.userLocationCircle) {
      this.userLocationCircle.remove();
    }

    // Crear nuevo marcador
    this.userLocationMarker = L.marker(
      [coords.latitud, coords.longitud],
      {
        icon: L.divIcon({
          className: 'user-location-marker',
          html: '<div style="background: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })
      }
    ).addTo(this.map);

    // Agregar círculo de radio
    this.userLocationCircle = L.circle(
      [coords.latitud, coords.longitud],
      {
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.1,
        radius: 40000 // 40km
      }
    ).addTo(this.map);

    this.userLocationMarker.bindPopup('📍 Tu ubicación');
  }

  private marcarPuntoRecomendacion(coords: Coordenadas): void {
    if (!this.map) return;

    if (this.puntoRecomendacionMarker) {
      this.puntoRecomendacionMarker.remove();
    }

    this.puntoRecomendacionMarker = L.marker([coords.latitud, coords.longitud]).addTo(this.map);
    this.puntoRecomendacionMarker.bindPopup('📌 Punto para recomendación IA').openPopup();
  }

  /**
   * Ajusta la vista del mapa para mostrar todos los marcadores
   */
  ajustarVistaTodosMarkers(): void {
    if (!this.map || this.markers.length === 0) return;

    const group = L.featureGroup(this.markers);
    this.map.fitBounds(group.getBounds().pad(0.1));
  }

  /**
   * Actualiza las estaciones mostradas (llamado desde el componente padre)
   */
  actualizarEstaciones(estaciones: GasStation[]): void {
    this.estaciones = estaciones;
    this.cargarEstaciones();
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Obtiene el precio del combustible seleccionado
   */
  private obtenerPrecio(estacion: GasStation): number | undefined {
    switch (this.combustibleSeleccionado) {
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
