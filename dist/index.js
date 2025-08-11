import * as http from "node:http";
const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("This is a HTTP server");
});
server.listen(80, () => {
    console.log("Running on 80");
});
//# sourceMappingURL=index.js.map