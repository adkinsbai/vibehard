interface DisplayEvent { eventId: string; sequence: number; type: string; data: Record<string, unknown>; timestamp: string }

// A streamed answer is one message. Its final text replaces accumulated deltas.
export function conversationMessages(events: DisplayEvent[]) {
  const result: DisplayEvent[] = [];
  const messages = new Map<string, DisplayEvent>();
  let turn = "initial";
  for (const event of events) {
    if (event.type === "task.started") turn = event.eventId;
    if (event.type === "agent.message.delta" || event.type === "agent.message") {
      const key = `${turn}:${String(event.data.itemId ?? "message")}`;
      const current = messages.get(key);
      if (current) current.data.text = event.type === "agent.message" ? event.data.text : String(current.data.text ?? "") + String(event.data.text ?? "");
      else { const next = { ...event, type: "agent.message", data: { ...event.data } }; messages.set(key, next); result.push(next); }
    } else if (event.type === "tool.started" || event.type === "tool.completed") {
      const item = event.data.item as { type?: string } | undefined;
      if (item?.type !== "agentMessage" && item?.type !== "reasoning") result.push(event);
    } else if (["task.started", "reasoning", "command.output", "task.failed", "task.interrupted"].includes(event.type)
      || (event.type === "task.completed" && typeof event.data.workflowReport === "string")) result.push(event);
  }
  return result;
}
