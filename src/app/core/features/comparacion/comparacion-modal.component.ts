import { Component, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComparacionService } from '../../services/comparacion.service';
import {
  GasStation,
  TipoCombustible,
  ComparacionEstaciones,
  COMBUSTIBLES_INFO
} from '../../models/gas-station.models';

/**
 * Componente modal para comparación de estaciones
 * Muestra tabla comparativa y análisis de precios
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Component({
  selector: 'app-comparacion-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="cerrar()" *ngIf="visible">
      <div class="modal-content" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="modal-header">
          <h2>⚖️ Comparación de Estaciones</h2>
          <button class="btn-close" (click)="cerrar()">✕</button>
        </div>

        <!-- Selector de combustible -->
        <div class="combustible-selector">
          <label>Combustible a comparar:</label>
          <select [(ngModel)]="combustibleSeleccionado" (change)="actualizarComparacion()" class="form-select">
            @for (combustible of combustiblesInfo; track combustible.key) {
              <option [value]="combustible.key">
                {{ combustible.icon }} {{ combustible.label }}
              </option>
            }
          </select>
        </div>

        <!-- Contenido -->
        @if (comparacion()) {
          <div class="modal-body">
            
            <!-- Resumen -->
            <div class="resumen-comparacion">
              <div class="stat-card mejor">
                <div class="stat-icon">🥇</div>
                <div class="stat-content">
                  <h4>Mejor Precio</h4>
                  <p class="stat-marca">{{ comparacion()!.mejorPrecio.estacion.marca }}</p>
                  <p class="stat-precio">{{ formatearPrecio(comparacion()!.mejorPrecio.precio) }}</p>
                </div>
              </div>

              <div class="stat-card diferencia">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                  <h4>Diferencia Máxima</h4>
                  <p class="stat-valor">{{ formatearPrecio(comparacion()!.diferenciaMaxima) }}</p>
                  @if (ahorroMensualCalculado()) {
                    <p class="stat-detalle">
                      Ahorro mensual: {{ ahorroMensualCalculado()!.toFixed(2) }}€
                    </p>
                  }
                </div>
              </div>

              <div class="stat-card peor">
                <div class="stat-icon">📈</div>
                <div class="stat-content">
                  <h4>Mayor Precio</h4>
                  <p class="stat-marca">{{ comparacion()!.peorPrecio.estacion.marca }}</p>
                  <p class="stat-precio">{{ formatearPrecio(comparacion()!.peorPrecio.precio) }}</p>
                </div>
              </div>
            </div>

            <!-- Calculadora de ahorro -->
            <div class="calculadora-ahorro">
              <h3>🧮 Calculadora de Ahorro</h3>
              <div class="calc-input">
                <label>Consumo mensual estimado (litros):</label>
                <input 
                  type="number" 
                  [(ngModel)]="litrosPorMes"
                  (ngModelChange)="calcularAhorro()"
                  min="0"
                  step="10"
                  class="form-input">
              </div>
            </div>

            <!-- Tabla comparativa -->
            <div class="tabla-comparacion">
              <h3>📊 Comparación Detallada</h3>
              <table>
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Dirección</th>
                    <th>Precio</th>
                    <th>Distancia</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (estacion of comparacion()!.estaciones; track estacion.id) {
                    <tr [class.mejor-opcion]="esMejorOpcion(estacion)">
                      <td class="marca-cell">
                        <strong>{{ estacion.marca }}</strong>
                      </td>
                      <td class="direccion-cell">
                        <div>{{ estacion.direccion }}</div>
                        <small>{{ estacion.municipio }}</small>
                      </td>
                      <td class="precio-cell">
                        <span class="precio-badge" [class.mejor]="esMejorPrecio(estacion)">
                          {{ obtenerPrecio(estacion) }}
                        </span>
                      </td>
                      <td class="distancia-cell">
                        @if (estacion.distancia) {
                          {{ estacion.distancia.toFixed(1) }} km
                        } @else {
                          N/D
                        }
                      </td>
                      <td class="estado-cell">
                        @if (estacion.estaAbierta === true) {
                          <span class="badge badge-success">🟢 Abierta</span>
                        } @else if (estacion.estaAbierta === false) {
                          <span class="badge badge-danger">🔴 Cerrada</span>
                        } @else {
                          <span class="badge badge-neutral">❓ Desconocido</span>
                        }
                      </td>
                      <td class="acciones-cell">
                        <button 
                          class="btn-icon"
                          (click)="eliminarDeComparacion(estacion)"
                          title="Eliminar de comparación">
                          🗑️
                        </button>
                        <button 
                          class="btn-icon"
                          (click)="solicitarRuta(estacion)"
                          title="Calcular ruta">
                          🗺️
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Recomendación -->
            @if (recomendacion()) {
              <div class="recomendacion">
                <h3>💡 Recomendación</h3>
                <p>
                  Basándonos en precio{{ ubicacionDisponible() ? ' y distancia' : '' }}, 
                  te recomendamos <strong>{{ recomendacion()!.marca }}</strong>
                  en {{ recomendacion()!.direccion }}.
                </p>
              </div>
            }
          </div>

          <!-- Footer con acciones -->
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="exportarJSON()">
              📥 Exportar JSON
            </button>
            <button class="btn btn-secondary" (click)="exportarCSV()">
              📊 Exportar CSV
            </button>
            <button class="btn btn-primary" (click)="cerrar()">
              Cerrar
            </button>
          </div>
        } @else {
          <div class="modal-body">
            <div class="empty-state">
              <p class="empty-icon">⚖️</p>
              <p class="empty-text">No hay suficientes estaciones para comparar</p>
              <p class="empty-hint">Agrega al menos 2 estaciones</p>
            </div>
          </div>
        }
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
      max-width: 1200px;
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

    .combustible-selector {
      padding: 16px 24px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .combustible-selector label {
      font-weight: 500;
      color: #475569;
    }

    .form-select, .form-input {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .resumen-comparacion {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 2px solid transparent;
    }

    .stat-card.mejor {
      border-color: #10b981;
      background: linear-gradient(135deg, #d1fae5 0%, #ffffff 100%);
    }

    .stat-card.peor {
      border-color: #ef4444;
      background: linear-gradient(135deg, #fee2e2 0%, #ffffff 100%);
    }

    .stat-card.diferencia {
      border-color: #f59e0b;
      background: linear-gradient(135deg, #fef3c7 0%, #ffffff 100%);
    }

    .stat-icon {
      font-size: 36px;
      line-height: 1;
    }

    .stat-content h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-marca {
      margin: 4px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
    }

    .stat-precio, .stat-valor {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #2563eb;
    }

    .stat-detalle {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #64748b;
    }

    .calculadora-ahorro {
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .calculadora-ahorro h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      color: #1e293b;
    }

    .calc-input {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .calc-input label {
      font-size: 14px;
      font-weight: 500;
      color: #475569;
    }

    .tabla-comparacion {
      margin-bottom: 24px;
    }

    .tabla-comparacion h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      color: #1e293b;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    thead {
      background: #f1f5f9;
    }

    th {
      padding: 12px;
      text-align: left;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 16px 12px;
      border-top: 1px solid #f1f5f9;
    }

    tr.mejor-opcion {
      background: #f0fdf4;
    }

    .marca-cell strong {
      font-size: 15px;
      color: #1e293b;
    }

    .direccion-cell div {
      font-size: 14px;
      color: #475569;
    }

    .direccion-cell small {
      font-size: 12px;
      color: #94a3b8;
    }

    .precio-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 15px;
      background: #f1f5f9;
      color: #1e293b;
    }

    .precio-badge.mejor {
      background: #10b981;
      color: white;
    }

    .badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-neutral {
      background: #f1f5f9;
      color: #475569;
    }

    .acciones-cell {
      display: flex;
      gap: 8px;
    }

    .btn-icon {
      background: none;
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-icon:hover {
      background: #f1f5f9;
      border-color: #2563eb;
    }

    .recomendacion {
      background: linear-gradient(135deg, #dbeafe 0%, #ffffff 100%);
      border: 2px solid #2563eb;
      border-radius: 12px;
      padding: 20px;
    }

    .recomendacion h3 {
      margin: 0 0 12px 0;
      font-size: 18px;
      color: #1e293b;
    }

    .recomendacion p {
      margin: 0;
      font-size: 15px;
      color: #475569;
      line-height: 1.6;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
    }

    .empty-icon {
      font-size: 64px;
      margin: 0;
    }

    .empty-text {
      font-size: 18px;
      font-weight: 600;
      color: #1e293b;
      margin: 16px 0 8px 0;
    }

    .empty-hint {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }

    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: #f8fafc;
    }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover {
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

    @media (max-width: 768px) {
      .resumen-comparacion {
        grid-template-columns: 1fr;
      }

      table {
        font-size: 12px;
      }

      th, td {
        padding: 8px;
      }
    }
  `]
})
export class ComparacionModalComponent {
  private readonly comparacionService = inject(ComparacionService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() rutaSolicitada = new EventEmitter<GasStation>();

  combustibleSeleccionado: TipoCombustible = TipoCombustible.GASOLINA_95;
  combustiblesInfo = COMBUSTIBLES_INFO;
  litrosPorMes = 60; // Consumo promedio

  // Signals
  comparacion = signal<ComparacionEstaciones | null>(null);
  ahorroMensualCalculado = signal<number | undefined>(undefined);
  recomendacion = signal<GasStation | null>(null);
  ubicacionDisponible = signal(false);

  ngOnInit(): void {
    this.actualizarComparacion();
  }

  actualizarComparacion(): void {
    const comp = this.comparacionService.generarComparacion(
      this.combustibleSeleccionado,
      { litrosPorMes: this.litrosPorMes, combustible: this.combustibleSeleccionado }
    );
    this.comparacion.set(comp);
    
    if (comp) {
      this.ahorroMensualCalculado.set(comp.ahorroMensual);
      
      // Obtener recomendación
      const rec = this.comparacionService.obtenerRecomendacion(this.combustibleSeleccionado);
      this.recomendacion.set(rec);
    }
  }

  calcularAhorro(): void {
    this.actualizarComparacion();
  }

  cerrar(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  eliminarDeComparacion(estacion: GasStation): void {
    this.comparacionService.eliminarDeComparacion(estacion.id);
    this.actualizarComparacion();
  }

  solicitarRuta(estacion: GasStation): void {
    this.rutaSolicitada.emit(estacion);
  }

  exportarJSON(): void {
    const comp = this.comparacion();
    if (comp) {
      this.comparacionService.exportarComparacion(comp);
    }
  }

  exportarCSV(): void {
    const comp = this.comparacion();
    if (comp) {
      this.comparacionService.exportarComparacionCSV(comp);
    }
  }

  obtenerPrecio(estacion: GasStation): string {
    const precio = this.getPrecioNumerico(estacion);
    return precio ? `${precio.toFixed(3)}€/L` : 'N/D';
  }

  private getPrecioNumerico(estacion: GasStation): number | undefined {
    switch (this.combustibleSeleccionado) {
      case TipoCombustible.GASOLEO_A:
        return estacion.precios.gasoleoA;
      case TipoCombustible.GASOLINA_95:
        return estacion.precios.gasolina95;
      case TipoCombustible.GASOLINA_98:
        return estacion.precios.gasolina98;
      default:
        return undefined;
    }
  }

  esMejorPrecio(estacion: GasStation): boolean {
    const comp = this.comparacion();
    return comp ? comp.mejorPrecio.estacion.id === estacion.id : false;
  }

  esMejorOpcion(estacion: GasStation): boolean {
    const rec = this.recomendacion();
    return rec ? rec.id === estacion.id : false;
  }

  formatearPrecio(precio: number): string {
    return `${precio.toFixed(3)}€/L`;
  }
}
