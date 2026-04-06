import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const colorOptions = [
  { value: 'blue', bg: 'bg-class-blue' },
  { value: 'teal', bg: 'bg-class-teal' },
  { value: 'purple', bg: 'bg-class-purple' },
  { value: 'orange', bg: 'bg-class-orange' },
  { value: 'pink', bg: 'bg-class-pink' },
  { value: 'green', bg: 'bg-class-green' },
];

export function CreateClassDialog({ open, onOpenChange }: CreateClassDialogProps) {
  const [selectedColor, setSelectedColor] = useState('teal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create a new class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Class name</Label>
            <Input placeholder="e.g. Advanced Mathematics" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Input placeholder="e.g. Section A - Period 1" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea placeholder="What will students learn?" className="rounded-xl resize-none" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Theme color</Label>
            <div className="flex gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedColor(c.value)}
                  className={`w-8 h-8 rounded-full ${c.bg} transition-all ${
                    selectedColor === c.value ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
          <Button onClick={() => onOpenChange(false)} className="rounded-xl">Create class</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
