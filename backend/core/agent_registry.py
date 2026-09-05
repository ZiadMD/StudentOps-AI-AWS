from pydantic import BaseModel, ConfigDict, ValidationError
from typing import Callable, Dict, Type

class AgentTool:
    def __init__(
        self, 
        name: str, 
        description: str, 
        input_schema: Type[BaseModel], 
        output_schema: Type[BaseModel], 
        requires_human_approval: bool,
        executor: Callable
    ):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.output_schema = output_schema
        self.requires_human_approval = requires_human_approval
        self.executor = executor

class ToolRegistry:
    """
    SECURITY: AI Agent Boundary. 
    Maintains an absolute allow-list of callable functions.
    Validates both inputs and outputs to neutralize Indirect Prompt Injections.
    """
    _tools: Dict[str, AgentTool] = {}

    @classmethod
    def register(cls, tool: AgentTool):
        cls._tools[tool.name] = tool

    @classmethod
    def get_tool(cls, name: str) -> AgentTool:
        if name not in cls._tools:
            raise ValueError(f"SECURITY ALERT: Unregistered tool execution attempted: {name}")
        return cls._tools[name]

    @classmethod
    def validate_and_execute(cls, name: str, raw_input: dict, organization_id: str) -> dict:
        tool = cls.get_tool(name)
        
        # 1. Validate Input (Prevent malicious injection from the LLM)
        try:
            validated_input = tool.input_schema(**raw_input)
        except ValidationError as e:
            raise ValueError(f"Invalid tool input schema: {str(e)}")

        # 2. Execute Business Logic
        raw_output = tool.executor(validated_input.model_dump(), organization_id)
        
        # 3. Validate Output (Prevent malicious DB data from smuggling instructions back to LLM)
        try:
            validated_output = tool.output_schema(**raw_output)
            return validated_output.model_dump()
        except ValidationError as e:
            raise ValueError(f"SECURITY ALERT: Tool output failed schema validation, possible data poisoning: {str(e)}")


class SystemStatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SystemStatusOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    organization_id: str


def get_system_status(_: dict, organization_id: str) -> dict:
    """Return non-sensitive status for the caller's already-authorized tenant."""
    return {"status": "online", "organization_id": organization_id}


ToolRegistry.register(
    AgentTool(
        name="get_system_status",
        description="Return the current availability status for the authenticated organization.",
        input_schema=SystemStatusInput,
        output_schema=SystemStatusOutput,
        requires_human_approval=False,
        executor=get_system_status,
    )
)