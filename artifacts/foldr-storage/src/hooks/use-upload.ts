import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function useUploadWithProgress() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upload = async (
    file: File,
    encrypt: boolean,
    folderId?: string,
    options?: { silent?: boolean }
  ) => {
    setIsUploading(true);
    setProgress(0);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files/upload");
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            queryClient.invalidateQueries({ queryKey: ["/api/files"] });
            if (!options?.silent) {
              toast({
                title: "Upload Complete",
                description: `${file.name} has been uploaded securely.`,
              });
            }
            resolve(response);
          } catch (e) {
            resolve(xhr.responseText);
          }
        } else {
          try {
            const errResponse = JSON.parse(xhr.responseText);
            if (!options?.silent) {
              toast({
                variant: "destructive",
                title: "Upload Failed",
                description: errResponse.message || "An error occurred during upload.",
              });
            }
            reject(new Error(errResponse.message));
          } catch (e) {
            if (!options?.silent) {
              toast({
                variant: "destructive",
                title: "Upload Failed",
                description: "An unexpected error occurred.",
              });
            }
            reject(new Error("Upload failed"));
          }
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        if (!options?.silent) {
          toast({
            variant: "destructive",
            title: "Network Error",
            description: "Could not connect to the server.",
          });
        }
        reject(new Error("Network error"));
      };

      const formData = new FormData();
      formData.append("file", file);
      formData.append("encrypt", String(encrypt));
      if (folderId) formData.append("folderId", folderId);

      xhr.send(formData);
    });
  };

  return { upload, progress, isUploading };
}
