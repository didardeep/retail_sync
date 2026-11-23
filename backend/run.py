import os

import uvicorn

# Development server: auto-reload on, port 5050. The site uses
# scripts/start-server.bat instead (no reload, port 8199, production settings).
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=5050,
                reload=os.getenv("RELOAD", "1") == "1")
