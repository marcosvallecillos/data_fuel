# 📘 Guía de Implementación - Gas-Trend Pro

## 🎯 Pasos para Completar la Aplicación

Esta guía detalla los pasos necesarios para integrar todos los componentes y tener la aplicación funcionando completamente.

---

## 1. Configuración Inicial del Proyecto

### 1.1 Crear el proyecto Angular

```bash
ng new gas-trend-pro --standalone --routing --style=css
cd gas-trend-pro
```

### 1.2 Instalar dependencias

```bash
# Mapas
npm install leaflet
npm install @types/leaflet --save-dev

# Gráficas
npm install echarts

# Opcional pero recomendado
npm install @angular/material @angular/cdk
```

### 1.3 Copiar archivos generados

Copiar todos los archivos TypeScript generados a sus respectivas ubicaciones en el proyecto Angular.

---

## 2. Configuración de Angular

### 2.1 angular.json

Agregar assets de Leaflet:

```json
{
  "projects": {
    "gas-trend-pro": {
      "architect": {
        "build": {
          "options": {
            "assets": [
              "src/favicon.ico",
              "src/assets",
              {
                "glob": "**/*",
                "input": "node_modules/leaflet/dist/images",
                "output": "/assets/"
              }
            ],
            "styles": [
              "src/styles.css",
              "node_modules/leaflet/dist/leaflet.css"
            ]
          }
        }
      }
    }
  }
}
```

### 2.2 app.config.ts (o main.ts para standalone)

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient()
  ]
};
```

### 2.3 app.routes.ts

```typescript
import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: DashboardComponent
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
```

### 2.4 app.component.ts

```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: []
})
export class AppComponent {
  title = 'Gas-Trend Pro';
}
```

---

## 3. Estilos Globales

### 3.1 styles.css

```css
/* Reset y base */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f8fafc;
  color: #1e293b;
}

/* Leaflet fixes */
.leaflet-container {
  font-family: inherit;
}

.leaflet-popup-content-wrapper {
  font-family: inherit;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
```

---

## 4. Integraciones y Mejoras

### 4.1 Implementar Gráficas en Dashboard

Actualizar `dashboard.component.html` para incluir el componente de gráficas:

```html
<!-- Vista: Gráficas -->
@if (vistaActiva() === 'graficas') {
  <div class="graficas-container">
    <app-charts
      [estaciones]="estacionesFiltradas()"
      [estacionSeleccionada]="estacionSeleccionada()"
      [combustible]="searchForm.value.combustible">
    </app-charts>
  </div>
}
```

Importar en `dashboard.component.ts`:

```typescript
import { ChartsComponent } from '../charts/charts.component';

// En el decorador
imports: [
  CommonModule,
  ReactiveFormsModule,
  MapComponent,
  ChartsComponent  // Agregar esto
]
```

### 4.2 Agregar FormsModule para ngModel en Charts

En `charts.component.ts`:

```typescript
import { FormsModule } from '@angular/forms';

// En el decorador
imports: [CommonModule, FormsModule]
```

---

## 5. Optimizaciones de Rendimiento

### 5.1 Implementar Change Detection OnPush

```typescript
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  // ...
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

### 5.2 Lazy Loading de Componentes

```typescript
// En app.routes.ts
{
  path: 'dashboard',
  loadComponent: () => import('./features/dashboard/dashboard.component')
    .then(m => m.DashboardComponent)
}
```

### 5.3 Virtual Scrolling para Listas Grandes

```typescript
import { ScrollingModule } from '@angular/cdk/scrolling';

// En el template
<cdk-virtual-scroll-viewport itemSize="100" class="lista-viewport">
  <div *cdkVirtualFor="let estacion of estacionesFiltradas()">
    <!-- Card de estación -->
  </div>
</cdk-virtual-scroll-viewport>
```

---

## 6. Testing

### 6.1 Test de GasStationService

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GasStationService } from './gas-station.service';

describe('GasStationService', () => {
  let service: GasStationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GasStationService]
    });
    service = TestBed.inject(GasStationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch estaciones', () => {
    const mockData = {
      ListaEESSPrecio: [
        {
          IDEESS: '1',
          Rótulo: 'REPSOL',
          // ... más datos
        }
      ]
    };

    service.getEstacionesGeneral().subscribe(estaciones => {
      expect(estaciones.length).toBe(1);
      expect(estaciones[0].marca).toBe('REPSOL');
    });

    const req = httpMock.expectOne(service['ENDPOINTS'].estacionesGeneral);
    expect(req.request.method).toBe('GET');
    req.flush(mockData);
  });
});
```

---

## 7. Características Avanzadas (Opcional)

### 7.1 PWA (Progressive Web App)

```bash
ng add @angular/pwa
```

Configurar `ngsw-config.json`:

```json
{
  "dataGroups": [
    {
      "name": "api-cache",
      "urls": [
        "https://sedeaplicaciones.minetur.gob.es/**"
      ],
      "cacheConfig": {
        "maxSize": 100,
        "maxAge": "1h",
        "strategy": "freshness"
      }
    }
  ]
}
```

### 7.2 Internacionalización (i18n)

```bash
ng add @angular/localize
```

```typescript
// En app.config.ts
import { provideI18n } from '@angular/localize';

