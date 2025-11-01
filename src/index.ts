import * as http from "node:http";
import { SimpleWebSocketServer } from "./websocket.js";
import type { Duplex } from "node:stream";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("This is an HTTP server");
});

const wsServer = new SimpleWebSocketServer(server);

wsServer.on("connect", (socket: Duplex) => {
  console.log("Client connected");
});

wsServer.on("message", (socket: Duplex, message: string) => {
  console.log("Received message:", message);
  wsServer.send(socket, "Hello from server!");
});

server.listen(80, () => {
  console.log("Listening on port 80");
});
