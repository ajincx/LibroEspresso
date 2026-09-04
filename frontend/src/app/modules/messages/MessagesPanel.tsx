import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { messageService } from "../../services/message.service";
import type { DirectMessage, MessageContact } from "../../types/messaging";

function initials(contact: MessageContact) { return `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase(); }

export function MessagesPanel({ embedded = false, initialMessageId = null }: { embedded?: boolean; initialMessageId?: string | null }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadContacts = async () => {
    const result = await messageService.contacts();
    setContacts(result);
    return result;
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setLoading(true);
      try {
        const result = await loadContacts();
        let initialId = "";
        if (initialMessageId) initialId = await messageService.context(initialMessageId);
        if (!initialId) initialId = result.find(contact => contact.unreadCount > 0)?.id ?? result[0]?.id ?? "";
        if (active) setSelectedId(initialId);
      } catch (error) { if (active) toast.error(error instanceof Error ? error.message : "Unable to load messages"); }
      finally { if (active) setLoading(false); }
    };
    void initialize();
    return () => { active = false; };
  }, [initialMessageId]);

  const loadConversation = async (contactId: string, quiet = false) => {
    try {
      const result = await messageService.conversation(contactId);
      setMessages(result);
      await messageService.markConversationRead(contactId);
      setContacts(current => current.map(contact => contact.id === contactId ? { ...contact, unreadCount: 0 } : contact));
    } catch (error) { if (!quiet) toast.error(error instanceof Error ? error.message : "Unable to load conversation"); }
  };

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void loadConversation(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void loadContacts().catch(() => undefined);
      if (selectedId) void loadConversation(selectedId, true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [selectedId, user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const selected = contacts.find(contact => contact.id === selectedId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter(contact => !term || `${contact.firstName} ${contact.lastName} ${contact.position} ${contact.branchName ?? ""}`.toLowerCase().includes(term));
  }, [contacts, search]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    try {
      const sent = await messageService.send(selectedId, body);
      setMessages(current => [...current, sent]);
      setDraft("");
      await loadContacts();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send message"); }
    finally { setSending(false); }
  };

  return <div className={embedded ? "h-full" : "p-4 sm:p-6 h-full min-h-[620px]"}>
    <div className="h-full max-w-7xl mx-auto flex flex-col">
      {!embedded && <div className="mb-5"><h1 className="text-2xl font-bold text-[var(--app-text)]">Messages</h1><p className="text-sm mt-1 text-[var(--app-text-muted)]">Communicate securely with other active Libro Espresso users.</p></div>}
      <div className={`flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_1fr] overflow-hidden bg-[var(--app-surface)] ${embedded ? "" : "rounded-2xl border border-[var(--app-border)]"}`}>
        <aside className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-[var(--app-border)]">
          <div className="p-4 border-b border-[var(--app-border)]"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 font-semibold text-[var(--app-text)]"><Users size={17}/>People</div><button onClick={() => void loadContacts()} className="text-[var(--app-text-faint)]" title="Refresh contacts"><RefreshCw size={15}/></button></div><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)]"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm outline-none bg-[var(--app-bg)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)]"/></div></div>
          <div className="overflow-y-auto max-h-64 md:max-h-none md:flex-1">
            {loading ? <div className="p-8 text-center text-sm text-[var(--app-text-muted)]">Loading users...</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-[var(--app-text-muted)]">No users found.</div> : filtered.map(contact => <button key={contact.id} onClick={() => setSelectedId(contact.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors border-[var(--app-border)]" style={{ background: selectedId === contact.id ? "var(--app-primary-subtle)" : "transparent" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white bg-[var(--app-primary)]">{initials(contact)}</div>
              <div className="flex-1 min-w-0"><div className="flex justify-between gap-2"><p className="font-semibold text-sm truncate text-[var(--app-text)]">{contact.firstName} {contact.lastName}</p>{contact.unreadCount > 0 && <span className="min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-[var(--app-primary)]">{contact.unreadCount}</span>}</div><p className="text-xs truncate text-[var(--app-text-muted)]">{contact.lastMessage ?? contact.position}</p><p className="text-[11px] truncate mt-0.5 text-[var(--app-text-faint)]">{contact.branchName ?? "All branches"}</p></div>
            </button>)}
          </div>
        </aside>

        <section className="flex flex-col min-h-[430px] min-w-0">
          {!selected ? <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[var(--app-primary-subtle)] text-[var(--app-primary)]"><MessageCircle size={24}/></div><h2 className="font-semibold text-[var(--app-text)]">Select a conversation</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">Choose an active user to start messaging.</p></div> : <>
            <header className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--app-border)]"><div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white bg-[var(--app-primary)]">{initials(selected)}</div><div><h2 className="font-semibold text-[var(--app-text)]">{selected.firstName} {selected.lastName}</h2><p className="text-xs text-[var(--app-text-muted)]">{selected.position}{selected.branchName ? ` · ${selected.branchName}` : ""}</p></div></header>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[var(--app-bg)]">
              {messages.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-[var(--app-text-muted)]">No messages yet. Start the conversation.</div> : messages.map(message => {
                const mine = message.senderUserId === user?.id;
                return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className="max-w-[82%] sm:max-w-[68%] rounded-2xl px-3.5 py-2.5" style={{ background: mine ? "var(--app-primary)" : "var(--app-surface)", color: mine ? "white" : "var(--app-text)", border: mine ? "none" : "1px solid var(--app-border)", borderBottomRightRadius: mine ? 5 : undefined, borderBottomLeftRadius: mine ? undefined : 5 }}><p className="text-sm whitespace-pre-wrap break-words">{message.body}</p><p className="text-[10px] mt-1.5" style={{ color: mine ? "rgba(255,255,255,.72)" : "var(--app-text-faint)" }}>{new Date(message.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}{mine && message.readAt ? " · Read" : ""}</p></div></div>;
              })}<div ref={bottomRef}/>
            </div>
            <form onSubmit={send} className="p-3 sm:p-4 border-t border-[var(--app-border)]"><div className="flex items-end gap-2"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} maxLength={2000} rows={1} placeholder={`Message ${selected.firstName}...`} className="flex-1 max-h-32 min-h-11 resize-y rounded-xl border px-3.5 py-2.5 text-sm outline-none bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)]"/><button disabled={!draft.trim() || sending} className="h-11 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-50"><Send size={16}/><span className="hidden sm:inline">{sending ? "Sending..." : "Send"}</span></button></div><p className="text-[11px] mt-1.5 text-[var(--app-text-faint)]">Enter to send · Shift+Enter for a new line</p></form>
          </>}
        </section>
      </div>
    </div>
  </div>;
}
