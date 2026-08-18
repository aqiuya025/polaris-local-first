import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CollectionShelf, Persona, World } from '../../types/domain';
import type { ConversationCardSummary } from '../../app/collection/conversationCardSummary';
import { Icon, type IconName } from '../Icon';
import { useI18n } from '../../i18n';

export type DesktopAppSidebarShelfItem = {
  shelf: CollectionShelf;
  label: string;
};

export type DesktopAppSidebarProps = {
  activeWorld: World;
  activeConversationId: string | null;
  collectionShelf: CollectionShelf;
  collaboratorScopeId: string | null;
  currentCollaborator: Persona | null;
  collaborators: Persona[];
  conversations: ConversationCardSummary[];
  shelfItems: DesktopAppSidebarShelfItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectCollaborator: (collaboratorId: string | null) => void;
  onCreateCollaboratorFromBuilder: () => void;
  onCreateCustomCollaborator: () => void;
  onSelectShelf: (shelf: CollectionShelf) => void;
  onOpenConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, title: string) => void;
  onToggleConversationPinned: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string, title: string) => void;
  onCreateConversation: () => void;
  onOpenGroupWorld: () => void;
  onOpenSettings: () => void;
};

const ESCAPE_POD_SHELVES: Partial<Record<CollectionShelf, { icon: IconName; label: string }>> = {
  project: { icon: 'navWorkspace', label: 'Projects' },
  code: { icon: 'navCard', label: 'Artifacts' }
};

function sortSidebarConversations(conversations: ConversationCardSummary[]) {
  return [...conversations].sort((left, right) => {
    if (left.pinnedAt && right.pinnedAt) return right.pinnedAt - left.pinnedAt;
    if (left.pinnedAt) return -1;
    if (right.pinnedAt) return 1;
    return right.updatedAt - left.updatedAt;
  });
}