providers: [
  // ...
  provideI18n()
]
```

### 7.3 State Management con NgRx (Alternativa a Signals)

```bash
ng add @ngrx/store
ng add @ngrx/effects
```

```typescript
// estaciones.state.ts
export interface EstacionesState {
  estaciones: GasStation[];
  loading: boolean;
  error: string | null;
  filtros: FiltrosBusqueda;
}

// estaciones.actions.ts
export const cargarEstaciones = createAction('[Estaciones] Cargar');
export const cargarEstacionesSuccess = createAction(
  '[Estaciones] Cargar Success',
  props<{ estaciones: GasStation[] }>()
);
```

### 7.4 Analytics con Google Analytics

```bash
npm install @angular/fire
```

```typescript
// En app.config.ts
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';

providers: [
  // ...
  provideAnalytics(() => getAnalytics())
]
```

---

## 8. Despliegue y CI/CD

### 8.1 GitHub Actions

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build:prod
        
      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist/gas-trend-pro/browser
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

### 8.2 Docker

`Dockerfile`:

```dockerfile
# Stage 1: Build
FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:prod

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist/gas-trend-pro/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`nginx.conf`:

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 9. Mejores Prácticas

### 9.1 Nomenclatura

- **Componentes**: PascalCase + Component (ej: `DashboardComponent`)
- **Servicios**: PascalCase + Service (ej: `GasStationService`)
- **Interfaces**: PascalCase (ej: `GasStation`)
- **Enums**: PascalCase (ej: `TipoCombustible`)
- **Constantes**: UPPER_SNAKE_CASE (ej: `COMBUSTIBLES_INFO`)

### 9.2 Estructura de Archivos

```
feature/
├── components/           # Componentes presentacionales
├── containers/           # Componentes contenedores
├── services/            # Servicios específicos del feature
├── models/              # Interfaces y tipos
├── utils/               # Utilidades
└── feature.routes.ts    # Rutas del feature
```

### 9.3 Gestión de Errores

```typescript
// error-handler.service.ts
import { Injectable, ErrorHandler } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: Error): void {
    console.error('Error global:', error);
    // Enviar a servicio de logging (ej: Sentry)
  }
}

// En app.config.ts
providers: [
  { provide: ErrorHandler, useClass: GlobalErrorHandler }
]
```

### 9.4 Logging

```typescript
// logger.service.ts
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  log(message: string, ...args: any[]): void {
    if (!environment.production) {
      console.log(`[LOG] ${message}`, ...args);
    }
  }

  error(message: string, error?: any): void {
    console.error(`[ERROR] ${message}`, error);
    // Enviar a servicio externo en producción
  }

  warn(message: string, ...args: any[]): void {
    if (!environment.production) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
}
```

---

## 10. Troubleshooting

### Problema: Iconos de Leaflet no se muestran

**Solución**: Verificar que los assets estén copiados correctamente y que la ruta en `angular.json` sea correcta.

### Problema: CORS al consumir API

**Solución**: La API del Ministerio tiene CORS habilitado. Si hay problemas, verificar configuración de headers en requests.

### Problema: Signals no reactivos

**Solución**: Asegurarse de usar `.set()` o `.update()` en lugar de mutación directa.

```typescript
// ❌ Incorrecto
this.estaciones().push(nuevaEstacion);

// ✅ Correcto
this.estaciones.update(list => [...list, nuevaEstacion]);
```

### Problema: Memory leaks en suscripciones

**Solución**: Usar `takeUntilDestroyed()` o AsyncPipe

```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// En constructor
this.service.data$
  .pipe(takeUntilDestroyed())
  .subscribe(data => {
    // ...
  });
```

---

## 11. Recursos Adicionales

- **Documentación Angular**: https://angular.dev
- **API Leaflet**: https://leafletjs.com/reference.html
- **API ECharts**: https://echarts.apache.org/en/api.html
- **RxJS**: https://rxjs.dev/guide/overview
- **TypeScript**: https://www.typescriptlang.org/docs/

---

## 12. Checklist Final

- [ ] Proyecto Angular creado con standalone components
- [ ] Dependencias instaladas (leaflet, echarts)
- [ ] Assets de Leaflet copiados
- [ ] Todos los servicios implementados
- [ ] Componentes integrados en dashboard
- [ ] Estilos aplicados correctamente
- [ ] Rutas configuradas
- [ ] Tests básicos escritos
- [ ] Build de producción exitoso
- [ ] Aplicación desplegada

---

**¡Listo para producción! 🚀**
