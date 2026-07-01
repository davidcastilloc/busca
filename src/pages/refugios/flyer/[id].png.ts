import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "cf-workers-og";
import { CATEGORIAS_INVENTARIO } from "../../../lib/items";
import { Buffer } from "node:buffer";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const { DB, FOTOS_BUCKET } = env as any;

    if (!DB || !id) {
      return new Response("Base de datos no disponible", { status: 500 });
    }

    // 1. Obtener datos del refugio/acopio/hospital
    let refugio = (await DB.prepare("SELECT *, 'refugio' as tipo FROM refugios WHERE id = ?").bind(id).first()) as any;
    if (!refugio) {
      refugio = (await DB.prepare("SELECT *, 'centro_acopio' as tipo FROM centros_acopio WHERE id = ?").bind(id).first()) as any;
    }
    if (!refugio) {
      refugio = (await DB.prepare("SELECT *, 'hospital' as tipo FROM hospitales WHERE id = ?").bind(id).first()) as any;
    }

    if (!refugio) {
      return new Response("Centro no encontrado", { status: 404 });
    }

    // 2. Procesar inventario para Semáforo
    let itemsCriticos: string[] = [];
    let itemsAlerta: string[] = [];
    if (refugio.inventario) {
      try {
        const inv = typeof refugio.inventario === "string" ? JSON.parse(refugio.inventario) : refugio.inventario;
        const allItems = CATEGORIAS_INVENTARIO.flatMap((c) => c.items);
        for (const [itemId, estado] of Object.entries(inv)) {
          const itemObj = allItems.find((i) => i.id === itemId);
          if (itemObj) {
            if (estado === "Crítico") itemsCriticos.push(itemObj.nombre);
            else if (estado === "Alerta") itemsAlerta.push(itemObj.nombre);
          }
        }
      } catch (err) {
        console.error("Error parseando inventario:", err);
      }
    }

    const esRojo = itemsCriticos.length > 0;
    const esAmarillo = !esRojo && itemsAlerta.length > 0;
    const themeColor = esRojo ? "#ef4444" : esAmarillo ? "#f59e0b" : "#10b981"; // Rojo, Amarillo, Verde
    const themeBg = esRojo ? "#fef2f2" : esAmarillo ? "#fffbeb" : "#ecfdf5";
    const emojiSemaforo = esRojo ? "🔴" : esAmarillo ? "🟡" : "🟢";
    const estadoSemaforo = esRojo ? "CRÍTICO" : esAmarillo ? "ALERTA" : "ESTABLE";

    // 3. Obtener fotos
    let fotosArray: string[] = [];
    if (refugio.fotos) {
      try {
        fotosArray = typeof refugio.fotos === "string" ? JSON.parse(refugio.fotos) : refugio.fotos;
      } catch {}
    }

    // 4. Descargar fuente Roboto TTF
    const fontResponse = await fetch("https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf");
    if (!fontResponse.ok) throw new Error("No se pudo descargar la fuente");
    const fontBuffer = await fontResponse.arrayBuffer();

    // 5. Descargar la primera foto si existe
    let base64Image = "";
    if (fotosArray.length > 0 && FOTOS_BUCKET) {
      try {
        const fotoKey = fotosArray[0];
        const object = await FOTOS_BUCKET.get(fotoKey);
        if (object) {
          const bytes = await object.arrayBuffer();
          // Límite de seguridad: WASM / Resvg colapsa (OOM) con imágenes raw muy pesadas
          // Saltamos imágenes mayores a 1.5MB para evitar el RuntimeError: unreachable
          if (bytes.byteLength < 1.5 * 1024 * 1024) {
            const base64 = Buffer.from(bytes).toString('base64');
            const ext = fotoKey.split('.').pop() || 'jpeg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            base64Image = `data:${mime};base64,${base64}`;
          } else {
            console.warn(`Foto demasiado grande para el flyer: ${bytes.byteLength} bytes. Se omitirá para prevenir crash WASM.`);
          }
        }
      } catch (err) {
        console.error("Error al obtener foto de R2:", err);
      }
    }

    // 6. Descargar QR
    let base64QR = "";
    try {
      const siteUrl = "https://dondeestan.org";
      const qrResponse = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(siteUrl)}`);
      if (qrResponse.ok) {
        const qrBytes = await qrResponse.arrayBuffer();
        base64QR = `data:image/png;base64,${Buffer.from(qrBytes).toString('base64')}`;
      }
    } catch (err) {
      console.error("Error generando QR:", err);
    }

    // 7. Preparar "Ficha" estructurada
    const descriptionChildren: any[] = [];
    const fieldStyle = { display: "flex", flexDirection: "column" as any, marginBottom: "8px" };
    const labelStyle = { display: "flex", fontSize: "11px", fontWeight: "bold", color: themeColor, textTransform: "uppercase" as any, marginBottom: "2px" };
    const valueStyle = { display: "flex", fontSize: "13px", color: "#374151", lineHeight: "1.3" };

    if (refugio.direccion) {
      descriptionChildren.push({
        type: "div", props: { style: fieldStyle, children: [
          { type: "span", props: { style: labelStyle, children: "📍 Dirección" } },
          { type: "span", props: { style: valueStyle, children: refugio.direccion } }
        ]}
      });
    }

    if (refugio.tipo === "refugio") {
      descriptionChildren.push({
        type: "div", props: { style: fieldStyle, children: [
          { type: "span", props: { style: labelStyle, children: "👥 Capacidad" } },
          { type: "span", props: { style: valueStyle, children: `${refugio.ocupacion_actual || 0} de ${refugio.capacidad_maxima || '?'} personas` } }
        ]}
      });
    }

    if (itemsCriticos.length > 0) {
      descriptionChildren.push({
        type: "div", props: { style: fieldStyle, children: [
          { type: "span", props: { style: { ...labelStyle, color: "#ef4444" }, children: "🔴 NECESIDADES URGENTES" } },
          { type: "span", props: { style: valueStyle, children: itemsCriticos.join(", ") } }
        ]}
      });
    } else if (itemsAlerta.length > 0) {
      descriptionChildren.push({
        type: "div", props: { style: fieldStyle, children: [
          { type: "span", props: { style: { ...labelStyle, color: "#f59e0b" }, children: "🟡 EN ALERTA (Requiere Pronto)" } },
          { type: "span", props: { style: valueStyle, children: itemsAlerta.join(", ") } }
        ]}
      });
    }

    if (refugio.necesidades) {
      const truncated = refugio.necesidades.length > 150 ? refugio.necesidades.substring(0, 150) + "..." : refugio.necesidades;
      descriptionChildren.push({
        type: "div", props: { style: { display: "flex", flexDirection: "column" as any }, children: [
          { type: "span", props: { style: labelStyle, children: "📝 Notas / Requerimientos Adicionales" } },
          { type: "span", props: { style: valueStyle, children: truncated } }
        ]}
      });
    }

    const tipoText = refugio.tipo === "centro_acopio" ? "CENTRO DE ACOPIO" : refugio.tipo === "hospital" ? "HOSPITAL / SALUD" : "REFUGIO";

    // 8. Generar diseño HTML/CSS para ImageResponse
    return ImageResponse.create(
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            width: "600px",
            height: "800px",
            backgroundColor: "#ffffff",
            padding: "24px",
            boxSizing: "border-box",
            borderTop: `16px solid ${themeColor}`,
            fontFamily: "Roboto",
          },
          children: [
            // Header
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                  width: "100%",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        backgroundColor: themeColor,
                        color: "#ffffff",
                        padding: "6px 16px",
                        fontSize: "14px",
                        fontWeight: "bold",
                        letterSpacing: "2px",
                        borderRadius: "4px",
                      },
                      children: tipoText,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        fontSize: "18px",
                        fontWeight: "bold",
                        color: themeColor,
                        backgroundColor: themeBg,
                        padding: "4px 12px",
                        borderRadius: "16px"
                      },
                      children: `${emojiSemaforo} ${estadoSemaforo}`,
                    },
                  },
                ],
              },
            },
            
            // Título
            {
              type: "h1",
              props: {
                style: {
                  display: "flex",
                  fontSize: "32px",
                  fontWeight: "900",
                  color: "#111827",
                  margin: "0 0 12px 0",
                  lineHeight: "1.1",
                  textTransform: "uppercase",
                },
                children: refugio.nombre,
              },
            },

            // Imagen (CONDICIONAL)
            ...(base64Image ? [{
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  height: "380px",
                  backgroundColor: "#f3f4f6",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                  marginBottom: "12px",
                },
                children: {
                  type: "img",
                  props: {
                    src: base64Image,
                    style: {
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    },
                  },
                }
              },
            }] : []),

            // Descripción Ficha
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: themeBg,
                  padding: "12px",
                  borderRadius: "8px",
                  borderLeft: `5px solid ${themeColor}`,
                  flex: "1",
                  maxHeight: base64Image ? "200px" : "600px",
                  overflow: "hidden",
                },
                children: descriptionChildren,
              },
            },

            // Footer
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  borderTop: "2px solid #f3f4f6",
                  paddingTop: "16px",
                  marginTop: "auto",
                  width: "100%",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                      },
                      children: [
                        {
                          type: "span",
                          props: {
                            style: { display: "flex", fontSize: "14px", color: "#6b7280", marginBottom: "4px" },
                            children: refugio.contacto ? "¿PUEDES AYUDAR?" : "INFO",
                          },
                        },
                        {
                          type: "span",
                          props: {
                            style: { display: "flex", fontSize: "28px", fontWeight: "bold", color: themeColor },
                            children: refugio.contacto || "Acércate a ayudar",
                          },
                        },
                        {
                          type: "span",
                          props: {
                            style: { display: "flex", fontSize: "14px", color: "#374151", marginTop: "4px", fontWeight: "bold" },
                            children: "dondeestan.org",
                          },
                        },
                      ],
                    },
                  },
                  base64QR
                    ? {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                          },
                          children: [
                            {
                              type: "span",
                              props: {
                                style: { display: "flex", fontSize: "10px", color: "#9ca3af", marginBottom: "4px" },
                                children: "ESCANEA",
                              },
                            },
                            {
                              type: "span",
                              props: {
                                style: { display: "flex", fontSize: "10px", color: "#9ca3af", marginBottom: "4px" },
                                children: "PARA MÁS INFO",
                              },
                            },
                            {
                              type: "img",
                              props: {
                                src: base64QR,
                                style: { width: "70px", height: "70px" },
                              },
                            },
                          ],
                        },
                      }
                    : { type: "div", props: { children: [] } },
                ],
              },
            },
          ],
        },
      },
      {
        width: 600,
        height: 800,
        fonts: [
          {
            name: "Roboto",
            data: fontBuffer,
            weight: 400,
            style: "normal",
          },
        ],
      }
    );
  } catch (error: any) {
    console.error("Error al generar el flyer de refugio:", error);
    return new Response(`Error generando la imagen: ${error.message}`, { status: 500 });
  }
};
