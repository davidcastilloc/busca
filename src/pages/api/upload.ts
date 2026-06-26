import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { FOTOS_BUCKET } = env;
    const formData = await context.request.formData();
    const file = formData.get("foto");

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No se envió archivo de foto válido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const key = `fotos/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
    const arrayBuffer = await file.arrayBuffer();

    await FOTOS_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || "image/jpeg" }
    });

    return new Response(JSON.stringify({ key }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en upload API:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const GET: APIRoute = async (context) => {
  try {
    const { FOTOS_BUCKET } = env;
    const url = new URL(context.request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return new Response("Falta el parámetro 'key'", { status: 400 });
    }

    const object = await FOTOS_BUCKET.get(key);

    if (!object) {
      return new Response("Archivo no encontrado", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, {
      headers
    });
  } catch (error: any) {
    console.error("Error sirviendo archivo R2:", error);
    return new Response(error.message, { status: 500 });
  }
};
