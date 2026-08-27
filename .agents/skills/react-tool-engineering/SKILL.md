---
name: react-tool-engineering
description: "Guidelines and patterns for engineering sandboxed ReAct tools, OpenRouter SSE streaming endpoints, and human-in-the-loop confirmation barriers in StudentOps AI."
risk: safe
source: "studentops/react-tools"
date_added: "2026-08-27"
---

# ReAct Tool Engineering Skill

This skill documents standard patterns for adding, categorizing, and executing tools within the StudentOps AI Autonomous ReAct Engine.

## Tool Categorization Matrix

| Category | Description | Confirmation Required | Example Tools |
|---|---|---|---|
| `READ_ONLY` | Queries database state without modifications. Instant execution. | `False` | `get_meeting_attendance`, `get_student_score`, `get_upcoming_events` |
| `WRITE_INTERNAL` | Modifies internal state in DB without notifying members. | `False` (if non-critical) | `update_task_score`, `record_attendance_override` |
| `SENSITIVE_EXTERNAL` | Sends messages, triggers external integrations, or performs bulk deletions. | `True` (Mandatory) | `send_reminder`, `broadcast_announcement` |

## Standard Implementation Pattern

### 1. Define Tool Handler (`backend/app/agent/tools.py`)
```python
async def tool_example(db: AsyncSession, param1: str, is_confirmed: bool = False) -> dict:
    if not is_confirmed:
        return {
            "status": "REQUIRES_CONFIRMATION",
            "message": "Human approval is required.",
            "preview_data": {"param1": param1}
        }
    # Execute operation
    return {"status": "SUCCESS", "data": ...}
```

### 2. Register Tool Definition
```python
TOOL_DEFINITIONS.append({
    "name": "example_tool",
    "description": "Clear description for LLM reasoning.",
    "category": ToolCategory.SENSITIVE_EXTERNAL.value,
    "parameters": {
        "type": "object",
        "properties": {
            "param1": {"type": "string", "description": "Parameter explanation"}
        },
        "required": ["param1"]
    }
})
```

### 3. Handle in ReAct Loop (`backend/app/agent/react_agent.py`)
- Check deterministic intent regex or keyword first.
- If intent matches, execute tool handler directly.
- If sensitive, generate action ID, log pending action to `AgentActionAudit`, and return `AgentChatResponse(requires_confirmation=True, pending_confirmation=...)`.

## Streaming Integration (`POST /api/agent/stream`)
- Emit `type: "tool"` event containing execution metadata and parameters.
- Stream tokens incrementally using Server-Sent Events (`data: {"type": "token", "content": "..."}\n\n`).
- Terminate with `data: {"type": "done", ...}\n\n`.