export function DesktopAppSidebar(props: DesktopAppSidebarProps) {
  const {
    activeWorld,
    activeConversationId,
    collectionShelf,
    conversations,
    shelfItems,
    collapsed,
    onToggleCollapsed,
    onSelectShelf,
    onOpenConversation,
    onRenameConversation,
    onToggleConversationPinned,
    onDeleteConversation,
    onCreateConversation,
    onOpenSettings
  } = props;
  const { t } = useI18n();
  const [actionMenuConversationId, setActionMenuConversationId] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [conversationTitleDraft, setConversationTitleDraft] = useState('');
  const longPressTimerRef = useRef<number | null>(null);
  const suppressNextThreadClickRef = useRef(false);
  const sortedConversations = sortSidebarConversations(conversations);
  const escapePodShelfItems = shelfItems.filter((item) => Boolean(ESCAPE_POD_SHELVES[item.shelf]));

  useEffect(() => {
    const liveConversationIds = new Set(conversations.map((conversation) => conversation.id));
    if (actionMenuConversationId && !liveConversationIds.has(actionMenuConversationId)) {
      setActionMenuConversationId(null);
    }
    if (editingConversationId && !liveConversationIds.has(editingConversationId)) {
      setEditingConversationId(null);
      setConversationTitleDraft('');
    }
  }, [actionMenuConversationId, conversations, editingConversationId]);

  const clearLongPress = () => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const openConversationMenu = (conversationId: string) => {
    setActionMenuConversationId((current) => (current === conversationId ? null : conversationId));
  };
  const beginConversationRename = (conversation: ConversationCardSummary) => {
    setActionMenuConversationId(conversation.id);
    setEditingConversationId(conversation.id);
    setConversationTitleDraft(conversation.title);
  };
  const commitConversationRename = (conversationId: string) => {
    const nextTitle = conversationTitleDraft.trim();
    if (!nextTitle) return;
    onRenameConversation(conversationId, nextTitle);
    setEditingConversationId(null);
    setConversationTitleDraft('');
    setActionMenuConversationId(null);
  };
  const cancelConversationRename = () => {
    setEditingConversationId(null);
    setConversationTitleDraft('');
  };
  const handleConversationDelete = (conversation: ConversationCardSummary) => {
    onDeleteConversation(conversation.id, conversation.title);
    setActionMenuConversationId(null);
    if (editingConversationId === conversation.id) {
      setEditingConversationId(null);
      setConversationTitleDraft('');
    }
  };
  const handleThreadPointerDown = (event: PointerEvent, conversationId: string) => {
    clearLongPress();
    if (event.pointerType === 'mouse') return;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      suppressNextThreadClickRef.current = true;
      setActionMenuConversationId(conversationId);
    }, 520);
  };

  return (
    <aside className={`desktop-app-sidebar escape-pod-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label={t('desktop.navLabel')}>
      <div className="escape-pod-sidebar-brand-row">
        <div className="escape-pod-sidebar-brand" aria-label="Polaris Escape Pod">
          <span className="escape-pod-sidebar-brand-mark" aria-hidden="true">
            <Icon name="polarisStar" size={17} />
          </span>
          <span className="escape-pod-sidebar-brand-copy">
            <strong>Polaris</strong>
            <small>Escape Pod</small>
          </span>
        </div>
        <button
          type="button"
          className="desktop-sidebar-collapse-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t('desktop.expandSidebar') : t('desktop.collapseSidebar')}
          title={collapsed ? t('desktop.expandSidebarTitle') : t('desktop.collapseSidebarTitle')}
          aria-pressed={collapsed}
        >
          <Icon name="sidebar" size={17} />
        </button>
      </div>

      <button
        type="button"
        className="escape-pod-new-chat"
        onClick={() => {
          setActionMenuConversationId(null);
          setEditingConversationId(null);
          setConversationTitleDraft('');
          onCreateConversation();
        }}
      >
        <Icon name="plus" size={16} />
        <span>{t('common.newConversation')}</span>
      </button>

      <nav className="desktop-sidebar-section escape-pod-sidebar-primary" aria-label="Escape Pod navigation">
        {escapePodShelfItems.map((item) => {
          const config = ESCAPE_POD_SHELVES[item.shelf]!;
          const active = activeWorld === 'collection' && collectionShelf === item.shelf;
          return (
            <button
              key={item.shelf}
              type="button"
              className={`desktop-sidebar-nav-item ${active ? 'active' : ''}`}
              onClick={() => onSelectShelf(item.shelf)}
            >
              <Icon name={config.icon} size={17} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="desktop-sidebar-section desktop-sidebar-threads" aria-label={t('desktop.conversationThreads')}>
        <div className="desktop-sidebar-section-head">
          <p className="desktop-sidebar-section-label">Recents</p>
          <button
            type="button"
            className="desktop-sidebar-thread-create"
            onClick={onCreateConversation}
            aria-label={t('common.newConversation')}
            title={t('common.newConversation')}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="desktop-sidebar-thread-list">
          {sortedConversations.length > 0 ? (
            sortedConversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              const menuOpen = actionMenuConversationId === conversation.id;
              const editing = editingConversationId === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className={`desktop-sidebar-thread-row ${active ? 'active' : ''} ${conversation.pinnedAt ? 'pinned' : ''} ${menuOpen ? 'menu-open' : ''} ${editing ? 'editing' : ''}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setActionMenuConversationId(conversation.id);
                  }}
                >
                  {editing ? (
                    <div className="desktop-sidebar-thread-edit">
                      <input
                        value={conversationTitleDraft}
                        onChange={(event) => setConversationTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitConversationRename(conversation.id);
                          if (event.key === 'Escape') cancelConversationRename();
                        }}
                        aria-label={t('desktop.renameConversation')}
                        autoFocus
                      />
                      <div className="desktop-sidebar-thread-edit-actions">
                        <button
                          type="button"
                          className="desktop-sidebar-thread-menu-item"
                          onClick={() => commitConversationRename(conversation.id)}
                        >
                          {t('desktop.saveConversationName')}
                        </button>
                        <button
                          type="button"
                          className="desktop-sidebar-thread-menu-item"
                          onClick={cancelConversationRename}
                        >
                          {t('desktop.cancelConversationName')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="desktop-sidebar-thread-body">
                      <button
                        type="button"
                        className="desktop-sidebar-thread"
                        onPointerDown={(event) => handleThreadPointerDown(event, conversation.id)}
                        onPointerMove={clearLongPress}
                        onPointerUp={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onClick={() => {
                          if (suppressNextThreadClickRef.current) {
                            suppressNextThreadClickRef.current = false;
                            return;
                          }
                          onOpenConversation(conversation.id);
                        }}
                      >
                        <span className="desktop-sidebar-thread-title">
                          {conversation.pinnedAt ? <Icon name="polarisStar" size={9} /> : null}
                          <span>{conversation.displayTitle}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="desktop-sidebar-thread-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          openConversationMenu(conversation.id);
                        }}
                        aria-label={t('desktop.conversationActions', { title: conversation.displayTitle })}
                        title={t('desktop.conversationActionsTitle')}
                        aria-expanded={menuOpen}
                      >
                        <Icon name="more" size={15} />
                      </button>
                    </div>
                  )}
                  {menuOpen && !editing ? (
                    <div className="desktop-sidebar-thread-menu">
                      <button
                        type="button"
                        className="desktop-sidebar-thread-menu-item"
                        onClick={() => {
                          onToggleConversationPinned(conversation.id);
                          setActionMenuConversationId(null);
                        }}
                      >
                        <Icon name="pin" size={13} />
                        <span>{conversation.pinnedAt ? t('desktop.unpinConversation') : t('desktop.pinConversation')}</span>
                      </button>
                      <button
                        type="button"
                        className="desktop-sidebar-thread-menu-item"
                        onClick={() => beginConversationRename(conversation)}
                      >
                        <Icon name="edit" size={13} />
                        <span>{t('desktop.renameConversation')}</span>
                      </button>
                      <button
                        type="button"
                        className="desktop-sidebar-thread-menu-item danger"
                        onClick={() => handleConversationDelete(conversation)}
                      >
                        <Icon name="x" size={13} />
                        <span>{t('desktop.deleteConversation')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="desktop-sidebar-thread-empty">{t('desktop.noChats')}</p>
          )}
        </div>
      </section>

      <footer className="desktop-sidebar-footer escape-pod-sidebar-footer">
        <button
          type="button"
          className="desktop-sidebar-settings"
          onClick={onOpenSettings}
          aria-label={t('common.settings')}
          title={t('common.settings')}
        >
          <Icon name="settings" size={17} />
          <span>{t('common.settings')}</span>
        </button>
      </footer>
    </aside>
  );
}
