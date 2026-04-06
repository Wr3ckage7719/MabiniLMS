import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface JoinClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinClassDialog({ open, onOpenChange }: JoinClassDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Join a class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Class code</Label>
            <Input placeholder="Enter class code" className="rounded-xl text-center text-lg tracking-widest font-mono" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ask your teacher for the class code, then enter it here. Codes are 6-7 characters.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
          <Button onClick={() => onOpenChange(false)} className="rounded-xl">Join</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
