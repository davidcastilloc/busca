interface EntidadesExtraidas {
  nombre?: string;
  apellido?: string;
  edad?: number;
  sexo?: 'M' | 'F' | 'X';
  vestimenta?: string;
  ubicacion?: string;
  señas_particulares?: string;
}

export async function extraerEntidades(env: Env, texto: string): Promise<EntidadesExtraidas> {
  try {
    const prompt = `Eres un extractor de entidades para una base de datos de personas desaparecidas en una catástrofe.
Extrae la información estructurada del siguiente texto.
Responde estrictamente en formato JSON utilizando este esquema exacto:
{
  "nombre": "Nombre de la persona si está disponible",
  "apellido": "Apellido si está disponible",
  "edad": número de años (entero) o null si no se menciona,
  "sexo": "M" para masculino, "F" para femenino, "X" para no binario/desconocido, o null si no se especifica,
  "vestimenta": "Descripción corta de la ropa descrita",
  "ubicacion": "Último lugar conocido o avistamiento mencionado",
  "señas_particulares": "Tatuajes, cicatrices, accesorios u otros rasgos identificativos"
}
Si un campo no se menciona en absoluto, pon null. No añadas explicaciones, solo devuelve el JSON.`;

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: texto }
      ],
      response_format: { type: "json_object" }
    });

    if (response && response.response) {
      return JSON.parse(response.response);
    }
    
    return {};
  } catch (error) {
    console.error("Error al extraer entidades con Workers AI:", error);
    return {};
  }
}

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

export async function generarEmbeddingsBatch(env: Env, textos: string[]): Promise<number[][]> {
  try {
    const response = await env.AI.run("@cf/baai/bge-m3", {
      text: textos
    });

    if (response && response.data) {
      return response.data;
    }
    throw new Error("No se obtuvieron datos de embedding en lote");
  } catch (error) {
    console.error("Error al generar embeddings en lote con Workers AI:", error);
    throw error;
  }
}
