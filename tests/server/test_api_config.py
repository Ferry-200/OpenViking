# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0

"""Tests for Config API endpoints (openviking/server/routers/config.py)."""

import json
from pathlib import Path

import httpx
import pytest_asyncio

from openviking.server.api_keys import APIKeyManager
from openviking.server.app import create_app
from openviking.server.config import ServerConfig
from openviking.server.dependencies import set_service
from openviking.service.core import OpenVikingService
from openviking_cli.session.user_id import UserIdentifier

ROOT_KEY = "config-api-test-root-key-abcdef1234567890ab"


@pytest_asyncio.fixture(scope="function")
async def config_service(temp_dir):
    svc = OpenVikingService(
        path=str(temp_dir / "config_data"), user=UserIdentifier.the_default_user("config_user")
    )
    await svc.initialize()
    yield svc
    await svc.close()


@pytest_asyncio.fixture(scope="function")
async def ov_conf(temp_dir) -> Path:
    """Create a minimal ov.conf for testing."""
    conf_path = temp_dir / "ov.conf"
    conf_path.write_text(json.dumps({
        "server": {
            "host": "127.0.0.1",
            "port": 1933,
            "workers": 1,
            "auth_mode": "api_key",
            "root_api_key": ROOT_KEY,
            "cors_origins": ["*"],
        },
        "encryption": {
            "enabled": True,
        }
    }, indent=2))
    return conf_path


@pytest_asyncio.fixture(scope="function")
async def config_app(config_service, ov_conf, monkeypatch):
    # Patch resolve_config_path at both call sites to use our test ov.conf
    monkeypatch.setattr(
        "openviking.server.routers.config.resolve_config_path",
        lambda *_args, **_kwargs: ov_conf,
    )
    monkeypatch.setattr(
        "openviking.server.config.resolve_config_path",
        lambda *_args, **_kwargs: ov_conf,
    )
    config = ServerConfig(root_api_key=ROOT_KEY)
    app = create_app(config=config, service=config_service)
    set_service(config_service)

    manager = APIKeyManager(root_key=ROOT_KEY, viking_fs=config_service.viking_fs)
    await manager.load()
    app.state.api_key_manager = manager

    return app


@pytest_asyncio.fixture(scope="function")
async def config_client(config_app):
    transport = httpx.ASGITransport(app=config_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


def root_headers():
    return {"X-API-Key": ROOT_KEY}


# ---- GET /api/v1/config ----


async def test_get_config_returns_sanitized(config_client: httpx.AsyncClient):
    """GET /api/v1/config returns config without root_api_key."""
    resp = await config_client.get("/api/v1/config", headers=root_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "root_api_key" not in body["result"]
    assert body["result"]["host"] == "127.0.0.1"
    assert body["result"]["port"] == 1933


async def test_get_config_reflects_encryption_enabled(config_client: httpx.AsyncClient):
    """GET /api/v1/config correctly injects encryption.enabled from top-level section."""
    resp = await config_client.get("/api/v1/config", headers=root_headers())
    assert resp.status_code == 200
    assert resp.json()["result"]["encryption_enabled"] is True


async def test_get_config_requires_root(config_client: httpx.AsyncClient):
    """GET /api/v1/config without auth returns 401."""
    resp = await config_client.get("/api/v1/config")
    assert resp.status_code == 401


async def test_get_config_no_tenant_headers_needed(config_client: httpx.AsyncClient):
    """ROOT can access /api/v1/config without X-OpenViking-Account/User."""
    resp = await config_client.get("/api/v1/config", headers=root_headers())
    assert resp.status_code == 200


# ---- PUT /api/v1/config ----


async def test_put_partial_update(config_client: httpx.AsyncClient, ov_conf: Path):
    """PUT with partial body only changes specified fields."""
    resp = await config_client.put(
        "/api/v1/config",
        json={"port": 8080},
        headers=root_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["result"]["port"] == 8080

    # Verify disk state
    disk = json.loads(ov_conf.read_text())
    assert disk["server"]["port"] == 8080
    assert disk["server"]["host"] == "127.0.0.1"  # unchanged


async def test_put_preserves_root_api_key(config_client: httpx.AsyncClient, ov_conf: Path):
    """PUT never removes root_api_key from ov.conf."""
    resp = await config_client.put(
        "/api/v1/config",
        json={"port": 9999},
        headers=root_headers(),
    )
    assert resp.status_code == 200

    disk = json.loads(ov_conf.read_text())
    assert disk["server"]["root_api_key"] == ROOT_KEY


async def test_put_consecutive_accumulate(config_client: httpx.AsyncClient, ov_conf: Path):
    """Two consecutive partial PUTs accumulate without overwriting each other."""
    await config_client.put(
        "/api/v1/config",
        json={"port": 8080},
        headers=root_headers(),
    )
    await config_client.put(
        "/api/v1/config",
        json={"with_bot": True},
        headers=root_headers(),
    )

    disk = json.loads(ov_conf.read_text())
    assert disk["server"]["port"] == 8080
    assert disk["server"]["with_bot"] is True


async def test_put_rejects_unknown_fields(config_client: httpx.AsyncClient):
    """PUT with unknown fields returns 400 via unified error response."""
    resp = await config_client.put(
        "/api/v1/config",
        json={"nonexistent_field": "value"},
        headers=root_headers(),
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "INVALID_ARGUMENT"


async def test_put_ignores_root_api_key_in_body(config_client: httpx.AsyncClient, ov_conf: Path):
    """PUT strips root_api_key from input body — cannot change key via API."""
    resp = await config_client.put(
        "/api/v1/config",
        json={"root_api_key": "hacked", "port": 7777},
        headers=root_headers(),
    )
    assert resp.status_code == 200

    disk = json.loads(ov_conf.read_text())
    assert disk["server"]["root_api_key"] == ROOT_KEY  # unchanged
    assert disk["server"]["port"] == 7777  # other field applied
