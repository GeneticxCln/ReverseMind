import React, { useEffect, useRef } from 'react';
import type { Pane } from '../../types';
import { useStore } from '../../store';
import { ChatPanel } from '../ChatPanel';
import { Spinner } from '../ui';

export function ChatPane({
  pane,
  workspaceId,
  onChatChange,
}: {
  pane: Pane;
  workspaceId: string | null;
  onChatChange: (chatId: string) => void;
}) {
  const { state, createChat } = useStore();
  const ensured = useRef(false);
  const chat = state.chats.find((item) => item.id === pane.chatId) || null;
  const agent = state.agents.find((item) => item.id === (chat?.agentId || pane.agentId || state.ui.selectedAgentId)) || state.agents[0] || null;

  useEffect(() => {
    if (chat || ensured.current) return;
    ensured.current = true;
    const created = createChat(agent?.id || state.agents[0].id, { workspaceId });
    onChatChange(created.id);
  }, [agent?.id, chat, createChat, onChatChange, state.agents, workspaceId]);

  if (!chat) {
    return (
      <div className="pane-empty">
        <Spinner size={16} />
        <span>Starting a conversation…</span>
      </div>
    );
  }

  return <ChatPanel chat={chat} agent={agent} compact />;
}
