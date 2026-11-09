"""Aggregates all API route modules. Register new routers here."""

from fastapi import APIRouter

from app.api.routes import auth, health, helpdesk, hr, onboarding, policies

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(onboarding.router)
api_router.include_router(policies.router)
api_router.include_router(hr.router)
api_router.include_router(helpdesk.router)
