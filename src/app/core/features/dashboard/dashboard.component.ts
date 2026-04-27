import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MapComponent } from '../map/map.component';
import { ComparacionModalComponent } from '../comparacion/comparacion-modal.component';
import { RutasModalComponent } from '../rutas/rutas-modal.component';
import { GraficasComponent } from './graficas.component';

import {
  GasStation,
  TipoCombustible,
  FiltrosBusqueda,
  ResultadoBusqueda,
  COMBUSTIBLES_INFO,
  Coordenadas,
  Provincia,
  Municipio,
  InformacionRuta,
  MARCAS_PRINCIPALES,
  ReviewCliente
} from '../../models/gas-station.models';
import { GasStationService } from '../../services/gas-station.service';
import { FavoritosService } from '../../services/favoritos.service';
import { AlertasService } from '../../services/alertas.service';
import { ComparacionService } from '../../services/comparacion.service';
import { ChatbotComponent } from '../chatbot/chatbot.component';

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
    ComparacionModalComponent,
    RutasModalComponent,
    GraficasComponent,
    ChatbotComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly gasStationService = inject(GasStationService);
  private readonly favoritosService = inject(FavoritosService);
  private readonly alertasService = inject(AlertasService);
  private readonly comparacionService = inject(ComparacionService);

  // ============================================================================
  // SIGNALS Y ESTADO REACTIVO
  // ============================================================================
  
  // Estado de carga
  cargando = this.gasStationService.loading$;
  
  // Estaciones y resultados
  todasEstaciones = signal<GasStation[]>([]);
  resultadoBusqueda = signal<ResultadoBusqueda | null>(null);
  estacionSeleccionada = signal<GasStation | null>(null);
  reviewsEstacionSeleccionada = signal<ReviewCliente[]>([]);
  cargandoReviews = signal(false);
  errorReviews = signal<string | null>(null);
  reviewsVisibles = signal(5);
  
  // Ubicación del usuario
  ubicacionUsuario = signal<Coordenadas | undefined>(undefined);
  
  // Listas para selectores
  provincias = signal<Provincia[]>([]);
  municipios = signal<Municipio[]>([]);
  marcasDisponibles = signal<string[]>([]);
  
  // Vista activa (mapa, lista, gráficas, favoritos)
  vistaActiva = signal<'mapa' | 'lista' | 'graficas' | 'favoritos'>('mapa');
  
  // Caché completa de estaciones para filtrado local (evita sobreescribir con búsquedas parciales)
  estacionesCache: GasStation[] = [];
  
  // Modales
  mostrarModalComparacion = signal(false);
  mostrarModalRutas = signal(false);
  estacionParaRuta = signal<GasStation | null>(null);
  
  // Comparación
  estacionesComparacion = this.comparacionService.estacionesComparacion;
  totalComparaciones = this.comparacionService.totalComparaciones;
  puedeCompararMas = this.comparacionService.puedeAgregarMas;
  
  // Ruta actual
  rutaActual = signal<InformacionRuta | null>(null);
  modoSeleccionPunto = signal(false);
  puntoRecomendacion = signal<Coordenadas | null>(null);
  mostrarModalRecomendacion = signal(false);
  recomendacionIaTexto = signal('');
  cargandoMejorMomento = signal(false);
  mejorMomentoTexto = signal('');
  litrosEstimados = signal<number>(40);
  consumoLKm = signal<number>(0.06);
  
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

  // Favoritos
  estacionesFavoritas = computed(() => 
    this.favoritosService.favoritos().map(f => f.estacion)
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
        this.estacionesCache = estaciones;
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
    
    // 1. Prioridad: Código Postal (Búsqueda local sobre el caché)
    if (valores.codigoPostal && valores.codigoPostal.length === 5) {
      this.todasEstaciones.set(this.estacionesCache);
      this.aplicarFiltros();
      return;
    }

    // 2. Si se seleccionó un municipio específico, cargar desde API (más preciso/ligero si no hay caché completo)
    if (valores.municipioId) {
      this.buscarPorMunicipio(valores.municipioId);
    } 
    // 3. Si se seleccionó "Todos los municipios" (municipioId vacío pero provinciaId presente)
    else if (valores.provinciaId) {
      const provinciaName = this.provincias().find(p => p.IDPovincia === valores.provinciaId)?.Provincia;
      if (provinciaName) {
        const estacionesProvincia = this.estacionesCache.filter(e => 
          e.provincia.toUpperCase() === provinciaName.toUpperCase()
        );
        this.todasEstaciones.set(estacionesProvincia);
        this.aplicarFiltros();
      } else {
        // Si no encontramos el nombre, usamos todas
        this.todasEstaciones.set(this.estacionesCache);
        this.aplicarFiltros();
      }
    }
    // 4. GPS o General
    else {
      this.todasEstaciones.set(this.estacionesCache);
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
      codigoPostal: valores.codigoPostal || undefined,
      provinciaId: valores.provinciaId || undefined,
      municipioId: valores.municipioId || undefined,
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
    const marcasSet = new Set(estaciones.map(e => e.marca.toUpperCase()));
    const marcasFamosasPresentes = MARCAS_PRINCIPALES.filter(marcaPrincipal =>
      Array.from(marcasSet).some(marcaReal => marcaReal.includes(marcaPrincipal))
    );

    this.marcasDisponibles.set(marcasFamosasPresentes);
  }

  // ============================================================================
  // MÉTODOS DE VISTA Y NAVEGACIÓN
  // ============================================================================

  /**
   * Cambia la vista activa (mapa, lista, gráficas)
   * @param vista Vista a activar
   */
  cambiarVista(vista: 'mapa' | 'lista' | 'graficas' | 'favoritos'): void {
    this.vistaActiva.set(vista);
    
    if (vista === 'favoritos') {
      // Al cambiar a favoritos, forzamos un resultado temporal
      const favs = this.estacionesFavoritas();
      this.resultadoBusqueda.set({
        estaciones: favs,
        totalEncontradas: favs.length,
        precioMedio: favs.length > 0 ? favs.reduce((acc, curr) => acc + (this.obtenerPrecioEstacion(curr, this.searchForm.value.combustible) || 0), 0) / favs.length : 0,
        precioMinimo: 0,
        precioMaximo: 0,
        timestamp: new Date()
      });
    } else {
      // Re-aplicar filtros para volver a la búsqueda original
      this.aplicarFiltros();
    }
  }

  /**
   * Maneja la selección de una estación desde el mapa
   * @param estacion Estación seleccionada
   */
  onEstacionSeleccionada(estacion: GasStation): void {
    this.seleccionarEstacion(estacion);
  }

  /**
   * Selecciona una estación y carga sus reviews de clientes
   */
  seleccionarEstacion(estacion: GasStation): void {
    this.estacionSeleccionada.set(estacion);
    this.cargarReviewsEstacion(estacion.id);
  }

  /**
   * Cierra el panel de detalles y limpia reviews cargadas
   */
  cerrarPanelDetalles(): void {
    this.estacionSeleccionada.set(null);
    this.reviewsEstacionSeleccionada.set([]);
    this.cargandoReviews.set(false);
    this.errorReviews.set(null);
    this.reviewsVisibles.set(5);
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

  // ============================================================================
  // MÉTODOS DE COMPARACIÓN
  // ============================================================================

  /**
   * Agrega o elimina una estación de comparación
   * @param estacion Estación a togglear
   */
  toggleComparacion(estacion: GasStation): void {
    if (this.comparacionService.estaEnComparacion(estacion.id)) {
      this.comparacionService.eliminarDeComparacion(estacion.id);
    } else {
      const agregado = this.comparacionService.agregarAComparacion(estacion);
      if (!agregado) {
        alert('Máximo 3 estaciones para comparar');
      }
    }
  }

  /**
   * Verifica si una estación está en comparación
   */
  estaEnComparacion(estacionId: string): boolean {
    return this.comparacionService.estaEnComparacion(estacionId);
  }

  /**
   * Abre el modal de comparación
   */
  abrirComparacion(): void {
    if (this.totalComparaciones() < 2) {
      alert('Selecciona al menos 2 estaciones para comparar');
      return;
    }
    this.mostrarModalComparacion.set(true);
  }

  // ============================================================================
  // MÉTODOS DE RUTAS
  // ============================================================================

  /**
   * Abre el modal de rutas para una estación
   * @param estacion Estación destino
   */
  abrirCalculadoraRutas(estacion: GasStation): void {
    this.estacionParaRuta.set(estacion);
    this.mostrarModalRutas.set(true);
  }

  /**
   * Maneja la ruta calculada desde el modal
   * @param ruta Información de la ruta
   */
  onRutaCalculada(ruta: InformacionRuta): void {
    this.rutaActual.set(ruta);
    // Aquí puedes actualizar el mapa para mostrar la ruta
    console.log('✅ Ruta calculada:', ruta);
  }

  /**
   * Acción inicial para lanzar sugerencias del futuro chatbot IA
   */
  abrirSugerenciaIA(): void {
    this.vistaActiva.set('mapa');
    this.modoSeleccionPunto.set(true);
    alert('Pulsa en el mapa para colocar la chincheta y generar la recomendacion IA.');
  }

  onPuntoMapaSeleccionado(coords: Coordenadas): void {
    this.puntoRecomendacion.set(coords);
    this.modoSeleccionPunto.set(false);
    this.generarRecomendacionDesdePunto(coords);
  }

  cerrarModalRecomendacion(): void {
    this.mostrarModalRecomendacion.set(false);
  }

  recalcularRecomendacion(): void {
    const punto = this.puntoRecomendacion();
    if (!punto) return;
    this.generarRecomendacionDesdePunto(punto);
  }

  private clampNumero(valor: any, min: number, max: number, fallback: number): number {
    const n = Number(valor);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  private generarRecomendacionDesdePunto(coords: Coordenadas): void {
    const combustible = this.searchForm.value.combustible as TipoCombustible;
    const radioKm = Number(this.searchForm.value.radioKm) || 15;
    const base = this.estacionesFiltradas().length > 0 ? this.estacionesFiltradas() : this.estacionesCache;

    this.mejorMomentoTexto.set('');
    // Parametros de coste (puedes exponerlos luego en UI)
    const litrosEstimados = this.clampNumero(this.litrosEstimados(), 5, 120, 40);
    const consumoLKm = this.clampNumero(this.consumoLKm(), 0.02, 0.25, 0.06);
    this.litrosEstimados.set(litrosEstimados);
    this.consumoLKm.set(consumoLKm);

    const candidatas = base
      .map(estacion => ({
        estacion,
        distanciaKm: this.calcularDistanciaHaversine(
          coords,
          { latitud: estacion.latitud, longitud: estacion.longitud }
        ),
        precio: this.obtenerPrecioEstacion(estacion, combustible)
      }))
      .filter(
        (item): item is { estacion: GasStation; distanciaKm: number; precio: number } =>
          item.precio !== undefined && item.precio > 0 && item.distanciaKm <= radioKm
      )
      .slice(0, 200);

    if (candidatas.length === 0) {
      this.recomendacionIaTexto.set(
        `No he encontrado gasolineras con precio disponible dentro de ${radioKm} km desde la chincheta.`
      );
      this.mostrarModalRecomendacion.set(true);
      return;
    }

    // Ranking por coste real:
    // - coste repostaje = litros * precio
    // - coste desplazamiento (ida+vuelta) en litros = 2 * distancia_km * consumoLKm
    // - coste desplazamiento en € se aproxima usando el mismo precio €/L
    // - coste efectivo €/L = coste_total / litros
    const candidatasRankeadas = candidatas
      .map(c => {
        const litrosDesplazamiento = 2 * c.distanciaKm * consumoLKm;
        const costeRepostaje = litrosEstimados * c.precio;
        const costeDesplazamiento = litrosDesplazamiento * c.precio;
        const costeTotal = costeRepostaje + costeDesplazamiento;
        const precioEfectivo = costeTotal / litrosEstimados;
        return {
          ...c,
          litrosDesplazamiento,
          precioEfectivo
        };
      })
      .sort((a, b) => a.precioEfectivo - b.precioEfectivo)
      .slice(0, 3);

    const top = candidatasRankeadas.map((item, index) =>
      `${index + 1}. ${item.estacion.marca} - ${item.estacion.direccion} (${item.estacion.municipio})\n` +
      `   Precio: ${item.precio.toFixed(3)} €/L · Distancia: ${item.distanciaKm.toFixed(1)} km\n` +
      `   Precio efectivo (incluye desplazamiento): ${item.precioEfectivo.toFixed(3)} €/L`
    );

    this.recomendacionIaTexto.set(
      `Recomendacion IA desde tu punto seleccionado (precio + distancia):\n` +
      `(suponiendo ${litrosEstimados} L y consumo ${consumoLKm.toFixed(3)} L/km)\n\n` +
      `${top.join('\n\n')}`
    );
    this.mostrarModalRecomendacion.set(true);

    // Sugerir mejor momento (día) para repostar con histórico simulado
    this.calcularMejorMomentoRepostaje(candidatasRankeadas[0].estacion, candidatasRankeadas[0].precio);
  }

  private calcularMejorMomentoRepostaje(estacion: GasStation, precioActualReferencia: number): void {
    const combustible = this.searchForm.value.combustible as TipoCombustible;
    this.cargandoMejorMomento.set(true);

    this.gasStationService.getHistoricoPrecios(estacion.municipio, combustible).subscribe({
      next: (datos) => {
        const ultimos7 = datos.slice(-7);
        const conPrecio = ultimos7
          .filter(d => typeof d.precioEstacion === 'number')
          .map(d => ({ fecha: d.fecha, precio: d.precioEstacion as number }));

        if (conPrecio.length === 0) {
          this.mejorMomentoTexto.set('No hay suficiente histórico para recomendar un mejor día.');
          this.cargandoMejorMomento.set(false);
          return;
        }

        const mejor = conPrecio.reduce((acc, curr) => (curr.precio < acc.precio ? curr : acc));
        const diaSemana = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(mejor.fecha);
        const precioMin7 = mejor.precio;

        // Solo recomendar "esperar" si el mínimo estimado es realmente menor que el precio actual
        const mejora = precioActualReferencia - precioMin7;
        const umbral = 0.01; // 1 centimo/L para que merezca la pena

        if (mejora > umbral) {
          this.mejorMomentoTexto.set(
            `Mejor dia estimado: ${diaSemana}.\n` +
            `Precio estimado (referencia): ${precioMin7.toFixed(3)} €/L.\n` +
            `Ahorro estimado vs ahora: ${mejora.toFixed(3)} €/L.\n` +
            `Nota: recomendacion basada en historico simulado hasta tener historico real.`
          );
        } else {
          this.mejorMomentoTexto.set(
            `Segun el historico (simulado), no hay un dia claramente mas barato que ahora.\n` +
            `Mejor opcion: repostar ahora (precio actual referencia: ${precioActualReferencia.toFixed(3)} €/L).`
          );
        }

        this.cargandoMejorMomento.set(false);
      },
      error: () => {
        this.mejorMomentoTexto.set('No se pudo calcular el mejor momento para repostar.');
        this.cargandoMejorMomento.set(false);
      }
    });
  }

  private calcularDistanciaHaversine(punto1: Coordenadas, punto2: Coordenadas): number {
    const R = 6371;
    const dLat = this.toRad(punto2.latitud - punto1.latitud);
    const dLon = this.toRad(punto2.longitud - punto1.longitud);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(punto1.latitud)) *
      Math.cos(this.toRad(punto2.latitud)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(grados: number): number {
    return grados * (Math.PI / 180);
  }

  /**
   * Incrementa el número de reviews visibles en bloques de 5
   */
  verMasReviews(): void {
    this.reviewsVisibles.update(valor => valor + 5);
  }

  /**
   * Indica si hay más reviews ya cargadas en memoria para mostrar
   */
  hayMasReviewsLocales(): boolean {
    return this.reviewsEstacionSeleccionada().length > this.reviewsVisibles();
  }

  publicarReview(estacion: GasStation): void {
    const autor = prompt('Tu nombre (opcional):', 'Anonimo') || 'Anonimo';
    const puntuacionInput = prompt('Puntuacion (1 a 5):', '5');
    const comentario = prompt('Escribe tu review:');

    if (!comentario || !comentario.trim()) {
      alert('La review necesita un comentario.');
      return;
    }

    const puntuacion = Number(puntuacionInput);
    if (Number.isNaN(puntuacion) || puntuacion < 1 || puntuacion > 5) {
      alert('La puntuacion debe ser un numero entre 1 y 5.');
      return;
    }

    this.gasStationService.agregarReviewEstacion(estacion.id, autor, puntuacion, comentario).subscribe({
      next: () => {
        this.cargarReviewsEstacion(estacion.id);
      },
      error: (error) => {
        console.error('Error guardando review:', error);
        alert('No se pudo guardar la review.');
      }
    });
  }

  /**
   * Devuelve una cadena de estrellas para una puntuación 1-5
   */
  obtenerEstrellas(puntuacion: number): string {
    const llenas = '★'.repeat(Math.max(0, Math.min(5, puntuacion)));
    const vacias = '☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, puntuacion))));
    return `${llenas}${vacias}`;
  }

  /**
   * Formatea una fecha para mostrar en UI
   */
  formatearFechaReview(fecha: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(fecha);
  }

  /**
   * Carga reviews de una estación concreta
   */
  private cargarReviewsEstacion(estacionId: string): void {
    const estacion = this.estacionSeleccionada();
    if (!estacion || estacion.id !== estacionId) return;

    this.cargandoReviews.set(true);
    this.reviewsEstacionSeleccionada.set([]);
    this.errorReviews.set(null);
    this.reviewsVisibles.set(5);

    this.gasStationService.getReviewsPorEstacion(estacion.id).subscribe({
      next: (reviews) => {
        const ordenadas = [...reviews].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
        this.reviewsEstacionSeleccionada.set(ordenadas);
        this.cargandoReviews.set(false);
      },
      error: (error) => {
        console.error('Error cargando reviews de la estacion:', error);
        this.reviewsEstacionSeleccionada.set([]);
        this.errorReviews.set(error?.message || 'No se pudieron cargar las reviews.');
        this.cargandoReviews.set(false);
      }
    });
  }
}
