import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgModel } from '@angular/forms';
import { RutasService } from '../../services/rutas.service';
import {
  GasStation,
  OrigenRuta,
  InformacionRuta,
  OpcionesRuta,
  Coordenadas,
  ResultadoDireccion
} from '../../models/gas-station.models';

/**
 * Componente modal para cálculo de rutas
 * Permite al usuario introducir origen y calcular ruta a gasolinera
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Component({
  selector: 'app-rutas-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="cerrar()" *ngIf="visible">
      <div class="modal-content" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="modal-header">
          <h2>🗺️ Calcular Ruta</h2>
          <button class="btn-close" (click)="cerrar()">✕</button>
        </div>

        <!-- Destino (solo lectura) -->
        <div class="destino-info">
          <h3>📍 Destino</h3>
          <div class="estacion-card">
            <strong>{{ estacion.marca }}</strong>
            <p>{{ estacion.direccion }}</p>
            <small>{{ estacion.municipio }}, {{ estacion.provincia }}</small>
          </div>
        </div>

        <!-- Contenido principal -->
        <div class="modal-body">
          
          @if (paso() === 'configuracion') {
            <!-- Paso 1: Configuración de origen -->
            <div class="origen-config">
              <h3>🚩 Punto de Partida</h3>
              
              <!-- Selector de tipo de origen -->
              <div class="tipo-origen">
                <label class="radio-option">
                  <input 
                    type="radio" 
                    [(ngModel)]="tipoOrigen" 
                    value="gps"
                    (change)="onTipoOrigenChange()">
                  <span>📍 Mi ubicación actual (GPS)</span>
                </label>
                
                <label class="radio-option">
                  <input 
                    type="radio" 
                    [(ngModel)]="tipoOrigen" 
                    value="manual"
                    (change)="onTipoOrigenChange()">
                  <span>✍️ Introducir dirección manualmente</span>
                </label>
              </div>

              <!-- Input de dirección manual -->
              @if (tipoOrigen === 'manual') {
                <div class="direccion-manual">
                  <label>Dirección de origen:</label>
                  <div class="input-with-spinner">
                    <input 
                      type="text" 
                      [(ngModel)]="direccionManual"
                      (input)="onDireccionChange()"
                      placeholder="Ej: Calle Mayor 1, Madrid"
                      class="form-input">
                    @if (buscando()) {
                      <span class="spinner-small"></span>
                    }
                  </div>
                  
                  <!-- Resultados de geocoding -->
                  @if (resultadosDireccion().length > 0) {
                    <div class="resultados-direccion">
                      @for (resultado of resultadosDireccion(); track $index) {
                        <div 
                          class="resultado-item"
                          (click)="seleccionarDireccion(resultado)">
                          <strong>{{ resultado.direccion }}</strong>
                          <div class="resultado-meta">
                            <span>📍 {{ resultado.detalles?.municipio || '---' }}, {{ resultado.detalles?.provincia || '---' }}</span>
                            <small>{{ (resultado.confianza * 100).toFixed(0) }}% certidumbre</small>
                          </div>
                        </div>
                      }
                    </div>
                  } @else if (direccionManual.length >= 3 && !buscando() && tipoOrigen === 'manual') {
                    <div class="no-results">
                      <small>No se encontraron resultados para "{{ direccionManual }}". Intenta ser más específico.</small>
                    </div>
                  }
                </div>
              }

              <!-- Opciones de ruta -->
              <div class="opciones-ruta">
                <h4>Modo de transporte:</h4>
                <div class="modo-transporte">
                  <label class="modo-option" [class.active]="modoTransporte === 'driving'">
                    <input 
                      type="radio" 
                      [(ngModel)]="modoTransporte" 
                      value="driving">
                    <span>🚗 Coche</span>
                  </label>
                  
                  <label class="modo-option" [class.active]="modoTransporte === 'walking'">
                    <input 
                      type="radio" 
                      [(ngModel)]="modoTransporte" 
                      value="walking">
                    <span>🚶 A pie</span>
                  </label>
                  
                  <label class="modo-option" [class.active]="modoTransporte === 'cycling'">
                    <input 
                      type="radio" 
                      [(ngModel)]="modoTransporte" 
                      value="cycling">
                    <span>🚴 Bicicleta</span>
                  </label>
                </div>
              </div>

              <!-- Botón calcular -->
              <button 
                class="btn btn-primary btn-block"
                (click)="calcularRuta()"
                [disabled]="calculando() || !origenValido()">
                @if (calculando()) {
                  <span class="spinner"></span> Calculando...
                } @else {
                  🗺️ Calcular Ruta
                }
              </button>
            </div>
          }

          @if (paso() === 'resultado') {
            <!-- Paso 2: Resultado de la ruta -->
            <div class="ruta-resultado">
              
              <!-- Resumen de ruta -->
              <div class="ruta-resumen">
                <div class="resumen-stat">
                  <div class="stat-icon">📏</div>
                  <div>
                    <h4>Distancia</h4>
                    <p>{{ rutasService.formatearDistancia(rutaCalculada()!.distanciaTotal) }}</p>
                  </div>
                </div>
                
                <div class="resumen-stat">
                  <div class="stat-icon">⏱️</div>
                  <div>
                    <h4>Duración estimada</h4>
                    <p>{{ rutasService.formatearDuracion(rutaCalculada()!.duracionEstimada) }}</p>
                  </div>
                </div>
                
                <div class="resumen-stat">
                  <div class="stat-icon">{{ rutasService.obtenerIconoTransporte(rutaCalculada()!.modoTransporte) }}</div>
                  <div>
                    <h4>Modo</h4>
                    <p>{{ obtenerNombreModo(rutaCalculada()!.modoTransporte) }}</p>
                  </div>
                </div>
              </div>

              <!-- Instrucciones paso a paso -->
              <div class="instrucciones">
                <h3>📋 Instrucciones de Navegación</h3>
                <div class="pasos-lista">
                  @for (paso of rutaCalculada()!.pasos; track $index) {
                    <div class="paso-item">
                      <div class="paso-numero">{{ $index + 1 }}</div>
                      <div class="paso-contenido">
                        <div class="paso-header">
                          <span class="paso-icon">{{ rutasService.obtenerIconoInstruccion(paso.tipo) }}</span>
                          <strong>{{ paso.instruccion }}</strong>
                        </div>
                        <div class="paso-meta">
                          {{ rutasService.formatearDistancia(paso.distancia / 1000) }}
                          · 
                          {{ rutasService.formatearDuracion(Math.round(paso.duracion / 60)) }}
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Acciones -->
              <div class="ruta-acciones">
                <button class="btn btn-secondary" (click)="volverAtras()">
                  ← Calcular otra ruta
                </button>
                <button class="btn btn-primary" (click)="abrirEnMaps()">
                  🗺️ Abrir en Google Maps
                </button>
              </div>
            </div>
          }

          <!-- Error (Solo mostrar si es relevante para el modo actual o es error general) -->
          @if (error() && (tipoOrigen === 'gps' || !error()!.includes('GPS'))) {
            <div class="error-message">
              <p class="error-icon">⚠️</p>
              <p>{{ error() }}</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 20px;
    }

    .modal-content {
      background: white;
      border-radius: 16px;
      max-width: 700px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 24px;
    }

    .btn-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .destino-info {
      padding: 20px 24px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .destino-info h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .estacion-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .estacion-card strong {
      display: block;
      font-size: 16px;
      color: #1e293b;
      margin-bottom: 4px;
    }

    .estacion-card p {
      margin: 4px 0;
      font-size: 14px;
      color: #475569;
    }

    .estacion-card small {
      font-size: 12px;
      color: #94a3b8;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .origen-config h3 {
      margin: 0 0 20px 0;
      font-size: 18px;
      color: #1e293b;
    }

    .tipo-origen {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option:hover {
      border-color: #2563eb;
      background: #f8fafc;
    }

    .radio-option input[type="radio"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }

    .radio-option span {
      font-size: 15px;
      color: #1e293b;
      font-weight: 500;
    }

    .direccion-manual {
      margin-bottom: 20px;
    }

    .direccion-manual label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #475569;
    }

    .form-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
    }

    .form-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .input-with-spinner {
      position: relative;
      display: flex;
      align-items: center;
    }

    .spinner-small {
      position: absolute;
      right: 12px;
      width: 16px;
      height: 16px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .resultados-direccion {
      margin-top: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
      max-height: 200px;
      overflow-y: auto;
    }

    .resultado-item {
      padding: 12px;
      cursor: pointer;
      transition: background 0.2s;
      border-bottom: 1px solid #f1f5f9;
    }

    .resultado-item:hover {
      background: #f8fafc;
    }

    .resultado-item:last-child {
      border-bottom: none;
    }

    .resultado-item strong {
      display: block;
      font-size: 14px;
      color: #1e293b;
      margin-bottom: 2px;
    }

    .resultado-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #64748b;
    }

    .no-results {
      margin-top: 8px;
      padding: 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      color: #92400e;
      text-align: center;
    }

    .opciones-ruta {
      margin-bottom: 20px;
    }

    .opciones-ruta h4 {
      margin: 0 0 12px 0;
      font-size: 15px;
      color: #475569;
    }

    .modo-transporte {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .modo-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .modo-option:hover {
      border-color: #2563eb;
      background: #f8fafc;
    }

    .modo-option.active {
      border-color: #2563eb;
      background: rgba(37, 99, 235, 0.05);
    }

    .modo-option input {
      display: none;
    }

    .modo-option span {
      font-size: 14px;
      font-weight: 500;
      color: #475569;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover {
      background: #f1f5f9;
    }

    .btn-block {
      width: 100%;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .ruta-resumen {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .resumen-stat {
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-icon {
      font-size: 32px;
      line-height: 1;
    }

    .resumen-stat h4 {
      margin: 0 0 4px 0;
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .resumen-stat p {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1e293b;
    }

    .instrucciones h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      color: #1e293b;
    }

    .pasos-lista {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .paso-item {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
    }

    .paso-numero {
      width: 32px;
      height: 32px;
      background: #2563eb;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      flex-shrink: 0;
    }

    .paso-contenido {
      flex: 1;
    }

    .paso-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .paso-icon {
      font-size: 20px;
    }

    .paso-header strong {
      font-size: 15px;
      color: #1e293b;
    }

    .paso-meta {
      font-size: 13px;
      color: #64748b;
    }

    .ruta-acciones {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .error-message {
      text-align: center;
      padding: 40px 20px;
    }

    .error-icon {
      font-size: 48px;
      margin: 0 0 16px 0;
    }

    .error-message p:last-child {
      font-size: 15px;
      color: #ef4444;
      margin: 0;
    }

    @media (max-width: 640px) {
      .modo-transporte {
        grid-template-columns: 1fr;
      }

      .ruta-acciones {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RutasModalComponent implements OnInit {
  readonly rutasService = inject(RutasService);
  Math = Math;
  @Input() visible = false;
  @Input() estacion!: GasStation;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() rutaCalculadaEvent = new EventEmitter<InformacionRuta>();

  // Estado
  paso = signal<'configuracion' | 'resultado'>('configuracion');
  calculando = signal(false);
  buscando = signal(false);
  error = signal<string | null>(null);

  // Configuración
  tipoOrigen: 'gps' | 'manual' = 'gps';
  direccionManual = '';
  modoTransporte: 'driving' | 'walking' | 'cycling' = 'driving';

  // Resultados
  resultadosDireccion = signal<ResultadoDireccion[]>([]);
  coordenadasOrigen = signal<Coordenadas | null>(null);
  rutaCalculada = signal<InformacionRuta | null>(null);

  origenValido = signal(false);

  private busquedaDireccionTimeout?: any;

  ngOnInit(): void {
    // Intentar obtener ubicación GPS al abrir
    if (this.tipoOrigen === 'gps') {
      this.obtenerUbicacionGPS();
    }
  }

  onTipoOrigenChange(): void {
    this.error.set(null);
    this.resultadosDireccion.set([]);
    
    if (this.tipoOrigen === 'gps') {
      this.obtenerUbicacionGPS();
    } else {
      this.origenValido.set(false);
    }
  }

  onDireccionChange(): void {
    clearTimeout(this.busquedaDireccionTimeout);
    
    if (this.direccionManual.length < 3) {
      this.resultadosDireccion.set([]);
      this.origenValido.set(false);
      this.buscando.set(false);
      return;
    }

    this.buscando.set(true);
    this.busquedaDireccionTimeout = setTimeout(() => {
      this.buscarDireccion();
    }, 500);
  }

  obtenerUbicacionGPS(): void {
    this.calculando.set(true);
    this.error.set(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.coordenadasOrigen.set({
          latitud: position.coords.latitude,
          longitud: position.coords.longitude
        });
        this.origenValido.set(true);
        this.calculando.set(false);
      },
      (error) => {
        this.error.set('No se pudo obtener tu ubicación. Por favor, activa el GPS.');
        this.calculando.set(false);
        this.origenValido.set(false);
      }
    );
  }

  buscarDireccion(): void {
    this.rutasService.buscarDireccion(this.direccionManual).subscribe({
      next: (resultados) => {
        this.resultadosDireccion.set(resultados);
        this.buscando.set(false);
      },
      error: (error) => {
        console.error('Error buscando dirección:', error);
        this.buscando.set(false);
      }
    });
  }

  seleccionarDireccion(resultado: ResultadoDireccion): void {
    this.direccionManual = resultado.direccion;
    this.coordenadasOrigen.set(resultado.coordenadas);
    this.resultadosDireccion.set([]);
    this.origenValido.set(true);
  }

  calcularRuta(): void {
    if (!this.coordenadasOrigen()) return;

    this.calculando.set(true);
    this.error.set(null);

    const origen: OrigenRuta = {
      tipo: this.tipoOrigen,
      coordenadas: this.coordenadasOrigen()!,
      direccion: this.tipoOrigen === 'manual' ? this.direccionManual : undefined
    };

    const opciones: OpcionesRuta = {
      modoTransporte: this.modoTransporte,
      optimizarPara: 'tiempo'
    };

    this.rutasService.calcularRuta(origen, this.estacion, opciones).subscribe({
      next: (ruta) => {
        if (ruta) {
          this.rutaCalculada.set(ruta);
          this.rutaCalculadaEvent.emit(ruta);
          this.paso.set('resultado');
        } else {
          this.error.set('No se pudo calcular la ruta. Inténtalo de nuevo.');
        }
        this.calculando.set(false);
      },
      error: (error) => {
        this.error.set('Error al calcular la ruta. Por favor, inténtalo de nuevo.');
        this.calculando.set(false);
      }
    });
  }

  volverAtras(): void {
    this.paso.set('configuracion');
    this.rutaCalculada.set(null);
  }

  abrirEnMaps(): void {
    const ruta = this.rutaCalculada();
    if (!ruta) return;

    const url = `https://www.google.com/maps/dir/?api=1&origin=${ruta.origen.coordenadas.latitud},${ruta.origen.coordenadas.longitud}&destination=${this.estacion.latitud},${this.estacion.longitud}&travelmode=${ruta.modoTransporte === 'driving' ? 'driving' : ruta.modoTransporte === 'walking' ? 'walking' : 'bicycling'}`;
    
    window.open(url, '_blank');
  }

  cerrar(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.paso.set('configuracion');
    this.rutaCalculada.set(null);
    this.error.set(null);
  }

  obtenerNombreModo(modo: 'driving' | 'walking' | 'cycling'): string {
    const nombres = {
      'driving': 'En coche',
      'walking': 'A pie',
      'cycling': 'En bicicleta'
    };
    return nombres[modo];
  }
}
