import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRevokeFileAccess } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ShieldOff, Wallet } from "lucide-react";

interface RevokeAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
}

export function RevokeAccessModal({ isOpen, onClose, fileId }: RevokeAccessModalProps) {
  const [address, setAddress] = useState("");
  const revokeMutation = useRevokeFileAccess();
  const { toast } = useToast();

  const handleRevoke = () => {
    if (!address.trim()) return;
    
    revokeMutation.mutate(
      { id: fileId, data: { revokeAddress: address } },
      {
        onSuccess: () => {
          toast({ title: "Access Revoked", description: "Wallet access removed successfully." });
          setAddress("");
          onClose();
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Revoke Failed", description: err.message });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-orange-500">
            <ShieldOff className="w-5 h-5" />
            Revoke Access
          </DialogTitle>
          <DialogDescription>
            Remove decryption access from a specific Ethereum wallet address.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revokeWalletAddress">Wallet Address to Revoke</Label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="revokeWalletAddress"
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-9 bg-black/20"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={revokeMutation.isPending}>Cancel</Button>
          <Button 
            onClick={handleRevoke} 
            disabled={!address.trim() || revokeMutation.isPending}
            variant="destructive"
          >
            {revokeMutation.isPending ? "Revoking..." : "Revoke Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
