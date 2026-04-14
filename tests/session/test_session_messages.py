# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0

"""Message management tests"""

import json
from types import SimpleNamespace

from openviking.message import ContextPart, TextPart, ToolPart
from openviking.session import Session, SessionMeta


class TestSessionMeta:
    """Test session metadata helpers."""

    def test_from_dict_defaults_missing_title_fields(self):
        """Legacy metadata should default missing title fields safely."""
        meta = SessionMeta.from_dict({"session_id": "legacy"})

        assert meta.title == ""
        assert meta.title_status == "empty"

    async def test_save_meta_uses_atomic_write_file(self, session: Session, monkeypatch):
        """Session metadata should be persisted through the atomic helper."""
        writes: list[tuple[str, str]] = []

        async def fake_atomic_write_file(uri: str, content: str, ctx=None):
            writes.append((uri, content))

        monkeypatch.setattr(
            session._viking_fs,
            "atomic_write_file",
            fake_atomic_write_file,
            raising=False,
        )

        session.meta.title = "原子写标题"
        session.meta.title_status = "final"

        await session._save_meta()

        assert writes == [
            (
                f"{session.uri}/.meta.json",
                json.dumps(session.meta.to_dict(), ensure_ascii=False),
            )
        ]

    async def test_atomic_write_file_writes_via_unique_temp_then_rename(
        self, session: Session, monkeypatch
    ):
        """Atomic file writes should use a same-directory temp file and raw rename."""
        writes: list[tuple[str, bytes]] = []
        moves: list[tuple[str, str]] = []
        target_uri = f"{session.uri}/.meta.json"
        target_path = session._viking_fs._uri_to_path(target_uri, ctx=session.ctx)

        class FakeAgfs:
            def write(self, path: str, content: bytes):
                writes.append((path, content))
                return "OK"

            def mv(self, old_path: str, new_path: str):
                moves.append((old_path, new_path))
                return {}

            def rm(self, path: str, recursive: bool = False, force: bool = True):
                raise AssertionError("rm should not be called after successful rename")

            def mkdir(self, path: str):
                return {}

        monkeypatch.setattr(session._viking_fs, "agfs", FakeAgfs())

        await session._viking_fs.atomic_write_file(
            target_uri,
            json.dumps({"title": "原子写标题"}, ensure_ascii=False),
            ctx=session.ctx,
        )

        assert len(writes) == 1
        tmp_path, tmp_content = writes[0]
        assert tmp_path.startswith(f"{target_path}.tmp.")
        assert tmp_path != target_path
        assert json.loads(tmp_content.decode("utf-8"))["title"] == "原子写标题"
        assert moves == [(tmp_path, target_path)]


