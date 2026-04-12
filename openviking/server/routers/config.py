# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0
"""Configuration management endpoints for OpenViking HTTP Server."""

import json
import os
import tempfile

from fastapi import APIRouter, Request

from openviking.server.auth import require_role
from openviking.server.config import ServerConfig, load_server_config
from openviking.server.identity import RequestContext, Role
from openviking.server.models import Response
from openviking_cli.utils.config.config_loader import load_json_config, resolve_config_path
from openviking_cli.utils.config.consts import DEFAULT_OV_CONF, OPENVIKING_CONFIG_ENV
from openviking_cli.utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/config", tags=["config"])


def _sanitize_config(config: ServerConfig) -> dict:
    """Return config as dict with sensitive fields removed."""
    data = config.model_dump()
    data.pop("root_api_key", None)
    return data


@router.get("")
async def get_config(
    request: Request,
    _ctx: RequestContext = require_role(Role.ROOT),
):
    """Return the current running server configuration (sanitized)."""
    return Response(status="ok", result=_sanitize_config(request.app.state.config))


_IMMUTABLE_FIELDS = {"root_api_key", "encryption_enabled"}


@router.put("")
async def update_config(
    request: Request,
    body: dict,
    _ctx: RequestContext = require_role(Role.ROOT),
):
    """Validate and persist server configuration to ov.conf."""
    # Strip fields not managed by this endpoint from input
    for key in _IMMUTABLE_FIELDS:
        body.pop(key, None)
    config = ServerConfig.model_validate(body)
    path = resolve_config_path(None, OPENVIKING_CONFIG_ENV, DEFAULT_OV_CONF)
    full = load_json_config(path)
    # Exclude the same fields when writing to preserve existing values in ov.conf
    full.setdefault("server", {}).update(config.model_dump(exclude=_IMMUTABLE_FIELDS))
    content = json.dumps(full, indent=2, ensure_ascii=False)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content.encode())
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, str(path))
    except BaseException:
        os.unlink(tmp)
        raise
    logger.info("Configuration updated and persisted to %s", path)
    return Response(status="ok", result=_sanitize_config(config))


@router.post("/reload")
async def reload_config(
    request: Request,
    _ctx: RequestContext = require_role(Role.ROOT),
):
    """Reload server configuration from ov.conf into memory.

    Note: process-level settings (host, port, workers) require a full
    server restart to take effect — reloading only updates values that
    are read from app.state.config at request time.
    """
    config = load_server_config()
    request.app.state.config = config
    logger.info("Configuration reloaded from disk")
    return Response(status="ok", result=_sanitize_config(config))