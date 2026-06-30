import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ImageResponse } from "cf-workers-og";
import { Buffer } from "node:buffer";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const { DB, FOTOS_BUCKET } = env as any;

    if (!DB || !id) {
      return new Response("Base de datos no disponible", { status: 500 });
    }

    // 1. Obtener datos del flyer
    const flyer = await DB.prepare("SELECT * FROM flyers WHERE id = ?").bind(id).first<any>();
    if (!flyer) {
      return new Response("Flyer no encontrado", { status: 404 });
    }

    const phones: string[] = JSON.parse(flyer.phones || "[]");
    const socials: string[] = JSON.parse(flyer.socials || "[]");

    // 3. Descargar fuente Roboto TTF
    const fontResponse = await fetch("https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf");
    if (!fontResponse.ok) throw new Error("No se pudo descargar la fuente");
    const fontBuffer = await fontResponse.arrayBuffer();

    // 4. Descargar foto de R2 si existe y codificar a Base64
    let base64Image = "";
    if (flyer.foto_key && FOTOS_BUCKET) {
      try {
        const object = await FOTOS_BUCKET.get(flyer.foto_key);
        if (object) {
          const bytes = await object.arrayBuffer();
          // Límite de seguridad: WASM / Resvg colapsa con OOM
          if (bytes.byteLength < 1.5 * 1024 * 1024) {
            // Conversión rápida con Buffer de NodeJS
            const base64 = Buffer.from(bytes).toString('base64');
            const ext = flyer.foto_key.split('.').pop() || 'jpeg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            base64Image = `data:${mime};base64,${base64}`;
          } else {
            console.warn(`Foto persona demasiado grande: ${bytes.byteLength} bytes. Se omitirá para prevenir crash.`);
          }
        }
      } catch (err) {
        console.error("Error al obtener foto de R2 para el flyer:", err);
      }
    }

    // 5. Generar QR Code
    let base64QR = "";
    try {
      const siteUrl = "https://dondeestan.org";
      const flyerUrl = `${siteUrl}/flyer/${id}`;
      const qrResponse = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(flyerUrl)}`);
      if (qrResponse.ok) {
        const qrBytes = await qrResponse.arrayBuffer();
        base64QR = `data:image/png;base64,${Buffer.from(qrBytes).toString('base64')}`;
      }
    } catch (err) {
      console.error("Error al generar QR para el flyer:", err);
    }

    // 6. Configurar colores y emojis según el tipo de flyer
    let themeColor = "#ef4444"; // Rojo (Desaparecido / Emergencia)
    let tipoEmoji = "🔴";
    let tipoLabel = "SE BUSCA";

    if (flyer.tipo === "refugio") {
      themeColor = "#3b82f6"; // Azul
      tipoEmoji = "🏠";
      tipoLabel = "REFUGIO ACTIVO";
    } else if (flyer.tipo === "necesidad") {
      themeColor = "#a855f7"; // Morado
      tipoEmoji = "📦";
      tipoLabel = "NECESIDAD CRÍTICA";
    } else if (flyer.tipo === "encontrado") {
      themeColor = "#10b981"; // Verde
      tipoEmoji = "✅";
      tipoLabel = "PERSONA LOCALIZADA";
    }

    // 7. Limpiar datos para el diseño
    let cleanTitle = flyer.title || "DESCONOCIDO";
    cleanTitle = cleanTitle.replace(/^(SE BUSCA:|ALERTA AMBER:|ALERTA:|URGENTE:)\s*/i, "").trim().toUpperCase();

    let rawDescription = flyer.description || "";
    
    let ubicaciones: string[] = [];
    rawDescription = rawDescription.replace(/\[UBICACIÓN:\s*(.*?)\]/gi, (match, p1) => {
      if (p1.trim()) ubicaciones.push(p1.trim());
      return "";
    });

    let ultimoContacto = "";
    rawDescription = rawDescription.replace(/\[FECHA ÚLTIMO CONTACTO:\s*(.*?)\]/gi, (match, p1) => {
      ultimoContacto = p1.trim();
      return "";
    });

    let senas = "";
    rawDescription = rawDescription.replace(/\[SEÑAS:\s*(.*?)\]/gi, (match, p1) => {
      senas = p1.trim();
      return "";
    });

    // Remover otras etiquetas sobrantes
    rawDescription = rawDescription.replace(/\[(.*?)\]/g, "");
    
    let extraDetails = rawDescription.replace(/\n{2,}/g, "\n").trim();
    const ubiText = ubicaciones.length > 0 ? Array.from(new Set(ubicaciones)).join(" / ") : "";

    const descriptionChildren: any[] = [];
    const fieldStyle = { display: "flex", flexDirection: "column" as any, marginBottom: "8px" };
    const labelStyle = { display: "flex", fontSize: "11px", fontWeight: "bold", color: themeColor, textTransform: "uppercase" as any, marginBottom: "2px" };
    const valueStyle = { display: "flex", fontSize: "13px", color: "#374151", lineHeight: "1.3" };

    if (ubiText) {
      descriptionChildren.push({
        type: "div",
        props: {
          style: fieldStyle,
          children: [
            { type: "span", props: { style: labelStyle, children: "📍 Ubicación" } },
            { type: "span", props: { style: valueStyle, children: ubiText } }
          ]
        }
      });
    }

    if (ultimoContacto) {
      descriptionChildren.push({
        type: "div",
        props: {
          style: fieldStyle,
          children: [
            { type: "span", props: { style: labelStyle, children: "📅 Último Contacto" } },
            { type: "span", props: { style: valueStyle, children: ultimoContacto } }
          ]
        }
      });
    }

    if (senas) {
      descriptionChildren.push({
        type: "div",
        props: {
          style: fieldStyle,
          children: [
            { type: "span", props: { style: labelStyle, children: "👤 Señas Particulares" } },
            { type: "span", props: { style: valueStyle, children: senas } }
          ]
        }
      });
    }

    if (extraDetails) {
      const truncated = extraDetails.length > 300 ? extraDetails.substring(0, 300) + "..." : extraDetails;
      descriptionChildren.push({
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column" as any },
          children: [
            { type: "span", props: { style: labelStyle, children: "📝 Detalles Adicionales" } },
            { type: "span", props: { style: valueStyle, children: truncated } }
          ]
        }
      });
    }

    // 8. Generar diseño HTML/CSS para ImageResponse (Aspect ratio de cartel 600x800)
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
                      children: tipoLabel,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: "24px",
                      },
                      children: tipoEmoji,
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
                children: cleanTitle,
              },
            },

            // Imagen
            {
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
                children: base64Image
                  ? {
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
                  : {
                      type: "span",
                      props: {
                        style: { display: "flex", color: "#9ca3af", fontSize: "20px" },
                        children: "SIN FOTO",
                      },
                    },
              },
            },

            // Descripción
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: "#f9fafb",
                  padding: "12px",
                  borderRadius: "8px",
                  borderLeft: `5px solid ${themeColor}`,
                  flex: "1",
                  maxHeight: "180px",
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
                            style: {
                              display: "flex",
                              fontSize: "12px",
                              fontWeight: "bold",
                              color: "#6b7280",
                              textTransform: "uppercase",
                            },
                            children: "¿Tienes información?",
                          },
                        },
                        phones.length > 0
                          ? {
                              type: "span",
                              props: {
                                style: {
                                  display: "flex",
                                  fontSize: "24px",
                                  fontWeight: "900",
                                  color: themeColor,
                                  marginTop: "4px",
                                },
                                children: phones[0],
                              },
                            }
                          : null,
                        {
                          type: "div",
                          props: {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              marginTop: "8px",
                            },
                            children: [
                              {
                                type: "span",
                                props: {
                                  style: {
                                    display: "flex",
                                    fontSize: "14px",
                                    fontWeight: "900",
                                    color: "#111827",
                                  },
                                  children: "dondeestan.org",
                                },
                              },
                              {
                                type: "span",
                                props: {
                                  style: {
                                    display: "flex",
                                    fontSize: "10px",
                                    color: "#9ca3af",
                                    marginLeft: "6px",
                                  },
                                  children: `(Reporte #${id})`,
                                },
                              },
                            ],
                          },
                        },
                      ].filter(Boolean),
                    },
                  },
                  base64QR
                    ? {
                        type: "div",
                        props: {
                          style: { display: "flex", alignItems: "center", gap: "8px" },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: {
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  fontSize: "10px",
                                  color: "#9ca3af",
                                  fontWeight: "bold",
                                },
                                children: [
                                  { type: "span", props: { style: { display: "flex" }, children: "ESCANEA" } },
                                  { type: "span", props: { style: { display: "flex" }, children: "PARA MÁS INFO" } },
                                ],
                              },
                            },
                            {
                              type: "img",
                              props: {
                                src: base64QR,
                                style: { width: "60px", height: "60px", borderRadius: "4px" },
                              },
                            },
                          ],
                        },
                      }
                    : null,
                ].filter(Boolean),
              },
            },
          ].filter(Boolean),
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
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      }
    );
  } catch (error: any) {
    console.error("Error al renderizar el flyer PNG:", error);
    return new Response(`Error al renderizar flyer: ${error.message}`, { status: 500 });
  }
};
