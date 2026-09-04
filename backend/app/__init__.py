from flask import Flask
from flask_cors import CORS

from .db import SessionLocal, init_db
from .routes import bp


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    init_db()
    app.register_blueprint(bp)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.teardown_appcontext
    def cleanup(exc=None):
        SessionLocal.remove()

    return app
