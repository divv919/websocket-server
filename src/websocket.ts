import * as http from "node:http";
import * as crypto from "node:crypto";
import type { Duplex } from "node:stream";

export class SimpleWebSocketServer {
  private server: http.Server;
  private clients: Set<Duplex> = new Set();
  private eventHandlers: Record<string, Function[]> = {};

  constructor(server: http.Server) {
    this.server = server;
    this.server.on("upgrade", (req, socket) => this.handleUpgrade(req, socket));
  }

  private handleUpgrade(req: http.IncomingMessage, socket: Duplex) {
    if (req.headers["upgrade"] !== "websocket") {
      socket.end("HTTP/1.1 400 Bad Request");
      return;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.end("HTTP/1.1 400 Bad Request");
      return;
    }

    const acceptKey = this.generateAcceptKey(key as string);
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
    ];

    socket.write(responseHeaders.concat("\r\n").join("\r\n"));
    this.clients.add(socket);
    this.emit("connect", socket);

    socket.on("data", (buffer) => this.handleMessage(socket, buffer));
    socket.on("close", () => this.emit("disconnect", socket));
    socket.on("end", () => this.emit("disconnect", socket));
  }

  private generateAcceptKey(key: string): string {
    const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    return crypto.createHash("sha1").update(key + GUID).digest("base64");
  }

  private handleMessage(socket: Duplex, buffer: Buffer) {
    if (!buffer[0] || !buffer[1]) {
      console.warn("Incomplete frame header");
      return;
    }

    const firstByte = buffer[0];
    const opcode = firstByte & 0x0f;

    if (opcode === 0x8) {
      this.clients.delete(socket);
      socket.end();
      this.emit("disconnect", socket);
      return;
    }

    if (opcode !== 0x1) return;

    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    let maskingKey: number[] = [];
    if (isMasked) {
      maskingKey = Array.from(buffer.subarray(offset, offset + 4));
      if (maskingKey.length < 4) {
        console.warn("Incomplete masking key");
        return;
      }
      offset += 4;
    }

    const payload = buffer.subarray(offset, offset + payloadLength);
    if (payload.length < payloadLength) {
      console.warn("Incomplete payload");
      return;
    }

    const decoded = payload.map((byte, i) =>
      isMasked ? byte ^ maskingKey[i % 4]! : byte
    );

    const message = Buffer.from(decoded).toString("utf8");
    this.emit("message", socket, message);
  }

  public on(event: "connect" | "message" | "disconnect", handler: Function) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  private emit(event: string, ...args: any[]) {
    (this.eventHandlers[event] || []).forEach((fn) => fn(...args));
  }

  public send(socket: Duplex, message: string) {
    const msgBuffer = Buffer.from(message);
    const frame = this.encodeFrame(msgBuffer);
    socket.write(frame);
  }

  private encodeFrame(data: Buffer): Buffer {
    const frame = [0x81]; // FIN + text frame
    const length = data.length;

    if (length <= 125) {
      frame.push(length);
    } else if (length < 65536) {
      frame.push(126, (length >> 8) & 255, length & 255);
    } else {
      throw new Error("Message too large");
    }

    return Buffer.concat([Buffer.from(frame), data]);
  }
}
