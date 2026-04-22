import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import { GasStation, TipoCombustible, EvolucionPrecio, Provincia } from '../../models/gas-station.models';
import { GasStationService } from '../../services/gas-station.service';

@Component({
  selector: 'app-graficas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="graficas-wrapper">
      <div class="graficas-header">
        <div class="title-area">
          <h3>📈 Histórico Nacional y por Provincias</h3>
          <p class="subtitle">Evolución del precio de los combustibles en los últimos 12 meses</p>
        </div>
        
        <div class="filtros-grafica">
          <div class="filter-group">
            <label>📍 Filtrar por Provincia:</label>
            <select (change)="onProvinciaChange($event)" class="dropdown">
              <option value="all">📍 España (Media Nacional)</option>
              @for (prov of provincias; track prov.IDPovincia) {
                <option [value]="prov.IDPovincia">{{ prov.Provincia }}</option>
              }
            </select>
          </div>
          
          <div class="filter-group">
            <label>⛽ Combustible:</label>
            <select (change)="onCombustibleChange($event)" class="dropdown">
              <option value="Precio Gasolina 95 E5">Gasolina 95</option>
              <option value="Precio Gasoleo A">Diesel</option>
              <option value="Precio Gasolina 98 E5">Gasolina 98</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="main-chart-card">
        <div class="chart-header">
          <div class="price-indicator">
            <span class="curr-price">{{ avgPrice() }}€/L</span>
            <span class="trend" [class.up]="true">↗ +12.4% (vs año pasado)</span>
          </div>
        </div>
        <div #chartFullContainer class="chart-full"></div>
      </div>
      
      <div class="info-footer">
        <p>💡 Datos actualizados según los informes mensuales de precios medios en España.</p>
      </div>
    </div>
  `,
  styles: [`
    .graficas-wrapper {
      padding: 30px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 25px;
      background: #f1f5f9;
      overflow-y: auto;
    }
    .graficas-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 5px;
    }
    .title-area h3 {
      margin: 0;
      font-size: 22px;
      color: #1e293b;
    }
    .subtitle {
      margin: 5px 0 0 0;
      color: #64748b;
      font-size: 14px;
    }
    .filtros-grafica {
      display: flex;
      gap: 20px;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .filter-group label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
    }
    .dropdown {
      padding: 10px 15px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: white;
      font-size: 14px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      min-width: 200px;
    }
    .main-chart-card {
      background: white;
      padding: 30px;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
      min-height: 500px;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .price-indicator {
      display: flex;
      align-items: baseline;
      gap: 15px;
    }
    .curr-price {
      font-size: 32px;
      font-weight: 800;
      color: #0f172a;
    }
    .trend {
      font-size: 14px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 20px;
    }
    .trend.up {
      background: #fef2f2;
      color: #ef4444;
    }
    .chart-full {
      width: 100%;
      height: 100%;
      min-height: 400px;
    }
    .info-footer {
      text-align: center;
      color: #64748b;
      font-size: 13px;
    }
  `]
})
export class GraficasComponent implements AfterViewInit, OnDestroy {
  @Input() provincias: Provincia[] = [];
  
  @ViewChild('chartFullContainer') chartFullContainer!: ElementRef;
  
  private chart: any;
  private gasStationService = inject(GasStationService);
  
  selectedProvincia: string = 'all';
  selectedCombustible: TipoCombustible = TipoCombustible.GASOLINA_95;
  avgPrice = signal<string>('0.000');

  ngAfterViewInit() {
    this.initChart();
  }

  ngOnDestroy() {
    this.chart?.dispose();
  }

  onProvinciaChange(event: any) {
    this.selectedProvincia = event.target.value;
    this.updateChart();
  }

  onCombustibleChange(event: any) {
    this.selectedCombustible = event.target.value as TipoCombustible;
    this.updateChart();
  }

  private initChart() {
    if (this.chartFullContainer) {
      this.chart = echarts.init(this.chartFullContainer.nativeElement);
      this.updateChart();
      
      window.addEventListener('resize', () => this.chart?.resize());
    }
  }

  private updateChart() {
    if (!this.chart) return;

    this.gasStationService.getHistoricoMensual(this.selectedProvincia).subscribe(data => {
      // Formatear meses para el eje X
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const categories = data.map(d => {
        return monthNames[d.fecha.getMonth()];
      });

      if (data && data.length > 0) {
  const last = data[data.length - 1];

  if (last?.precioEstacion != null) {
    this.avgPrice.set(last.precioEstacion.toFixed(3));
  }
}

      const option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          textStyle: { color: '#1e293b' },
          formatter: (params: any) => {
            let res = `<div style="font-weight: 600; margin-bottom: 5px;">${params[0].name}</div>`;
            params.forEach((p: any) => {
              res += `<div style="display: flex; justify-content: space-between; gap: 20px;">
                <span>${p.marker} ${p.seriesName}</span>
                <span style="font-weight: 700;">${p.value.toFixed(3)} €/L</span>
              </div>`;
            });
            return res;
          }
        },
        legend: {
          data: ['Precio Medio España', this.selectedProvincia === 'all' ? 'Tendencia' : 'Precio Provincia'],
          bottom: 10,
          icon: 'circle'
        },
        grid: {
          left: '3%',
          right: '5%',
          bottom: '15%',
          top: '5%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: categories,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#64748b' }
        },
        yAxis: {
          type: 'value',
          min: (v: any) => (v.min - 0.05).toFixed(2),
          axisLabel: { color: '#64748b', formatter: '{value} €' },
          splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
        },
        series: [
          {
            name: 'Precio Medio España',
            type: 'line',
            data: data.map(d => d.precioNacional),
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 3, color: '#94a3b8', type: 'dashed' },
            emphasis: { focus: 'series' }
          },
          {
            name: this.selectedProvincia === 'all' ? 'Tendencia' : 'Precio Provincia',
            type: 'line',
            data: data.map(d => d.precioEstacion),
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: { color: '#2563eb', borderWidth: 2, borderColor: '#fff' },
            lineStyle: { width: 4, shadowColor: 'rgba(37, 99, 235, 0.3)', shadowBlur: 10, shadowOffsetY: 5 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(37, 99, 235, 0.2)' },
                { offset: 1, color: 'rgba(37, 99, 235, 0)' }
              ])
            },
            emphasis: { focus: 'series' }
          }
        ]
      };

      this.chart.setOption(option, true);
    });
  }
}
