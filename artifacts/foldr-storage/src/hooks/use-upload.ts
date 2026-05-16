import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey, getBaseUrl } from "@workspace/api-client-react";
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
      const apiUrl = getBaseUrl() || "";
      xhr.open("POST", `${apiUrl}/api/files/upload`);

      // Send auth cookie (if SameSite=None) AND Bearer token fallback
      xhr.withCredentials = true;
      const token = localStorage.getItem("foldr-auth-token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
        }
      };

      const showError = (title: string, detail: string) => {
        setIsUploading(false);
        if (!options?.silent) {
          toast({ variant: "destructive", title, description: detail });
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
          let detail = `HTTP ${xhr.status}`;
          try {
            const errResponse = JSON.parse(xhr.responseText);
            if (errResponse.message) detail += ` — ${errResponse.message}`;
            if (errResponse.detail) detail += ` — ${errResponse.detail}`;
            if (errResponse.error) detail += ` — ${errResponse.error}`;
          } catch {
            if (xhr.responseText) detail += `: ${xhr.responseText.slice(0, 300)}`;
          }
          showError("Upload Failed", detail);
          reject(new Error(detail));
        }
      };

      xhr.onerror = () => {
        showError("Network Error", "Could not connect to the server. Check if the API is running and CORS is configured.");
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
