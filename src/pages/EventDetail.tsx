import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Copy,
  ExternalLink,
  Lock,
  Trash2,
  Image as ImageIcon,
  Film,
  Check,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { publicUrl, thumbUrl, inferMediaType, getImageDimensions } from "@/lib/media";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  share_slug: string;
  password_hash: string | null;
  owner_id: string;
}
interface MediaRow {
  id: string;
  storage_path: string;
  type: "image" | "video";
  filename: string;
  width: number | null;
  height: number | null;
}

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: ev, error } = await supabase
      .from("events")
      .select("id, name, description, share_slug, password_hash, owner_id")
      .eq("id", id)
      .single();
    if (error || !ev) {
      toast.error("Event not found");
      navigate("/dashboard");
      return;
    }
    setEvent(ev);
    const { data: m } = await supabase
      .from("media")
      .select("id, storage_path, type, filename, width, height")
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    setMedia((m ?? []) as MediaRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const shareUrl = event ? `${window.location.origin}/g/${event.share_slug}` : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !event || !user) return;
    const items: UploadItem[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${f.name}-${Math.random()}`,
      name: f.name,
      progress: 0,
      status: "pending",
    }));
    setUploads((u) => [...items, ...u]);

    let firstCoverPath: string | null = null;

    await Promise.all(
      Array.from(files).map(async (file, idx) => {
        const item = items[idx];
        try {
          setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, status: "uploading", progress: 5 } : x)));
          const ext = file.name.split(".").pop() || "bin";
          const path = `${event.id}/${crypto.randomUUID()}.${ext}`;
          const type = inferMediaType(file);

          const { error: upErr } = await supabase.storage
            .from("event-media")
            .upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type,
            });
          if (upErr) throw upErr;

          setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, progress: 70 } : x)));

          let width: number | null = null;
          let height: number | null = null;
          if (type === "image") {
            const dims = await getImageDimensions(file);
            width = dims.width || null;
            height = dims.height || null;
          }

          const { error: insErr } = await supabase.from("media").insert({
            event_id: event.id,
            storage_path: path,
            type,
            filename: file.name,
            size_bytes: file.size,
            width,
            height,
          });
          if (insErr) throw insErr;

          if (!firstCoverPath && type === "image") firstCoverPath = path;

          setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, status: "done", progress: 100 } : x)));
        } catch (err: unknown) {
          console.error(err);
          setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, status: "error", progress: 100 } : x)));
        }
      })
    );

    // Set cover if not already
    if (event && !media.length && firstCoverPath) {
      await supabase.from("events").update({ cover_path: firstCoverPath }).eq("id", event.id);
    }

    await load();
    setTimeout(() => setUploads((u) => u.filter((x) => x.status !== "done")), 1500);
  };

  const handleSavePassword = async () => {
    if (!event) return;
    setSavingPw(true);
    const { error } = await supabase.rpc("set_event_password", {
      _event_id: event.id,
      _password: newPassword,
    });
    setSavingPw(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(newPassword ? "Password updated" : "Password removed");
      setPwOpen(false);
      setNewPassword("");
      await load();
    }
  };

  const deleteMedia = async (m: MediaRow) => {
    if (!confirm("Delete this item?")) return;
    await supabase.storage.from("event-media").remove([m.storage_path]);
    await supabase.from("media").delete().eq("id", m.id);
    toast.success("Deleted");
    await load();
  };

  if (loading || !event) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 text-center text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container py-10">
        <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> All events
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 animate-fade-up">
          <div>
            <h1 className="font-display text-5xl md:text-6xl">{event.name}</h1>
            {event.description && (
              <p className="text-muted-foreground mt-2 max-w-xl">{event.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPwOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              {event.password_hash ? "Change password" : "Add password"}
            </Button>
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy link
            </Button>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              <Button>
                <ExternalLink className="h-4 w-4 mr-2" /> Open gallery
              </Button>
            </a>
          </div>
        </div>

        {/* Share link bar */}
        <div className="glass border border-border rounded-md px-4 py-3 mb-8 flex items-center gap-3 text-sm">
          <span className="text-muted-foreground shrink-0">Share link:</span>
          <code className="truncate text-primary/90">{shareUrl}</code>
          {event.password_hash && (
            <span className="ml-auto text-xs text-primary flex items-center gap-1 shrink-0">
              <Lock className="h-3 w-3" /> Protected
            </span>
          )}
        </div>

        {/* Uploader */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center mb-10 hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Upload className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="font-display text-2xl">Drop photos or videos here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse · multiple files supported</p>
        </div>

        {/* Upload progress */}
        {uploads.length > 0 && (
          <div className="space-y-2 mb-8">
            {uploads.map((u) => (
              <div key={u.id} className="bg-card border border-border rounded-md p-3">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="truncate mr-3">{u.name}</span>
                  <span className={u.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                    {u.status === "done" ? "Done" : u.status === "error" ? "Failed" : `${u.progress}%`}
                  </span>
                </div>
                <Progress value={u.progress} className="h-1" />
              </div>
            ))}
          </div>
        )}

        {/* Media grid */}
        {media.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No media yet — upload your first batch above.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {media.map((m) => (
              <div key={m.id} className="group relative aspect-square rounded-md overflow-hidden bg-muted">
                {m.type === "image" ? (
                  <img
                    src={thumbUrl(m.storage_path, 400)}
                    alt={m.filename}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-secondary relative flex items-center justify-center">
                    <video src={publicUrl(m.storage_path)} className="w-full h-full object-cover" muted preload="metadata" />
                    <Film className="absolute h-8 w-8 text-primary drop-shadow-lg" />
                  </div>
                )}
                <button
                  onClick={() => deleteMedia(m)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Password dialog */}
        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-3xl">
                {event.password_hash ? "Change password" : "Add a password"}
              </DialogTitle>
              <DialogDescription>
                Leave empty and save to remove password protection.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="newpw">Password</Label>
              <Input
                id="newpw"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <DialogFooter>
              <Button onClick={handleSavePassword} disabled={savingPw}>
                {savingPw ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