class TestAddMessage:
    """Test add_message"""

    async def test_add_user_message(self, session: Session):
        """Test adding user message"""
        msg = session.add_message("user", [TextPart("Hello, world!")])

        assert msg is not None
        assert msg.role == "user"
        assert len(msg.parts) == 1
        assert msg.id is not None

    async def test_add_assistant_message(self, session: Session):
        """Test adding assistant message"""
        msg = session.add_message("assistant", [TextPart("Hello! How can I help?")])

        assert msg is not None
        assert msg.role == "assistant"
        assert len(msg.parts) == 1

    async def test_add_message_with_multiple_parts(self, session: Session):
        """Test adding message with multiple parts"""
        parts = [TextPart("Here is some context:"), TextPart("And here is more text.")]
        msg = session.add_message("assistant", parts)

        assert len(msg.parts) == 2

    async def test_add_message_with_context_part(self, session: Session):
        """Test adding message with context part"""
        parts = [
            TextPart("Based on the context:"),
            ContextPart(
                uri="viking://user/test/resources/doc.md",
                context_type="resource",
                abstract="Some context abstract",
            ),
        ]
        msg = session.add_message("assistant", parts)

        assert len(msg.parts) == 2

    async def test_add_message_with_tool_part(self, session: Session):
        """Test adding message with tool call"""
        tool_part = ToolPart(
            tool_id="tool_123",
            tool_name="search_tool",
            tool_uri="viking://session/test/tools/tool_123",
            skill_uri="viking://agent/skills/search",
            tool_input={"query": "test"},
            tool_status="running",
        )
        msg = session.add_message("assistant", [TextPart("Executing search..."), tool_part])

        assert len(msg.parts) == 2

    async def test_messages_list_updated(self, session: Session):
        """Test message list update"""
        initial_count = len(session.messages)

        session.add_message("user", [TextPart("Message 1")])
        session.add_message("assistant", [TextPart("Response 1")])

        assert len(session.messages) == initial_count + 2

    async def test_first_user_message_sets_provisional_title(self, session: Session):
        """First user message should seed the persisted title."""
        await session.ensure_exists()
        session.add_message("user", [TextPart("  First line\nsecond line  ")])

        assert session.meta.title == "First line second li"
        assert session.meta.title_status == "provisional"

    async def test_second_user_message_does_not_overwrite_title(self, session: Session):
        """Later user messages must not replace the first title seed."""
        await session.ensure_exists()
        session.add_message("user", [TextPart("First title seed")])
        session.add_message("user", [TextPart("Second title seed")])

        assert session.meta.title == "First title seed"
        assert session.meta.title_status == "provisional"

    async def test_assistant_message_does_not_create_title(self, session: Session):
        """Assistant-only sessions should not invent a title."""
        await session.ensure_exists()
        session.add_message("assistant", [TextPart("Hello there")])

        assert session.meta.title == ""
        assert session.meta.title_status == "empty"

    async def test_refine_title_updates_meta(self, session: Session, monkeypatch):
        """Refinement should promote a provisional title to final."""
        await session.ensure_exists()

        class DisabledVLM:
            def is_available(self) -> bool:
                return False

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=DisabledVLM()),
        )

        session.add_message("user", [TextPart("Need help with deployment failures")])
        session.add_message("assistant", [TextPart("Let's trace the rollout error and fix it.")])

        class FakeVLM:
            def is_available(self) -> bool:
                return True

            async def get_completion_async(self, prompt: str) -> str:
                assert "deployment failures" in prompt
                return "Deploy rollback"

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=FakeVLM()),
        )

        await session._refine_title_if_needed()

        assert session.meta.title == "Deploy rollback"
        assert session.meta.title_status == "final"

    async def test_refine_title_prompts_for_user_language(self, session: Session, monkeypatch):
        """Chinese sessions should ask the model for a Chinese-only short title."""
        await session.ensure_exists()

        class DisabledVLM:
            def is_available(self) -> bool:
                return False

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=DisabledVLM()),
        )

        session.add_message("user", [TextPart("奶农哥能说话不")])
        session.add_message("assistant", [TextPart("可以，我现在已经能正常回复了。")])

        class FakeVLM:
            def is_available(self) -> bool:
                return True

            async def get_completion_async(self, prompt: str) -> str:
                assert "same language as the user's first message" in prompt
                assert "The user is speaking Chinese" in prompt
                assert "Output 4-12 Chinese characters only" in prompt
                return "奶农哥能说话"

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=FakeVLM()),
        )

        await session._refine_title_if_needed()

        assert session.meta.title == "奶农哥能说话"
        assert session.meta.title_status == "final"

    async def test_refine_title_failure_keeps_provisional(self, session: Session, monkeypatch):
        """Refinement failures must preserve the provisional title."""
        await session.ensure_exists()

        class DisabledVLM:
            def is_available(self) -> bool:
                return False

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=DisabledVLM()),
        )

        session.add_message("user", [TextPart("Investigate production alert spikes")])
        session.add_message("assistant", [TextPart("I will check the alert timeline first.")])

        class BrokenVLM:
            def is_available(self) -> bool:
                return True

            async def get_completion_async(self, prompt: str) -> str:
                raise RuntimeError("llm offline")

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=BrokenVLM()),
        )

        await session._refine_title_if_needed()

        assert session.meta.title == "Investigate producti"
        assert session.meta.title_status == "provisional"

    async def test_refine_title_rejects_english_for_chinese_user(
        self, session: Session, monkeypatch
    ):
        """Chinese sessions must not accept English refined titles."""
        await session.ensure_exists()

        class DisabledVLM:
            def is_available(self) -> bool:
                return False

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=DisabledVLM()),
        )

        session.add_message("user", [TextPart("奶农哥说话来！")])
        session.add_message("assistant", [TextPart("我现在已经能正常说话了。")])

        class EnglishOnlyVLM:
            def is_available(self) -> bool:
                return True

            async def get_completion_async(self, prompt: str) -> str:
                return "Greeting and offer of assistance"

        monkeypatch.setattr(
            "openviking.session.session.get_openviking_config",
            lambda: SimpleNamespace(vlm=EnglishOnlyVLM()),
        )

        await session._refine_title_if_needed()

        assert session.meta.title == "奶农哥说话来！"
        assert session.meta.title_status == "provisional"


class TestUpdateToolPart:
    """Test update_tool_part"""

    async def test_update_tool_completed(self, session_with_tool_call):
        """Test updating tool status to completed"""
        session, message_id, tool_id = session_with_tool_call

        session.update_tool_part(
            message_id=message_id,
            tool_id=tool_id,
            output="Tool execution completed successfully",
            status="completed",
        )

        # Verify tool status updated
        # Need to find the corresponding message and tool part
        msg = next((m for m in session.messages if m.id == message_id), None)
        assert msg is not None

    async def test_update_tool_failed(self, session_with_tool_call):
        """Test updating tool status to failed"""
        session, message_id, tool_id = session_with_tool_call

        session.update_tool_part(
            message_id=message_id,
            tool_id=tool_id,
            output="Tool execution failed: error message",
            status="failed",
        )

        # Verify tool status updated
        msg = next((m for m in session.messages if m.id == message_id), None)
        assert msg is not None
