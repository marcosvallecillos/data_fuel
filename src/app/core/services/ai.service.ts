import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly http = inject(HttpClient);
  private readonly API_KEY = ''; // Se cargará desde configuración segura
  private readonly API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  /**
   * Genera un consejo amigable usando Groq (Grok)
   * @param hoy Precio medio hoy
   * @param manana Precio estimado mañana
   * @param zona Nombre de la zona/comarca
   */
  getConsejoExperto(hoy: number, manana: number, zona: string): Observable<string> {
    const prompt = `Eres un asesor energético experto en el sector de las gasolineras en la Comunidad Valenciana. 
    Analiza los datos:
    - Precio medio actual en ${zona}: ${hoy} €/L
    - Precio estimado para mañana en ${zona}: ${manana} €/L
    
    Tu tarea:
    Escribir un consejo breve (máximo 20 palabras), práctico y claro para el usuario de nuestra app.
    El tono debe ser cercano y útil, como de "colega a colega".
    
    Recomendaciones:
    1. Si el precio va a BAJAR mañana (manana < hoy), el consejo debe invitar a REPOSTAR MAÑANA. 
       Ejemplo: "¡Buenas noticias! Mañana bajan los precios en ${zona}. Mejor esperar para llenar el depósito." 
    2. Si el precio va a SUBIR mañana (manana > hoy), el consejo debe recomendar REPOSTAR HOY. 
       Ejemplo: "¡Ojo! Mañana sube la gasolina en ${zona}. Si puedes, aprovecha hoy y llena el depósito." 
    
    Formato de salida:
    - Solo el texto del consejo. 
    - Sin emoticonos.
    - Sin introducciones ni coletillas (ej. "Aquí tienes tu consejo:").
    - Máximo 20 palabras.
    - Incluye siempre el nombre de la zona: "${zona}".`;

    const body = {
      model: 'llama-3.1-8b-instant', 
      messages: [
        { role: 'system', content: 'Eres un experto en ahorro de combustible.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 150
    };

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.API_KEY}`,
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(this.API_URL, body, { headers }).pipe(
      map(response => response.choices[0].message.content.trim()),
      catchError(err => {
        console.error('Error detallado de Groq:', err);
        if (err.error && err.error.error) {
          console.error('Mensaje de la API:', err.error.error.message);
        }
        return throwError(() => err);
      })
    );
  }
}
