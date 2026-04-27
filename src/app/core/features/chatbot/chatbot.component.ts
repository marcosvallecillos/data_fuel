import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GasStationService } from '../../services/gas-station.service';
import { Coordenadas, GasStation, TipoCombustible } from '../../models/gas-station.models';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-chatbot-barber',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.css'
})
export class ChatbotComponent {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  isOpen = false;
  isLoading = false;
  userInput = '';
  messages: Message[] = [];
  isSpanish = true;
  private estacionesCache: GasStation[] = [];
  private ubicacionUsuario?: Coordenadas;

  constructor(private gasStationService: GasStationService) {}

  ngOnInit() {
    this.addWelcomeMessage();
  }

  addWelcomeMessage() {
    this.messages = [{
      role: 'assistant',
      content: this.isSpanish
        ? '👋 ¡Hola! Soy tu asistente de Data Fuel. Preguntame por gasolineras baratas y cercanas.'
        : '👋 Hi! I am your Data Fuel assistant.'
    }];
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) setTimeout(() => this.scrollToBottom(), 100);
  }

  async sendMessage(): Promise<void> {
    const text = this.userInput.trim();
    if (!text || this.isLoading) return;

    this.messages.push({ role: 'user', content: text });
    this.userInput = '';
    this.isLoading = true;
    this.scrollToBottom();

    try {
      const respuesta = await this.generarRespuesta(text);
      this.messages.push({ role: 'assistant', content: respuesta });
    } catch {
      this.messages.push({
        role: 'assistant',
        content: '❌ No he podido completar la sugerencia ahora mismo.'
      });
    } finally {
      this.isLoading = false;
      this.scrollToBottom();
    }
  }

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.sendMessage();
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  getText(es: string, en: string): string {
    return this.isSpanish ? es : en;
  }

  private async generarRespuesta(textoUsuario: string): Promise<string> {
    const texto = textoUsuario.toLowerCase();
    const radio = this.extraerRadioKm(texto);
    const soloAbiertas = texto.includes('abierta') || texto.includes('abiertas');

    if (
      texto.includes('barata') ||
      texto.includes('barato') ||
      texto.includes('economica') ||
      texto.includes('economico') ||
      texto.includes('cerca')
    ) {
      return this.buscarRecomendaciones(radio, soloAbiertas);
    }

    return 'Prueba con: "dime la gasolinera mas barata cercana a mi" o "gasolineras abiertas cerca de mi en 10 km".';
  }

  private async buscarRecomendaciones(radioKm: number, soloAbiertas: boolean): Promise<string> {
    const ubicacion = await this.obtenerUbicacionUsuario();
    const estaciones = await this.obtenerEstaciones();

    const candidatas = estaciones
      .map(estacion => ({
        estacion,
        precio: this.obtenerPrecio(estacion, TipoCombustible.GASOLINA_95),
        distanciaKm: this.calcularDistanciaKm(ubicacion, {
          latitud: estacion.latitud,
          longitud: estacion.longitud
        })
      }))
      .filter(
        (
          item
        ): item is {
          estacion: GasStation;
          precio: number;
          distanciaKm: number;
        } =>
          item.precio !== undefined &&
          item.precio > 0 &&
          item.distanciaKm <= radioKm &&
          (!soloAbiertas || item.estacion.estaAbierta === true)
      )
      .sort((a, b) => (a.precio !== b.precio ? a.precio - b.precio : a.distanciaKm - b.distanciaKm))
      .slice(0, 3);

    if (candidatas.length === 0) {
      return `No encuentro gasolineras con ese criterio en ${radioKm} km. Prueba ampliando el radio.`;
    }

    const lineas = candidatas.map(
      (item, index) =>
        `${index + 1}. ${item.estacion.marca} - ${item.estacion.municipio}\n` +
        `   ${item.precio.toFixed(3)} €/L · ${item.distanciaKm.toFixed(1)} km`
    );

    return `Estas son las mejores opciones cerca de ti (radio ${radioKm} km):\n\n${lineas.join('\n\n')}`;
  }

  private async obtenerEstaciones(): Promise<GasStation[]> {
    if (this.estacionesCache.length > 0) return this.estacionesCache;
    const estaciones = await firstValueFrom(this.gasStationService.getEstacionesGeneral());
    this.estacionesCache = estaciones;
    return estaciones;
  }

  private async obtenerUbicacionUsuario(): Promise<Coordenadas> {
    if (this.ubicacionUsuario) return this.ubicacionUsuario;
    const coords = await this.gasStationService.obtenerUbicacionActual();
    this.ubicacionUsuario = coords;
    return coords;
  }

  private extraerRadioKm(texto: string): number {
    const match = texto.match(/(\d{1,3})\s*km/);
    if (!match) return 15;
    const valor = parseInt(match[1], 10);
    return Math.max(1, Math.min(100, valor));
  }

  private obtenerPrecio(estacion: GasStation, combustible: TipoCombustible): number | undefined {
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

  private calcularDistanciaKm(origen: Coordenadas, destino: Coordenadas): number {
    const R = 6371;
    const dLat = this.toRad(destino.latitud - origen.latitud);
    const dLon = this.toRad(destino.longitud - origen.longitud);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(origen.latitud)) *
      Math.cos(this.toRad(destino.latitud)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(grados: number): number {
    return grados * (Math.PI / 180);
  }
}