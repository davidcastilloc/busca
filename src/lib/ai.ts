
export async function generarEmbedding(env: Env, texto: string): Promise<number[]> {
  try {
    const response = await env.AI.run("@cf/baai/bge-m3", {
      text: [texto]
    });

    if (response && response.data && response.data[0]) {
      return response.data[0];
    }
    throw new Error("No se obtuvieron datos de embedding");
  } catch (error) {
    console.error("Error al generar embedding con Workers AI:", error);
    throw error;
  }
}


export async function extraerNombresDeImagen(env: Env, imageBuffer: ArrayBuffer): Promise<any[]> {
  const visionModel = "@cf/meta/llama-3.2-11b-vision-instruct";
  const instructModel = "@cf/meta/llama-3.1-8b-instruct-fast";
  
  try {
    // Paso 1: Transcribir la imagen de forma plana usando Llama Vision
    const transcribePrompt = `You are an expert transcriber. Transcribe all text, names, numbers, and handwritten content from this image as accurately as possible. Output the lines exactly as they appear in the image, line by line. Do not write introductory or concluding text, do not explain anything, just output the raw transcription. If the writing is cursive or messy, try your best to decipher it character by character.`;

    let visionResponse;
    let retries = 3;
    while (retries > 0) {
      try {
        visionResponse = await env.AI.run(visionModel, {
          prompt: transcribePrompt,
          image: [...new Uint8Array(imageBuffer)],
          max_tokens: 2048
        });
        break; // Éxito
      } catch (err: any) {
        const errMsg = err.message || String(err);
        if (errMsg.includes("5016") || errMsg.toLowerCase().includes("agree")) {
          console.log("Detectado requisito de licencia de Meta. Enviando 'agree'...");
          try {
            await env.AI.run(visionModel, { prompt: "agree" });
            console.log("Acuerdo enviado. Reintentando transcripción...");
            visionResponse = await env.AI.run(visionModel, {
              prompt: transcribePrompt,
              image: [...new Uint8Array(imageBuffer)],
              max_tokens: 2048
            });
            break;
          } catch (agreeErr) {
            console.error("Fallo al enviar acuerdo de licencia 'agree':", agreeErr);
            throw err;
          }
        } else {
          retries--;
          console.warn(`Error en IA Vision (${errMsg}). Reintentos restantes: ${retries}`);
          if (retries === 0) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    const transcripcionRaw = typeof visionResponse?.response === "string" 
      ? visionResponse.response 
      : String(visionResponse?.response || "");

    if (!transcripcionRaw.trim()) {
      console.warn("La transcripción de la imagen resultó vacía.");
      return [];
    }

    console.log("Transcripción de imagen obtenida con éxito:\n", transcripcionRaw);

    // Paso 2: Extraer nombres estructurados usando la función reutilizable
    return await extraerNombresDeTexto(env, transcripcionRaw);
  } catch (error) {
    console.error("Error en el pipeline de transcripción/extracción con IA:", error);
    return [];
  }
}

export async function extraerNombresDeTexto(env: Env, texto: string): Promise<{ nombre: string, cedula: number|null, telefono: string|null, edad: number|null, raw_context: string }[]> {
  const instructModel = "@cf/meta/llama-3.1-8b-instruct-fast";
  try {
    const parsePrompt = `Actúa como un motor de ETL (Extract, Transform, Load) especializado en datos demográficos venezolanos. Tu tarea es procesar listas de texto no estructuradas y convertirlas a un formato JSON limpio y estandarizado.

### Reglas de Procesamiento:
1. **Salida Estricta:** Responde ÚNICAMENTE con un objeto JSON que contenga el array 'personas'. No incluyas explicaciones, saludos ni texto adicional.
2. **Normalización de Campos:**
    - \`nombre\`: Elimina cualquier número o código que esté pegado al nombre.
    - \`cedula\`: Si contiene números con puntos (ej: 15.370.185), elimínalos para dejar solo el entero (15370185). Si no tiene, asigna null.
    - \`telefono\`: Filtra números. Si empieza por 0412, 0414, 0416, 0424, 0414, formatea como cadena de texto. Si no, asigna null.
    - \`edad\`: Si hay un número entre paréntesis o claramente al lado del nombre, extráelo como entero. Si no, null.
    - \`raw_context\`: Mantén la línea original para trazabilidad.
3. **Manejo de Errores:** Si un registro no tiene datos suficientes, intenta inferir por contexto, pero si es imposible, marca el campo como null. No inventes datos.
4. **Validación:** Si detectas duplicados potenciales (mismo nombre o cédula similar), agrúpalos si es posible o márcalos en un flag de \`warning\`.

### Formato de Salida (JSON Schema):
{
  "personas": [
    {
      "nombre": "String",
      "cedula": "Int|null",
      "telefono": "String|null",
      "edad": "Int|null",
      "raw_context": "String"
    }
  ]
}

### Ejemplo de Procesamiento:
Input: "1- Naigui Ruitino (52) 12/04/2/19"
Output: {"personas": [{"nombre": "Naigui Ruitino", "cedula": null, "telefono": null, "edad": 52, "raw_context": "1- Naigui Ruitino (52) 12/04/2/19"}]}

Input: "Miguel Gutierrez (46) 15.370.185"
Output: {"personas": [{"nombre": "Miguel Gutierrez", "cedula": 15370185, "telefono": null, "edad": 46, "raw_context": "Miguel Gutierrez (46) 15.370.185"}]}`;

    let instructResponse;
    let instructRetries = 3;
    while (instructRetries > 0) {
      try {
        instructResponse = await env.AI.run(instructModel, {
          messages: [
            { role: "system", content: parsePrompt },
            { role: "user", content: texto }
          ],
          response_format: { type: "json_object" },
          max_tokens: 4096
        });
        break;
      } catch (err: any) {
        const errMsg = err.message || String(err);
        instructRetries--;
        console.warn(`Error en IA Instruct (${errMsg}). Reintentos restantes: ${instructRetries}`);
        if (instructRetries === 0) throw err;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let rawPersonas: { nombre: string, cedula: number|null, telefono: string|null, edad: number|null, raw_context: string }[] = [];

    if (instructResponse && instructResponse.response) {
      if (typeof instructResponse.response === "object" && instructResponse.response !== null) {
        const obj = instructResponse.response as any;
        rawPersonas = obj.personas || [];
      } else {
        let parseResultRaw = String(instructResponse.response).trim();

        if (parseResultRaw.startsWith("```json")) {
          parseResultRaw = parseResultRaw.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (parseResultRaw.startsWith("```")) {
          parseResultRaw = parseResultRaw.replace(/^```/, "").replace(/```$/, "").trim();
        }

        try {
          const parsed = JSON.parse(parseResultRaw);
          rawPersonas = parsed.personas || [];
        } catch (parseErr) {
          console.error("Error al parsear JSON de Llama Instruct:", parseResultRaw, parseErr);
          // Fallback manual para extraer objetos incluso si el string se cortó
          const matches = parseResultRaw.match(/\{[^}]*"nombre"[^}]*\}/g);
          if (matches) {
            for (const match of matches) {
              try {
                rawPersonas.push(JSON.parse(match));
              } catch (e) {}
            }
          }
        }
      }
    }

    // Limpiar nombres y devolver tal cual para UI
    const personasLimpia: { nombre: string, cedula: number|null, telefono: string|null, edad: number|null, raw_context: string }[] = [];
    for (const p of rawPersonas) {
      if (!p.nombre) continue;
      let cleanName = p.nombre;
      cleanName = cleanName.replace(/^[0-9.-]+\s*/, "").replace(/[\[\]]/g, "").trim();
      
      if (cleanName.length > 2) {
        personasLimpia.push({
          nombre: cleanName,
          cedula: p.cedula || null,
          telefono: p.telefono || null,
          edad: p.edad || null,
          raw_context: p.raw_context || ""
        });
      }
    }

    return personasLimpia;
  } catch (error) {
    console.error("Error al extraer nombres del texto con IA:", error);
    return [];
  }
}


