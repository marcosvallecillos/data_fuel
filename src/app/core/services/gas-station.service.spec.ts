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
          'Dirección': 'Calle Falsa 123',
          'Municipio': 'Madrid',
          'Provincia': 'Madrid',
          'C.P.': '28001',
          'Horario': 'L-D: 24H',
          'Latitud': '40,4168',
          'Longitud (WGS84)': '-3,7038',
          'Precio Gasoleo A': '1,500',
          'Precio Gasolina 95 E5': '1,600',
          'Precio Gasolina 98 E5': '1,700',
          'Precio Biodiesel': '',
          'Precio Gases licuados del petróleo': '',
          'Fecha': '2026-04-20'
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
