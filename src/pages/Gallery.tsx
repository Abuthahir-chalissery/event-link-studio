import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Lock,
  Camera,
  Heart,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Film,
  DownloadCloud,
  Sparkles,
  User,
  RotateCcw,
} from "lucide-react";
import { publicUrl, thumbUrl, lqipUrl } from "@/lib/media";
import { getClientToken } from "@/lib/clientToken";
import JSZip from "jszip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  share_slug: string;
  password_hash: string | null;
  allow_downloads: boolean;
}
interface MediaRow {
  id: string;
  storage_path: string;
  type: "image" | "video";
  filename: string;
  width: number | null;
  height: number | null;
  face_descriptors: { description: string }[] | null;
}

export default function Gallery() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showOnlyFavs, setShowOnlyFavs] = useState(false);
  const [zipping, setZipping] = useState(false);

  // Face search state
  const [faceOpen, setFaceOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Touch swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!slug) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("id, name, description, share_slug, password_hash, allow_downloads")
        .eq("share_slug", slug)
        .maybeSingle();

      if (error || !data) {
        setLoading(false);
        setEvent(null);
        return;
      }
      setEvent(data);

      const sessionKey = `lumen.unlocked.${slug}`;
      if (data.password_hash && sessionStorage.getItem(sessionKey) !== "1") {
        setNeedsPassword(true);
        setLoading(false);
        return;
      }
      await loadMedia(data.id);
      setLoading(false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const loadMedia = useCallback(async (eventId: string) => {
    const [{ data: m }, { data: favs }] = await Promise.all([
      supabase
        .from("media")
        .select("id, storage_path, type, filename, width, height, face_descriptors")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
      supabase
        .from("favorites")
        .select("media_id")
        .eq("event_id", eventId)
        .eq("client_token", getClientToken()),
    ]);
    setMedia((m ?? []) as unknown as MediaRow[]);
    setFavorites(new Set((favs ?? []).map((f) => f.media_id)));
  }, []);

  const verifyPassword = async () => {
    if (!slug) return;
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_event_password", {
      _share_slug: slug,
      _password: passwordInput,
    });
    setVerifying(false);
    if (error) return toast.error(error.message);
    if (data) {
      sessionStorage.setItem(`lumen.unlocked.${slug}`, "1");
      setNeedsPassword(false);
      if (event) await loadMedia(event.id);
    } else {
      toast.error("Incorrect password");
    }
  };

  const toggleFavorite = async (m: MediaRow) => {
    if (!event) return;
    const token = getClientToken();
    const isFav = favorites.has(m.id);
    const next = new Set(favorites);
    if (isFav) {
      next.delete(m.id);
      setFavorites(next);
      await supabase
        .from("favorites")
        .delete()
        .eq("media_id", m.id)
        .eq("client_token", token);
    } else {
      next.add(m.id);
      setFavorites(next);
      await supabase.from("favorites").insert({
        event_id: event.id,
        media_id: m.id,
        client_token: token,
      });
    }
  };

  const downloadOne = async (m: MediaRow) => {
    const url = publicUrl(m.storage_path);
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadAll = async () => {
    const items = visible;
    if (items.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      // Pool downloads to avoid blowing memory
      const chunks: MediaRow[][] = [];
      const SIZE = 6;
      for (let i = 0; i < items.length; i += SIZE) chunks.push(items.slice(i, i + SIZE));
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (m) => {
            const res = await fetch(publicUrl(m.storage_path));
            const blob = await res.blob();
            zip.file(m.filename, blob);
          })
        );
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${event?.name ?? "gallery"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Download ready");
    } catch (e) {
      console.error(e);
      toast.error("Failed to zip files");
    } finally {
      setZipping(false);
    }
  };

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowRight") setLightboxIdx((i) => (i === null ? null : Math.min(visible.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIdx, media.length, matchedIds, showOnlyFavs]);

  const onSelfiePicked = async (file: File) => {
    if (!event) return;
    const candidates = media
      .filter((m) => m.type === "image" && m.face_descriptors && m.face_descriptors.length > 0)
      .map((m) => ({
        id: m.id,
        description: (m.face_descriptors ?? []).map((f) => f.description).join(" | "),
      }));
    if (candidates.length === 0) {
      toast.error("Photographer hasn't analyzed faces yet.");
      return;
    }
    setSearching(true);
    try {
      // Upload selfie temporarily to a storage path under event so AI can fetch it.
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${event.id}/_selfies/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        // Selfies may be blocked by RLS; fall back to data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const { data, error } = await supabase.functions.invoke("face-match", {
          body: { action: "match", selfieUrl: dataUrl, candidates },
        });
        if (error) throw error;
        const ids = new Set<string>(data.matches ?? []);
        setMatchedIds(ids);
        toast.success(`Found ${ids.size} matching photo${ids.size === 1 ? "" : "s"}`);
        setFaceOpen(false);
        setShowOnlyFavs(false);
        return;
      }
      const selfieUrl = thumbUrl(path, 1200);
      const { data, error } = await supabase.functions.invoke("face-match", {
        body: { action: "match", selfieUrl, candidates },
      });
      // Best-effort cleanup
      await supabase.storage.from("event-media").remove([path]);
      if (error) throw error;
      const ids = new Set<string>(data.matches ?? []);
      setMatchedIds(ids);
      toast.success(`Found ${ids.size} matching photo${ids.size === 1 ? "" : "s"}`);
      setFaceOpen(false);
      setShowOnlyFavs(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Face search failed");
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h1 className="font-display text-5xl mb-3">Gallery not found</h1>
          <p className="text-muted-foreground mb-6">This link is invalid or has been removed.</p>
          <Link to="/"><Button variant="outline">Back home</Button></Link>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-hero relative grain flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center animate-fade-up">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/30 mb-6 animate-float">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-primary tracking-widest uppercase mb-2">Private gallery</p>
          <h1 className="font-display text-5xl mb-3">{event.name}</h1>
          <p className="text-muted-foreground mb-8">Please enter the password your photographer shared.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyPassword();
            }}
            className="space-y-4"
          >
            <div className="text-left space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={verifying || !passwordInput}>
              {verifying ? "Unlocking…" : "Unlock gallery"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  let visible = matchedIds ? media.filter((m) => matchedIds.has(m.id)) : media;
  if (showOnlyFavs) visible = visible.filter((m) => favorites.has(m.id));

  const hasAnalyzedFaces = media.some((m) => m.face_descriptors && m.face_descriptors.length > 0);

  return (
    <div className="min-h-screen">
      <header className="relative h-[40vh] min-h-[280px] overflow-hidden bg-hero grain">
        {media[0]?.type === "image" && (
          <img
            src={thumbUrl(media[0].storage_path, 1600)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
        <div className="relative container h-full flex flex-col justify-end pb-8">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="h-4 w-4 text-primary" />
            <span className="font-display text-xl">Lumen</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl tracking-tight">{event.name}</h1>
          {event.description && (
            <p className="text-muted-foreground mt-3 max-w-2xl">{event.description}</p>
          )}
        </div>
      </header>

      <div className="sticky top-0 z-20 glass border-b border-border">
        <div className="container flex items-center justify-between py-3 gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {visible.length} {visible.length === 1 ? "item" : "items"}
            {matchedIds && " · my photos"}
            {showOnlyFavs && " · favorites"}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasAnalyzedFaces && (
              matchedIds ? (
                <Button variant="ghost" size="sm" onClick={() => setMatchedIds(null)}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Show all
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setFaceOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Find my photos
                </Button>
              )
            )}
            <Button
              variant={showOnlyFavs ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowOnlyFavs((v) => !v)}
            >
              <Heart className={`h-4 w-4 mr-1.5 ${showOnlyFavs ? "fill-current" : ""}`} />
              {favorites.size}
            </Button>
            {event.allow_downloads && visible.length > 0 && (
              <Button variant="outline" size="sm" onClick={downloadAll} disabled={zipping}>
                <DownloadCloud className="h-4 w-4 mr-1.5" />
                {zipping ? "Preparing…" : "Download all"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="container py-8">
        {visible.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {matchedIds
              ? "No matching photos found."
              : showOnlyFavs
              ? "No favorites yet."
              : "This gallery is empty."}
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
            {visible.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setLightboxIdx(i)}
                className="group relative mb-3 block w-full overflow-hidden rounded-md bg-muted break-inside-avoid"
                style={{
                  aspectRatio: m.width && m.height ? `${m.width}/${m.height}` : "1/1",
                }}
              >
                {m.type === "image" ? (
                  <>
                    <img
                      src={lqipUrl(m.storage_path)}
                      aria-hidden
                      className="absolute inset-0 w-full h-full object-cover blur-lg scale-110"
                    />
                    <img
                      src={thumbUrl(m.storage_path, 800)}
                      alt={m.filename}
                      loading="lazy"
                      decoding="async"
                      className="relative w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 animate-fade-in"
                    />
                  </>
                ) : (
                  <div className="relative w-full h-full bg-secondary flex items-center justify-center">
                    <video
                      src={publicUrl(m.storage_path)}
                      preload="metadata"
                      muted
                      className="w-full h-full object-cover"
                    />
                    <Film className="absolute h-10 w-10 text-primary drop-shadow-lg" />
                  </div>
                )}
                <div className="absolute inset-0 bg-cinematic opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(m);
                    }}
                    className="p-2 rounded-full glass border border-border hover:text-primary"
                  >
                    <Heart className={`h-4 w-4 ${favorites.has(m.id) ? "fill-primary text-primary" : ""}`} />
                  </span>
                </div>
                {favorites.has(m.id) && (
                  <div className="absolute top-2 left-2 p-1.5 rounded-full glass border border-primary/40">
                    <Heart className="h-3 w-3 fill-primary text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightboxIdx !== null && visible[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center animate-fade-in touch-pan-y"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            const dy = e.changedTouches[0].clientY - touchStartY.current;
            touchStartX.current = null;
            touchStartY.current = null;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0 && lightboxIdx < visible.length - 1) setLightboxIdx(lightboxIdx + 1);
            else if (dx > 0 && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
          }}
        >
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 p-2 rounded-full glass border border-border hover:text-primary z-10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <button
              onClick={() => toggleFavorite(visible[lightboxIdx])}
              className="p-2 rounded-full glass border border-border hover:text-primary"
              aria-label="Favorite"
            >
              <Heart
                className={`h-5 w-5 ${favorites.has(visible[lightboxIdx].id) ? "fill-primary text-primary" : ""}`}
              />
            </button>
            {event.allow_downloads && (
              <button
                onClick={() => downloadOne(visible[lightboxIdx])}
                className="p-2 rounded-full glass border border-border hover:text-primary"
                aria-label="Download"
              >
                <Download className="h-5 w-5" />
              </button>
            )}
          </div>
          {lightboxIdx > 0 && (
            <button
              onClick={() => setLightboxIdx(lightboxIdx - 1)}
              className="absolute left-4 p-2 rounded-full glass border border-border hover:text-primary hidden md:block"
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightboxIdx < visible.length - 1 && (
            <button
              onClick={() => setLightboxIdx(lightboxIdx + 1)}
              className="absolute right-4 p-2 rounded-full glass border border-border hover:text-primary hidden md:block"
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          <div className="max-w-[92vw] max-h-[90vh] select-none">
            {visible[lightboxIdx].type === "image" ? (
              <img
                src={publicUrl(visible[lightboxIdx].storage_path)}
                alt={visible[lightboxIdx].filename}
                draggable={false}
                className="max-w-[92vw] max-h-[90vh] object-contain animate-fade-in"
              />
            ) : (
              <video
                src={publicUrl(visible[lightboxIdx].storage_path)}
                controls
                autoPlay
                className="max-w-[92vw] max-h-[90vh]"
              />
            )}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
            {lightboxIdx + 1} / {visible.length}
          </div>
        </div>
      )}

      {/* Face search dialog */}
      <Dialog open={faceOpen} onOpenChange={setFaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">Find your photos</DialogTitle>
            <DialogDescription>
              Upload a clear selfie. We'll use AI to surface the photos you appear in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input
              ref={selfieInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSelfiePicked(f);
              }}
            />
            <Button
              className="w-full h-12"
              disabled={searching}
              onClick={() => selfieInputRef.current?.click()}
            >
              <User className="h-4 w-4 mr-2" />
              {searching ? "Searching…" : "Choose a selfie"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Your selfie is used only for this search and is not stored.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Delivered with <span className="text-primary">Lumen</span>
      </footer>
    </div>
  );
}
