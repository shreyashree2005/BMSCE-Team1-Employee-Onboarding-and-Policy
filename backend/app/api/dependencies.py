from fastapi import Request

from app.core.config import Settings


def get_app_settings(request: Request) -> Settings:
    """Settings of the running application (set in ``create_app``), so each app instance can be configured independently."""
    return request.app.state.settings
