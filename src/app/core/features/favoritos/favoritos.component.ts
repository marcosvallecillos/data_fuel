import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FavoritosService } from '../../services/favoritos.service';
import { GasStation, TipoCombustible } from '../../models/gas-station.models';

@Component({
  selector: 'app-favoritos',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './favoritos.component.html',
  styleUrls: ['./favoritos.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FavoritosComponent {
  public readonly favoritosService = inject(FavoritosService);
  public readonly TipoCombustible = TipoCombustible;

  obtenerPrecioEstacion(estacion: GasStation, combustible: TipoCombustible): number | undefined {
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

  formatearPrecio(precio?: number): string {
    return precio ? `${precio.toFixed(3)}€/L` : 'N/D';
  }

  eliminarFavorito(id: string): void {
    if (confirm('¿Estás seguro de que deseas eliminar esta estación de favoritos?')) {
      this.favoritosService.eliminarFavorito(id);
    }
  }

  limpiarTodos(): void {
    this.favoritosService.limpiarTodosFavoritos();
  }
}
