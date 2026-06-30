import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

export const prerender = false;

let wasmInitialized = false;

async function initializeResvg() {
  if (wasmInitialized) return;
  try {
    // Carga de wasm desde CDN para ejecución rápida y sin configuraciones de bundler en el Edge
    const wasmResponse = await fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
    if (!wasmResponse.ok) throw new Error("No se pudo obtener el wasm de resvg");
    const wasmBuffer = await wasmResponse.arrayBuffer();
    await initWasm(wasmBuffer);
    wasmInitialized = true;
  } catch (e) {
    // Si ya fue inicializado por otro request concurrentemente
    console.warn("Inicialización de resvg-wasm omitida o reintentada:", e);
  }
}

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

    // 2. Inicializar Resvg
    await initializeResvg();

    // 3. Descargar fuente Roboto WOFF
    const fontResponse = await fetch("https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff");
    if (!fontResponse.ok) throw new Error("No se pudo descargar la fuente de Google Fonts");
    const fontBuffer = await fontResponse.arrayBuffer();

    // 4. Descargar foto de R2 si existe y codificar a Base64
    let base64Image = "";
    if (flyer.foto_key && FOTOS_BUCKET) {
      try {
        const object = await FOTOS_BUCKET.get(flyer.foto_key);
        if (object) {
          const bytes = await object.arrayBuffer();
          // Conversión segura de bytes a base64
          let binary = "";
          const len = bytes.byteLength;
          const uints = new Uint8Array(bytes);
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uints[i]);
          }
          const base64 = btoa(binary);
          const ext = flyer.foto_key.split('.').pop() || 'jpeg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          base64Image = `data:${mime};base64,${base64}`;
        }
      } catch (err) {
        console.error("Error al obtener foto de R2 para el flyer:", err);
      }
    }

    // 5. Descargar código QR para redirigir al flyer interactivo
    let base64QR = "";
    try {
      const siteUrl = "https://dondeestan.org";
      const flyerUrl = `${siteUrl}/flyer/${id}`;
      const qrResponse = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(flyerUrl)}`);
      if (qrResponse.ok) {
        const qrBytes = await qrResponse.arrayBuffer();
        let qrBinary = "";
        const qrUints = new Uint8Array(qrBytes);
        for (let i = 0; i < qrUints.length; i++) {
          qrBinary += String.fromCharCode(qrUints[i]);
        }
        base64QR = `data:image/png;base64,${btoa(qrBinary)}`;
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

    // 7. Generar diseño HTML/CSS para Satori (Aspect ratio de cartel 600x800)
    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "600px",
            height: "800px",
            backgroundColor: "#ffffff",
            padding: "28px",
            boxSizing: "border-box",
            border: `12px solid ${themeColor}`,
            fontFamily: "Roboto",
          },
          children: [
            // Cabecera superior
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: themeColor,
                        color: "#ffffff",
                        padding: "8px 24px",
                        fontSize: "14px",
                        fontWeight: "bold",
                        letterSpacing: "4px",
                        borderRadius: "4px",
                        marginBottom: "16px",
                      },
                      children: `🚨 DONDE ESTAN 🚨`,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        fontSize: "26px",
                        fontWeight: "900",
                        color: "#111827",
                        textAlign: "center",
                        textTransform: "uppercase",
                        marginBottom: "16px",
                        lineHeight: "1.2",
                      },
                      children: flyer.title,
                    },
                  },
                ],
              },
            },
            // Imagen central o marcador de posición
            base64Image
              ? {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      width: "100%",
                      height: "360px",
                      backgroundColor: "#f3f4f6",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      overflow: "hidden",
                    },
                    children: [
                      {
                        type: "img",
                        props: {
                          src: base64Image,
                          style: {
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          },
                        },
                      },
                    ],
                  },
                }
              : {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      width: "100%",
                      height: "360px",
                      backgroundColor: "#f3f4f6",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    },
                    children: [
                      {
                        type: "span",
                        props: {
                          style: { fontSize: "80px", marginBottom: "12px" },
                          children: tipoEmoji,
                        },
                      },
                      {
                        type: "span",
                        props: {
                          style: {
                            fontSize: "14px",
                            fontWeight: "bold",
                            color: "#4b5563",
                            letterSpacing: "2px",
                          },
                          children: tipoLabel,
                        },
                      },
                    ],
                  },
                },
            // Descripción detallada
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: "#f9fafb",
                  padding: "16px",
                  borderRadius: "8px",
                  borderLeft: `5px solid ${themeColor}`,
                  marginTop: "16px",
                  flexGrow: "1",
                  maxHeight: "130px",
                  overflow: "hidden",
                },
                children: [
                  {
                    type: "p",
                    props: {
                      style: {
                        fontSize: "14px",
                        color: "#1f2937",
                        lineHeight: "1.5",
                        margin: "0",
                        whiteSpace: "pre-wrap",
                      },
                      children: flyer.description,
                    },
                  },
                ],
              },
            },
            // Pie de página con contactos y QR
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "16px",
                  marginTop: "16px",
                },
                children: [
                  // Contactos
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        maxWidth: "350px",
                      },
                      children: [
                        phones.length > 0
                          ? {
                              type: "div",
                              props: {
                                style: {
                                  display: "flex",
                                  flexDirection: "column",
                                  marginBottom: "8px",
                                },
                                children: [
                                  {
                                    type: "span",
                                    props: {
                                      style: {
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        color: "#4b5563",
                                        textTransform: "uppercase",
                                        letterSpacing: "1px",
                                      },
                                      children: "Llamar a:",
                                    },
                                  },
                                  ...phones.map((phone) => ({
                                    type: "span",
                                    props: {
                                      style: {
                                        fontSize: "16px",
                                        fontWeight: "bold",
                                        color: "#111827",
                                      },
                                      children: phone,
                                    },
                                  })),
                                ],
                              },
                            }
                          : null,
                        socials.length > 0
                          ? {
                              type: "div",
                              props: {
                                style: { display: "flex", flexDirection: "column" },
                                children: [
                                  {
                                    type: "span",
                                    props: {
                                      style: {
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        color: "#4b5563",
                                        textTransform: "uppercase",
                                        letterSpacing: "1px",
                                      },
                                      children: "Redes Sociales / Info:",
                                    },
                                  },
                                  ...socials.map((social) => ({
                                    type: "span",
                                    props: {
                                      style: {
                                        fontSize: "13px",
                                        fontWeight: "bold",
                                        color: "#374151",
                                      },
                                      children: social,
                                    },
                                  })),
                                ],
                              },
                            }
                          : null,
                        {
                          type: "span",
                          props: {
                            style: {
                              fontSize: "9px",
                              color: "#9ca3af",
                              marginTop: "8px",
                            },
                            children: `Reporte #${id}`,
                          },
                        },
                      ].filter(Boolean),
                    },
                  },
                  // QR
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              fontSize: "9px",
                              color: "#4b5563",
                              textTransform: "uppercase",
                              fontWeight: "bold",
                              letterSpacing: "0.5px",
                            },
                            children: [
                              { type: "span", props: { children: "Escanea" } },
                              { type: "span", props: { children: "para" } },
                              { type: "span", props: { children: "más info" } },
                            ],
                          },
                        },
                        base64QR
                          ? {
                              type: "img",
                              props: {
                                src: base64QR,
                                style: {
                                  width: "60px",
                                  height: "60px",
                                  borderRadius: "4px",
                                  border: "1px solid #e5e7eb",
                                  padding: "2px",
                                  backgroundColor: "#ffffff",
                                },
                              },
                            }
                          : null,
                      ].filter(Boolean),
                    },
                  },
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

    // 8. Convertir SVG a PNG en milisegundos con Resvg
    const resvg = new Resvg(svg, {
      background: "rgba(255, 255, 255, 1)",
      fitTo: {
        mode: "width",
        value: 600,
      },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // 9. Responder con los bytes del PNG
    return new Response(pngBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable", // Cachear agresivamente
      },
    });
  } catch (error: any) {
    console.error("Error al renderizar el flyer PNG:", error);
    return new Response(`Error al renderizar flyer: ${error.message}`, { status: 500 });
  }
};
