import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShareEncryptedFile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Share2, Wallet } from "lucide-react";

interface ShareEncryptedModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
}

export function ShareEncryptedModal({ isOpen, onClose, fileId }: ShareEncryptedModalProps) {
  const [address, setAddress] = useState("");
  const shareMutation = useShareEncryptedFile();
  const { toast } = useToast();

  const handleShare = () => {
    if (!address.trim()) return;
    
    shareMutation.mutate(
      { id: fileId, data: { recipientAddress: address } },
      {
        onSuccess: () => {
          toast({ title: "File Shared", description: "Access granted successfully." });
          setAddress("");
          onClose();
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Share Failed", description: err.message });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Share2 className="w-5 h-5 text-accent" />
            Share Encrypted File
          </DialogTitle>
          <DialogDescription>
            Grant decryption access to another Ethereum wallet address via Kavach.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Recipient Wallet Address</Label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="walletAddress"
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-9 bg-black/20"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={shareMutation.isPending}>Cancel</Button>
          <Button 
            onClick={handleShare} 
            disabled={!address.trim() || shareMutation.isPending}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {shareMutation.isPending ? "Sharing..." : "Share Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
