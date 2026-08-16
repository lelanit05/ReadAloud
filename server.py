#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 5173


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Permissions-Policy", "microphone=(self), camera=()")
        self.send_header("Feature-Policy", "microphone 'self'")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Open in Google Chrome (not Cursor preview):\n  http://{HOST}:{PORT}\n")
    server.serve_forever()
