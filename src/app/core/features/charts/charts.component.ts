import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  AfterViewInit,
  ElementRef,
  ViewChild,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import { 
  GasStation, 
  TipoCombustible,
  EvolucionPrecio 
} from '../../models/gas-station.models';
import { FormsModule, NgModel } from '@angular/forms';

/**
 * Componente de visualización de gráficas con ECharts
 * Muestra evolución de precios y comparativas
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule,FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="charts-container">
      
      <!-- Header con controles -->
      <div class="charts-header">
        <h3>📊 Evolución de Precios</h3>
        <div class="chart-controls">
          <select 
            class="chart-select"
            [(ngModel)]="periodoSeleccionado"
            (change)="actualizarGrafica()">
            <option value="7">Última semana</option>
            <option value="30">Último mes</option>
            <option value="90">Últimos 3 meses</option>
          </select>
        </div>
      </div>

      <!-- Gráfica principal de líneas -->
      <div class="chart-wrapper">
        <div #chartElement class="chart-canvas"></div>
      </div>

      <!-- Grid de estadísticas -->
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-icon">📈</div>
          <div class="stat-content">
            <span class="stat-label">Precio actual</span>
            <span class="stat-value">{{ precioActual() }}€</span>
          </div>
        </div>
        
        <div class="stat-box">
          <div class="stat-icon">📉</div>
          <div class="stat-content">
            <span class="stat-label">Variación</span>
            <span class="stat-value" 
                  [class.positivo]="variacion() > 0"
                  [class.negativo]="variacion() < 0">
              {{ variacion() > 0 ? '+' : '' }}{{ variacion().toFixed(2) }}%
            </span>
          </div>
        </div>
        
        <div class="stat-box">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <span class="stat-label">Precio mínimo</span>
            <span class="stat-value">{{ precioMinimo() }}€</span>
          </div>
        </div>
        
        <div class="stat-box">
          <div class="stat-icon">🔥</div>
          <div class="stat-content">
            <span class="stat-label">Precio máximo</span>
            <span class="stat-value">{{ precioMaximo() }}€</span>
          </div>
        </div>
      </div>

      <!-- Gráfica de barras comparativa -->
      @if (estacionSeleccionada) {
        <div class="chart-wrapper">
          <h4 class="chart-title">Comparativa de precios</h4>
          <div #comparisonChart class="chart-canvas chart-small"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .charts-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 24px;
      height: 100%;
      overflow-y: auto;
    }

    .charts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .charts-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1e293b;
    }

    .chart-controls {
      display: flex;
      gap: 12px;
    }

    .chart-select {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
      background: white;
      cursor: pointer;
    }

    .chart-wrapper {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .chart-title {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
    }

    .chart-canvas {
      width: 100%;
      height: 400px;
    }

    .chart-small {
      height: 300px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .stat-box {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .stat-icon {
      font-size: 32px;
      line-height: 1;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-label {
      font-size: 13px;
      color: #64748b;
    }

    .stat-value {
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
    }

    .stat-value.positivo {
      color: #10b981;
    }

    .stat-value.negativo {
      color: #ef4444;
    }

    @media (max-width: 768px) {
      .chart-canvas {
        height: 300px;
      }
      
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ChartsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartElement', { static: false }) chartElement?: ElementRef;
  @ViewChild('comparisonChart', { static: false }) comparisonChartElement?: ElementRef;
  
  @Input() estaciones: GasStation[] = [];
  @Input() estacionSeleccionada?: GasStation;
  @Input() combustible: TipoCombustible = TipoCombustible.GASOLINA_95;
  
  // Instancias de ECharts
  private chart?: echarts.ECharts;
  private comparisonChartInstance?: echarts.ECharts;
  
  // Estado
  periodoSeleccionado = '30';
  
  // Signals para estadísticas
  precioActual = signal(0);
  precioMinimo = signal(0);
  precioMaximo = signal(0);
  variacion = signal(0);
  
  ngOnInit(): void {
    this.calcularEstadisticas();
  }
  
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.inicializarGrafica();
      if (this.estacionSeleccionada) {
        this.inicializarGraficaComparativa();
      }
    }, 0);
  }
  
  ngOnDestroy(): void {
    this.chart?.dispose();
    this.comparisonChartInstance?.dispose();
  }
  
  /**
   * Inicializa la gráfica principal de líneas
   */
  private inicializarGrafica(): void {
    if (!this.chartElement) return;
    
    this.chart = echarts.init(this.chartElement.nativeElement);
    
    // Generar datos simulados de evolución
    const datos = this.generarDatosEvolucion();
    
    const option: echarts.EChartsOption = {
      title: {
        text: 'Evolución del precio medio nacional',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal',
          color: '#64748b'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const data = params[0];
          return `${data.name}<br/>
                  Precio: <strong>${data.value.toFixed(3)}€/L</strong>`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: datos.fechas,
        axisLine: {
          lineStyle: { color: '#e2e8f0' }
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 12
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: { color: '#e2e8f0' }
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 12,
          formatter: '{value}€'
        },
        splitLine: {
          lineStyle: {
            color: '#f1f5f9'
          }
        }
      },
      series: [
        {
          name: 'Precio',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            color: '#2563eb',
            width: 3
          },
          itemStyle: {
            color: '#2563eb',
            borderWidth: 2,
            borderColor: '#fff'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(37, 99, 235, 0.3)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0.05)' }
            ])
          },
          data: datos.precios
        }
      ]
    };
    
    this.chart.setOption(option);
    
    // Responsive
    window.addEventListener('resize', () => {
      this.chart?.resize();
    });
  }
  
  /**
   * Inicializa la gráfica comparativa de barras
   */
  private inicializarGraficaComparativa(): void {
    if (!this.comparisonChartElement || !this.estacionSeleccionada) return;
    
    this.comparisonChartInstance = echarts.init(this.comparisonChartElement.nativeElement);
    
    // Comparar precios de diferentes combustibles
    const combustibles = ['Gasóleo A', 'Gasolina 95', 'Gasolina 98'];
    const preciosEstacion = [
      this.estacionSeleccionada.precios.gasoleoA || 0,
      this.estacionSeleccionada.precios.gasolina95 || 0,
      this.estacionSeleccionada.precios.gasolina98 || 0
    ];
    
    // Calcular precios medios (simulados)
    const preciosMedios = preciosEstacion.map(p => p * 1.05);
    
    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['Esta estación', 'Media nacional'],
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: combustibles,
        axisLabel: {
          color: '#64748b',
          fontSize: 12
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#64748b',
          fontSize: 12,
          formatter: '{value}€'
        }
      },
      series: [
        {
          name: 'Esta estación',
          type: 'bar',
          data: preciosEstacion,
          itemStyle: {
            color: '#10b981'
          }
        },
        {
          name: 'Media nacional',
          type: 'bar',
          data: preciosMedios,
          itemStyle: {
            color: '#64748b'
          }
        }
      ]
    };
    
    this.comparisonChartInstance.setOption(option);
  }
  
  /**
   * Genera datos simulados de evolución de precios
   * En producción, estos datos vendrían de un histórico real
   */
  private generarDatosEvolucion(): { fechas: string[], precios: number[] } {
    const dias = parseInt(this.periodoSeleccionado);
    const fechas: string[] = [];
    const precios: number[] = [];
    
    // Precio base (media actual de estaciones)
    const precioBase = this.calcularPrecioMedio();
    
    for (let i = dias; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      
      // Formato de fecha
      const dia = fecha.getDate().toString().padStart(2, '0');
      const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
      fechas.push(`${dia}/${mes}`);
      
      // Generar precio con variación aleatoria
      const variacion = (Math.random() - 0.5) * 0.05; // ±2.5%
      const precio = precioBase * (1 + variacion);
      precios.push(parseFloat(precio.toFixed(3)));
    }
    
    return { fechas, precios };
  }
  
  /**
   * Calcula el precio medio de las estaciones
   */
  private calcularPrecioMedio(): number {
    const precios = this.estaciones
      .map(e => this.obtenerPrecio(e))
      .filter((p): p is number => p !== undefined);
    
    if (precios.length === 0) return 1.5;
    
    return precios.reduce((sum, p) => sum + p, 0) / precios.length;
  }
  
  /**
   * Calcula estadísticas de precios
   */
  private calcularEstadisticas(): void {
    const precios = this.estaciones
      .map(e => this.obtenerPrecio(e))
      .filter((p): p is number => p !== undefined);
    
    if (precios.length === 0) {
      this.precioActual.set(0);
      this.precioMinimo.set(0);
      this.precioMaximo.set(0);
      this.variacion.set(0);
      return;
    }
    
    const min = Math.min(...precios);
    const max = Math.max(...precios);
    const actual = precios.reduce((sum, p) => sum + p, 0) / precios.length;
    
    // Calcular variación simulada (en producción sería vs histórico real)
    const variacion = ((Math.random() - 0.5) * 4); // ±2%
    
    this.precioActual.set(parseFloat(actual.toFixed(3)));
    this.precioMinimo.set(parseFloat(min.toFixed(3)));
    this.precioMaximo.set(parseFloat(max.toFixed(3)));
    this.variacion.set(variacion);
  }
  
  /**
   * Actualiza la gráfica cuando cambia el periodo
   */
  actualizarGrafica(): void {
    const datos = this.generarDatosEvolucion();
    
    this.chart?.setOption({
      xAxis: {
        data: datos.fechas
      },
      series: [{
        data: datos.precios
      }]
    });
  }
  
  /**
   * Obtiene el precio del combustible seleccionado
   */
  private obtenerPrecio(estacion: GasStation): number | undefined {
    switch (this.combustible) {
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
