import { useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { imageFromFile, imageUrl, isAiImage } from "./aiImages";
import { readWorkPdf, type Work } from "./aiStudy";
import { errorText } from "./errorText";

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export function WorkInput({ work, onChange, label, placeholder, pdf = false }: { work: Work; onChange: (w: Work) => void; label: string; placeholder?: string; pdf?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(0);
  const latest = useRef(work);
  latest.current = work;
  const set = (w: Work) => {
    latest.current = w;
    onChange(w);
  };

  const add = async (files: File[]) => {
    const usable = files.filter((f) => isAiImage(f) || (pdf && isPdf(f)));
    if (usable.length < files.length) toast.error(pdf ? "Only PDF, PNG and JPEG files can be added" : "Only PNG and JPEG images can be added");
    if (!usable.length) return;
    setReading((n) => n + usable.length);
    for (const f of usable) {
      try {
        if (isPdf(f)) {
          const { doc, images } = await readWorkPdf(f);
          const w = latest.current;
          set({ ...w, docs: [...w.docs, doc], images: [...w.images, ...images] });
        } else {
          const image = await imageFromFile(f);
          const w = latest.current;
          set({ ...w, images: [...w.images, image] });
        }
      } catch (err) {
        toast.error(`Could not read ${f.name || "that file"}`, { description: errorText(err) });
      } finally {
        setReading((n) => n - 1);
      }
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter(isAiImage);
    if (!files.length) return;
    e.preventDefault();
    void add(files);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    void add([...e.dataTransfer.files]);
  };

  return (
    <div className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Label htmlFor={`${id}-work`} className="text-xs text-muted-foreground">{label}</Label>
      <Textarea id={`${id}-work`} value={work.text} placeholder={placeholder} onPaste={onPaste} onChange={(e) => onChange({ ...work, text: e.target.value })} />
      {(work.images.length > 0 || work.docs.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {work.docs.map((d, i) => (
            <li key={`d${i}`} className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {d.name}
              <button type="button" aria-label={`Remove ${d.name}`} className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...work, docs: work.docs.filter((_, j) => j !== i) })}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          {work.images.map((img, i) => (
            <li key={`i${i}`} className="relative">
              <img src={imageUrl(img)} alt={img.name} className="h-16 w-16 rounded-md border border-border/60 object-cover" />
              <button type="button" aria-label={`Remove ${img.name}`} className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...work, images: work.images.filter((_, j) => j !== i) })}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={reading > 0} onClick={() => input.current?.click()}>
          <Paperclip className="h-3.5 w-3.5 mr-1" /> {reading > 0 ? "Reading" : pdf ? "Attach PDF or images" : "Attach images"}
        </Button>
        <span className="text-xs text-muted-foreground">or paste or drop {pdf ? "files" : "images"} here</span>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={pdf ? ".pdf,image/png,image/jpeg" : "image/png,image/jpeg"}
        className="hidden"
        data-testid="work-files"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void add(files);
        }}
      />
    </div>
  );
}
