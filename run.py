"""Run the web app.

    uv run run.py
"""

import uvicorn

from app.main import app

if __name__ == "__main__":
    print("Web:  http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
