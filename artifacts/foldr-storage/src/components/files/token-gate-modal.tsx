import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSetTokenGate } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Key } from "lucide-react";

interface TokenGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
}

export function TokenGateModal({ isOpen, onClose, fileId }: TokenGateModalProps) {
  const [chain, setChain] = useState("Ethereum");
  const [contractType, setContractType] = useState("ERC20");
  const [contractAddress, setContractAddress] = useState("");
  const [method, setMethod] = useState("balanceOf");
  const [comparator, setComparator] = useState(">=");
  const [value, setValue] = useState("1");
  
  const tokenGateMutation = useSetTokenGate();
  const { toast } = useToast();

  const handleApply = () => {
    if (!contractAddress.trim()) return;

    const condition = {
      id: 1,
      chain,
      method,
      standardContractType: contractType,
      contractAddress,
      returnValueTest: { comparator, value },
      parameters: [":userAddress"]
    };
    
    tokenGateMutation.mutate(
      { id: fileId, data: { conditions: [condition], aggregator: "([1])" } },
      {
        onSuccess: () => {
          toast({ title: "Token Gate Applied", description: "Access conditions updated successfully." });
          onClose();
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Failed to Apply", description: err.message });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-yellow-500">
            <Key className="w-5 h-5" />
            Set Token Gate
          </DialogTitle>
          <DialogDescription>
            Restrict file access to users holding a specific token or NFT.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Network Chain</Label>
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger className="bg-black/20">
                  <SelectValue placeholder="Select chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ethereum">Ethereum</SelectItem>
                  <SelectItem value="Polygon">Polygon</SelectItem>
                  <SelectItem value="Optimism">Optimism</SelectItem>
                  <SelectItem value="Arbitrum">Arbitrum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contract Type</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger className="bg-black/20">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ERC20">ERC20</SelectItem>
                  <SelectItem value="ERC721">ERC721 (NFT)</SelectItem>
                  <SelectItem value="ERC1155">ERC1155</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contractAddress">Contract Address</Label>
            <Input
              id="contractAddress"
              placeholder="0x..."
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              className="bg-black/20"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <Input value={method} onChange={(e) => setMethod(e.target.value)} className="bg-black/20" />
            </div>
            <div className="space-y-2">
              <Label>Compare</Label>
              <Select value={comparator} onValueChange={setComparator}>
                <SelectTrigger className="bg-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=">">{">"}</SelectItem>
                  <SelectItem value=">=">{">="}</SelectItem>
                  <SelectItem value="==">{"=="}</SelectItem>
                  <SelectItem value="<">{"<"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="bg-black/20" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={tokenGateMutation.isPending}>Cancel</Button>
          <Button 
            onClick={handleApply} 
            disabled={!contractAddress.trim() || tokenGateMutation.isPending}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
          >
            {tokenGateMutation.isPending ? "Applying..." : "Apply Gate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
