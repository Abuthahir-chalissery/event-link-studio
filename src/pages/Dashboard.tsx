import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Calendar, Image as ImageIcon, Lock, Trash2 } from "lucide-react";
import { publicUrl } from "@/lib/media";
import { formatDistanceToNow } from "date-fns";

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  share_slug: string;
  password_hash: string | null;
  cover_path: string | null;
  created_at: string;
  media_count: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<EventRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("id, name, description, share_slug, password_hash, cover_path, created_at, media(count)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setEvents(
        (data ?? []).map((e: any) => ({
          ...e,
          media_count: e.media?.[0]?.count ?? 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .insert({ name, description: description || null, owner_id: user.id })
        .select()
        .single();
      if (error) throw error;

      if (password.trim()) {
        const { error: pwErr } = await supabase.rpc("set_event_password", {
          _event_id: data.id,
          _password: password,
        });
        if (pwErr) throw pwErr;
      }

      toast.success("Event created");
      setOpen(false);
      setName("");
      setDescription("");
      setPassword("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      // Remove storage files for the event
      const { data: list } = await supabase.storage
        .from("event-media")
        .list(toDelete.id, { limit: 1000 });
      if (list && list.length > 0) {
        const paths = list.map((f) => `${toDelete.id}/${f.name}`);
        await supabase.storage.from("event-media").remove(paths);
      }
      // Delete the event row (media + favorites cascade)
      const { error } = await supabase.from("events").delete().eq("id", toDelete.id);
      if (error) throw error;
      toast.success("Event deleted");
      setToDelete(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container py-12">
        <div className="flex items-end justify-between mb-10 animate-fade-up">
          <div>
            <p className="text-sm text-primary tracking-widest uppercase mb-2">Your studio</p>
            <h1 className="font-display text-5xl md:text-6xl">Events</h1>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-4 w-4" />
                New event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-3xl">Create an event</DialogTitle>
                <DialogDescription>
                  A private space for one shoot. You can add photos and videos next.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Event name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Neha & Arjun · Wedding"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A few words for your client…"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw" className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> Password (optional)
                  </Label>
                  <Input
                    id="pw"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave empty for no password"
                  />
                  <p className="text-xs text-muted-foreground">
                    If set, clients must enter this to view the gallery.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating…" : "Create event"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-lg animate-shimmer" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-lg">
            <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-3xl mb-2">No events yet</h2>
            <p className="text-muted-foreground mb-6">Create your first event to start delivering.</p>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New event</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((ev, i) => (
              <div
                key={ev.id}
                className="group relative rounded-lg overflow-hidden bg-card border border-border shadow-card hover:shadow-elegant hover:border-primary/40 transition-all duration-500 animate-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <Link to={`/events/${ev.id}`} className="block">
                  <div className="aspect-[4/3] relative overflow-hidden bg-muted">
                    {ev.cover_path ? (
                      <img
                        src={publicUrl(ev.cover_path)}
                        alt={ev.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-cinematic" />
                    {ev.password_hash && (
                      <div className="absolute top-3 right-3 glass rounded-full p-1.5 border border-border">
                        <Lock className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-2xl truncate">{ev.name}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="h-3 w-3" />
                        {ev.media_count} item{ev.media_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setToDelete(ev);
                  }}
                  className="absolute top-3 left-3 p-2 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Delete event"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-2xl">Delete this event?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong className="text-foreground">{toDelete?.name}</strong> and all of its photos and videos
                will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete forever"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
