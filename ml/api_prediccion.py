"""
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
    print("\n" + "=" * 70)
    print("🚀 API FLASK - PREDICCIÓN DE PRECIOS DE GASOLINA")
    print("=" * 70)
    print(f"\n📊 Modelo Random Forest:")
    print(f"   • RMSE: {METRICAS.get('rmse_percentage', 'N/A')}%")
    print(f"   • R² Score: {METRICAS.get('r2_test', 'N/A')}")
    print(f"   • Precisión: Excelente")
    
    print(f"\n🌐 Endpoints:")
    print(f"   • GET  http://localhost:5000/api/health")
    print(f"   • GET  http://localhost:5000/api/metricas")
    print(f"   • GET  http://localhost:5000/api/clases")
    print(f"   • POST http://localhost:5000/api/predecir-precio")
    print(f"   • POST http://localhost:5000/api/predecir-lote")
    
    print(f"\n✨ Iniciando servidor...")
    print("=" * 70 + "\n")
    
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        threaded=True,
        use_reloader=False
    )
