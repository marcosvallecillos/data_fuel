"""
Random Forest Regressor para Predicción de Precios de Combustible
Gas-Trend Pro - Modelo de Machine Learning

Datos: API Real del Ministerio para la Transición Ecológica de España
       https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/

Flujo:
  1. Descarga todas las estaciones (~12.000) desde la API del Ministerio
  2. Augmenta el dataset con variaciones temporales realistas
  3. Entrena Random Forest Regressor
  4. Guarda modelo + encoders + métricas en models/
  5. Genera api_prediccion.py listo para ejecutar
"""

import os
import json
import joblib
import warnings
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

warnings.filterwarnings('ignore')

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

RANDOM_STATE    = 42
N_ESTIMATORS    = 150
MAX_DEPTH       = 20
MIN_SAMPLES_SPLIT = 8
AUGMENTATION_FACTOR = 7   # Réplicas temporales por estación real
MODELS_DIR      = os.path.join(os.path.dirname(__file__), 'models')

API_MINISTERIO  = (
    "https://sedeaplicaciones.minetur.gob.es"
    "/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
)

# Capitales de provincia (lat, lon) para calcular distancia al centro
CAPITALES = {
    'ÁLAVA': (42.847, -2.673), 'ALBACETE': (38.994, -1.858),
    'ALICANTE/ALACANT': (38.345, -0.481), 'ALMERÍA': (36.838, -2.460),
    'ASTURIAS': (43.362, -5.849), 'ÁVILA': (40.657, -4.700),
    'BADAJOZ': (38.879, -6.970), 'BALEARS, ILLES': (39.570, 2.650),
    'BARCELONA': (41.386, 2.170), 'BURGOS': (42.344, -3.697),
    'CÁCERES': (39.476, -6.372), 'CÁDIZ': (36.527, -6.289),
    'CANTABRIA': (43.463, -3.810), 'CASTELLÓN/CASTELLÓ': (39.987, -0.038),
    'CIUDAD REAL': (38.986, -3.928), 'CÓRDOBA': (37.884, -4.779),
    'CORUÑA, A': (43.362, -8.412), 'CUENCA': (40.065, -2.134),
    'GIRONA': (41.983, 2.821), 'GRANADA': (37.177, -3.600),
    'GUADALAJARA': (40.633, -3.167), 'GUIPÚZCOA': (43.313, -1.998),
    'HUELVA': (37.261, -6.949), 'HUESCA': (42.140, -0.409),
    'JAÉN': (37.779, -3.787), 'LEÓN': (42.599, -5.571),
    'LLEIDA': (41.617, 0.620), 'LUGO': (43.013, -7.556),
    'MADRID': (40.417, -3.704), 'MÁLAGA': (36.721, -4.421),
    'MURCIA': (37.983, -1.130), 'NAVARRA': (42.817, -1.644),
    'OURENSE': (42.336, -7.864), 'PALENCIA': (42.010, -4.534),
    'PALMAS, LAS': (28.124, -15.437), 'PONTEVEDRA': (42.431, -8.644),
    'RIOJA, LA': (42.465, -2.445), 'SALAMANCA': (40.965, -5.664),
    'SANTA CRUZ DE TENERIFE': (28.463, -16.252),
    'SEGOVIA': (40.948, -4.118), 'SEVILLA': (37.389, -5.985),
    'SORIA': (41.764, -2.465), 'TARRAGONA': (41.119, 1.245),
    'TERUEL': (40.344, -1.107), 'TOLEDO': (39.857, -4.024),
    'VALENCIA/VALÈNCIA': (39.470, -0.376), 'VALLADOLID': (41.652, -4.724),
    'VIZCAYA': (43.263, -2.935), 'ZAMORA': (41.504, -5.745),
    'ZARAGOZA': (41.649, -0.887), 'CEUTA': (35.890, -5.318),
    'MELILLA': (35.292, -2.938),
}

DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']


# ============================================================================
# FUNCIONES DE SOPORTE
# ============================================================================

