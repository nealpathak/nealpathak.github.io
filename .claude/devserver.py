"""Static file server for local verification.

Identical to `python -m http.server` except that it tells the browser never to
cache anything.

This exists because of a real incident in this repo: the stock server lets a
browser reuse cached ES modules across reloads, and a verification pass silently
ran against the *previous* version of the code. Everything looked fine, and the
result was meaningless. Caching is exactly wrong for a dev loop whose whole
point is to check that the change you just made behaves.
"""

import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet unless something actually went wrong.
        status = args[1] if len(args) > 1 else ""
        if not str(status).startswith("2"):
            super().log_message(fmt, *args)


# Threading matters: a browser holds its connection open with keep-alive, and a
# single-threaded server would then block every other request — including the
# rest of the page's own module graph.
class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"serving {ROOT} on http://127.0.0.1:{port} (no-store)")
        httpd.serve_forever()
