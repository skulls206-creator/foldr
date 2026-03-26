import { 
  FileText, 
  Image as ImageIcon, 
  FileArchive, 
  FileAudio, 
  FileVideo, 
  FileCode,
  File
} from "lucide-react";

export function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("compressed")) return FileArchive;
  if (mimeType.includes("pdf") || mimeType.includes("document")) return FileText;
  if (mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("html")) return FileCode;
  return File;
}

export function FileIconDisplay({ mimeType, className }: { mimeType: string, className?: string }) {
  const Icon = getFileIcon(mimeType);
  
  // Determine color based on type for visual richness
  let colorClass = "text-muted-foreground";
  if (mimeType.startsWith("image/")) colorClass = "text-blue-400";
  else if (mimeType.startsWith("video/")) colorClass = "text-purple-400";
  else if (mimeType.includes("pdf")) colorClass = "text-red-400";
  else if (mimeType.includes("zip") || mimeType.includes("tar")) colorClass = "text-yellow-400";

  return <Icon className={`${colorClass} ${className || "w-10 h-10"}`} strokeWidth={1.5} />;
}
