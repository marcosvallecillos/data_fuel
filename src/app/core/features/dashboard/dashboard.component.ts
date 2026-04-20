import { Component, OnInit, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GasStationService } from '../../services/gas-station.service';
import { FavoritosService } from '../../services/favoritos.service';
import { AlertasService } from '../../services/alertas.service';
import {
  GasStation,
  TipoCombustible,
  FiltrosBusqueda,
  ResultadoBusqueda,
  COMBUSTIBLES_INFO,
  Coordenadas,
  Provincia,
  Municipio
} from '../../models/gas-station.models';
import { MapComponent } from '../map/map.component';
import { ChartsComponent } from '../charts/charts.component';

/**
 * Componente principal del dashboard de Gas-Trend Pro
 * Implementa un layout de dos paneles con búsqueda y visualización
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MapComponent,
    ChartsComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly gasStationService = inject(GasStationService);
  private readonly favoritosService = inject(FavoritosService);
  private readonly alertasService = inject(AlertasService);

  // ============================================================================
  // SIGNALS Y ESTADO REACTIVO
  // ============================================================================

  // Estado de carga
  cargando = this.gasStationService.loading$;

  // Estaciones y resultados
  todasEstaciones = signal<GasStation[]>([]);
  resultadoBusqueda = signal<ResultadoBusqueda | null>(null);
  estacionSeleccionada = signal<GasStation | null>(null);

  // Ubicación del usuario
  ubicacionUsuario = signal<Coordenadas | undefined>(undefined);

  // Listas para selectores
  provincias = signal<Provincia[]>([]);
  municipios = signal<Municipio[]>([]);
  marcasDisponibles = signal<string[]>([]);

  // Vista activa (mapa, lista, gráficas)
  vistaActiva = signal<'mapa' | 'lista' | 'graficas'>('mapa');

  // Computed signals
  estacionesFiltradas = computed(() =>
    this.resultadoBusqueda()?.estaciones || []
  );

  totalEstaciones = computed(() =>
    this.resultadoBusqueda()?.totalEncontradas || 0
  );

  precioMedio = computed(() =>
    this.resultadoBusqueda()?.precioMedio || 0
  );

  // ============================================================================
  // FORMULARIOS REACTIVOS
  // ============================================================================

  searchForm!: FormGroup;
  combustiblesInfo = COMBUSTIBLES_INFO;
  TipoCombustible = TipoCombustible;

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  ngOnInit(): void {
    this.inicializarFormulario();
    this.cargarProvincias();
    this.cargarEstacionesIniciales();
    this.suscribirCambiosFormulario();
    this.solicitarUbicacion();
  }

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================

  /**
   * Inicializa el formulario de búsqueda con validaciones
   */
  private inicializarFormulario(): void {
    this.searchForm = this.fb.group({
      // Ubicación
      codigoPostal: [''],
      provinciaId: [''],
      municipioId: [''],
      usarGPS: [false],
      radioKm: [40, [Validators.min(1), Validators.max(100)]],

      // Combustible
      combustible: [TipoCombustible.GASOLINA_95, Validators.required],

      // Filtros
      marcas: [[]],
      soloAbiertas: [false],
      ordenarPor: ['precio']
    });
  }

  /**
   * Carga el listado de provincias desde la API
   */
  private cargarProvincias(): void {
    this.gasStationService.getProvincias().subscribe({
      next: (provincias) => {
        this.provincias.set(provincias);
        console.log(`✅ ${provincias.length} provincias cargadas`);
      },
      error: (error) => {
        console.error('Error cargando provincias:', error);
      }
    });
  }

  /**
   * Carga estaciones iniciales (todas o por ubicación)
   */
  private cargarEstacionesIniciales(): void {
    // Cargar todas las estaciones al inicio
    this.gasStationService.getEstacionesGeneral().subscribe({
      next: (estaciones) => {
        this.todasEstaciones.set(estaciones);
        this.extraerMarcasDisponibles(estaciones);
        this.aplicarFiltros();
        console.log(`✅ ${estaciones.length} estaciones cargadas`);
      },
      error: (error) => {
        console.error('Error cargando estaciones:', error);
        alert('Error al cargar los datos. Por favor, recarga la página.');
      }
    });
  }

  /**
   * Suscribe a cambios en el formulario para filtrado dinámico
   */
  private suscribirCambiosFormulario(): void {
    // Cuando cambia la provincia, cargar municipios
    this.searchForm.get('provinciaId')?.valueChanges.subscribe(provinciaId => {
      if (provinciaId) {
        this.cargarMunicipios(provinciaId);
      } else {
        this.municipios.set([]);
      }
      this.searchForm.patchValue({ municipioId: '' }, { emitEvent: false });
    });

    // Cuando cambia el combustible, reaplicar filtros
    this.searchForm.get('combustible')?.valueChanges.subscribe(() => {
      this.aplicarFiltros();
    });

    // Cuando cambian los filtros de marca o apertura
    this.searchForm.get('marcas')?.valueChanges.subscribe(() => {
      this.aplicarFiltros();
    });

    this.searchForm.get('soloAbiertas')?.valueChanges.subscribe(() => {
      this.aplicarFiltros();
    });

    this.searchForm.get('ordenarPor')?.valueChanges.subscribe(() => {
      this.aplicarFiltros();
    });
  }

  /**
   * Solicita ubicación del usuario al cargar
   */
  private solicitarUbicacion(): void {
    this.gasStationService.obtenerUbicacionActual()
      .then(coords => {
        this.ubicacionUsuario.set(coords);
        console.log('📍 Ubicación obtenida:', coords);
      })
      .catch(error => {
        console.warn('⚠️ No se pudo obtener ubicación:', error.message);
      });
  }

  // ============================================================================
  // MÉTODOS DE BÚSQUEDA Y FILTRADO
  // ============================================================================

  /**
   * Ejecuta la búsqueda según los criterios del formulario
   */
  buscar(): void {
    const valores = this.searchForm.value;

    // Si se seleccionó un municipio específico, cargar solo ese
    if (valores.municipioId) {
      this.buscarPorMunicipio(valores.municipioId);
    } else if (valores.usarGPS && this.ubicacionUsuario()) {
      this.aplicarFiltros();
    } else {
      // Usar todas las estaciones y aplicar filtros
      this.aplicarFiltros();
    }
  }

  /**
   * Busca estaciones de un municipio específico
   * @param municipioId ID del municipio
   */
  private buscarPorMunicipio(municipioId: string): void {
    this.gasStationService.getEstacionesPorMunicipio(municipioId).subscribe({
      next: (estaciones) => {
        this.todasEstaciones.set(estaciones);
        this.aplicarFiltros();
      },
      error: (error) => {
        console.error('Error buscando por municipio:', error);
      }
    });
  }

  /**
   * Aplica filtros sobre las estaciones cargadas
   */
  private aplicarFiltros(): void {
    const valores = this.searchForm.value;

    const filtros: FiltrosBusqueda = {
      combustible: valores.combustible,
      marcas: valores.marcas || [],
      soloAbiertas: valores.soloAbiertas,
      radioKm: valores.radioKm,
      ordenarPor: valores.ordenarPor,
      coordenadas: valores.usarGPS ? this.ubicacionUsuario() || undefined : undefined
    };

    const resultado = this.gasStationService.filtrarEstaciones(
      this.todasEstaciones(),
      filtros
    );

    this.resultadoBusqueda.set(resultado);

    // Verificar alertas con los nuevos resultados
    this.alertasService.verificarAlertas(resultado.estaciones);

    console.log(`🔍 Búsqueda completada: ${resultado.totalEncontradas} estaciones`);
  }

  /**
   * Limpia todos los filtros y resetea el formulario
   */
  limpiarFiltros(): void {
    this.searchForm.reset({
      combustible: TipoCombustible.GASOLINA_95,
      radioKm: 40,
      usarGPS: false,
      soloAbiertas: false,
      ordenarPor: 'precio',
      marcas: []
    });
    this.aplicarFiltros();
  }

  // ============================================================================
  // MÉTODOS DE CARGA DE DATOS
  // ============================================================================

  /**
   * Carga municipios de una provincia
   * @param provinciaId ID de la provincia
   */
  private cargarMunicipios(provinciaId: string): void {
    this.gasStationService.getMunicipiosPorProvincia(provinciaId).subscribe({
      next: (municipios) => {
        this.municipios.set(municipios);
        console.log(`✅ ${municipios.length} municipios cargados`);
      },
      error: (error) => {
        console.error('Error cargando municipios:', error);
      }
    });
  }

  /**
   * Extrae marcas únicas del conjunto de estaciones
   * @param estaciones Array de estaciones
   */
  private extraerMarcasDisponibles(estaciones: GasStation[]): void {
    const marcas = new Set(estaciones.map(e => e.marca));
    this.marcasDisponibles.set(Array.from(marcas).sort());
  }

  // ============================================================================
  // MÉTODOS DE VISTA Y NAVEGACIÓN
  // ============================================================================

  /**
   * Cambia la vista activa (mapa, lista, gráficas)
   * @param vista Vista a activar
   */
  cambiarVista(vista: 'mapa' | 'lista' | 'graficas'): void {
    this.vistaActiva.set(vista);
  }

  /**
   * Maneja la selección de una estación desde el mapa
   * @param estacion Estación seleccionada
   */
  onEstacionSeleccionada(estacion: GasStation): void {
    this.estacionSeleccionada.set(estacion);
  }

  // ============================================================================
  // MÉTODOS DE FAVORITOS Y ALERTAS
  // ============================================================================

  /**
   * Alterna el estado de favorito de una estación
   * @param estacion Estación a togglear
   */
  toggleFavorito(estacion: GasStation): void {
    const esFavorito = this.favoritosService.esFavorito(estacion.id);

    if (esFavorito) {
      this.favoritosService.eliminarFavorito(estacion.id);
    } else {
      this.favoritosService.agregarFavorito(estacion);
    }
  }

  /**
   * Verifica si una estación es favorita
   * @param estacionId ID de la estación
   * @returns true si es favorita
   */
  esFavorito(estacionId: string): boolean {
    return this.favoritosService.esFavorito(estacionId);
  }

  /**
   * Crea una alerta para una estación
   * @param estacion Estación para la alerta
   */
  crearAlerta(estacion: GasStation): void {
    const combustible = this.searchForm.value.combustible;
    const precioActual = this.obtenerPrecioEstacion(estacion, combustible);

    if (!precioActual) {
      alert('No hay precio disponible para este combustible');
      return;
    }

    const precioObjetivo = prompt(
      `Precio actual: ${precioActual.toFixed(3)}€\n\n` +
      `Introduce el precio objetivo para recibir una alerta:`,
      (precioActual * 0.95).toFixed(3) // Sugerir 5% menos
    );

    if (precioObjetivo) {
      const precio = parseFloat(precioObjetivo);
      if (!isNaN(precio) && precio > 0) {
        this.alertasService.crearAlerta(
          estacion.id,
          combustible,
          precio,
          `Alerta para ${estacion.marca}`
        );
        alert('✅ Alerta creada correctamente');
      }
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Obtiene el precio de un combustible de una estación
   */
  public obtenerPrecioEstacion(
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

  /**
   * Formatea un precio para mostrar
   */
  formatearPrecio(precio?: number): string {
    return precio ? `${precio.toFixed(3)}€/L` : 'N/D';
  }

  /**
   * Obtiene el icono del combustible
   */
  obtenerIconoCombustible(combustible: TipoCombustible): string {
    const info = this.combustiblesInfo.find(c => c.key === combustible);
    return info?.icon || '⛽';
  }

  /**
   * Alterna la selección de una marca en el filtro
   * @param marca Marca a togglear
   */
  toggleMarca(marca: string): void {
    const marcasActuales = this.searchForm.value.marcas || [];
    const index = marcasActuales.indexOf(marca);

    let nuevasMarcas: string[];
    if (index > -1) {
      // Eliminar marca
      nuevasMarcas = marcasActuales.filter((m: string) => m !== marca);
    } else {
      // Agregar marca
      nuevasMarcas = [...marcasActuales, marca];
    }

    this.searchForm.patchValue({ marcas: nuevasMarcas });
  }
}
