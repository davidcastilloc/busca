export class TelegramClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    if (!token) {
      throw new Error("Telegram Bot Token is required");
    }
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call(method: string, payload: any, isMultipart = false): Promise<any> {
    const url = `${this.baseUrl}/${method}`;
    let response: Response;

    if (isMultipart) {
      response = await fetch(url, {
        method: "POST",
        body: payload, // payload is FormData
      });
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    const data = await response.json() as any;
    if (!response.ok || !data.ok) {
      console.error(`Telegram API Error [${method}]:`, data);
      throw new Error(data.description || `HTTP Error ${response.status}`);
    }
    return data.result;
  }

  async sendMessage(chatId: string | number, text: string, options: any = {}): Promise<any> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      ...options,
    });
  }

  async sendLocation(
    chatId: string | number,
    latitude: number,
    longitude: number,
    options: any = {}
  ): Promise<any> {
    return this.call("sendLocation", {
      chat_id: chatId,
      latitude: latitude,
      longitude: longitude,
      ...options,
    });
  }

  async sendPhoto(
    chatId: string | number,
    photo: string | Blob,
    options: any = {}
  ): Promise<any> {
    if (typeof photo === "string") {
      // Photo is a file_id or URL
      return this.call("sendPhoto", {
        chat_id: chatId,
        photo: photo,
        parse_mode: "HTML",
        ...options,
      });
    } else {
      // Photo is a Blob (multipart)
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("photo", photo, "photo.jpg");
      form.append("parse_mode", "HTML");
      for (const [key, value] of Object.entries(options)) {
        form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      return this.call("sendPhoto", form, true);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, options: any = {}): Promise<any> {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...options,
    });
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options: any = {}
  ): Promise<any> {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: "HTML",
      ...options,
    });
  }

  async setMyCommands(commands: Array<{command: string, description: string}>, scope: any = { type: "default" }): Promise<any> {
    return this.call("setMyCommands", {
      commands,
      scope,
    });
  }

  async getFile(fileId: string): Promise<any> {
    return this.call("getFile", { file_id: fileId });
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download file: HTTP ${res.status}`);
    }
    return await res.blob();
  }
}
