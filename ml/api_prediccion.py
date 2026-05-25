"""
API Flask - Predicción de Precios de Combustible
Gas-Trend Pro | Puerto 5000
"""
import os
import json
import joblib
import numpy as np
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

BASE = os.path.dirname(__file__)
MODELS = os.path.join(BASE, "models")

app = Flask(__name__)
CORS(app)

# ── Carga de artefactos ────────────────────────────────────────────
modelo   = joblib.load(os.path.join(MODELS, "random_forest_precio_gasolina.pkl"))
le_marca = joblib.load(os.path.join(MODELS, "label_encoder_marca.pkl"))
le_dia   = joblib.load(os.path.join(MODELS, "label_encoder_dia.pkl"))

with open(os.path.join(MODELS, "clases_encoder.json"), encoding="utf-8") as f:
    CLASES = json.load(f)

with open(os.path.join(MODELS, "metricas_modelo.json"), encoding="utf-8") as f:
    METRICAS = json.load(f)

FEATURES = [
    "latitud", "longitud",
    "marca_encoded", "dia_encoded",
    "hora", "distancia_centro_km",
    "es_fin_semana", "es_hora_punta",
]

DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def encode_marca(marca: str) -> int:
    m = str(marca).upper().strip()
    # Normalizar a clase conocida
    for cls in CLASES["marcas"]:
        if cls in m or m in cls:
            return int(le_marca.transform([cls])[0])
    return int(le_marca.transform(["OTRA"])[0]) if "OTRA" in CLASES["marcas"] else 0


def encode_dia(dia: str) -> int:
    if dia in CLASES["dias"]:
        return int(le_dia.transform([dia])[0])
    return 0


def predecir(lat, lon, marca, dia, hora, dist_centro):
    marca_enc = encode_marca(marca)
    dia_enc   = encode_dia(dia)
    fin_sem   = 1 if dia in ("Sábado", "Domingo") else 0
    hora_punta = 1 if (7 <= hora <= 9 or 17 <= hora <= 19) else 0
    X = np.array([[lat, lon, marca_enc, dia_enc, hora, dist_centro, fin_sem, hora_punta]])
    return round(float(modelo.predict(X)[0]), 3)


# ── Endpoints ──────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "modelo": "random_forest",
        "fecha_entrenamiento": METRICAS.get("fecha_entrenamiento"),
        "rmse_percentage": METRICAS.get("rmse_percentage"),
    })


@app.route("/api/metricas", methods=["GET"])
def metricas():
    return jsonify(METRICAS)


@app.route("/api/predecir-precio", methods=["POST"])
def predecir_precio():
    """
    Body JSON:
    {
      "latitud": 39.47, "longitud": -0.38,
      "marca": "REPSOL",
      "dia_semana": "Viernes",
      "hora": 18,
      "distancia_centro": 2.5
    }
    """
    try:
        d = request.get_json(force=True)
        required = ["latitud", "longitud", "marca", "dia_semana", "hora", "distancia_centro"]
        missing = [k for k in required if k not in d]
        if missing:
            return jsonify({"error": f"Faltan campos: {missing}"}), 400

        precio = predecir(
            lat=float(d["latitud"]),
            lon=float(d["longitud"]),
            marca=str(d["marca"]),
            dia=str(d["dia_semana"]),
            hora=int(d["hora"]),
            dist_centro=float(d["distancia_centro"]),
        )
        return jsonify({
            "precio_predicho": precio,
            "unidad": "€/L",
            "marca_normalizada": str(d["marca"]).upper(),
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/predecir-lote", methods=["POST"])
def predecir_lote():
    """
    Body JSON: { "estaciones": [ {...}, ... ] }
    Cada estación igual que predecir-precio.
    """
    try:
        estaciones = request.get_json(force=True).get("estaciones", [])
        resultados = []
        manana = DIAS[(datetime.now().weekday() + 1) % 7]
        hora_manana = 12

        for est in estaciones:
            try:
                precio = predecir(
                    lat=float(est.get("latitud", 0)),
                    lon=float(est.get("longitud", 0)),
                    marca=str(est.get("marca", "OTRA")),
                    dia=manana,
                    hora=hora_manana,
                    dist_centro=float(est.get("distancia_centro", 5)),
                )
                resultados.append({
                    "id": est.get("id"),
                    "precio_manana": precio,
                    "dia_prediccion": manana,
                })
            except Exception:
                resultados.append({"id": est.get("id"), "precio_manana": None})

        return jsonify({
            "predicciones": resultados,
            "dia_prediccion": manana,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🚀 API de predicción iniciada en http://localhost:5000")
    print("   Endpoints disponibles:")
    print("   GET  /api/health")
    print("   GET  /api/metricas")
    print("   POST /api/predecir-precio")
    print("   POST /api/predecir-lote")
    app.run(host="0.0.0.0", port=5000, debug=False)
