/**
 * Script para configurar el Webhook del Bot de Telegram.
 * 
 * Uso:
 *   node scripts/setup-telegram.js <DOMINIO_PROD_O_TUNNEL> <TELEGRAM_BOT_TOKEN> <SECRET_TOKEN>
 * 
 * Ejemplo:
 *   node scripts/setup-telegram.js https://dondeestan.org your_token_here secret123
 */

const [domain, token, secret] = process.argv.slice(2);

if (!domain || !token) {
  console.log("❌ Parámetros inválidos.");
  console.log("Uso: node scripts/setup-telegram.js <DOMINIO> <BOT_TOKEN> [SECRET_TOKEN]");
  console.log("Ejemplo: node scripts/setup-telegram.js https://dondeestan.org 123456:ABC-def123 secret123");
  process.exit(1);
}

// Asegurarse de que el dominio tiene protocolo y no termina en /
const cleanDomain = domain.replace(/\/$/, "");
const webhookUrl = `${cleanDomain}/api/telegram/webhook${secret ? `?secret=${secret}` : ""}`;

async function setWebhook() {
  console.log(`🌀 Registrando Webhook en Telegram...`);
  console.log(`   URL del Webhook: ${webhookUrl}`);
  
  const telegramUrl = `https://api.telegram.org/bot${token}/setWebhook`;
  
  try {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      console.log("✅ Webhook registrado con éxito en Telegram!");
      console.log(data);
    } else {
      console.error("❌ Error de Telegram API:");
      console.error(data);
    }
  } catch (error) {
    console.error("❌ Error de red al conectar con Telegram:");
    console.error(error);
  }
}

setWebhook();
