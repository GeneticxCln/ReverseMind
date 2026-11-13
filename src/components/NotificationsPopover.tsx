import React from 'react';
import { Bell, CheckCheck, Inbox, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { IconButton } from './ui';

function timeAgo(timestamp: number): string {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function NotificationsPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setState, patchUi, toast } = useStore();

  if (!open) return null;
  const unread = state.notifications.filter((notification) => !notification.read).length;

  const openTarget = (id: string, target?: { chatId?: string; taskId?: string; routineId?: string }) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      ),
    }));
    if (target?.chatId) {
      const chat = state.chats.find((item) => item.id === target.chatId);
      if (chat) {
        patchUi({ view: 'workspace', mode: 'agent', selectedChatId: chat.id, selectedAgentId: chat.agentId });
      }
    } else if (target?.taskId) {
      patchUi({ view: 'tickets' });
    } else if (target?.routineId) {
      patchUi({ view: 'routines' });
    }
    onClose();
  };

  return (
    <>
      <div className="popover-backdrop" onMouseDown={onClose} />
      <div className="popover" data-testid="notifications-popover">
        <div className="popover-head">
          <Bell size={14} />
          <h3>Notifications</h3>
          {unread > 0 && <span className="notification-unread">{unread} new</span>}
          <span className="spacer" />
          <IconButton
            label="Mark all read"
            disabled={unread === 0}
            onClick={() =>
              setState((prev) => ({
                ...prev,
                notifications: prev.notifications.map((notification) => ({ ...notification, read: true })),
              }))
            }
            data-testid="mark-all-read"
          >
            <CheckCheck size={14} />
          </IconButton>
          <IconButton
            label="Clear notifications"
            onClick={() => {
              setState((prev) => ({ ...prev, notifications: [] }));
              toast('Notifications cleared', undefined, 'info');
            }}
            data-testid="clear-notifications"
          >
            <Trash2 size={13} />
          </IconButton>
          <IconButton label="Close notifications" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="popover-body">
          {state.notifications.length === 0 && (
            <div className="empty-state compact">
              <Inbox size={22} />
              <h3>All caught up</h3>
              <p>Agent completions, approvals and routine results appear here.</p>
            </div>
          )}
          {state.notifications.map((notification) => (
            <div
              className={`notification-row ${notification.read ? 'read' : 'unread'}`}
              key={notification.id}
              onClick={() => openTarget(notification.id, notification.target)}
              data-testid={`notification-${notification.id}`}
            >
              <span className="notification-dot" />
              <div style={{ minWidth: 0 }}>
                <div className="notification-title">{notification.title}</div>
                <div className="notification-body">{notification.body}</div>
                <div className="notification-time">
                  {timeAgo(notification.createdAt)} · {notification.kind.replace('_', ' ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