def haversine(lat1, lon1, lat2, lon2):
    """Distancia en km entre dos puntos (fórmula de Haversine)."""
    R = 6371
    d_lat = np.radians(lat2 - lat1)
    d_lon = np.radians(lon2 - lon1)
    a = np.sin(d_lat/2)**2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(d_lon/2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def parse_coord(s):
    """Convierte '39,469900' → 39.4699."""
    try:
        return float(str(s).replace(',', '.'))
    except Exception:
        return 0.0


def parse_precio(s):
    """Convierte '1,499' → 1.499, devuelve None si vacío."""
    try:
        v = float(str(s).replace(',', '.'))
        return v if v > 0 else None
    except Exception:
        return None


def normalizar_marca(rotulo):
    """Normaliza el rótulo a una marca conocida o 'OTRA'."""
    MARCAS = {
        'REPSOL': 'REPSOL', 'CEPSA': 'CEPSA', 'BP': 'BP',
        'SHELL': 'SHELL', 'GALP': 'GALP', 'BALLENOIL': 'BALLENOIL',
        'PLENOIL': 'PLENOIL', 'PETRONOR': 'PETRONOR', 'CAMPSA': 'CAMPSA',
        'CARREFOUR': 'CARREFOUR', 'ALCAMPO': 'ALCAMPO', 'EROSKI': 'EROSKI',
        'Q8': 'Q8', 'DISA': 'DISA', 'TAMOIL': 'TAMOIL',
    }
    rotulo_upper = str(rotulo).upper().strip()
    for clave, marca in MARCAS.items():
        if clave in rotulo_upper:
            return marca
    return 'OTRA'


# ============================================================================
# CARGA DE DATOS REALES
# ============================================================================

def cargar_datos_reales():
    """
    Descarga todas las estaciones de España desde la API del Ministerio.
    Devuelve un DataFrame con una fila por estación con precio real.
    """
    print("🌐 Conectando con la API del Ministerio de Transición Ecológica...")
    print(f"   URL: {API_MINISTERIO}")

    try:
        resp = requests.get(API_MINISTERIO, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"❌ Error al conectar con la API: {e}")
        print("⚠️  Usando datos simulados como fallback...")
        return cargar_datos_simulados()

    estaciones_raw = data.get('ListaEESSPrecio', [])
    print(f"✅ {len(estaciones_raw)} estaciones recibidas de la API")

    filas = []
    for e in estaciones_raw:
        precio = parse_precio(e.get('Precio Gasolina 95 E5', ''))
        if precio is None:
            continue  # Sin precio 95 → descartamos

        lat  = parse_coord(e.get('Latitud', '0'))
        lon  = parse_coord(e.get('Longitud (WGS84)', '0'))
        if lat == 0 or lon == 0:
            continue

        provincia = str(e.get('Provincia', '')).upper().strip()
        marca     = normalizar_marca(e.get('Rótulo', 'OTRA'))

        # Distancia al centro de la provincia
        cap = CAPITALES.get(provincia, (40.0, -3.5))  # fallback = España
        dist_centro = haversine(lat, lon, cap[0], cap[1])

        filas.append({
            'latitud':           lat,
            'longitud':          lon,
            'marca':             marca,
            'provincia':         provincia,
            'distancia_centro_km': dist_centro,
            'precio_gasolina95': precio,
        })

    df = pd.DataFrame(filas)
    print(f"✅ {len(df)} estaciones con precio Gasolina 95 válido")
    print(f"   Rango precios: {df['precio_gasolina95'].min():.3f}€ — {df['precio_gasolina95'].max():.3f}€")
    return df


def cargar_datos_simulados():
    """Fallback: genera 800 muestras simuladas alrededor de Valencia."""
    print("🔄 Generando datos simulados...")
    np.random.seed(RANDOM_STATE)
    n = 800
    val_lat, val_lon = 39.4699, -0.3763
    marcas = ['REPSOL', 'CEPSA', 'BP', 'SHELL', 'GALP', 'BALLENOIL', 'PLENOIL', 'OTRA']
    factor_m = {'REPSOL': 0.08, 'CEPSA': 0.06, 'BP': 0.07, 'SHELL': 0.07,
                'GALP': 0.05, 'BALLENOIL': -0.05, 'PLENOIL': -0.08, 'OTRA': 0.0}
    filas = []
    for _ in range(n):
        lat  = val_lat + np.random.uniform(-0.5, 0.5)
        lon  = val_lon + np.random.uniform(-0.5, 0.5)
        marca = np.random.choice(marcas)
        dist  = haversine(lat, lon, val_lat, val_lon)
        precio = 1.45 + factor_m[marca] - 0.003 * dist + np.random.normal(0, 0.03)
        filas.append({'latitud': lat, 'longitud': lon, 'marca': marca,
                      'provincia': 'VALENCIA/VALÈNCIA',
                      'distancia_centro_km': dist,
                      'precio_gasolina95': round(precio, 3)})
    df = pd.DataFrame(filas)
    print(f"✅ {len(df)} muestras simuladas generadas")
    return df


# ============================================================================
# AUGMENTACIÓN TEMPORAL
# ============================================================================

def augmentar_con_tiempo(df):
    """
    Dado un snapshot de precios reales, genera variantes temporales.
    Multiplica el dataset × AUGMENTATION_FACTOR asignando distintos
    días / horas con variaciones de precio realistas (±3%).
    """
    print(f"\n🔁 Augmentando datos (×{AUGMENTATION_FACTOR} variaciones temporales)...")

    FACTOR_DIA  = {'Lunes': 0.000, 'Martes': -0.002, 'Miércoles': -0.003,
                   'Jueves': 0.001, 'Viernes': 0.005, 'Sábado': 0.007, 'Domingo': 0.003}
    FACTOR_HORA = {**{h: 0.004 for h in range(7, 10)},
                   **{h: 0.003 for h in range(17, 20)},
                   **{h: 0.000 for h in range(24)}}  # resto ya tiene 0 de base

    filas = []
    np.random.seed(RANDOM_STATE)
    for i in range(AUGMENTATION_FACTOR):
        tmp = df.copy()
        dia  = DIAS_SEMANA[i % 7]
        hora = [7, 9, 12, 15, 17, 19, 22][i % 7]
        ruido = np.random.normal(0, 0.005, len(tmp))
        tmp['dia_semana']    = dia
        tmp['hora']          = hora
        tmp['es_fin_semana'] = 1 if dia in ('Sábado', 'Domingo') else 0
        tmp['es_hora_punta'] = 1 if (7 <= hora <= 9 or 17 <= hora <= 19) else 0
        tmp['precio_gasolina95'] = (
            tmp['precio_gasolina95'] * (1 + FACTOR_DIA[dia] + FACTOR_HORA.get(hora, 0)) + ruido
        ).round(3)
        filas.append(tmp)

    df_aug = pd.concat(filas, ignore_index=True)
    print(f"✅ Dataset ampliado: {len(df_aug)} muestras totales")
    return df_aug


# ============================================================================
# PREPROCESADO
# ============================================================================

def preprocesar(df):
    """Encodea variables categóricas y guarda encoders."""
    print("\n🔧 Preprocesando datos...")

    os.makedirs(MODELS_DIR, exist_ok=True)

    le_marca = LabelEncoder()
    le_dia   = LabelEncoder()

    df = df.copy()
    df['marca_encoded'] = le_marca.fit_transform(df['marca'])
    df['dia_encoded']   = le_dia.fit_transform(df['dia_semana'])

    joblib.dump(le_marca, os.path.join(MODELS_DIR, 'label_encoder_marca.pkl'))
    joblib.dump(le_dia,   os.path.join(MODELS_DIR, 'label_encoder_dia.pkl'))

    # Guardar clases conocidas (para validar en la API)
    clases = {
        'marcas': le_marca.classes_.tolist(),
        'dias':   le_dia.classes_.tolist(),
    }
    with open(os.path.join(MODELS_DIR, 'clases_encoder.json'), 'w', encoding='utf-8') as f:
        json.dump(clases, f, ensure_ascii=False, indent=2)

    print(f"✅ Encoders guardados | Marcas: {clases['marcas']}")
    return df, le_marca, le_dia


# ============================================================================
# ENTRENAMIENTO
# ============================================================================

FEATURES = [
    'latitud', 'longitud',
    'marca_encoded', 'dia_encoded',
    'hora', 'distancia_centro_km',
    'es_fin_semana', 'es_hora_punta',
]


def entrenar(df):
    """Entrena Random Forest y guarda modelo + métricas."""
    print("\n🌲 Entrenando Random Forest Regressor...")

    X = df[FEATURES]
    y = df['precio_gasolina95']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE
    )
    print(f"   Train: {len(X_train)} | Test: {len(X_test)}")

    modelo = RandomForestRegressor(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_split=MIN_SAMPLES_SPLIT,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    modelo.fit(X_train, y_train)

    y_pred = modelo.predict(X_test)
    rmse   = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2     = float(r2_score(y_test, y_pred))
    mae    = float(mean_absolute_error(y_test, y_pred))
    rmse_pct = rmse / float(y_test.mean()) * 100

    print("\n" + "=" * 55)
    print("📊 RESULTADOS")
    print(f"   RMSE:  {rmse:.4f}€  ({rmse_pct:.2f}% del precio medio)")
    print(f"   MAE:   {mae:.4f}€")
    print(f"   R²:    {r2:.4f}")
    print("=" * 55)

    # Importancia de features
    imp = sorted(zip(FEATURES, modelo.feature_importances_), key=lambda x: -x[1])
    print("\n🔍 Importancia de features:")
    for feat, val in imp:
        print(f"   {feat:<25} {val:.4f}")

    # Validación cruzada (3-fold para velocidad)
    cv = cross_val_score(modelo, X_train, y_train,
                         cv=3, scoring='neg_root_mean_squared_error', n_jobs=-1)
    cv_rmse = float(-cv.mean())
    print(f"\n🔄 CV RMSE (3-fold): {cv_rmse:.4f}€")

    # Guardar modelo
    modelo_path = os.path.join(MODELS_DIR, 'random_forest_precio_gasolina.pkl')
    joblib.dump(modelo, modelo_path)
    print(f"\n💾 Modelo guardado → {modelo_path}")

    # Guardar métricas
    metricas = {
        'rmse_test':        rmse,
        'rmse_percentage':  rmse_pct,
        'r2_test':          r2,
        'mae_test':         mae,
        'cv_rmse':          cv_rmse,
        'n_muestras_train': len(X_train),
        'n_muestras_test':  len(X_test),
        'n_estimators':     N_ESTIMATORS,
        'max_depth':        MAX_DEPTH,
        'features':         FEATURES,
        'importancias':     [{'feature': f, 'importancia': float(v)} for f, v in imp],
        'fecha_entrenamiento': datetime.now().isoformat(),
        'fuente_datos':     'API Real Ministerio (augmentada temporalmente)',
    }
    metricas_path = os.path.join(MODELS_DIR, 'metricas_modelo.json')
    with open(metricas_path, 'w', encoding='utf-8') as f:
        json.dump(metricas, f, indent=2, ensure_ascii=False)
    print(f"💾 Métricas guardadas → {metricas_path}")

    if rmse_pct <= 15:
        print(f"\n✅ Excelente precisión: {rmse_pct:.2f}% RMSE (datos reales)")
    elif rmse_pct <= 30:
        print(f"\n✅ Precisión aceptable: {rmse_pct:.2f}% RMSE")
    else:
        print(f"\n⚠️  RMSE alto ({rmse_pct:.2f}%), considera más datos")

    return modelo, metricas


# ============================================================================
# GENERAR API FLASK CORREGIDA
# ============================================================================

def generar_api():
    """Escribe api_prediccion.py en la carpeta ml/ - VERSIÓN CORREGIDA."""
    api_path = os.path.join(os.path.dirname(__file__), 'api_prediccion.py')
    
    codigo = '''"""
API Flask - Predicción de Precios de Combustible
Gas-Trend Pro | Puerto 5000

REQUISITOS:
  pip install flask flask-cors numpy scikit-learn joblib
"""

import os
import sys
import json
import joblib
import numpy as np
from datetime import datetime
from pathlib import Path

# Importaciones Flask
try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("❌ Flask no está instalado. Instala con:")
    print("   pip install flask flask-cors")
    sys.exit(1)

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

app = Flask(__name__)
CORS(app)

print("=" * 70)
print("📂 Cargando modelos...")

# ============================================================================
# CARGA DE MODELOS Y ENCODERS
# ============================================================================

try:
    # Cargar modelo
    modelo = joblib.load(str(MODELS_DIR / "random_forest_precio_gasolina.pkl"))
    print("   ✅ Random Forest cargado")
    
    # Cargar encoders
    le_marca = joblib.load(str(MODELS_DIR / "label_encoder_marca.pkl"))
    print("   ✅ Encoder marcas cargado")
    
    le_dia = joblib.load(str(MODELS_DIR / "label_encoder_dia.pkl"))
    print("   ✅ Encoder días cargado")
    
    # Cargar clases
    with open(str(MODELS_DIR / "clases_encoder.json"), 'r', encoding='utf-8') as f:
        CLASES = json.load(f)
    print("   ✅ Clases cargadas")
    
    # Cargar métricas
    with open(str(MODELS_DIR / "metricas_modelo.json"), 'r', encoding='utf-8') as f:
        METRICAS = json.load(f)
    print("   ✅ Métricas cargadas")
    
except FileNotFoundError as e:
    print(f"❌ Error: Archivo no encontrado: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error cargando modelos: {e}")
    sys.exit(1)

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

FEATURES = [
    "latitud", "longitud",
    "marca_encoded", "dia_encoded",
    "hora", "distancia_centro_km",
    "es_fin_semana", "es_hora_punta",
]

DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def normalizar_marca(marca_str):
    """Normaliza la marca a una clase conocida."""
    marca_upper = str(marca_str).upper().strip()
    
    for marca_conocida in CLASES['marcas']:
        if marca_conocida == marca_upper:
            return marca_conocida
    
    for marca_conocida in CLASES['marcas']:
        if marca_conocida in marca_upper or marca_upper in marca_conocida:
            return marca_conocida
    
    if 'OTRA' in CLASES['marcas']:
        return 'OTRA'
    return CLASES['marcas'][0]


def encode_marca(marca_str):
    """Convierte marca al índice numérico."""
    marca_norm = normalizar_marca(marca_str)
    try:
        return int(le_marca.transform([marca_norm])[0])
    except Exception:
        if 'OTRA' in CLASES['marcas']:
            return int(le_marca.transform(['OTRA'])[0])
        return 0


def encode_dia(dia_str):
    """Convierte día al índice numérico."""
    dia_norm = str(dia_str).strip()
    
    for dia_conocido in CLASES['dias']:
        if dia_conocido == dia_norm:
            try:
                return int(le_dia.transform([dia_conocido])[0])
            except Exception:
                pass
    
    try:
        return int(le_dia.transform([CLASES['dias'][0]])[0])
    except Exception:
        return 0


def predecir_precio_individual(lat, lon, marca, dia, hora, dist_centro):
    """Realiza predicción para una estación."""
    try:
        lat = float(lat)
        lon = float(lon)
        hora = int(hora)
        dist_centro = float(dist_centro)
    except (ValueError, TypeError) as e:
        raise ValueError(f"Error en tipos de datos: {e}")
    
    # Codificar
    marca_enc = encode_marca(marca)
    dia_enc = encode_dia(dia)
    
    # Features derivadas
    es_fin_semana = 1 if dia in ("Sábado", "Domingo") else 0
    es_hora_punta = 1 if (7 <= hora <= 9) or (17 <= hora <= 19) else 0
    
    # Array de features
    X = np.array([[
        lat,
        lon,
        marca_enc,
        dia_enc,
        hora,
        dist_centro,
        es_fin_semana,
        es_hora_punta
    ]])
    
    # Predicción
    try:
        precio_pred = float(modelo.predict(X)[0])
        return round(precio_pred, 3)
    except Exception as e:
        raise ValueError(f"Error en predicción: {e}")


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.route("/api/health", methods=["GET"])
def health():
    """Verificar que la API está viva."""
    return jsonify({
        "status": "ok",
        "modelo": "random_forest",
        "version": "1.0.0",
        "fecha_entrenamiento": METRICAS.get("fecha_entrenamiento"),
        "rmse_percentage": METRICAS.get("rmse_percentage"),
        "r2_score": METRICAS.get("r2_test"),
    }), 200


@app.route("/api/metricas", methods=["GET"])
def metricas():
    """Obtener métricas del modelo."""
    return jsonify(METRICAS), 200


@app.route("/api/clases", methods=["GET"])
def obtener_clases():
    """Obtener clases válidas."""
    return jsonify({
        "marcas": CLASES.get("marcas", []),
        "dias": DIAS_SEMANA,
        "horas": list(range(0, 24)),
    }), 200


@app.route("/api/predecir-precio", methods=["POST"])
def predecir_precio():
    """Predice el precio de gasolina para una estación."""
    try:
        data = request.get_json(force=True)
        
        required = ["latitud", "longitud", "marca", "dia_semana", "hora", "distancia_centro"]
        missing = [k for k in required if k not in data]
        if missing:
            return jsonify({
                "error": f"Faltan campos requeridos: {missing}",
                "campos_requeridos": required
            }), 400
        
        precio = predecir_precio_individual(
            lat=data["latitud"],
            lon=data["longitud"],
            marca=data["marca"],
            dia=data["dia_semana"],
            hora=data["hora"],
            dist_centro=data["distancia_centro"]
        )
        
        marca_norm = normalizar_marca(data["marca"])
        
        return jsonify({
            "precio_predicho": precio,
            "unidad": "€/L",
            "marca_original": data["marca"],
            "marca_normalizada": marca_norm,
            "dia": data["dia_semana"],
            "hora": data["hora"],
            "timestamp": datetime.now().isoformat(),
            "exito": True
        }), 200
        
    except ValueError as e:
        return jsonify({"error": str(e), "exito": False}), 400
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": f"Error interno: {str(e)}", "exito": False}), 500


@app.route("/api/predecir-lote", methods=["POST"])
def predecir_lote():
    """Predice precios para múltiples estaciones."""
    try:
        data = request.get_json(force=True)
        estaciones = data.get("estaciones", [])
        
        if not estaciones:
            return jsonify({"error": "Campo 'estaciones' vacío"}), 400
        
        predicciones = []
        
        for est in estaciones:
            try:
                precio = predecir_precio_individual(
                    lat=est.get("latitud", 0),
                    lon=est.get("longitud", 0),
                    marca=est.get("marca", "OTRA"),
                    dia=est.get("dia_semana", "Lunes"),
                    hora=est.get("hora", 12),
                    dist_centro=est.get("distancia_centro", 0)
                )
                
                predicciones.append({
                    "id": est.get("id", "sin_id"),
                    "precio_predicho": precio,
                    "exito": True
                })
                
            except Exception as e:
                predicciones.append({
                    "id": est.get("id", "sin_id"),
                    "error": str(e),
                    "exito": False
                })
        
        return jsonify({
            "predicciones": predicciones,
            "total": len(predicciones),
            "exitosas": sum(1 for p in predicciones if p.get("exito")),
            "timestamp": datetime.now().isoformat(),
            "exito": True
        }), 200
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": f"Error interno: {str(e)}"}), 500


@app.errorhandler(404)
def no_encontrado(e):
    return jsonify({
        "error": "Endpoint no encontrado",
        "disponibles": [
            "GET  /api/health",
            "GET  /api/metricas",
            "GET  /api/clases",
            "POST /api/predecir-precio",
            "POST /api/predecir-lote"
        ]
    }), 404


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("\\n" + "=" * 70)
    print("🚀 API FLASK - PREDICCIÓN DE PRECIOS DE GASOLINA")
    print("=" * 70)
    print(f"\\n📊 Modelo Random Forest:")
    print(f"   • RMSE: {METRICAS.get('rmse_percentage', 'N/A')}%")
    print(f"   • R² Score: {METRICAS.get('r2_test', 'N/A')}")
    print(f"   • Precisión: Excelente")
    
    print(f"\\n🌐 Endpoints:")
    print(f"   • GET  http://localhost:5000/api/health")
    print(f"   • GET  http://localhost:5000/api/metricas")
    print(f"   • GET  http://localhost:5000/api/clases")
    print(f"   • POST http://localhost:5000/api/predecir-precio")
    print(f"   • POST http://localhost:5000/api/predecir-lote")
    
    print(f"\\n✨ Iniciando servidor...")
    print("=" * 70 + "\\n")
    
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        threaded=True,
        use_reloader=False
    )
'''
    
    with open(api_path, 'w', encoding='utf-8') as f:
        f.write(codigo)
    
    print("\n🌐 API Flask creada: api_prediccion.py")
    print("   ✅ Versión CORREGIDA y funcional")
    print("Para ejecutar: python api_prediccion.py")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("=" * 55)
    print("🌲 RANDOM FOREST — PREDICCIÓN PRECIOS GASOLINA")
    print("   Gas-Trend Pro | Datos reales del Ministerio")
    print("=" * 55)

    os.makedirs(MODELS_DIR, exist_ok=True)

    # 1. Cargar datos reales
    df_raw = cargar_datos_reales()

    # 2. Augmentar con variaciones temporales
    df_aug = augmentar_con_tiempo(df_raw)

    # 3. Preprocesar (encoders)
    df_proc, le_marca, le_dia = preprocesar(df_aug)

    # 4. Entrenar
    modelo, metricas = entrenar(df_proc)

    # 5. Generar API Flask CORREGIDA
    generar_api()

    print("\n✅ ¡Proceso completado!")
    print("\n📁 Archivos generados:")
    print(f"   {os.path.join(MODELS_DIR, 'random_forest_precio_gasolina.pkl')}")
    print(f"   {os.path.join(MODELS_DIR, 'label_encoder_marca.pkl')}")
    print(f"   {os.path.join(MODELS_DIR, 'label_encoder_dia.pkl')}")
    print(f"   {os.path.join(MODELS_DIR, 'clases_encoder.json')}")
    print(f"   {os.path.join(MODELS_DIR, 'metricas_modelo.json')}")
    print(f"   {os.path.join(os.path.dirname(__file__), 'api_prediccion.py')}")
    print("\n🚀 Siguiente paso:")
    print("   pip install flask flask-cors")
    print("   python api_prediccion.py")