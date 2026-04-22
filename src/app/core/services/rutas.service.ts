import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import {
  GasStation,
  OrigenRuta,
  InformacionRuta,
  PasoRuta,
  Coordenadas,
  OpcionesRuta,
  ResultadoDireccion
} from '../models/gas-station.models';

/**
 * Servicio para cálculo de rutas y geocoding
 * Utiliza OpenRouteService (alternativa gratuita a Google Maps)
 * 
 * IMPORTANTE: Necesitas registrarte en https://openrouteservice.org
 * para obtener una API key gratuita (2000 requests/día)
 * 
 * @author Gas-Trend Pro Team
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class RutasService {
  private readonly http = inject(HttpClient);
  
  // ============================================================================
  // CONFIGURACIÓN - OPENROUTESERVICE
  // ============================================================================
  
  // TODO: Reemplazar con tu API key de OpenRouteService
  // Obtener en: https://openrouteservice.org/dev/#/signup
  private readonly API_KEY = 'TU_API_KEY_AQUI'; // ⚠️ CAMBIAR ESTO
  
  private readonly ORS_BASE = 'https://api.openrouteservice.org';
  
  private readonly ENDPOINTS = {
    directions: (profile: string) => `${this.ORS_BASE}/v2/directions/${profile}`,
    geocode: `${this.ORS_BASE}/geocode/search`,
    reverseGeocode: `${this.ORS_BASE}/geocode/reverse`
  };

  // ============================================================================
  // MÉTODOS PRINCIPALES - CÁLCULO DE RUTAS
  // ============================================================================

  /**
   * Calcula la ruta desde un origen hasta una gasolinera
   * @param origen Punto de partida
   * @param destino Estación de destino
   * @param opciones Opciones de ruta (modo transporte, etc.)
   * @returns Observable con información de la ruta
   */
  calcularRuta(
    origen: OrigenRuta,
    destino: GasStation,
    opciones: OpcionesRuta = {
      modoTransporte: 'driving',
      optimizarPara: 'tiempo'
    }
  ): Observable<InformacionRuta | null> {
    // Validar API key
    if (this.API_KEY === 'TU_API_KEY_AQUI') {
      console.warn('⚠️ API key de ORS no configurada. Usando ruta simple (línea recta).');
      return of(this.generarRutaSimple(origen, destino, opciones));
    }

    const profile = this.mapearModoTransporte(opciones.modoTransporte);
    const url = this.ENDPOINTS.directions(profile);

    const body = {
      coordinates: [
        [origen.coordenadas.longitud, origen.coordenadas.latitud],
        [destino.longitud, destino.latitud]
      ],
      preference: opciones.optimizarPara === 'distancia' ? 'shortest' : 'fastest',
      units: 'km',
      language: 'es',
      geometry: true,
      instructions: true,
      elevation: false
    };

    const headers = {
      'Authorization': this.API_KEY,
      'Content-Type': 'application/json'
    };

    return this.http.post<any>(url, body, { headers }).pipe(
      map(response => this.procesarRespuestaRuta(response, origen, destino, opciones)),
      catchError(error => {
        console.error('❌ Error calculando ruta:', error);
        // Si OpenRouteService falla, calcular ruta simple con línea recta
        return of(this.generarRutaSimple(origen, destino, opciones));
      })
    );
  }

  /**
   * Busca coordenadas de una dirección (geocoding)
   * @param direccion Dirección en texto
   * @param pais Código de país (default: 'ES' para España)
   * @returns Observable con resultados de búsqueda
   */
  buscarDireccion(
    direccion: string, 
    pais: string = 'ES'
  ): Observable<ResultadoDireccion[]> {
    if (this.API_KEY === 'TU_API_KEY_AQUI') {
      // Fallback a Nominatim (OpenStreetMap) si no hay API key de ORS
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&countrycodes=${pais.toLowerCase()}&addressdetails=1&limit=5`;
      
      return this.http.get<any[]>(nominatimUrl).pipe(
        map(results => results.map(res => ({
          direccion: res.display_name,
          coordenadas: {
            latitud: parseFloat(res.lat),
            longitud: parseFloat(res.lon)
          },
          confianza: 1,
          detalles: {
            municipio: res.address.city || res.address.town || res.address.village,
            provincia: res.address.state || res.address.county
          }
        }))),
        catchError(error => {
          console.error('❌ Error en geocoding (Nominatim):', error);
          return of(this.generarMockDireccion(direccion));
        })
      );
    }

    const url = `${this.ENDPOINTS.geocode}?api_key=${this.API_KEY}&text=${encodeURIComponent(direccion)}&boundary.country=${pais}&size=5`;

    return this.http.get<any>(url).pipe(
      map(response => this.procesarResultadosGeocoding(response)),
      catchError(error => {
        console.error('❌ Error en geocoding:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene la dirección de unas coordenadas (reverse geocoding)
   * @param coordenadas Coordenadas a convertir
   * @returns Observable con la dirección
   */
  obtenerDireccionDeCoordenadas(
    coordenadas: Coordenadas
  ): Observable<string | null> {
    if (this.API_KEY === 'TU_API_KEY_AQUI') {
      return of(null);
    }

    const url = `${this.ENDPOINTS.reverseGeocode}?api_key=${this.API_KEY}&point.lon=${coordenadas.longitud}&point.lat=${coordenadas.latitud}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        if (response.features && response.features.length > 0) {
          return response.features[0].properties.label;
        }
        return null;
      }),
      catchError(() => of(null))
    );
  }

  // ============================================================================
  // PROCESAMIENTO DE RESPUESTAS
  // ============================================================================

  /**
   * Procesa la respuesta de OpenRouteService y la convierte a nuestro modelo
   */
  private procesarRespuestaRuta(
    response: any,
    origen: OrigenRuta,
    destino: GasStation,
    opciones: OpcionesRuta
  ): InformacionRuta {
    const route = response.routes[0];
    const summary = route.summary;
    const steps = route.segments[0].steps;

    // Procesar pasos de la ruta
    const pasos: PasoRuta[] = steps.map((step: any) => ({
      distancia: step.distance,
      duracion: step.duration,
      instruccion: step.instruction,
      tipo: this.mapearTipoInstruccion(step.type),
      coordenadas: {
        latitud: step.way_points[0][1],
        longitud: step.way_points[0][0]
      }
    }));

    // Decodificar polyline (coordenadas de la línea en el mapa)
    const polyline: Coordenadas[] = this.decodificarPolyline(route.geometry);

    return {
      origen,
      destino,
      distanciaTotal: summary.distance, // Ya viene en km
      duracionEstimada: Math.round(summary.duration / 60), // Convertir segundos a minutos
      pasos,
      polyline,
      modoTransporte: opciones.modoTransporte,
      timestamp: new Date()
    };
  }

  /**
   * Procesa resultados de geocoding
   */
  private procesarResultadosGeocoding(response: any): ResultadoDireccion[] {
    if (!response.features || response.features.length === 0) {
      return [];
    }

    return response.features.map((feature: any) => ({
      direccion: feature.properties.label,
      coordenadas: {
        latitud: feature.geometry.coordinates[1],
        longitud: feature.geometry.coordinates[0]
      },
      confianza: feature.properties.confidence || 0.5,
      detalles: {
        calle: feature.properties.street,
        numero: feature.properties.housenumber,
        codigoPostal: feature.properties.postalcode,
        municipio: feature.properties.locality,
        provincia: feature.properties.region
      }
    }));
  }

  /**
   * Genera una ruta simple usando línea recta (fallback)
   * Se usa cuando OpenRouteService no está disponible
   */
  private generarRutaSimple(
    origen: OrigenRuta,
    destino: GasStation,
    opciones: OpcionesRuta
  ): InformacionRuta {
    // Calcular distancia en línea recta usando fórmula Haversine
    const distanciaKm = this.calcularDistanciaHaversine(
      origen.coordenadas,
      { latitud: destino.latitud, longitud: destino.longitud }
    );

    // Estimar duración según modo de transporte
    let velocidadPromedio: number;
    switch (opciones.modoTransporte) {
      case 'walking':
        velocidadPromedio = 5; // km/h
        break;
      case 'cycling':
        velocidadPromedio = 15; // km/h
        break;
      case 'driving':
      default:
        velocidadPromedio = 50; // km/h en ciudad
        break;
    }

    const duracionMinutos = Math.round((distanciaKm / velocidadPromedio) * 60);

    return {
      origen,
      destino,
      distanciaTotal: distanciaKm,
      duracionEstimada: duracionMinutos,
      pasos: [
        {
          distancia: distanciaKm * 1000, // convertir a metros
          duracion: duracionMinutos * 60, // convertir a segundos
          instruccion: `Dirígete hacia ${destino.marca} en ${destino.direccion}`,
          tipo: 'straight',
          coordenadas: origen.coordenadas
        },
        {
          distancia: 0,
          duracion: 0,
          instruccion: `Has llegado a ${destino.marca}`,
          tipo: 'destination',
          coordenadas: { latitud: destino.latitud, longitud: destino.longitud }
        }
      ],
      polyline: [
        origen.coordenadas,
        { latitud: destino.latitud, longitud: destino.longitud }
      ],
      modoTransporte: opciones.modoTransporte,
      timestamp: new Date()
    };
  }

  // ============================================================================
  // UTILIDADES Y HELPERS
  // ============================================================================

  /**
   * Mapea nuestro modo de transporte al perfil de OpenRouteService
   */
  private mapearModoTransporte(modo: 'driving' | 'walking' | 'cycling'): string {
    const mapeo = {
      'driving': 'driving-car',
      'walking': 'foot-walking',
      'cycling': 'cycling-regular'
    };
    return mapeo[modo];
  }

  /**
   * Mapea el tipo de instrucción de ORS a nuestro tipo
   */
  private mapearTipoInstruccion(tipo: number): PasoRuta['tipo'] {
    // Tipos de ORS: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/post
    const mapeo: { [key: number]: PasoRuta['tipo'] } = {
      0: 'turn-left',
      1: 'turn-right',
      2: 'turn-left', // sharp left
      3: 'turn-right', // sharp right
      4: 'straight',
      5: 'straight',
      6: 'straight',
      7: 'roundabout',
      10: 'destination'
    };
    return mapeo[tipo] || 'straight';
  }

  /**
   * Decodifica polyline codificado (algoritmo de Google)
   */
  private decodificarPolyline(encoded: string): Coordenadas[] {
    // Esta es una implementación simplificada
    // En producción, usar librería como '@mapbox/polyline'
    const coordenadas: Coordenadas[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordenadas.push({
        latitud: lat / 1e5,
        longitud: lng / 1e5
      });
    }

    return coordenadas;
  }

  /**
   * Calcula distancia usando fórmula de Haversine
   */
  private calcularDistanciaHaversine(coord1: Coordenadas, coord2: Coordenadas): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(coord2.latitud - coord1.latitud);
    const dLon = this.toRad(coord2.longitud - coord1.longitud);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(coord1.latitud)) * 
      Math.cos(this.toRad(coord2.latitud)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convierte grados a radianes
   */
  private toRad(grados: number): number {
    return grados * (Math.PI / 180);
  }

  /**
   * Formatea duración en formato legible
   */
  formatearDuracion(minutos: number): string {
    if (minutos < 60) {
      return `${minutos} min`;
    }
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}min`;
  }

  /**
   * Formatea distancia en formato legible
   */
  formatearDistancia(km: number): string {
    if (km < 1) {
      return `${Math.round(km * 1000)} m`;
    }
    return `${km.toFixed(1)} km`;
  }

  /**
   * Obtiene icono según tipo de instrucción
   */
  obtenerIconoInstruccion(tipo: PasoRuta['tipo']): string {
    const iconos = {
      'straight': '⬆️',
      'turn-left': '⬅️',
      'turn-right': '➡️',
      'roundabout': '🔄',
      'destination': '🏁'
    };
    return iconos[tipo] || '⬆️';
  }

  /**
   * Obtiene icono según modo de transporte
   */
  obtenerIconoTransporte(modo: 'driving' | 'walking' | 'cycling'): string {
    const iconos = {
      'driving': '🚗',
      'walking': '🚶',
      'cycling': '🚴'
    };
    return iconos[modo];
  }

  /**
   * Genera resultados de geocoding ficticios para pruebas
   */
  private generarMockDireccion(texto: string): ResultadoDireccion[] {
    const ciudadesMock = [
      { nombre: 'Madrid', lat: 40.4168, lon: -3.7038, provincia: 'Madrid' },
      { nombre: 'Valencia', lat: 39.4699, lon: -0.3763, provincia: 'Valencia' },
      { nombre: 'Barcelona', lat: 41.3851, lon: 2.1734, provincia: 'Barcelona' },
      { nombre: 'Silla', lat: 39.3621, lon: -0.4121, provincia: 'Valencia' },
      { nombre: 'Torrent', lat: 39.4363, lon: -0.4655, provincia: 'Valencia' }
    ];

    // Filtrar por texto
    const ciudadEncontrada = ciudadesMock.find(c => 
      c.nombre.toLowerCase().includes(texto.toLowerCase())
    );

    if (!ciudadEncontrada) return [];

    return [{
      direccion: `${texto}, ${ciudadEncontrada.provincia}`,
      coordenadas: {
        latitud: ciudadEncontrada.lat + (Math.random() - 0.5) * 0.01,
        longitud: ciudadEncontrada.lon + (Math.random() - 0.5) * 0.01
      },
      confianza: 0.9,
      detalles: {
        municipio: ciudadEncontrada.nombre,
        provincia: ciudadEncontrada.provincia
      }
    }];
  }
}
